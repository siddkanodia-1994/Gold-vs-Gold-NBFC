import { fetchDailyCloses } from "./dhan/client";
import { getDhanCredentials } from "./dhan/token";
import { COMPANIES } from "./instruments";
import { upsertShares } from "./prices";

export interface SyncResult {
  from: string;
  to: string;
  days: number;
  latest: string | null;
}

/** Pulls both stocks' daily closes from DHAN for [from, to] and stores them. */
export async function syncShareCloses(from: string, to: string): Promise<SyncResult> {
  const credentials = await getDhanCredentials();
  const byDate = new Map<string, { date: string; muthoot?: number; manappuram?: number }>();
  for (const c of COMPANIES) {
    for (const { date, close } of await fetchDailyCloses(c.securityId, from, to, credentials)) {
      const row = byDate.get(date) ?? { date };
      row[c.key] = close;
      byDate.set(date, row);
    }
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  await upsertShares(rows, "dhan");
  return { from, to, days: rows.length, latest: rows.at(-1)?.date ?? null };
}
