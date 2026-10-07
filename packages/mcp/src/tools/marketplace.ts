/**
 * Marketplace tools: shops/suppliers, product moderation, supplier invites,
 * categories. Mirrors apps/admin/src/server/{suppliers,products}.ts.
 */
import { z } from "zod";
import {
  SELLER_TYPES,
  INVITE_LINK_PLACEHOLDER,
  adminSetShopSellerTypes,
  applyInviteLink,
  approveProducts,
  buildInviteMessage,
  buildJoinUrl,
  createInvite,
  err,
  generateInviteToken,
  getActiveInviteByPhone,
  listActiveCategoriesWithCounts,
  listProductsForModeration,
  listShopsForReview,
  moderateProduct,
  moderationCounts,
  normalizeLkPhone,
  ok,
  reviewShop,
} from "@flowers/api";
import { sendAndLog } from "../whatsapp-send";
import { defineTool, uuid, type AnyTool } from "../tool";

const INVITE_TTL_DAYS = 30;

const verificationStatus = z.enum(["unverified", "pending", "verified", "rejected"]);
const moderationStatus = z.enum(["pending", "approved", "blocked"]);
const sellerType = z.enum(SELLER_TYPES);

/** Same resolution as the admin Products page: storage path → public URL. */
function imageUrl(storagePath: string, supabaseUrl: string | undefined): string | null {
  if (/^https?:\/\//.test(storagePath) || storagePath.startsWith("/")) return storagePath;
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/product-images/${storagePath}`;
}

export const marketplaceTools: AnyTool[] = [
  defineTool({
    name: "list_shops",
    title: "List shops",
    description:
      "List supplier/florist/farmer shops with owner contact and verification status. " +
      "Filter by verification status (e.g. 'pending' for the review queue).",
    kind: "read",
    input: { status: verificationStatus.optional() },
    async run({ status }, ctx) {
      return ok(await listShopsForReview(ctx.db(), status ? { status } : undefined));
    },
  }),

  defineTool({
    name: "review_shop",
    title: "Verify or reject a shop",
    description:
      "Set a shop's verification status. Only 'verified' shops appear publicly. " +
      "Give notes when rejecting so the owner knows what to fix.",
    kind: "write",
    input: {
      shopId: uuid("Shop id"),
      status: verificationStatus,
      notes: z.string().optional(),
    },
    async run({ shopId, status, notes }, ctx) {
      const admin = await ctx.actingAdmin();
      if (!admin.ok) return admin;
      return reviewShop(ctx.db(), shopId, admin.data.userId, status, notes ?? null);
    },
  }),

  defineTool({
    name: "set_shop_seller_types",
    title: "Set a shop's seller types",
    description:
      "Replace a shop's seller types (any of florist, supplier, farmer; never empty). " +
      "Only supplier/farmer shops are matched for RFQs.",
    kind: "write",
    input: { shopId: uuid("Shop id"), sellerTypes: z.array(sellerType).min(1) },
    async run({ shopId, sellerTypes }, ctx) {
      return adminSetShopSellerTypes(ctx.db(), shopId, sellerTypes);
    },
  }),

  defineTool({
    name: "list_products_for_moderation",
    title: "List products for moderation",
    description:
      "List products across all shops with their moderation state, plus queue counts. " +
      "A product is public only when status='active', moderation='approved' and its shop is verified. " +
      "Prices are integer LKR cents.",
    kind: "read",
    input: {
      moderation: moderationStatus.optional().describe("Defaults to every state"),
      shopId: uuid("Restrict to one shop").optional(),
      q: z.string().optional().describe("Search product names"),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async run({ moderation, shopId, q, limit }, ctx) {
      const db = ctx.db();
      const supabaseUrl = ctx.env().SUPABASE_URL;
      const [rows, counts] = await Promise.all([
        listProductsForModeration(db, { moderation, shopId, q }),
        moderationCounts(db),
      ]);
      const products = rows.slice(0, limit).map(({ imagePaths, ...rest }) => ({
        ...rest,
        imageUrls: imagePaths
          .map((p) => imageUrl(p, supabaseUrl))
          .filter((u): u is string => u !== null),
      }));
      return ok({ counts, total: rows.length, products });
    },
  }),

  defineTool({
    name: "moderate_product",
    title: "Approve, block or re-queue a product",
    description:
      "Set one product's moderation status. Blocking requires a note the seller will see.",
    kind: "write",
    input: {
      productId: uuid("Product id"),
      status: moderationStatus,
      note: z.string().optional(),
    },
    async run({ productId, status, note }, ctx) {
      if (status === "blocked" && !note?.trim()) {
        return err("validation", "Add a reason so the seller knows what to fix.");
      }
      const admin = await ctx.actingAdmin();
      if (!admin.ok) return admin;
      return moderateProduct(ctx.db(), productId, admin.data.userId, status, note);
    },
  }),

  defineTool({
    name: "approve_products",
    title: "Bulk-approve products",
    description: "Approve several products at once (e.g. after reviewing the pending queue).",
    kind: "write",
    input: { productIds: z.array(z.string().uuid()).min(1).max(100) },
    async run({ productIds }, ctx) {
      const admin = await ctx.actingAdmin();
      if (!admin.ok) return admin;
      return approveProducts(ctx.db(), productIds, admin.data.userId);
    },
  }),

  defineTool({
    name: "list_categories",
    title: "List product categories",
    description: "Active product categories with ids, slugs, names and product counts.",
    kind: "read",
    input: {},
    async run(_args, ctx) {
      return ok(await listActiveCategoriesWithCounts(ctx.db()));
    },
  }),

  defineTool({
    name: "get_pending_supplier_invite",
    title: "Find a pending supplier invite",
    description:
      "Look up the active invite for a Sri Lankan mobile number (only one may be pending per number).",
    kind: "read",
    input: { phone: z.string().describe("e.g. 0771234567 or 94771234567") },
    async run({ phone }, ctx) {
      const normalized = normalizeLkPhone(phone);
      if (!normalized) return err("validation", "Not a Sri Lankan mobile number.");
      const invite = await getActiveInviteByPhone(ctx.db(), normalized);
      if (!invite) return ok(null);
      return ok({
        ...invite,
        joinUrl: buildJoinUrl(ctx.env().SUPPLIER_PORTAL_URL, invite.token),
      });
    },
  }),

  defineTool({
    name: "invite_supplier",
    title: "Invite a supplier to join",
    description:
      "Create a 30-day tokenized join link for a grower/florist and, when delivery='whatsapp', " +
      "SEND the invite message to their WhatsApp. Use delivery='link' to only create the link. " +
      "A custom message may contain {link}, which is replaced with the join URL; omit it to use the default template.",
    kind: "send",
    input: {
      phone: z.string().describe("Sri Lankan mobile, e.g. 0771234567"),
      nameEn: z.string().nullable().default(null),
      sellerTypes: z
        .array(sellerType)
        .min(1)
        .nullable()
        .default(null)
        .describe("null lets the supplier choose at registration"),
      language: z.enum(["en", "si"]).default("en"),
      message: z.string().nullable().default(null),
      delivery: z.enum(["whatsapp", "link"]),
    },
    async run(input, ctx) {
      const phone = normalizeLkPhone(input.phone);
      if (!phone) {
        return err("validation", "Enter a Sri Lankan mobile number, e.g. 0771234567.");
      }
      const admin = await ctx.actingAdmin();
      if (!admin.ok) return admin;

      const db = ctx.db();
      const token = generateInviteToken();
      const joinUrl = buildJoinUrl(ctx.env().SUPPLIER_PORTAL_URL, token);
      if (!joinUrl) {
        return err("db_unavailable", "SUPPLIER_PORTAL_URL is not configured; cannot build a join link.");
      }
      const template =
        input.message?.trim() ||
        buildInviteMessage({
          nameEn: input.nameEn,
          sellerTypes: input.sellerTypes,
          language: input.language,
          joinUrl: INVITE_LINK_PLACEHOLDER,
        });
      const message = applyInviteLink(template, joinUrl);

      const created = await createInvite(db, {
        phone,
        nameEn: input.nameEn,
        sellerTypes: input.sellerTypes,
        language: input.language,
        token,
        sentBy: admin.data.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      });
      if (!created.ok) return created;

      let delivery: { status: "sent" | "skipped" } | { status: "failed"; detail: string } = {
        status: "skipped",
      };
      if (input.delivery === "whatsapp") {
        const res = await sendAndLog(db, ctx.evolution(), phone, message);
        delivery = res.ok ? { status: "sent" } : { status: "failed", detail: res.message };
      }
      return ok({ token, joinUrl, phone, message, delivery });
    },
  }),
];
