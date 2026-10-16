/**
 * Florist directory tools: Google Places search/import, listing management and
 * invites. Mirrors apps/admin/src/server/florists.ts.
 */
import { z } from "zod";
import {
  INVITE_LINK_PLACEHOLDER,
  applyInviteLink,
  buildJoinUrl,
  createInvite,
  err,
  expireInvite,
  generateInviteToken,
  getActiveInviteByPhone,
  getListingInviteInfo,
  importListingFromPlace,
  linkListingToShop,
  listListings,
  listStaleListingIds,
  markListingInvited,
  normalizeLkPhone,
  ok,
  refreshListingFromPlace,
  setListingLocation,
  setListingStatus,
  shouldReuseInvite,
  type ActionResult,
} from "@flowers/api";
import {
  getPlaceDetails,
  searchFloristsNearby,
  searchFloristsText,
} from "@flowers/integrations";
import { sendAndLog } from "../whatsapp-send";
import { defineTool, uuid, type AnyTool } from "../tool";
import type { Ctx } from "../context";

const INVITE_TTL_DAYS = 30;
const MAX_REFRESH = 50;

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

function placesKey(ctx: Ctx): ActionResult<string> {
  const key = ctx.env().GOOGLE_PLACES_API_KEY?.trim();
  return key ? ok(key) : err("validation", "Places API key not configured (GOOGLE_PLACES_API_KEY).");
}

