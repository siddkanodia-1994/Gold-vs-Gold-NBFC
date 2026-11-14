import { describe, expect, it } from "vitest";
import seed from "../../../data/seed-history.json";
import expected from "./excel-expected.json";
import { computeOptimiser } from "./optimiser";
import { computeRatio } from "./ratio";
import { computeRegression } from "./regression";
import { alignRows, rollingAverage, windowOf, type RawRow } from "./series";
import { percentRankInc } from "./stats";
import { COMPANIES } from "../instruments";

// The workbook as saved: 2-year lookback, 1-day gold average, latest row 08-Nov-26.
// excel-expected.json holds its cached values (Summary + Regression Charts sheets).
const rows = alignRows((seed as { rows: RawRow[] }).rows);
const avg = rollingAverage(
  rows.map((r) => r.gold),
  1
);
const span = windowOf(rows, { kind: "months", months: 24 })!;
const close = (a: number, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits);

describe("against the Excel workbook (2Y, 1D)", () => {
  it("builds the same 495-session window", () => {
    expect(rows).toHaveLength(1246);
    expect(span.start).toBe("2024-11-08");
    expect(span.end).toBe("2026-11-08");
    expect(span.endIdx - span.startIdx + 1).toBe(495);
  });

  COMPANIES.forEach((c, i) => {
    it(`${c.short}: ratio stats`, () => {
      const r = computeRatio(rows, avg, span, c.key)!;
      close(r.current.ratio, expected.ratio[i] as number, 12);
      close(r.mean, expected.mean[i] as number, 12);
      close(r.sd, expected.sd[i] as number, 12);
      close(r.z, expected.z[i] as number);
      close(r.min, expected.min[i] as number, 12);
      close(r.max, expected.max[i] as number, 12);
      close(r.fairValue, expected.fair[i] as number, 6);
      expect(r.percentile).toBe(expected.pct[i]);
      expect(r.band.replaceAll("−", "-")).toBe(expected.band[i]);
    });

    it(`${c.short}: regression`, () => {
      const g = computeRegression(rows, avg, span, c.key)!;
      close(g.fit.slope, expected.slope[i] as number, 12);
      close(g.fit.intercept, expected.intercept[i] as number, 6);
      close(g.fit.r2, expected.r2[i] as number, 12);
      close(g.fit.r, expected.r[i] as number, 12);
      close(g.current.fitted, expected.fitted[i] as number, 6);
      close(g.fit.steyx, expected.steyx[i] as number, 6);
      close(g.residualZ, expected.resz[i] as number);
      close(g.retMean, expected.retMean[i] as number, 12);
      close(g.retSd, expected.retSd[i] as number, 12);
    });
  });

  it("R² grids, by avg days and the optimum", () => {
    const o = computeOptimiser(rows, span, 1);
    COMPANIES.forEach((c, i) => o.byAvgDays[c.key].forEach((v, j) => close(v!, (expected.byAvg[i] as number[])[j], 10)));
    o.grid.muthoot.forEach((row, i) => row.forEach((v, j) => close(v!, expected.gridMu[i][j], 10)));
    expect(o.bestAvgDays.manappuram?.value).toBe(120);
    expect(o.bestLookback.muthoot?.value).toBe(60);
    expect(o.bestLookback.manappuram?.value).toBe(48);
    expect(o.bestCombo.muthoot).toMatchObject({ avgDays: 1, lookback: 60 });
  });
});

describe("percentRankInc", () => {
  it("interpolates between values and truncates to 3 digits like Excel", () => {
    expect(percentRankInc([1, 2, 3, 4], 2)).toBe(0.333);
    expect(percentRankInc([1, 2, 3, 4], 2.5)).toBe(0.5);
    expect(percentRankInc([1, 2, 3, 4], 5)).toBeNull();
  });
});
