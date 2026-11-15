import { sql } from "drizzle-orm";
import seed from "../../../data/seed-history.json";
import type { RawRow } from "../analytics/series";
import { upsertGold, upsertShares } from "../prices";
import { db } from "./client";

// Same tables as schema.ts, created from the server so setup never needs a
// direct database connection from the machine doing it.
export async function ensureTables(): Promise<void> {
  await db.execute(sql`
    create table if not exists daily_price (
      date date primary key,
      gold double precision,
      gold_source varchar(16),
      muthoot double precision,
      manappuram double precision,
      share_source varchar(16),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`
    create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )`);
}

/** Loads the workbook history, but only into an empty table so it never overwrites newer data. */
export async function seedIfEmpty(): Promise<{ seeded: boolean; rows: number }> {
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from daily_price`)).rows as { n: number }[];
  if (n > 0) return { seeded: false, rows: n };
  const rows = (seed as { rows: RawRow[] }).rows;
  await upsertGold(
    rows.filter((r) => r.g !== undefined).map((r) => ({ date: r.d, price: r.g! })),
    "excel"
  );
  await upsertShares(
    rows.filter((r) => r.mu !== undefined || r.ma !== undefined).map((r) => ({ date: r.d, muthoot: r.mu, manappuram: r.ma })),
    "excel"
  );
  return { seeded: true, rows: rows.length };
}
