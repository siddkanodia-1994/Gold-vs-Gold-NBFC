import { COMPANIES } from "../instruments";
import { getDhanCredentials, type DhanCredentials } from "./token";

const QUOTE_URL = "https://api.dhan.co/v2/marketfeed/quote";
const HISTORICAL_URL = "https://api.dhan.co/v2/charts/historical";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function headers(c: DhanCredentials): HeadersInit {
  return { "access-token": c.token, "client-id": c.clientId, "Content-Type": "application/json", Accept: "application/json" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface Quote {
  securityId: string;
  lastPrice: number;
  /** Previous session's close. */
  prevClose: number | null;
  /** IST calendar date of the last trade, when DHAN reports one. */
  tradeDate: string | null;
}

interface QuoteEntry {
  last_price?: number;
  last_trade_time?: string;
  ohlc?: { close?: number };
}

// DHAN has sent last_trade_time both as "YYYY-MM-DD HH:mm:ss" and
// "DD/MM/YYYY HH:mm:ss"; anything else is treated as unknown.
function tradeDateOf(text: string | undefined): string | null {
  if (!text) return null;
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] === "1980" ? null : `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return m[3] === "1980" ? null : `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Full quotes (LTP, previous close, last trade time) for both stocks in one request. */
export async function fetchQuotes(credentials?: DhanCredentials): Promise<Quote[]> {
  const c = credentials ?? (await getDhanCredentials());
  const res = await fetch(QUOTE_URL, {
    method: "POST",
    headers: headers(c),
    body: JSON.stringify({ NSE_EQ: COMPANIES.map((x) => Number(x.securityId)) }),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error("DHAN rejected the token — it has probably expired. Paste a new one on /admin.");
  if (!res.ok) throw new Error(`DHAN quote request failed (HTTP ${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const json = (await res.json()) as { status?: string; data?: { NSE_EQ?: Record<string, QuoteEntry> } };
  if (json.status !== "success") throw new Error(`DHAN quote request returned status "${json.status}"`);
  const quotes: Quote[] = [];
  for (const co of COMPANIES) {
    const e = json.data?.NSE_EQ?.[co.securityId];
    if (!e || typeof e.last_price !== "number" || !(e.last_price > 0)) continue;
    quotes.push({
      securityId: co.securityId,
      lastPrice: e.last_price,
      prevClose: typeof e.ohlc?.close === "number" && e.ohlc.close > 0 ? e.ohlc.close : null,
      tradeDate: tradeDateOf(e.last_trade_time),
    });
  }
  return quotes;
}

export interface HistoricalClose {
  date: string;
  close: number;
}

/** Daily closes for one NSE equity over [from, to] (both inclusive). Retries transient failures. */
export async function fetchDailyCloses(securityId: string, from: string, to: string, credentials?: DhanCredentials): Promise<HistoricalClose[]> {
  const c = credentials ?? (await getDhanCredentials());
  const toExclusive = new Date(`${to}T00:00:00Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  let detail = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(HISTORICAL_URL, {
        method: "POST",
        headers: headers(c),
        body: JSON.stringify({
          securityId,
          exchangeSegment: "NSE_EQ",
          instrument: "EQUITY",
          expiryCode: 0,
          oi: false,
          fromDate: from,
          toDate: toExclusive.toISOString().slice(0, 10),
        }),
        cache: "no-store",
      });
      const body = await res.text();
      // DH-905: DHAN has no data for this range (e.g. only holidays).
      if (!res.ok && body.includes("DH-905")) return [];
      if (res.status === 401 || res.status === 403) throw new Error("DHAN rejected the token — it has probably expired. Paste a new one on /admin.");
      if (!res.ok) {
        detail = `HTTP ${res.status}: ${body.slice(0, 200)}`;
      } else {
        const json = JSON.parse(body) as { close?: number[]; timestamp?: number[] };
        if (json.close && json.timestamp && json.close.length === json.timestamp.length) {
          return json.timestamp.map((ts, i) => ({ date: new Date(ts * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10), close: json.close![i] }));
        }
        detail = "malformed response (close/timestamp arrays missing or mismatched)";
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("DHAN rejected")) throw err;
      detail = err instanceof Error ? err.message : "network error";
    }
    if (attempt < 3) await sleep(1500);
  }
  throw new Error(`DHAN history for ${securityId} failed: ${detail}`);
}

/** One quote call with a candidate pair, so a bad token is never saved. */
export async function testDhanCredentials(c: DhanCredentials): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const quotes = await fetchQuotes(c);
    return quotes.length > 0 ? { ok: true } : { ok: false, message: "DHAN answered but returned no prices." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "DHAN request failed" };
  }
}
