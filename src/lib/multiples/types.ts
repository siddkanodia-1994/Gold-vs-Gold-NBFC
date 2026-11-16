import type { CompanyKey } from "../instruments";

// TTM consolidated multiples from Ace Equity's "Query Expression" export.
export const METRICS = ["pe", "pbv", "mcapSales"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABELS: Record<Metric, { short: string; long: string; perShare: string }> = {
  pe: { short: "PE", long: "TTM PE (x)", perShare: "TTM EPS" },
  pbv: { short: "P/BV", long: "Price / Book (x)", perShare: "Book value / share" },
  mcapSales: { short: "Mcap/Sales", long: "Mcap / Sales (x)", perShare: "TTM sales / share" },
};

/** Ace Equity Accord Codes (public identifiers) → this app's company keys. */
export const ACCORD_CODES: Record<string, CompanyKey> = { "221790": "muthoot", "131213": "manappuram" };

export interface MultipleRow {
  company: CompanyKey;
  date: string;
  pe: number | null;
  pbv: number | null;
  mcapSales: number | null;
}

/** One day's multiples: "ace" straight from the file, "derived" price-updated from held TTM figures. */
export interface MultiplePoint {
  date: string;
  pe: number | null;
  pbv: number | null;
  mcapSales: number | null;
  source: "ace" | "derived" | "live";
}

/** TTM per-share figures backed out of the latest Ace days, held until the next file. */
export interface Anchor {
  date: string;
  pe: number | null;
  pbv: number | null;
  mcapSales: number | null;
}
