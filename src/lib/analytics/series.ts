import { edate } from "../dates";
import type { CompanyKey } from "../instruments";

/** A stored date: any of gold / Muthoot / Manappuram may be missing. */
export interface RawRow {
  d: string;
  g?: number;
  mu?: number;
  ma?: number;
}

/** A session with both share closes and the gold that applies to it. */
export interface AlignedRow {
  date: string;
  gold: number;
  /** The date the gold price is from: earlier than `date` when it was carried forward. */
  goldDate: string;
  muthoot: number;
  manappuram: number;
  /** True for the intraday point built from live prices. */
  live?: boolean;
}

/**
 * One row per date that has both share closes, oldest first. Gold is that
 * day's MCX spot, or the latest earlier one (the workbook carries gold
 * forward the same way for weekend sessions; it also covers a day whose
 * spot file hasn't been uploaded yet).
 */
export function alignRows(raw: RawRow[]): AlignedRow[] {
  const sorted = [...raw].sort((a, b) => a.d.localeCompare(b.d));
  const out: AlignedRow[] = [];
  let gold: number | null = null;
  let goldDate = "";
  for (const r of sorted) {
    if (r.g !== undefined && r.g > 0) {
      gold = r.g;
      goldDate = r.d;
    }
    if (gold === null || !(r.mu! > 0) || !(r.ma! > 0)) continue;
    out.push({ date: r.d, gold, goldDate, muthoot: r.mu!, manappuram: r.ma! });
  }
  return out;
}

export interface LivePoint {
  date: string;
  muthoot: number;
  manappuram: number;
}

/** Adds (or replaces) today's row with live prices, on the latest gold. */
export function withLivePoint(rows: AlignedRow[], raw: RawRow[], live: LivePoint | null): AlignedRow[] {
  if (!live || rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  if (live.date < last.date) return rows;
  const goldRow = [...raw].reverse().find((r) => r.g !== undefined && r.g > 0 && r.d <= live.date);
  const row: AlignedRow = {
    date: live.date,
    gold: goldRow?.g ?? last.gold,
    goldDate: goldRow?.d ?? last.goldDate,
    muthoot: live.muthoot,
    manappuram: live.manappuram,
    live: true,
  };
  return live.date === last.date ? [...rows.slice(0, -1), row] : [...rows, row];
}

/** Trailing N-row average including the row itself (fewer rows at the very start, as in the workbook). */
export function rollingAverage(values: number[], n: number): number[] {
  const out = new Array<number>(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out[i] = sum / Math.min(n, i + 1);
  }
  return out;
}

export type Period = { kind: "months"; months: number } | { kind: "all" } | { kind: "custom"; from: string; to: string };

export interface WindowSpan {
  /** Index of the first and last row in the window (inclusive). */
  startIdx: number;
  endIdx: number;
  start: string;
  end: string;
}

/**
 * The workbook's window: from EDATE(latest, -months) (never before the first
 * row) to the latest row. Custom spans run between two dates.
 */
export function windowOf(rows: AlignedRow[], period: Period): WindowSpan | null {
  if (rows.length === 0) return null;
  let endIdx = rows.length - 1;
  let startDate: string;
  if (period.kind === "custom") {
    while (endIdx >= 0 && rows[endIdx].date > period.to) endIdx--;
    if (endIdx < 0) return null;
    startDate = period.from;
  } else if (period.kind === "all") {
    startDate = rows[0].date;
  } else {
    startDate = edate(rows[endIdx].date, -period.months);
  }
  const startIdx = rows.findIndex((r) => r.date >= startDate);
  if (startIdx < 0 || startIdx > endIdx) return null;
  return { startIdx, endIdx, start: rows[startIdx].date, end: rows[endIdx].date };
}

export function priceOf(row: AlignedRow, company: CompanyKey): number {
  return company === "muthoot" ? row.muthoot : row.manappuram;
}
