import { asc, sql } from "drizzle-orm";
import seed from "../../data/seed-history.json";
import { db, hasDatabase } from "./db/client";
import { dailyPrice } from "./db/schema";
import type { RawRow } from "./analytics/series";

/** Every stored date, oldest first. Falls back to the bundled seed history when no database is configured. */
export async function loadHistory(): Promise<{ rows: RawRow[]; source: "db" | "seed" }> {
  if (!hasDatabase()) return { rows: (seed as { rows: RawRow[] }).rows, source: "seed" };
  const rows = await db.select().from(dailyPrice).orderBy(asc(dailyPrice.date));
  return {
    source: "db",
    rows: rows.map((r) => ({
      d: r.date,
      ...(r.gold !== null ? { g: r.gold } : {}),
      ...(r.muthoot !== null ? { mu: r.muthoot } : {}),
      ...(r.manappuram !== null ? { ma: r.manappuram } : {}),
    })),
  };
}

const BATCH = 500;

/** Upserts gold prices, leaving the share columns of existing rows alone. */
export async function upsertGold(rows: { date: string; price: number }[], source: string): Promise<number> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await db
      .insert(dailyPrice)
      .values(chunk.map((r) => ({ date: r.date, gold: r.price, goldSource: source })))
      .onConflictDoUpdate({
        target: dailyPrice.date,
        set: { gold: sql`excluded.gold`, goldSource: sql`excluded.gold_source`, updatedAt: new Date() },
      });
  }
  return rows.length;
}

/** Upserts share closes; a missing company keeps its stored value. */
export async function upsertShares(rows: { date: string; muthoot?: number; manappuram?: number }[], source: string): Promise<number> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await db
      .insert(dailyPrice)
      .values(chunk.map((r) => ({ date: r.date, muthoot: r.muthoot ?? null, manappuram: r.manappuram ?? null, shareSource: source })))
      .onConflictDoUpdate({
        target: dailyPrice.date,
        set: {
          muthoot: sql`coalesce(excluded.muthoot, ${dailyPrice.muthoot})`,
          manappuram: sql`coalesce(excluded.manappuram, ${dailyPrice.manappuram})`,
          shareSource: sql`excluded.share_source`,
          updatedAt: new Date(),
        },
      });
  }
  return rows.length;
}
