import { describe, expect, it } from "vitest";
import seed from "../../../data/seed-history.json";
import { alignRows, type RawRow } from "../analytics/series";
import { computeMultipleBlock, computeTargetPrices, DEFAULT_SETTINGS, validSettings } from "./model";

describe("multiple block", () => {
  it("FY28 target, then discounted to FY27 and today (as the AMC block)", () => {
    // Net worth ₹10,000 Cr on 40 Cr shares → BV ₹250; P/B 2 → ₹500; ÷1.2 → 416.67; ÷1.1 → 378.79.
    const b = computeMultipleBlock("pbv", { netWorthFy28eCr: 10000, sharesCr: 40, pbBase: 2, discountFy27: 0.2, discountFy26: 0.1 }, null);
    expect(b.perShare).toBe(250);
    expect(b.fy28.base).toBe(500);
    expect(b.fy27.base).toBeCloseTo(500 / 1.2, 9);
    expect(b.current.base).toBeCloseTo(500 / 1.32, 9);
    expect(b.current.bear).toBeNull(); // no multiple typed and no band
  });
  it("a blank multiple falls back to the band's −1 SD / Mean / +1 SD", () => {
    const b = computeMultipleBlock("pe", { patFy28eCr: 4000, sharesCr: 40, discountFy27: 0, discountFy26: 0, peBull: 20 }, { mean: 12, sd: 3 });
    expect(b.multiples).toEqual({ bear: 9, base: 12, bull: 20 });
    expect(b.fromBand).toEqual({ bear: true, base: true, bull: false });
    expect(b.current).toEqual({ bear: 900, base: 1200, bull: 2000 });
  });
});

describe("target price table", () => {
  const rows = alignRows((seed as { rows: RawRow[] }).rows);
  it("Ratio = mean ± SD × gold; Best fit = line at gold ∓ x%; average rescales over methods with a value", () => {
    const t = computeTargetPrices(rows, "muthoot", { ...DEFAULT_SETTINGS, ratioPeriod: "2Y" }, {}, null);
    // 2Y ratio stats from the workbook (Summary sheet), at the latest gold.
    expect(t.ratio!.mean).toBeCloseTo(0.02424663290813921, 12);
    expect(t.methods.ratio.base).toBeCloseTo(0.02424663290813921 * 141032, 6);
    expect(t.methods.ratio.bear).toBeCloseTo((0.02424663290813921 - 0.0033307421031557242) * 141032, 6);
    const line = t.bestFit!;
    expect(t.methods.bestFit.bull).toBeCloseTo(line.intercept + line.slope * 141032 * 1.1, 6);
    // No FY28E inputs → no multiple target, so the average is Ratio 35 : Best fit 15 rescaled to 100.
    expect(t.methods.multiple.base).toBeNull();
    expect(t.average.base).toBeCloseTo((t.methods.ratio.base! * 35 + t.methods.bestFit.base! * 15) / 50, 6);
    expect(t.shares).toEqual({ ratio: 0.7, bestFit: 0.3, multiple: null });
  });
  it("accepts the defaults as valid settings", () => {
    expect(validSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(validSettings({ ...DEFAULT_SETTINGS, ratioGoldAt: 3 })).toBe(false);
  });
});
