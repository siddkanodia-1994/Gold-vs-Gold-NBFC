import { fetchQuotes } from "@/lib/dhan/client";
import { istDate, istMinutes, isWeekday } from "@/lib/dates";
import { COMPANIES } from "@/lib/instruments";
import type { LiveResponse } from "@/lib/live-types";

export const dynamic = "force-dynamic";

const NSE_OPEN = 9 * 60 + 15;
const NSE_CLOSE = 15 * 60 + 30;
const CACHE_MS = 30_000;
let cache: { at: number; body: LiveResponse } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) return Response.json(cache.body, { headers: { "Cache-Control": "public, s-maxage=30" } });
  const now = new Date();
  const today = istDate(now);
  const minutes = istMinutes(now);
  const marketOpen = isWeekday(today) && minutes >= NSE_OPEN && minutes <= NSE_CLOSE;
  const body: LiveResponse = { asOf: now.toISOString(), marketOpen, quotes: {} };
  try {
    for (const q of await fetchQuotes()) {
      const co = COMPANIES.find((c) => c.securityId === q.securityId)!;
      // Without a trade time from DHAN, a weekday after the open counts as today.
      const date = q.tradeDate ?? (isWeekday(today) && minutes >= NSE_OPEN ? today : null);
      if (date) body.quotes[co.key] = { price: q.lastPrice, prevClose: q.prevClose, date };
    }
  } catch (err) {
    body.error = err instanceof Error ? err.message : "Live prices unavailable";
  }
  cache = { at: Date.now(), body };
  return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
