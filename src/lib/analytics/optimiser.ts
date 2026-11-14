import { edate } from "../dates";
import { COMPANIES, type CompanyKey } from "../instruments";
import { rsq } from "./stats";
import { priceOf, rollingAverage, type AlignedRow } from "./series";

// The workbook's Summary grids: R² of Price on N-day avg gold for each
// avg-days × lookback combination, each lookback counted back from the
// window's last row.
export const AVG_DAYS_GRID = [1, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 200];
export const LOOKBACK_GRID = [6, 12, 24, 36, 48, 60];

export type R2Grid = Record<CompanyKey, (number | null)[][]>;

export interface Best {
  value: number;
  r2: number;
}

function argmax(values: (number | null)[], keys: number[]): Best | null {
  let best: Best | null = null;
  values.forEach((v, i) => {
    if (v !== null && (best === null || v > best.r2)) best = { value: keys[i], r2: v };
  });
  return best;
}

export interface OptimiserResult {
  /** R² by avg days for the current window. */
  byAvgDays: Record<CompanyKey, (number | null)[]>;
  bestAvgDays: Record<CompanyKey, Best | null>;
  /** [avgDaysIdx][lookbackIdx] */
  grid: R2Grid;
  /** Best avg days per lookback column. */
  bestPerLookback: Record<CompanyKey, (Best | null)[]>;
  /** R² by lookback at the current avg days. */
  byLookback: Record<CompanyKey, (number | null)[]>;
  bestLookback: Record<CompanyKey, Best | null>;
  bestCombo: Record<CompanyKey, { avgDays: number; lookback: number; r2: number } | null>;
}

function r2Over(rows: AlignedRow[], avg: number[], startIdx: number, endIdx: number, company: CompanyKey): number | null {
  if (endIdx - startIdx < 2) return null;
  const ys: number[] = [];
  const xs: number[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    ys.push(priceOf(rows[i], company));
    xs.push(avg[i]);
  }
  return rsq(ys, xs);
}

export function computeOptimiser(rows: AlignedRow[], window: { startIdx: number; endIdx: number }, avgDays: number): OptimiserResult {
  const endIdx = window.endIdx;
  const golds = rows.map((r) => r.gold);
  const avgs = new Map<number, number[]>();
  const avgOf = (n: number) => {
    if (!avgs.has(n)) avgs.set(n, rollingAverage(golds, n));
    return avgs.get(n)!;
  };
  const lookbackStart = LOOKBACK_GRID.map((m) => {
    const from = edate(rows[endIdx].date, -m);
    const i = rows.findIndex((r) => r.date >= from);
    return i < 0 ? 0 : i;
  });

  const empty = <T,>(f: () => T) => Object.fromEntries(COMPANIES.map((c) => [c.key, f()])) as Record<CompanyKey, T>;
  const byAvgDays = empty<(number | null)[]>(() => []);
  const grid = empty<(number | null)[][]>(() => []);
  const byLookback = empty<(number | null)[]>(() => []);
  for (const c of COMPANIES) {
    byAvgDays[c.key] = AVG_DAYS_GRID.map((n) => r2Over(rows, avgOf(n), window.startIdx, endIdx, c.key));
    grid[c.key] = AVG_DAYS_GRID.map((n) => lookbackStart.map((s) => r2Over(rows, avgOf(n), s, endIdx, c.key)));
    byLookback[c.key] = lookbackStart.map((s) => r2Over(rows, avgOf(avgDays), s, endIdx, c.key));
  }

  const bestAvgDays = empty(() => null as Best | null);
  const bestPerLookback = empty<(Best | null)[]>(() => []);
  const bestLookback = empty(() => null as Best | null);
  const bestCombo = empty(() => null as { avgDays: number; lookback: number; r2: number } | null);
  for (const c of COMPANIES) {
    bestAvgDays[c.key] = argmax(byAvgDays[c.key], AVG_DAYS_GRID);
    bestPerLookback[c.key] = LOOKBACK_GRID.map((_, j) => argmax(grid[c.key].map((row) => row[j]), AVG_DAYS_GRID));
    bestLookback[c.key] = argmax(byLookback[c.key], LOOKBACK_GRID);
    let combo: { avgDays: number; lookback: number; r2: number } | null = null;
    grid[c.key].forEach((row, i) =>
      row.forEach((v, j) => {
        if (v !== null && (combo === null || v > combo.r2)) combo = { avgDays: AVG_DAYS_GRID[i], lookback: LOOKBACK_GRID[j], r2: v };
      })
    );
    bestCombo[c.key] = combo;
  }
  return { byAvgDays, bestAvgDays, grid, bestPerLookback, byLookback, bestLookback, bestCombo };
}
