import type { CompanyKey } from "../instruments";
import { linearFit, mean, stdevS, type LinearFit } from "./stats";
import { priceOf, type AlignedRow, type WindowSpan } from "./series";

export interface RegressionPoint {
  date: string;
  /** N-day avg gold (x). */
  x: number;
  /** Share price (y). */
  y: number;
  fitted: number;
  /** The workbook's "return to best fit": fitted ÷ actual − 1. */
  retToFit: number;
}

export interface RegressionResult {
  fit: LinearFit;
  points: RegressionPoint[];
  current: RegressionPoint;
  residual: number;
  /** Residual ÷ STEYX. */
  residualZ: number;
  signal: string;
  /** Mean and STDEV.S of return-to-fit over the window (the workbook's band stats). */
  retMean: number;
  retSd: number;
  retZ: number;
}

/** The workbook's "Regression signal". */
export function signalOf(residualZ: number): string {
  if (residualZ <= -1) return "Cheap vs gold";
  if (residualZ >= 1) return "Rich vs gold";
  return "Within ±1 SE";
}

/** Price = a + b × N-day avg gold, fitted on the window. */
export function computeRegression(rows: AlignedRow[], avgGold: number[], span: WindowSpan, company: CompanyKey): RegressionResult | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = span.startIdx; i <= span.endIdx; i++) {
    xs.push(avgGold[i]);
    ys.push(priceOf(rows[i], company));
  }
  const fit = linearFit(ys, xs);
  if (!fit) return null;
  const points = xs.map((x, j) => {
    const fitted = fit.intercept + fit.slope * x;
    return { date: rows[span.startIdx + j].date, x, y: ys[j], fitted, retToFit: fitted / ys[j] - 1 };
  });
  const current = points[points.length - 1];
  const residual = current.y - current.fitted;
  const residualZ = fit.steyx > 0 ? residual / fit.steyx : 0;
  const rets = points.map((p) => p.retToFit);
  const retMean = mean(rets);
  const retSd = stdevS(rets);
  return {
    fit,
    points,
    current,
    residual,
    residualZ,
    signal: signalOf(residualZ),
    retMean,
    retSd,
    retZ: retSd > 0 ? (current.retToFit - retMean) / retSd : 0,
  };
}

/**
 * Return-to-fit at `k` SDs from its mean, and the price that would put it
 * there today: fitted ÷ (1 + return).
 */
export function retLevel(r: RegressionResult, k: number): { ret: number; price: number; upside: number } {
  const ret = r.retMean + k * r.retSd;
  const price = r.current.fitted / (1 + ret);
  return { ret, price, upside: price / r.current.y - 1 };
}
