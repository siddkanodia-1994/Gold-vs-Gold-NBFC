import type { CompanyKey } from "../instruments";
import { mean, percentRankInc, stdevP } from "./stats";
import { priceOf, type AlignedRow, type WindowSpan } from "./series";

export const SD_LEVELS = [2, 1, 0, -1, -2] as const;

export interface RatioPoint {
  date: string;
  ratio: number;
  price: number;
  avgGold: number;
}

export interface RatioResult {
  points: RatioPoint[];
  mean: number;
  /** STDEV.P of the window's ratios, as in the workbook. */
  sd: number;
  min: number;
  max: number;
  current: RatioPoint;
  z: number;
  band: string;
  /** PERCENTRANK.INC of today's ratio within the window (0–1). */
  percentile: number | null;
  /** Price at the mean ratio: mean × today's avg gold. */
  fairValue: number;
  upsideToFair: number;
}

/** The workbook's "Band position" wording. */
export function bandOf(z: number): string {
  if (z >= 2) return "Above +2 SD";
  if (z >= 1) return "+1 to +2 SD";
  if (z >= 0) return "Mean to +1 SD";
  if (z > -1) return "−1 SD to Mean";
  if (z > -2) return "−2 to −1 SD";
  return "Below −2 SD";
}

/** Share price ÷ N-day avg gold over the window. `avgGold` covers every row, not just the window. */
export function computeRatio(rows: AlignedRow[], avgGold: number[], span: WindowSpan, company: CompanyKey): RatioResult | null {
  const points: RatioPoint[] = [];
  for (let i = span.startIdx; i <= span.endIdx; i++) {
    const price = priceOf(rows[i], company);
    points.push({ date: rows[i].date, price, avgGold: avgGold[i], ratio: price / avgGold[i] });
  }
  if (points.length < 3) return null;
  const ratios = points.map((p) => p.ratio);
  const m = mean(ratios);
  const sd = stdevP(ratios);
  const current = points[points.length - 1];
  const z = sd > 0 ? (current.ratio - m) / sd : 0;
  const fairValue = m * current.avgGold;
  return {
    points,
    mean: m,
    sd,
    min: Math.min(...ratios),
    max: Math.max(...ratios),
    current,
    z,
    band: bandOf(z),
    percentile: percentRankInc(ratios, current.ratio),
    fairValue,
    upsideToFair: fairValue / current.price - 1,
  };
}

/** Ratio and price at `k` SDs from the mean (price = ratio × today's avg gold). */
export function ratioLevel(r: RatioResult, k: number): { ratio: number; price: number; upside: number } {
  const ratio = r.mean + k * r.sd;
  const price = ratio * r.current.avgGold;
  return { ratio, price, upside: price / r.current.price - 1 };
}
