import { and, asc, eq, sql } from "drizzle-orm";
import { db, hasDatabase } from "../db/client";
import { multipleDaily } from "../db/schema";
import { COMPANIES, type CompanyKey } from "../instruments";
import { loadHistory } from "../prices";
import { computeAnchor, derivePoints, firstQuarterEndBetween, type Close } from "./derive";
import type { Anchor, MultiplePoint, MultipleRow } from "./types";

const BATCH = 400;

async function upsert(rows: MultipleRow[], source: "ace" | "derived"): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(multipleDaily)
      .values(rows.slice(i, i + BATCH).map((r) => ({ ...r, source })))
      .onConflictDoUpdate({
        target: [multipleDaily.company, multipleDaily.date],
        set: {
          pe: sql`excluded.pe`,
          pbv: sql`excluded.pbv`,
          mcapSales: sql`excluded.mcap_sales`,
          source: sql`excluded.source`,
          updatedAt: new Date(),
        },
      });
  }
}

async function closesOf(company: CompanyKey): Promise<Close[]> {
  const { rows } = await loadHistory();
  const f = company === "muthoot" ? "mu" : "ma";
  return rows.flatMap((r) => (r[f] !== undefined ? [{ date: r.d, price: r[f]! }] : []));
}

async function pointsOf(company: CompanyKey): Promise<MultiplePoint[]> {
  const rows = await db.select().from(multipleDaily).where(eq(multipleDaily.company, company)).orderBy(asc(multipleDaily.date));
  return rows.map((r) => ({ date: r.date, pe: r.pe, pbv: r.pbv, mcapSales: r.mcapSales, source: r.source as "ace" | "derived" }));
}

/**
 * Re-anchors on the latest Ace rows and (re)writes a derived row for every
 * stored close after them. Run after each upload and each daily share sync,
 * so the price-updated days are stored as they happen.
 */
export async function refreshDerived(): Promise<Record<CompanyKey, { anchor: string | null; derived: number }>> {
  const out = {} as Record<CompanyKey, { anchor: string | null; derived: number }>;
  for (const c of COMPANIES) {
    const ace = (await pointsOf(c.key)).filter((p) => p.source === "ace");
    const closes = await closesOf(c.key);
    const anchor = computeAnchor(ace, closes);
    if (!anchor) {
      out[c.key] = { anchor: null, derived: 0 };
      continue;
    }
    // Derived rows from an older anchor that the new Ace file now covers are replaced by the Ace upsert;
    // any left on or before the anchor date (Ace skipped that day) are stale.
    await db.delete(multipleDaily).where(and(eq(multipleDaily.company, c.key), eq(multipleDaily.source, "derived"), sql`${multipleDaily.date} <= ${anchor.date}`));
    const derived = derivePoints(anchor, closes).map((p) => ({ company: c.key, date: p.date, pe: p.pe, pbv: p.pbv, mcapSales: p.mcapSales }));
    await upsert(derived, "derived");
    out[c.key] = { anchor: anchor.date, derived: derived.length };
  }
  return out;
}

export interface UploadSummary {
  company: CompanyKey;
  rows: number;
  added: number;
  changed: number;
  replacedDerived: number;
  from: string;
  to: string;
}

/** Stores an Ace upload (Ace wins over anything stored for the same day), then refreshes the derived days. */
export async function storeAceUpload(rows: MultipleRow[]): Promise<UploadSummary[]> {
  const summary: UploadSummary[] = [];
  for (const c of COMPANIES) {
    const mine = rows.filter((r) => r.company === c.key);
    if (!mine.length) continue;
    const stored = new Map((await pointsOf(c.key)).map((p) => [p.date, p]));
    let added = 0;
    let changed = 0;
    let replacedDerived = 0;
    for (const r of mine) {
      const s = stored.get(r.date);
      if (!s) added++;
      else if (s.source === "derived") replacedDerived++;
      else if (s.pe !== r.pe || s.pbv !== r.pbv || s.mcapSales !== r.mcapSales) changed++;
    }
    await upsert(mine, "ace");
    summary.push({ company: c.key, rows: mine.length, added, changed, replacedDerived, from: mine[0].date, to: mine[mine.length - 1].date });
  }
  await refreshDerived();
  return summary;
}

export interface CompanyMultiples {
  points: MultiplePoint[];
  anchor: Anchor | null;
  lastAce: string | null;
  /** A quarter-end has passed since the last Ace row, so the held TTM figures may be out of date. */
  staleSince: string | null;
}

export async function loadMultiples(): Promise<Record<CompanyKey, CompanyMultiples> | null> {
  if (!hasDatabase()) return null;
  const out = {} as Record<CompanyKey, CompanyMultiples>;
  for (const c of COMPANIES) {
    const points = await pointsOf(c.key);
    const ace = points.filter((p) => p.source === "ace");
    const anchor = computeAnchor(ace, await closesOf(c.key));
    const last = points.at(-1);
    out[c.key] = {
      points,
      anchor,
      lastAce: ace.at(-1)?.date ?? null,
      staleSince: anchor && last ? firstQuarterEndBetween(anchor.date, last.date) : null,
    };
  }
  return out;
}

/** Days stored per company, for /admin. */
export async function multiplesStatus(): Promise<Record<string, { ace: number; derived: number; lastAce: string | null; last: string | null }>> {
  const rows = (
    await db.execute(sql`
      select company, source, count(*)::int as n, max(date)::text as last
      from multiple_daily group by company, source`)
  ).rows as { company: string; source: string; n: number; last: string }[];
  const out: Record<string, { ace: number; derived: number; lastAce: string | null; last: string | null }> = {};
  for (const c of COMPANIES) {
    const ace = rows.find((r) => r.company === c.key && r.source === "ace");
    const der = rows.find((r) => r.company === c.key && r.source === "derived");
    out[c.key] = { ace: ace?.n ?? 0, derived: der?.n ?? 0, lastAce: ace?.last ?? null, last: der?.last ?? ace?.last ?? null };
  }
  return out;
}
