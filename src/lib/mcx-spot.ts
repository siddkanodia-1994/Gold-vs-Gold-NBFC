import { parseLooseDate } from "./dates";

// Parses MCX's "Spot Market" download (mcxindia.com → Market Data → Spot
// Market, saved as .xls -- which is really an HTML table) or the same table
// saved as CSV. Keeps only GOLDM rows quoted per 10 grams, one price per date
// (the latest time on that date wins).

export interface GoldSpotRow {
  date: string;
  price: number;
  /** "16:59" as printed by MCX, when present. */
  time: string | null;
  location: string | null;
}

export interface ParsedSpotFile {
  rows: GoldSpotRow[];
  /** Data rows seen that weren't GOLDM / 10 GRMS (other commodities). */
  skipped: number;
  warnings: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  commodity: ["commodity", "symbol", "instrument"],
  unit: ["unit"],
  location: ["location"],
  price: ["spot price(rs.)", "spot price", "spot price (rs.)", "price", "close"],
  date: ["date"],
  time: ["time"],
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cellsOfHtml(text: string): string[][] {
  const rows: string[][] = [];
  for (const tr of text.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]*>/g, "")).trim());
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function cellsOfCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === "," && !quoted) {
          out.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    });
}

export function parseMcxSpotFile(text: string): ParsedSpotFile {
  const table = /<t[dr][\s>]/i.test(text) ? cellsOfHtml(text) : cellsOfCsv(text);
  const warnings: string[] = [];
  const headerIdx = table.findIndex((r) => r.some((c) => c.toLowerCase() === "commodity" || c.toLowerCase() === "symbol"));
  if (headerIdx < 0) {
    return { rows: [], skipped: 0, warnings: ["Couldn't find the header row (Commodity, Unit, Location, Spot Price, Date). Is this MCX's Spot Market download?"] };
  }
  const header = table[headerIdx].map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
  const col = (name: string) => header.findIndex((h) => HEADER_ALIASES[name].includes(h));
  const ci = { commodity: col("commodity"), unit: col("unit"), location: col("location"), price: col("price"), date: col("date"), time: col("time") };
  if (ci.commodity < 0 || ci.price < 0 || ci.date < 0) {
    return { rows: [], skipped: 0, warnings: [`Header is missing Commodity, Spot Price or Date (found: ${table[headerIdx].join(", ")}).`] };
  }

  const byDate = new Map<string, GoldSpotRow>();
  let skipped = 0;
  for (const r of table.slice(headerIdx + 1)) {
    const commodity = (r[ci.commodity] ?? "").toUpperCase();
    const unit = ci.unit >= 0 ? (r[ci.unit] ?? "").toUpperCase().replace(/\s+/g, " ") : "10 GRMS";
    if (commodity !== "GOLDM" || !/^10 GR/.test(unit)) {
      skipped++;
      continue;
    }
    const date = parseLooseDate(r[ci.date] ?? "");
    const price = Number((r[ci.price] ?? "").replace(/,/g, ""));
    if (!date || !Number.isFinite(price) || price <= 0) {
      warnings.push(`Skipped unreadable row: ${r.join(" | ")}`);
      continue;
    }
    const time = ci.time >= 0 ? r[ci.time] || null : null;
    const prev = byDate.get(date);
    if (!prev || (time ?? "") > (prev.time ?? "")) {
      byDate.set(date, { date, price, time, location: ci.location >= 0 ? r[ci.location] || null : null });
    }
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) warnings.push("No GOLDM (10 GRMS) rows found in the file.");
  return { rows, skipped, warnings };
}
