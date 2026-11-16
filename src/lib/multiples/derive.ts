import { METRICS, type Anchor, type Metric, type MultiplePoint } from "./types";

// Price-updated multiples for the days after the last Ace Equity row, as in
// the AMC dashboard: Ace's trailing ratios are price ÷ TTM EPS, book value
// and sales per share, which only move when results roll in. So back those
// per-share figures out of the last Ace days (close ÷ multiple), hold them,
// and divide later closes by them. Pure.

export interface Close {
  date: string;
  price: number;
}

const QUARTER_ENDS = ["03-31", "06-30", "09-30", "12-31"];

/** First quarter-end q with after < q <= upTo, or null. */
export function firstQuarterEndBetween(after: string, upTo: string): string | null {
  for (let y = Number(after.slice(0, 4)); y <= Number(upTo.slice(0, 4)); y++) {
    for (const md of QUARTER_ENDS) {
      const q = `${y}-${md}`;
      if (q > after && q <= upTo) return q;
    }
  }
  return null;
}

// Ace's TTM figures step ON the quarter-end date, so the anchor never reaches back past one.
function lastQuarterEndOnOrBefore(date: string): string {
  const y = Number(date.slice(0, 4));
  return [`${y - 1}-12-31`, ...QUARTER_ENDS.map((md) => `${y}-${md}`)].filter((q) => q <= date).at(-1)!;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Ace rounds to 1 dp (±1% on a 3x Mcap/Sales); the median over the last few
// days of the same quarter cancels most of it.
const ANCHOR_DAYS = 5;

/**
 * The held per-share figures (EPS, BV/share, sales/share) behind the latest
 * Ace rows. `ace` and `closes` ascending; each Ace day uses the latest close
 * on or before it. A metric with no usable value is null.
 */
export function computeAnchor(ace: MultiplePoint[], closes: Close[]): Anchor | null {
  const last = ace.at(-1);
  if (!last) return null;
  const window = ace.filter((r) => r.date >= lastQuarterEndOnOrBefore(last.date)).slice(-ANCHOR_DAYS);
  const closeOnOrBefore = (d: string) => [...closes].reverse().find((c) => c.date <= d)?.price;
  const implied = (m: Metric) => {
    const xs = window.flatMap((r) => {
      const close = closeOnOrBefore(r.date);
      const v = r[m];
      return close && v && v > 0 ? [close / v] : [];
    });
    return xs.length ? median(xs) : null;
  };
  const anchor: Anchor = { date: last.date, pe: implied("pe"), pbv: implied("pbv"), mcapSales: implied("mcapSales") };
  return METRICS.some((m) => anchor[m] !== null) ? anchor : null;
}

/** Multiples at a given share price, from the held per-share figures. */
export function multiplesAt(anchor: Anchor, price: number): Record<Metric, number | null> {
  return {
    pe: anchor.pe ? price / anchor.pe : null,
    pbv: anchor.pbv ? price / anchor.pbv : null,
    mcapSales: anchor.mcapSales ? price / anchor.mcapSales : null,
  };
}

/** Derived days: every close after the anchor date, priced on the held figures. */
export function derivePoints(anchor: Anchor, closes: Close[]): MultiplePoint[] {
  return closes.filter((c) => c.date > anchor.date && c.price > 0).map((c) => ({ date: c.date, ...multiplesAt(anchor, c.price), source: "derived" }));
}

/** Adds (or replaces) today's point at the live price, unless Ace already covers that day. */
export function withLivePoint(points: MultiplePoint[], anchor: Anchor | null, live: Close | null): MultiplePoint[] {
  const last = points.at(-1);
  if (!anchor || !live || !last || live.date < last.date || (last.date === live.date && last.source === "ace")) return points;
  const point: MultiplePoint = { date: live.date, ...multiplesAt(anchor, live.price), source: "live" };
  return last.date === live.date ? [...points.slice(0, -1), point] : [...points, point];
}
