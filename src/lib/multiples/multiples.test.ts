import { describe, expect, it } from "vitest";
import { computeBands, niceYAxis } from "./bands";
import { computeAnchor, derivePoints, firstQuarterEndBetween, withLivePoint } from "./derive";
import { parseAceRows, validateAceRows } from "./parse-ace";
import type { MultiplePoint } from "./types";

// Synthetic numbers only: the real Ace Equity values are licensed and never committed.
const ace = (date: string, pe: number, pbv: number, mcapSales: number): MultiplePoint => ({ date, pe, pbv, mcapSales, source: "ace" });

describe("parseAceRows", () => {
  const sheet: unknown[][] = [
    ["Query - Query Expression"],
    ["Accord Code", "Company Name", "NDP_Date", "NDP_Consolidated MCAP NS", "NDP_Consolidated Price BV", "NDP_Consolidated PE"],
    [221790, "Muthoot Finance Ltd.", 46327, 4, 3, 15],
    [131213, "Manappuram Finance Ltd.", "2026-11-13", 2.5, 1.5, null],
    [999999, "Someone Else", 46327, 1, 1, 1],
    [],
    ["Source:Ace Equity Nxt..."],
  ];
  it("maps Accord Codes, Excel serial dates and blanks", () => {
    const { rows, errors } = parseAceRows(sheet);
    expect(rows).toEqual([
      { company: "manappuram", date: "2026-11-13", pe: null, pbv: 1.5, mcapSales: 2.5 },
      { company: "muthoot", date: "2026-11-01", pe: 15, pbv: 3, mcapSales: 4 },
    ]);
    expect(errors).toHaveLength(1);
  });
  it("rejects a file without the expected columns", () => {
    expect(parseAceRows([["Accord Code", "NDP_Date"]]).errors[0]).toMatch(/Missing column/);
  });
  it("server validation refuses junk", () => {
    expect(validateAceRows([{ company: "muthoot", date: "2026-11-13", pe: "x" }]).error).toMatch(/Bad pe/);
    expect(validateAceRows([{ company: "hdfc", date: "2026-11-13" }]).error).toMatch(/Unknown company/);
  });
});

describe("anchoring and price-updated days", () => {
  // Price 100 on every Ace day; PE 10 / 10 / 10.2 / 9.8 / 10 → implied EPS median 10.
  const aceRows = [ace("2026-11-09", 10, 2, 4), ace("2026-11-10", 10, 2, 4), ace("2026-11-11", 10.2, 2, 4), ace("2026-11-12", 9.8, 2, 4), ace("2026-11-13", 10, 2, 4)];
  const closes = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].map((date) => ({ date, price: 100 }));

  it("backs out per-share figures with a median over the last 5 Ace days", () => {
    const a = computeAnchor(aceRows, closes)!;
    expect(a.date).toBe("2026-11-13");
    expect(a.pe).toBeCloseTo(10, 9);
    expect(a.pbv).toBeCloseTo(50, 9);
    expect(a.mcapSales).toBeCloseTo(25, 9);
  });

  it("never anchors across a quarter-end", () => {
    const a = computeAnchor([ace("2026-09-29", 20, 2, 4), ace("2026-09-30", 10, 2, 4)], [{ date: "2026-09-29", price: 100 }, { date: "2026-09-30", price: 100 }])!;
    expect(a.pe).toBeCloseTo(10, 9); // only the 30 Sep row, which already carries the new quarter
  });

  it("re-prices later closes and the live price on the held figures", () => {
    const a = computeAnchor(aceRows, closes)!;
    const later = derivePoints(a, [...closes, { date: "2026-11-16", price: 110 }]);
    expect(later).toEqual([{ date: "2026-11-16", pe: 11, pbv: 2.2, mcapSales: 4.4, source: "derived" }]);
    const withLive = withLivePoint([...aceRows, ...later], a, { date: "2026-11-17", price: 90 });
    expect(withLive.at(-1)).toMatchObject({ date: "2026-11-17", pe: 9, source: "live" });
    // An Ace row for today wins over the live price.
    expect(withLivePoint(aceRows, a, { date: "2026-11-13", price: 90 }).at(-1)?.source).toBe("ace");
  });

  it("flags the first quarter-end passed since the anchor", () => {
    expect(firstQuarterEndBetween("2026-11-13", "2026-12-30")).toBeNull();
    expect(firstQuarterEndBetween("2026-11-13", "2027-01-05")).toBe("2026-12-31");
  });
});

describe("bands", () => {
  it("uses the sample SD and the last value as current", () => {
    const b = computeBands([1, 2, 3, 4])!;
    expect(b.mean).toBe(2.5);
    expect(b.sd).toBeCloseTo(Math.sqrt(5 / 3), 12);
    expect(b.z).toBeCloseTo(1.5 / Math.sqrt(5 / 3), 12);
  });
  it("keeps every band line on the axis, even a negative −2 SD", () => {
    const vals = [5, 6, 60, 7];
    const b = computeBands(vals)!;
    const y = niceYAxis(vals, b);
    expect(y.min).toBeLessThanOrEqual(b.mean - 2 * b.sd);
    expect(y.max).toBeGreaterThanOrEqual(b.mean + 2 * b.sd);
  });
});
