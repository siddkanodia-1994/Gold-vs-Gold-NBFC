import { describe, expect, it } from "vitest";
import { goldLedgerPoints, shareLedgerPoints } from "./gold-ledger-points";

const rows = [
  { d: "2025-10-20", g: 130000, mu: 3100, ma: 280 },
  { d: "2025-10-21", g: 131000, mu: 3120, ma: 281 }, // Diwali Muhurat
  { d: "2025-10-22", mu: 3150 }, // no gold, no Manappuram close
  { d: "2025-10-25", g: 132000, mu: 3160, ma: 283 }, // Saturday
];

describe("shareLedgerPoints", () => {
  it("takes each company's close on weekdays, skipping Muhurat, weekends and missing closes", () => {
    expect(shareLedgerPoints(rows, "muthoot")).toEqual([
      { date: "2025-10-20", value: 3100 },
      { date: "2025-10-22", value: 3150 },
    ]);
    expect(shareLedgerPoints(rows, "manappuram")).toEqual([{ date: "2025-10-20", value: 280 }]);
  });

  it("leaves the gold points as they were", () => {
    expect(goldLedgerPoints(rows)).toEqual([{ date: "2025-10-20", value: 130000 }]);
  });
});
