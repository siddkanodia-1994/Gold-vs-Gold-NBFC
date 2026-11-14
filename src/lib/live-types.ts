import type { CompanyKey } from "./instruments";

export interface LiveQuote {
  price: number;
  prevClose: number | null;
  /** IST date the price is from. */
  date: string;
}

export interface LiveResponse {
  asOf: string;
  /** NSE's regular session (9:15–15:30 IST, Mon–Fri; exchange holidays aren't known here). */
  marketOpen: boolean;
  quotes: Partial<Record<CompanyKey, LiveQuote>>;
  error?: string;
}
