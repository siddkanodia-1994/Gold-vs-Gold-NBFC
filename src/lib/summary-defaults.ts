import { sql } from "drizzle-orm";
import { LEDGER_WEEKDAYS, type LedgerWeekday } from "./analytics/period-ledger";
import { db, hasDatabase } from "./db/client";

// The Summary tab's saved default (shared by everyone, saved without a
// password at the user's request): which view opens, whether the weekday
// tables show, and the ledger's row picks -- stored as positions back from
// the latest period (0 = latest, 1 = the one before, ...) so they roll
// forward as new months and quarters arrive.

export type SummaryView = "gold" | "model";

export interface SummaryDefaults {
  view: SummaryView;
  hideWeekdays: boolean;
  rows: { fy: number[]; q: number[]; m: number[]; wq: Record<LedgerWeekday, number[]> };
}

/** The AMC ledger's own defaults, as offsets: latest + previous; the 4th quarter row is the same quarter a year back. */
export const STANDARD_DEFAULTS: SummaryDefaults = {
  view: "gold",
  hideWeekdays: true,
  rows: {
    fy: [0, 1],
    q: [0, 1, 2, 4],
    m: [0, 1, 2],
    wq: Object.fromEntries(LEDGER_WEEKDAYS.map((d) => [d, [0, 1, 4]])) as Record<LedgerWeekday, number[]>,
  },
};

const LENGTHS = { fy: 2, q: 4, m: 3 } as const;
const offsets = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 400);

export function validSummaryDefaults(v: unknown): v is SummaryDefaults {
  const s = v as SummaryDefaults;
  return (
    !!s &&
    (s.view === "gold" || s.view === "model") &&
    typeof s.hideWeekdays === "boolean" &&
    !!s.rows &&
    (Object.keys(LENGTHS) as (keyof typeof LENGTHS)[]).every((k) => offsets(s.rows[k], LENGTHS[k])) &&
    !!s.rows.wq &&
    LEDGER_WEEKDAYS.every((d) => offsets(s.rows.wq[d], 3))
  );
}

/** Label ↔ offset against a period list (oldest first). */
export function toOffset(list: string[], label: string): number {
  const i = list.indexOf(label);
  return i < 0 ? 0 : list.length - 1 - i;
}
export function fromOffset(list: string[], offset: number): string {
  return list[Math.max(0, list.length - 1 - offset)] ?? "";
}

export async function loadSummaryDefaults(): Promise<SummaryDefaults> {
  if (!hasDatabase()) return STANDARD_DEFAULTS;
  const r = (await db.execute(sql`select value from valuation_model where key = 'summary-defaults'`)).rows as { value: string }[];
  const saved = r[0] ? JSON.parse(r[0].value) : null;
  return validSummaryDefaults(saved) ? saved : STANDARD_DEFAULTS;
}

export async function saveSummaryDefaults(d: SummaryDefaults): Promise<void> {
  await db.execute(sql`
    insert into valuation_model (key, value, updated_at) values ('summary-defaults', ${JSON.stringify(d)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
}
