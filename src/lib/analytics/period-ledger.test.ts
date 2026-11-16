import { describe, expect, it } from "vitest";
import { goldLedgerPoints } from "./gold-ledger-points";
import { buildPeriodLedger, formatLedgerPct, ledgerCalendarOf } from "./period-ledger";

describe("period ledger (as the AMC dashboard's)", () => {
  it("uses the Indian FY: Apr 2026 is FY 2027 Q1, Mar 2027 is FY 2027 Q4", () => {
    expect(ledgerCalendarOf("2026-04-01")).toMatchObject({ fyLabel: "FY 2027", qLabel: "Q1 FY 2027", mLabel: "FY 2027 April" });
    expect(ledgerCalendarOf("2027-03-31")).toMatchObject({ fyLabel: "FY 2027", qLabel: "Q4 FY 2027" });
  });
  it("averages observed days, and compares the last 5 with the 5 before", () => {
    const pts = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].map((date, i) => ({
      date,
      value: i < 5 ? 100 : 110,
    }));
    const l = buildPeriodLedger(pts);
    expect(l.tail(5).value).toBe(110);
    expect(l.tailPrev(5).value).toBe(100);
    expect(l.period("m", "FY 2027 November")).toEqual({ value: 105, days: 10 });
    expect(formatLedgerPct(110 / 100 - 1)).toEqual({ text: "10.0%", tone: "pos" });
  });
});

describe("gold ledger points", () => {
  it("drops weekend sessions and weekday Muhurat days", () => {
    const pts = goldLedgerPoints([
      { d: "2026-11-06", g: 141032 }, // Friday
      { d: "2026-11-08", g: 141032, mu: 2855, ma: 323 }, // Sunday Muhurat
      { d: "2025-10-21", g: 130000 }, // Tuesday Muhurat
      { d: "2026-11-09", mu: 2900, ma: 320 }, // no gold
    ]);
    expect(pts).toEqual([{ date: "2026-11-06", value: 141032 }]);
  });
});

import { computeCurrentQuarter, quarterEndOf, weekdaysBetween } from "./current-quarter";
import { fromOffset, STANDARD_DEFAULTS, toOffset, validSummaryDefaults } from "../summary-defaults";

describe("current quarter", () => {
  it("maps quarter labels to their end dates and counts weekdays left", () => {
    expect(quarterEndOf("Q3 FY 2027")).toBe("2026-12-31");
    expect(quarterEndOf("Q4 FY 2027")).toBe("2027-03-31");
    expect(weekdaysBetween("2026-12-25", "2026-12-31")).toBe(4); // Mon 28 – Thu 31
  });
  it("projects the quarter's average if spot holds", () => {
    // Q3 FY27 so far: 2 days at 100; Q3 FY26: 80. Latest spot 100 on Tue 29 Dec, 2 weekdays left → projection stays 100.
    const pts = [
      { date: "2025-10-01", value: 80 },
      { date: "2026-12-28", value: 100 },
      { date: "2026-12-29", value: 100 },
    ];
    const c = computeCurrentQuarter(buildPeriodLedger(pts), pts)!;
    expect(c).toMatchObject({ label: "Q3 FY 2027", yoyLabel: "Q3 FY 2026", remainingDays: 2, projected: 100, yoyAvg: 80 });
  });
});

describe("summary defaults", () => {
  it("round-trips row picks as offsets from the latest period", () => {
    const list = ["Q1 FY 2027", "Q2 FY 2027", "Q3 FY 2027"];
    expect(toOffset(list, "Q2 FY 2027")).toBe(1);
    expect(fromOffset(list, 1)).toBe("Q2 FY 2027");
    expect(fromOffset(list, 9)).toBe("Q1 FY 2027"); // clamps to the oldest
  });
  it("validates shape strictly", () => {
    expect(validSummaryDefaults(STANDARD_DEFAULTS)).toBe(true);
    expect(validSummaryDefaults({ ...STANDARD_DEFAULTS, view: "x" })).toBe(false);
    expect(validSummaryDefaults({ ...STANDARD_DEFAULTS, rows: { ...STANDARD_DEFAULTS.rows, q: [0, 1] } })).toBe(false);
  });
});
