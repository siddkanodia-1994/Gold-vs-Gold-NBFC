import type { LedgerPoint, PeriodLedger } from "./period-ledger";

// The Summary's current-quarter block: latest Gold M spot, the quarter-to-
// date average, and the full-quarter average if spot holds for the rest of
// the quarter -- each against the previous quarter (QoQ) and the same
// quarter a year earlier (YoY). Gold-loan NBFCs' quarterly numbers follow
// the quarter's average gold, so the projection is what the quarter is on
// course to print.

export interface CurrentQuarter {
  label: string;
  prevLabel: string | null;
  yoyLabel: string | null;
  quarterEnd: string;
  spot: { date: string; value: number };
  qtd: { value: number; days: number };
  /** Weekdays left in the quarter after the latest gold day (exchange holidays aren't known, so this is approximate). */
  remainingDays: number;
  projected: number;
  prevAvg: number | null;
  yoyAvg: number | null;
}

/** "Q3 FY 2027" → "2026-12-31". Indian FY: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec (all in the year before), Q4 Jan–Mar. */
export function quarterEndOf(label: string): string | null {
  const m = /^Q(\d) FY (\d{4})$/.exec(label);
  if (!m) return null;
  const q = Number(m[1]);
  const fy = Number(m[2]);
  return q === 4 ? `${fy}-03-31` : `${fy - 1}-${["06-30", "09-30", "12-31"][q - 1]}`;
}

export function weekdaysBetween(afterIso: string, toIso: string): number {
  let n = 0;
  const d = new Date(`${afterIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  for (d.setUTCDate(d.getUTCDate() + 1); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

export function computeCurrentQuarter(model: PeriodLedger, points: LedgerPoint[]): CurrentQuarter | null {
  const last = points.at(-1);
  const label = model.quarters.at(-1);
  if (!last || !label) return null;
  const qtd = model.period("q", label);
  const quarterEnd = quarterEndOf(label);
  if (qtd.value === null || !quarterEnd) return null;
  const prevLabel = model.quarters.at(-2) ?? null;
  const m = /^Q(\d) FY (\d{4})$/.exec(label)!;
  const yoyCandidate = `Q${m[1]} FY ${Number(m[2]) - 1}`;
  const yoyLabel = model.quarters.includes(yoyCandidate) ? yoyCandidate : null;
  const remainingDays = weekdaysBetween(last.date, quarterEnd);
  const projected = (qtd.value * qtd.days + last.value * remainingDays) / (qtd.days + remainingDays);
  return {
    label,
    prevLabel,
    yoyLabel,
    quarterEnd,
    spot: { date: last.date, value: last.value },
    qtd: { value: qtd.value, days: qtd.days },
    remainingDays,
    projected,
    prevAvg: prevLabel ? model.period("q", prevLabel).value : null,
    yoyAvg: yoyLabel ? model.period("q", yoyLabel).value : null,
  };
}
