import { and, count, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";

const ANON_MAX = 1;
const USER_MAX_PER_DAY = 3;
const COOLOFF_MS = 5 * 60 * 1000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "anon_limit" | "user_limit" | "cooloff"; resetAt?: Date };

export async function checkBouquetRateLimit(
  db: Db,
  opts: { userId: string | null; ipAddress: string },
): Promise<RateLimitResult> {
  const now = new Date();
  const cooloffStart = new Date(now.getTime() - COOLOFF_MS);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const cooloffWhere = opts.userId
    ? and(
        eq(schema.bouquetGenerations.userId, opts.userId),
        gt(schema.bouquetGenerations.createdAt, cooloffStart),
      )
    : and(
        isNull(schema.bouquetGenerations.userId),
        eq(schema.bouquetGenerations.ipAddress, opts.ipAddress),
        gt(schema.bouquetGenerations.createdAt, cooloffStart),
      );

  const [cooloffRow] = await db
    .select({ createdAt: schema.bouquetGenerations.createdAt })
    .from(schema.bouquetGenerations)
    .where(cooloffWhere)
    .orderBy(desc(schema.bouquetGenerations.createdAt))
    .limit(1);

  if (cooloffRow) {
    const resetAt = new Date(cooloffRow.createdAt.getTime() + COOLOFF_MS);
    return { allowed: false, reason: "cooloff", resetAt };
  }

  if (opts.userId) {
    const [row] = await db
      .select({ cnt: count() })
      .from(schema.bouquetGenerations)
      .where(
        and(
          eq(schema.bouquetGenerations.userId, opts.userId),
          gt(schema.bouquetGenerations.createdAt, dayAgo),
        ),
      );
    if ((row?.cnt ?? 0) >= USER_MAX_PER_DAY) {
      return { allowed: false, reason: "user_limit" };
    }
  } else {
    const [row] = await db
      .select({ cnt: count() })
      .from(schema.bouquetGenerations)
      .where(
        and(
          isNull(schema.bouquetGenerations.userId),
          eq(schema.bouquetGenerations.ipAddress, opts.ipAddress),
        ),
      );
    if ((row?.cnt ?? 0) >= ANON_MAX) {
      return { allowed: false, reason: "anon_limit" };
    }
  }

  return { allowed: true };
}

export async function recordBouquetGeneration(
  db: Db,
  opts: {
    userId: string | null;
    ipAddress: string;
    flowersJson: string | null;
    imageStoragePath: string | null;
    imagePublicUrl: string | null;
  },
): Promise<void> {
  await db.insert(schema.bouquetGenerations).values({
    userId: opts.userId ?? null,
    ipAddress: opts.ipAddress,
    flowersJson: opts.flowersJson,
    imageStoragePath: opts.imageStoragePath,
    imagePublicUrl: opts.imagePublicUrl,
  });
}

export interface BouquetGenerationRow {
  id: string;
  userId: string | null;
  ipAddress: string;
  flowersJson: string | null;
  imagePublicUrl: string | null;
  createdAt: Date;
}

export async function listBouquetGenerations(
  db: Db,
  opts: { limit?: number; publicOnly?: boolean } = {},
): Promise<BouquetGenerationRow[]> {
  return db
    .select({
      id: schema.bouquetGenerations.id,
      userId: schema.bouquetGenerations.userId,
      ipAddress: schema.bouquetGenerations.ipAddress,
      flowersJson: schema.bouquetGenerations.flowersJson,
      imagePublicUrl: schema.bouquetGenerations.imagePublicUrl,
      createdAt: schema.bouquetGenerations.createdAt,
    })
    .from(schema.bouquetGenerations)
    .where(opts.publicOnly ? isNotNull(schema.bouquetGenerations.imagePublicUrl) : undefined)
    .orderBy(desc(schema.bouquetGenerations.createdAt))
    .limit(opts.limit ?? 200);
}
