import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMcxSpotFile } from "./mcx-spot";

describe("parseMcxSpotFile", () => {
  it("reads MCX's Spot Market .xls (an HTML table)", () => {
    const text = readFileSync(path.join(__dirname, "__fixtures__/mcx-spot-goldm.xls"), "utf8");
    const { rows, warnings } = parseMcxSpotFile(text);
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(100);
    expect(rows.at(-1)).toMatchObject({ date: "2026-11-13", price: 135797, location: "AHMEDABAD" });
    // Same value as the workbook's Gold Data sheet for 06-Nov-26.
    expect(rows.find((r) => r.date === "2026-11-06")?.price).toBe(141032);
  });

  it("reads a CSV export and skips other commodities", () => {
    const csv = "Commodity,Unit,Location,Spot Price(Rs.),Up/Down,Date,Time\nSILVERM,1 KGS,AHMEDABAD,\"1,60,000.00\",+,13 Nov 2026,16:59\nGOLDM,10 GRMS,AHMEDABAD,\"1,35,797.00\",+,13 Nov 2026,16:59";
    const { rows, skipped } = parseMcxSpotFile(csv);
    expect(skipped).toBe(1);
    expect(rows).toEqual([{ date: "2026-11-13", price: 135797, time: "16:59", location: "AHMEDABAD" }]);
  });

  it("explains a file it can't read", () => {
    expect(parseMcxSpotFile("hello").warnings[0]).toMatch(/header row/);
  });
});
