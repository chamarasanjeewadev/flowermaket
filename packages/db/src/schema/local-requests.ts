import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { language } from "./enums";
import { shops } from "./shops";
import { supplierInvites } from "./supplier-invites";
import { bouquetGenerations } from "./bouquet-generations";

/** Bouquet design a customer sends to local florists (stored as jsonb). */
export interface BouquetDesign {
  flowers: { flowerId: string; nameEn: string; qty: number }[];
  fillers: { flowerId: string; nameEn: string; qty: number }[];
  wrapping: string | null;
  addons: string[];
  cardMessage: string | null;
  notes: string | null;
}

/**
 * Every florist we know about (Google Places seeded, registered or claimed).
 * Status/location_source are text with CHECK constraints (see 0024 migration):
 *   status: unclaimed | invited | claimed | opted_out | blocked
 *   location_source: google | owner | admin
 */
export const floristListings = pgTable(
  "florist_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googlePlaceId: text("google_place_id").unique(),
    shopId: uuid("shop_id").unique().references(() => shops.id),
    name: text("name").notNull(),
    /** Canonical 94XXXXXXXXX. */
    phone: text("phone"),
    address: text("address"),
    district: text("district"),
    city: text("city"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    locationSource: text("location_source").notNull().default("google"),
    googleRating: real("google_rating"),
    googleReviewCount: integer("google_review_count"),
    googleMapsUri: text("google_maps_uri"),
    googleSyncedAt: timestamp("google_synced_at", { withTimezone: true }),
    status: text("status").notNull().default("unclaimed"),
    supplierInviteId: uuid("supplier_invite_id").references(() => supplierInvites.id),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("florist_listings_lat_lng_idx").on(t.lat, t.lng),
    index("florist_listings_status_idx").on(t.status),
    index("florist_listings_phone_idx").on(t.phone),
  ],
);

/**
 * A customer's bouquet request.
 *   status: pending_verification | open | accepted | expired | cancelled | completed
 *   fulfilment: delivery | pickup
 *   needed_window: morning | afternoon | evening | any
 */
export const bouquetRequests = pgTable(
  "bouquet_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `LR-` + 6 chars, used in WhatsApp text. */
    ref: text("ref").unique().notNull(),
    /** SHA-256 of the customer page token; the token itself is never stored. */
    accessTokenHash: text("access_token_hash").unique().notNull(),
    status: text("status").notNull().default("pending_verification"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    language: language("language").notNull(),
    design: jsonb("design").$type<BouquetDesign>().notNull(),
    occasion: text("occasion"),
    /** Integer LKR cents. */
    budgetMinCents: integer("budget_min_cents").notNull(),
    /** Null = open-ended top band (20,000+). */
    budgetMaxCents: integer("budget_max_cents"),
    fulfilment: text("fulfilment").notNull(),
    deliveryLat: doublePrecision("delivery_lat").notNull(),
    deliveryLng: doublePrecision("delivery_lng").notNull(),
    /** Suburb/city label: the only location shops see before acceptance. */
    deliveryArea: text("delivery_area").notNull(),
    /** Full address, revealed only to the accepted shop. */
    deliveryAddress: text("delivery_address"),
    neededOn: date("needed_on", { mode: "string" }).notNull(),
    neededWindow: text("needed_window").notNull(),
    radiusKm: integer("radius_km").notNull().default(10),
    /** Set when the request opens; closes quoting only. */
    quoteDeadlineAt: timestamp("quote_deadline_at", { withTimezone: true }),
    noFloristsInRange: boolean("no_florists_in_range").notNull().default(false),
    /** No FK on purpose: avoids a cycle with bouquet_request_offers. */
    acceptedOfferId: uuid("accepted_offer_id"),
    /** Last customer "N quotes so far" digest; drives the 2 h throttle. */
    customerNotifiedAt: timestamp("customer_notified_at", { withTimezone: true }),
    bouquetGenerationId: uuid("bouquet_generation_id").references(() => bouquetGenerations.id),
    utm: jsonb("utm").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bouquet_requests_status_idx").on(t.status),
    index("bouquet_requests_customer_phone_idx").on(t.customerPhone),
  ],
);

/**
 * One per florist contacted (also the lead log).
 *   status: pending_approval | skipped | sent | send_failed | viewed | quoted
 *           | declined | accepted | not_selected | expired
 */
export const bouquetRequestOffers = pgTable(
  "bouquet_request_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => bouquetRequests.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => floristListings.id),
    /** Snapshot at send time. */
    shopId: uuid("shop_id").references(() => shops.id),
    distanceM: integer("distance_m").notNull(),
    status: text("status").notNull().default("pending_approval"),
    /** SHA-256 of the florist magic-link token. */
    tokenHash: text("token_hash").unique().notNull(),
    /** Integer LKR cents. */
    priceCents: integer("price_cents"),
    deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    message: text("message"),
    /** Optional example photo in storage bucket `lead-photos`. */
    photoPath: text("photo_path"),
    declineReason: text("decline_reason"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    notificationStatus: text("notification_status"),
    notificationError: text("notification_error"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bouquet_request_offers_req_listing_uq").on(t.requestId, t.listingId),
    index("bouquet_request_offers_listing_idx").on(t.listingId),
    index("bouquet_request_offers_shop_idx").on(t.shopId),
    index("bouquet_request_offers_status_idx").on(t.status),
  ],
);

/** Phone-verification OTPs for requests (hash only, never the code). */
export const bouquetRequestOtps = pgTable("bouquet_request_otps", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => bouquetRequests.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