export const floristTools: readonly AnyTool[] = [
  defineTool({
    name: "list_florist_listings",
    title: "List florist directory listings",
    description:
      "List imported local florist listings (status unclaimed|invited|claimed|opted_out|blocked), " +
      "optionally filtered by district, status, whether linked to a shop, or within radiusKm of a point.",
    kind: "read",
    input: {
      district: z.string().optional(),
      status: z.enum(["unclaimed", "invited", "claimed", "opted_out", "blocked"]).optional(),
      hasShop: z.boolean().optional(),
      near: z.object({ lat, lng, radiusKm: z.number().min(1).max(50) }).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async run(input, ctx) {
      return ok(await listListings(ctx.db(), input));
    },
  }),

  defineTool({
    name: "search_google_florists",
    title: "Search Google Places for florists",
    description:
      "Search Google Places for florists by text query and/or a lat/lng pin (radiusKm 1-50, default 10). " +
      "Each result is flagged imported=true when it is already in the directory. Needs GOOGLE_PLACES_API_KEY.",
    kind: "read",
    input: {
      query: z.string().optional(),
      lat: lat.optional(),
      lng: lng.optional(),
      radiusKm: z.number().min(1).max(50).default(10),
    },
    async run(input, ctx) {
      const key = placesKey(ctx);
      if (!key.ok) return key;
      const query = input.query?.trim() ?? "";
      const near =
        input.lat !== undefined && input.lng !== undefined
          ? { lat: input.lat, lng: input.lng }
          : null;
      if (!query && !near) return err("validation", "Provide a query or both lat and lng.");
      const radiusM = input.radiusKm * 1000;
      const res = query
        ? await searchFloristsText(key.data, query, near ? { ...near, radiusM } : undefined)
        : await searchFloristsNearby(key.data, near!.lat, near!.lng, radiusM);
      if (!res.ok) return err("unknown", res.message);
      const known = new Set<string>();
      for (const l of await listListings(ctx.db(), {})) if (l.googlePlaceId) known.add(l.googlePlaceId);
      return ok(res.data.map((p) => ({ ...p, imported: known.has(p.placeId) })));
    },
  }),

  defineTool({
    name: "import_florist_listing",
    title: "Import a Google Place as a florist listing",
    description:
      "Fetch a Google Place's details by placeId and add it to the florist directory (updates the existing row if already imported). Needs GOOGLE_PLACES_API_KEY.",
    kind: "write",
    input: { placeId: z.string().min(1) },
    async run(input, ctx) {
      const key = placesKey(ctx);
      if (!key.ok) return key;
      const details = await getPlaceDetails(key.data, input.placeId.trim());
      if (!details.ok) return err("unknown", details.message);
      return importListingFromPlace(ctx.db(), details.data);
    },
  }),

  defineTool({
    name: "link_listing_to_shop",
    title: "Link a florist listing to a shop",
    description: "Link a directory listing to an existing marketplace shop (marks the listing claimed).",
    kind: "write",
    input: { listingId: uuid("Listing"), shopId: uuid("Shop") },
    async run(input, ctx) {
      return linkListingToShop(ctx.db(), input.listingId, input.shopId);
    },
  }),

  defineTool({
    name: "set_listing_location",
    title: "Set a florist listing's location",
    description: "Set a listing's coordinates (source recorded as admin).",
    kind: "write",
    input: { listingId: uuid("Listing"), lat, lng },
    async run(input, ctx) {
      return setListingLocation(ctx.db(), input.listingId, { lat: input.lat, lng: input.lng }, "admin");
    },
  }),

  defineTool({
    name: "set_listing_status",
    title: "Set a florist listing's status",
    description: "Set a listing to unclaimed, opted_out or blocked. Opted-out/blocked listings are never invited or notified.",
    kind: "write",
    input: {
      listingId: uuid("Listing"),
      status: z.enum(["unclaimed", "opted_out", "blocked"]),
    },
    async run(input, ctx) {
      return setListingStatus(ctx.db(), input.listingId, input.status);
    },
  }),

  defineTool({
    name: "refresh_florist_ratings",
    title: "Refresh florist ratings from Google",
    description:
      `Re-fetch Google rating/details for the given listingIds (max ${MAX_REFRESH}), or pass stale=true to refresh the ${MAX_REFRESH} most out-of-date listings. Needs GOOGLE_PLACES_API_KEY.`,
    kind: "write",
    input: {
      listingIds: z.array(uuid("Listing")).min(1).max(MAX_REFRESH).optional(),
      stale: z.boolean().optional(),
    },
    async run(input, ctx) {
      if (!input.listingIds && !input.stale) {
        return err("validation", "Provide listingIds or stale=true.");
      }
      const key = placesKey(ctx);
      if (!key.ok) return key;
      const db = ctx.db();
      const ids = input.listingIds ?? (await listStaleListingIds(db, new Date(), MAX_REFRESH));
      const placeIds = new Map((await listListings(db, {})).map((r) => [r.id, r.googlePlaceId]));
      let refreshed = 0;
      let failed = 0;
      for (const id of ids) {
        const placeId = placeIds.get(id);
        if (!placeId) {
          failed++;
          continue;
        }
        const details = await getPlaceDetails(key.data, placeId);
        if (!details.ok) {
          failed++;
          continue;
        }
        const res = await refreshListingFromPlace(db, id, details.data);
        if (res.ok) refreshed++;
        else failed++;
      }
      return ok({ refreshed, failed });
    },
  }),

  defineTool({
    name: "invite_florist_listing",
    title: "Invite a florist listing to join",
    description:
      "SEND a WhatsApp invite to a directory florist. `message` must contain {link}, which is replaced with a 30-day join URL. " +
      "Refused for opted_out, blocked or claimed listings and listings without a valid mobile number. " +
      "Show the operator the exact message text and get approval before calling.",
    kind: "send",
    input: {
      listingId: uuid("Listing"),
      message: z.string().describe("Full WhatsApp text; must contain {link}"),
    },
    async run(input, ctx) {
      const template = input.message.trim();
      if (!template) return err("validation", "The message can't be empty.");
      if (!template.includes(INVITE_LINK_PLACEHOLDER)) {
        return err("validation", `The message must contain ${INVITE_LINK_PLACEHOLDER} so the join link can be added.`);
      }
      const admin = await ctx.actingAdmin();
      if (!admin.ok) return admin;
      const db = ctx.db();

      const listing = await getListingInviteInfo(db, input.listingId);
      if (!listing) return err("not_found", "Listing not found.");
      if (listing.status !== "unclaimed" && listing.status !== "invited") {
        return err("validation", `A ${listing.status.replace("_", " ")} listing cannot be invited.`);
      }
      const phone = listing.phone ? normalizeLkPhone(listing.phone) : null;
      if (!phone) return err("validation", "This listing has no valid mobile number.");

      const portal = ctx.env().SUPPLIER_PORTAL_URL;
      // Reuse a pending invite for this number instead of hitting the one-active-invite rule.
      let existing = await getActiveInviteByPhone(db, phone);
      if (existing && !shouldReuseInvite(existing, new Date())) {
        await expireInvite(db, existing.id);
        existing = null;
      }
      let token: string;
      let inviteId: string;
      if (existing) {
        token = existing.token;
        inviteId = existing.id;
      } else {
        token = generateInviteToken();
        if (!buildJoinUrl(portal, token)) {
          return err("db_unavailable", "SUPPLIER_PORTAL_URL is not configured; cannot build a join link.");
        }
        const created = await createInvite(db, {
          phone,
          nameEn: listing.name,
          sellerTypes: ["florist"],
          language: "en",
          token,
          sentBy: admin.data.userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
        });
        if (!created.ok) return created;
        inviteId = created.data.id;
      }
      const joinUrl = buildJoinUrl(portal, token);
      if (!joinUrl) {
        return err("db_unavailable", "SUPPLIER_PORTAL_URL is not configured; cannot build a join link.");
      }
      const message = applyInviteLink(template, joinUrl);

      // Link before sending so a failed send leaves the listing `invited` and resendable.
      const marked = await markListingInvited(db, listing.id, inviteId);
      if (!marked.ok) return marked;

      const sent = await sendAndLog(db, ctx.evolution(), phone, message);
      const delivery = sent.ok
        ? { status: "sent" as const }
        : { status: "failed" as const, detail: sent.message };
      return ok({ joinUrl, phone, message, delivery });
    },
  }),
];
