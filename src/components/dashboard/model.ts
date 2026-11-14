import { computeRatio, type RatioResult } from "@/lib/analytics/ratio";
import { computeRegression, type RegressionResult } from "@/lib/analytics/regression";
import { rollingAverage, windowOf, type AlignedRow, type Period, type WindowSpan } from "@/lib/analytics/series";
import { COMPANIES, type CompanyKey } from "@/lib/instruments";

/** Everything the sections draw from, for one set of toolbar settings. */
export interface Model {
  rows: AlignedRow[];
  /** N-day avg gold for every row (not just the window). */
  avgGold: number[];
  span: WindowSpan;
  avgDays: number;
  periodLabel: string;
  ratio: Record<CompanyKey, RatioResult | null>;
  reg: Record<CompanyKey, RegressionResult | null>;
  /** The window's last row is the intraday live point. */
  isLive: boolean;
}

export function buildModel(rows: AlignedRow[], period: Period, avgDays: number, periodLabel: string): Model | null {
  const span = windowOf(rows, period);
  if (!span) return null;
  const avgGold = rollingAverage(
    rows.map((r) => r.gold),
    avgDays
  );
  const ratio = {} as Model["ratio"];
  const reg = {} as Model["reg"];
  for (const c of COMPANIES) {
    ratio[c.key] = computeRatio(rows, avgGold, span, c.key);
    reg[c.key] = computeRegression(rows, avgGold, span, c.key);
  }
  return { rows, avgGold, span, avgDays, periodLabel, ratio, reg, isLive: Boolean(rows[span.endIdx]?.live) };
}

export function goldLabel(avgDays: number): string {
  return avgDays > 1 ? `Gold ${avgDays}D avg` : "Gold M spot";
}
