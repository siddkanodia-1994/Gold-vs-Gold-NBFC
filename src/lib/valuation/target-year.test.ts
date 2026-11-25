import { describe, expect, it } from "vitest";
import { computeMultipleBlock, DEFAULT_SETTINGS, validSettings, type CompanyInputs } from "./model";
import { estimateFor, fiscalYearOf, fyLabel, inputsForTargetYear, targetYearOptions, withEstimate } from "./target-year";

// Muthoot's saved inputs on production (24 Nov 2026).
const muthoot: CompanyInputs = { discountFy27: 0.18, discountFy26: 0.09, netWorthFy28eCr: 64723, sharesCr: 40.15, pbBear: 2.68, pbBase: 3.12, pbBull: 3.56 };

describe("target year", () => {
  it("labels, the current fiscal year and the switch's options", () => {
    expect(fyLabel(2029)).toBe("FY29");
    expect(fiscalYearOf("2026-11-25")).toBe(2027);
    expect(fiscalYearOf("2027-03-31")).toBe(2027);
    expect(fiscalYearOf("2027-04-01")).toBe(2028);
    expect(targetYearOptions(2027, 2028)).toEqual([2028, 2029, 2030]);
    expect(targetYearOptions(2028, 2028)).toEqual([2028, 2029, 2030, 2031]); // the chosen year stays until changed
  });

  it("FY28 leaves the inputs as they are, so today's targets don't move", () => {
    expect(inputsForTargetYear(muthoot, 2028)).toBe(muthoot);
    const b = computeMultipleBlock("pbv", inputsForTargetYear(muthoot, 2028), null);
    expect(b.current.base).toBeCloseTo(((64723 / 40.15) * 3.12) / (1.18 * 1.09), 9);
  });

  it("another year reads its own figures, and the rates stay per step", () => {
    const withFy29 = withEstimate(muthoot, "netWorthFy28eCr", 2029, 75000);
    expect(withFy29.netWorthFy28eCr).toBe(64723); // FY28 untouched
    expect(withFy29.estimates).toEqual({ "2029": { netWorthCr: 75000 } });
    expect(estimateFor(withFy29, "netWorthFy28eCr", 2029)).toBe(75000);
    const b = computeMultipleBlock("pbv", inputsForTargetYear(withFy29, 2029), null);
    // FY29 price ÷ 1.18 (to FY28) ÷ 1.09 (to FY27): the same two rates, one year later.
    expect(b.fy28.base).toBeCloseTo((75000 / 40.15) * 3.12, 9);
    expect(b.current.base).toBeCloseTo(((75000 / 40.15) * 3.12) / (1.18 * 1.09), 9);
  });

  it("a year with nothing typed comes out blank, not FY28's figure", () => {
    const y = inputsForTargetYear(muthoot, 2030);
    expect(y.netWorthFy28eCr).toBeNull();
    expect(computeMultipleBlock("pbv", y, null).current.base).toBeNull();
  });

  it("saving keeps the other years and fields", () => {
    const a = withEstimate(withEstimate(muthoot, "netWorthFy28eCr", 2029, 75000), "patFy28eCr", 2029, 6000);
    const b = withEstimate(a, "netWorthFy28eCr", 2030, 88000);
    expect(b.estimates).toEqual({ "2029": { netWorthCr: 75000, patCr: 6000 }, "2030": { netWorthCr: 88000 } });
    expect(withEstimate(b, "netWorthFy28eCr", 2028, 65000).netWorthFy28eCr).toBe(65000);
  });

  it("settings need a target year in range", () => {
    expect(validSettings({ ...DEFAULT_SETTINGS, targetFy: 2029 })).toBe(true);
    expect(validSettings({ ...DEFAULT_SETTINGS, targetFy: 2029.5 })).toBe(false);
    expect(validSettings({ ...DEFAULT_SETTINGS, targetFy: 2050 })).toBe(false);
  });
});
