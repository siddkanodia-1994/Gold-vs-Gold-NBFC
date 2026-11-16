import type { LedgerPoint } from "./period-ledger";
import type { RawRow } from "./series";

// One-off sessions kept out of the gold ledger's averages, day counts and
// weekday figures: every weekend date (Muhurat Sundays, DR-test and Budget
// Saturdays) and the weekday Muhurat sessions on Diwali, when the exchanges
// are otherwise shut.
export const GOLD_LEDGER_SPECIAL_SESSIONS: ReadonlySet<string> = new Set([
  "2021-11-04", // Muhurat (Thursday)
  "2022-10-24", // Muhurat (Monday)
  "2024-11-01", // Muhurat (Friday)
  "2025-10-21", // Muhurat (Tuesday)
]);

function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** Stored rows → one ledger point per MCX gold day, special sessions removed. */
export function goldLedgerPoints(rows: RawRow[]): LedgerPoint[] {
  return rows.flatMap((r) => (r.g !== undefined && r.g > 0 && !isWeekend(r.d) && !GOLD_LEDGER_SPECIAL_SESSIONS.has(r.d) ? [{ date: r.d, value: r.g }] : []));
}
