import { ACCORD_CODES, type MultipleRow } from "./types";

// Parses the Ace Equity "Query Expression" export (title row, header row
// Accord Code | Company Name | NDP_Date | NDP_Consolidated MCAP NS |
// NDP_Consolidated Price BV | NDP_Consolidated PE, one row per company per
// date, then a disclaimer footer). Columns are found by header name. Pure:
// the caller reads the workbook (SheetJS `sheet_to_json(ws, { header: 1, raw: true })`).

const HEADERS = {
  code: "accord code",
  date: "ndp_date",
  mcapSales: "ndp_consolidated mcap ns",
  pbv: "ndp_consolidated price bv",
  pe: "ndp_consolidated pe",
} as const;

export interface ParsedAceFile {
  rows: MultipleRow[];
  errors: string[];
}

// Excel day serial → YYYY-MM-DD without touching local time (25569 = 1970-01-01).
function serialToIso(serial: number): string {
  return new Date(Math.round(serial - 25569) * 86_400_000).toISOString().slice(0, 10);
}

function toIsoDate(v: unknown): string | null {
  if (typeof v === "number" && v > 0) return serialToIso(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function toMultiple(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function parseAceRows(sheetRows: unknown[][]): ParsedAceFile {
  const errors: string[] = [];
  const err = (m: string) => errors.length < 20 && errors.push(m);
  const headerIdx = sheetRows.findIndex((r) => r?.some((c) => typeof c === "string" && c.trim().toLowerCase() === HEADERS.code));
  if (headerIdx < 0) return { rows: [], errors: ["Header row not found: expected an 'Accord Code' column."] };
  const header = sheetRows[headerIdx].map((c) => (typeof c === "string" ? c.trim().toLowerCase() : ""));
  const col = Object.fromEntries(Object.entries(HEADERS).map(([k, name]) => [k, header.indexOf(name)])) as Record<keyof typeof HEADERS, number>;
  const missing = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => HEADERS[k as keyof typeof HEADERS]);
  if (missing.length) return { rows: [], errors: [`Missing column(s): ${missing.join(", ")}.`] };

  const rows: MultipleRow[] = [];
  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < sheetRows.length; i++) {
    const r = sheetRows[i] ?? [];
    const code = r[col.code];
    if (!(typeof code === "number" || (typeof code === "string" && /^\d+$/.test(code.trim())))) continue;
    const company = ACCORD_CODES[String(code).trim()];
    if (!company) {
      err(`Row ${i + 1}: Accord Code ${code} is not Muthoot (221790) or Manappuram (131213) — skipped.`);
      continue;
    }
    const date = toIsoDate(r[col.date]);
    if (!date) {
      err(`Row ${i + 1}: unreadable date.`);
      continue;
    }
    const pe = toMultiple(r[col.pe]);
    const pbv = toMultiple(r[col.pbv]);
    const mcapSales = toMultiple(r[col.mcapSales]);
    if (pe === undefined || pbv === undefined || mcapSales === undefined) {
      err(`Row ${i + 1}: a multiple is not a number.`);
      continue;
    }
    const key = `${company}|${date}`;
    if (seen.has(key)) {
      err(`Row ${i + 1}: duplicate date ${date} for ${company}.`);
      continue;
    }
    seen.add(key);
    rows.push({ company, date, pe, pbv, mcapSales });
  }
  if (!rows.length && !errors.length) errors.push("No data rows found.");
  return { rows: rows.sort((a, b) => a.company.localeCompare(b.company) || a.date.localeCompare(b.date)), errors };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Server-side re-check of rows posted by the admin page's own parse. */
export function validateAceRows(input: unknown): { rows: MultipleRow[]; error: string | null } {
  if (!Array.isArray(input) || input.length === 0) return { rows: [], error: "No rows to upload." };
  if (input.length > 20_000) return { rows: [], error: "Too many rows." };
  const companies = new Set(Object.values(ACCORD_CODES));
  const rows: MultipleRow[] = [];
  const seen = new Set<string>();
  for (const o of input as Record<string, unknown>[]) {
    if (typeof o?.company !== "string" || !companies.has(o.company as MultipleRow["company"])) return { rows: [], error: `Unknown company ${String(o?.company)}` };
    if (typeof o.date !== "string" || !DATE_RE.test(o.date)) return { rows: [], error: `Bad date ${String(o.date)}` };
    const key = `${o.company}|${o.date}`;
    if (seen.has(key)) return { rows: [], error: `Duplicate ${key}` };
    seen.add(key);
    const row = { company: o.company, date: o.date } as MultipleRow;
    for (const m of ["pe", "pbv", "mcapSales"] as const) {
      const v = o[m];
      if (v === null || v === undefined) row[m] = null;
      else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100_000) row[m] = v;
      else return { rows: [], error: `Bad ${m} on ${o.date}` };
    }
    rows.push(row);
  }
  return { rows, error: null };
}
