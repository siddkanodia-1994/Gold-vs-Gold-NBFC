"use client";

import "./dashboard.css";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { alignRows, withLivePoint, type Period, type RawRow } from "@/lib/analytics/series";
import { COMPANIES, type CompanyKey } from "@/lib/instruments";
import type { LiveResponse } from "@/lib/live-types";
import { DataSection } from "./data-section";
import { MultiplesSection, MultiplesSnapshot, type MultiplesData } from "./multiples";
import { dayLabel, inr, pct, toneOf } from "./format";
import { buildModel } from "./model";
import { RatioSection, RegressionSection } from "./sections";
import { SummarySection } from "./summary";
import { STANDARD_DEFAULTS, type SummaryDefaults, type SummaryView } from "@/lib/summary-defaults";
import { goldLedgerPoints, shareLedgerPoints } from "@/lib/analytics/gold-ledger-points";
import { ValuationSection } from "./valuation";
import { PERIOD_OPTIONS, periodOf, type PeriodKey as MultiplesPeriodKey } from "@/lib/valuation/model";
import type { ValuationModelData } from "@/lib/valuation/store";

type Section = "summary" | "ratio" | "regression" | "multiples" | "valuation" | "data";

const SECTIONS: { key: Section; label: string; icon: ReactNode }[] = [
  {
    key: "summary",
    label: "Summary",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" />
        <path d="M3 9h18M3 14h18M9 4v16" />
      </svg>
    ),
  },
  {
    key: "ratio",
    label: "Ratio",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 5L5 19" />
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="17" cy="17" r="2.5" />
      </svg>
    ),
  },
  {
    key: "regression",
    label: "Regression",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
      </svg>
    ),
  },
  {
    key: "multiples",
    label: "Multiples",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 20h18M6 16V9M11 16V5M16 16v-5M21 16V7" />
      </svg>
    ),
  },
  {
    key: "valuation",
    label: "Valuation Model",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l9 5v10l-9 5-9-5V7z" />
      </svg>
    ),
  },
  {
    key: "data",
    label: "Daily Data",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
];

// Period buttons; "custom" opens two date fields.
const PERIODS = [
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "2Y", months: 24 },
  { key: "3Y", months: 36 },
  { key: "4Y", months: 48 },
  { key: "5Y", months: 60 },
  { key: "All", months: null },
  { key: "Custom", months: null },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

const DEFAULT_PERIOD: PeriodKey = "3Y";
const DEFAULT_AVG = 1;

interface Settings {
  section: Section;
  company: CompanyKey;
  period: PeriodKey;
  from: string;
  to: string;
  avgInput: string;
  /** Multiples window picked in this view (null = the saved default). */
  mp: MultiplesPeriodKey | null;
  /** Summary view picked in this visit (null = the saved default). */
  sv: SummaryView | null;
}

const DEFAULTS: Settings = { section: "summary", company: "muthoot", period: DEFAULT_PERIOD, from: "", to: "", avgInput: String(DEFAULT_AVG), mp: null, sv: null };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

function readUrl(): Partial<Settings> {
  const q = new URLSearchParams(window.location.search);
  const out: Partial<Settings> = {};
  const s = q.get("s");
  if (SECTIONS.some((x) => x.key === s)) out.section = s as Section;
  const c = q.get("c");
  if (COMPANIES.some((x) => x.key === c)) out.company = c as CompanyKey;
  const p = q.get("p");
  if (PERIODS.some((x) => x.key === p)) out.period = p as PeriodKey;
  if (q.get("from")) out.from = q.get("from")!;
  if (q.get("to")) out.to = q.get("to")!;
  if (q.get("avg")) out.avgInput = q.get("avg")!;
  const sv = q.get("sv");
  if (sv === "gold" || sv === "model") out.sv = sv;
  const mp = q.get("mp");
  if (PERIOD_OPTIONS.some((x) => x.key === mp)) out.mp = mp as MultiplesPeriodKey;
  return out;
}

function writeUrl(s: Settings, avgDays: number) {
  const q = new URLSearchParams();
  if (s.section !== DEFAULTS.section) q.set("s", s.section);
  if (s.company !== DEFAULTS.company) q.set("c", s.company);
  if (s.period !== DEFAULT_PERIOD) q.set("p", s.period);
  if (s.period === "Custom") {
    if (s.from) q.set("from", s.from);
    if (s.to) q.set("to", s.to);
  }
  if (avgDays !== DEFAULT_AVG) q.set("avg", String(avgDays));
  if (s.mp) q.set("mp", s.mp);
  if (s.sv) q.set("sv", s.sv);
  const qs = q.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

function clampAvg(text: string): number {
  return Math.max(1, Math.min(250, parseInt(text, 10) || 1));
}

export function Dashboard() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));

  // Settings live in the URL so a view can be shared; read once after mount.
  useEffect(() => {
    const fromUrl = readUrl();
    if (Object.keys(fromUrl).length) setS((prev) => ({ ...prev, ...fromUrl })); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  // Typing in the avg-days box re-fits after a short pause.
  const [avgDays, setAvgDays] = useState(DEFAULT_AVG);
  useEffect(() => {
    const t = setTimeout(() => setAvgDays(clampAvg(s.avgInput)), 300);
    return () => clearTimeout(t);
  }, [s.avgInput]);

  useEffect(() => writeUrl(s, avgDays), [s, avgDays]);

  const history = useSWR<{ rows: RawRow[]; source: string }>("/api/history", fetchJson, { revalidateOnFocus: false, refreshInterval: 15 * 60_000 });
  const live = useSWR<LiveResponse>("/api/live", fetchJson, {
    refreshInterval: (d) => (d?.marketOpen ? 60_000 : 10 * 60_000),
    revalidateOnFocus: true,
  });

  const valuation = useSWR<ValuationModelData>("/api/valuation-model", fetchJson, { revalidateOnFocus: false });
  // One multiples window for the Multiples tab, the Summary's multiples table and the Valuation Model's reference table.
  const multiplesKey: MultiplesPeriodKey = s.mp ?? valuation.data?.settings.multiplesPeriod ?? "3Y";
  const multiplesPeriod = useMemo(() => periodOf(multiplesKey), [multiplesKey]);
  const multiples = useSWR<{ companies: MultiplesData | null }>("/api/multiples", fetchJson, { revalidateOnFocus: false, refreshInterval: 15 * 60_000 });

  const rows = useMemo(() => {
    if (!history.data) return null;
    const aligned = alignRows(history.data.rows);
    const q = live.data?.quotes;
    const mu = q?.muthoot;
    const ma = q?.manappuram;
    const point = mu && ma && mu.date === ma.date ? { date: mu.date, muthoot: mu.price, manappuram: ma.price } : null;
    return withLivePoint(aligned, history.data.rows, point);
  }, [history.data, live.data]);

  const periodDef = PERIODS.find((p) => p.key === s.period)!;
  const period: Period | null = useMemo(() => {
    if (s.period === "All") return { kind: "all" };
    if (s.period === "Custom") return s.from && s.to && s.from < s.to ? { kind: "custom", from: s.from, to: s.to } : null;
    return { kind: "months", months: periodDef.months! };
  }, [s.period, s.from, s.to, periodDef.months]);
  const periodLabel = s.period === "Custom" ? `${s.from} → ${s.to}` : s.period === "All" ? "full-history" : s.period;

  const model = useMemo(() => (rows && period ? buildModel(rows, period, avgDays, periodLabel) : null), [rows, period, avgDays, periodLabel]);

  const lastGold = useMemo(() => {
    const r = history.data ? [...history.data.rows].reverse().find((x) => x.g !== undefined) : undefined;
    return r ? { date: r.d, price: r.g! } : null;
  }, [history.data]);
  const summaryDefaults = useSWR<SummaryDefaults>("/api/summary-defaults", fetchJson, { revalidateOnFocus: false });
  const savedSummary = summaryDefaults.data ?? STANDARD_DEFAULTS;
  const goldPoints = useMemo(() => goldLedgerPoints(history.data?.rows ?? []), [history.data]);
  const sharePoints = useMemo(
    () => ({ muthoot: shareLedgerPoints(history.data?.rows ?? [], "muthoot"), manappuram: shareLedgerPoints(history.data?.rows ?? [], "manappuram") }),
    [history.data]
  );
  const lastRow = rows?.at(-1);
  const today = live.data?.asOf ? new Date(Date.parse(live.data.asOf) + 5.5 * 3600_000).toISOString().slice(0, 10) : null;

  // Per company: today's live price (for the multiples' live point) and the close on any date.
  const liveBy = useMemo(() => {
    const q = live.data?.quotes;
    return Object.fromEntries(COMPANIES.map((c) => [c.key, q?.[c.key] ? { date: q[c.key]!.date, price: q[c.key]!.price } : null])) as Record<
      CompanyKey,
      { date: string; price: number } | null
    >;
  }, [live.data]);
  const priceOnBy = useMemo(() => {
    const out = {} as Record<CompanyKey, (date: string) => number | null>;
    for (const c of COMPANIES) {
      const f = c.key === "muthoot" ? "mu" : "ma";
      const m = new Map((history.data?.rows ?? []).flatMap((r) => (r[f] !== undefined ? [[r.d, r[f]!] as const] : [])));
      const lv = liveBy[c.key];
      out[c.key] = (date) => (lv && lv.date === date ? lv.price : (m.get(date) ?? null));
    }
    return out;
  }, [history.data, liveBy]);

  function apply({ months, avgDays: n }: { months?: number; avgDays?: number }) {
    const p = months === undefined ? undefined : PERIODS.find((x) => x.months === months)?.key;
    set({ ...(p ? { period: p } : {}), ...(n !== undefined ? { avgInput: String(n) } : {}) });
    if (n !== undefined) setAvgDays(n);
  }

  const active = SECTIONS.find((x) => x.key === s.section)!;
  const isDefault = s.period === DEFAULT_PERIOD && avgDays === DEFAULT_AVG;
  const lookbackMonths = periodDef.months ?? null;

  return (
    <div className={`aa${navCollapsed ? " is-nav-rail" : ""}`}>
      <aside className="aa-side">
        <div className="aa-brand">
          <span className="aa-brand-mark" aria-hidden="true">
            Au
          </span>
          <div className="aa-brand-text">
            <span className="aa-brand-title">GOLD vs GOLD NBFC</span>
            <span className="aa-brand-sub">RATIO &amp; REGRESSION</span>
          </div>
          <button
            type="button"
            className="aa-collapse"
            aria-label={navCollapsed ? "Show section menu" : "Hide section menu"}
            aria-expanded={!navCollapsed}
            onClick={() => setNavCollapsed((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={navCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
            </svg>
          </button>
        </div>
        <nav aria-label="Sections">
          <ul className="aa-nav">
            {SECTIONS.map((x) => (
              <li key={x.key}>
                <button type="button" className="aa-nav-btn" aria-current={x.key === s.section ? "page" : undefined} onClick={() => set({ section: x.key })} title={x.label}>
                  {x.icon}
                  <span className="aa-nav-label">{x.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {!navCollapsed && (
          <div className="gn-side-foot">
            Gold: MCX Gold M spot (₹/10 g), uploaded daily from mcxindia.com.
            <br />
            Shares: NSE via DHAN, live in market hours.
            <br />
            <Link href="/admin">Admin</Link>
          </div>
        )}
      </aside>

      <div className="aa-main">
        <div className="aa-strip">
          <span className="aa-strip-label">Today&apos;s prices</span>
          {lastGold && (
            <span className="aa-chip">
              <span className="aa-chip-key">GOLD M</span>
              <span className="aa-chip-val">{inr(lastGold.price)}</span>
              <span className="aa-chip-note">MCX spot · {dayLabel(lastGold.date, false)}</span>
            </span>
          )}
          {COMPANIES.map((c) => {
            const q = live.data?.quotes[c.key];
            const isToday = q && today && q.date === today;
            const price = q?.price ?? (lastRow ? lastRow[c.key] : undefined);
            return (
              <span className="aa-chip" key={c.key}>
                <span className="aa-chip-key">{c.symbol}</span>
                <span className="aa-chip-val">{inr(price, 2)}</span>
                {q?.prevClose && <span className={`pl-chg pl-chg--${toneOf(q.price / q.prevClose - 1)}`}>{pct(q.price / q.prevClose - 1, 2)}</span>}
                {isToday && live.data?.marketOpen ? <span className="aa-live">LIVE</span> : <span className="aa-chip-note">{q ? `close ${dayLabel(q.date, false)}` : "last close"}</span>}
              </span>
            );
          })}
          {live.data?.error && <span className="aa-chip-note">Live prices unavailable — {live.data.error}</span>}
        </div>

        <h2 className="aa-title">{active.label}</h2>
        <div className="aa-body">
          {history.error ? (
            <p className="aa-note">Could not load the price history: {String(history.error.message ?? history.error)}</p>
          ) : !rows ? (
            <p className="aa-note">Loading 5 years of prices…</p>
          ) : (
            <>
              {s.section !== "summary" && s.section !== "data" && (
                <div className="pl-ledger">
                  <div className="pl-tabs" role="tablist" aria-label="Company">
                    {COMPANIES.map((c) => {
                      const last = rows.at(-1)!;
                      const prev = rows.at(-2);
                      const chg = prev ? last[c.key] / prev[c.key] - 1 : null;
                      return (
                        <button
                          key={c.key}
                          type="button"
                          role="tab"
                          aria-selected={c.key === s.company}
                          className={`pl-tab${c.key === s.company ? " is-active" : ""}`}
                          onClick={() => set({ company: c.key })}
                        >
                          {c.short}
                          <span className="pl-tab-px">
                            {inr(last[c.key], 2)}
                            <span className={`pl-tab-chg pl-tab-chg--${toneOf(chg)}`}>{pct(chg)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="aa-fitbar" role="toolbar" aria-label="Period and gold average" hidden={s.section === "valuation"}>
                {s.section === "multiples" ? (
                  <div className="gn-seg" role="group" aria-label="Multiples period">
                    {PERIOD_OPTIONS.map((p) => (
                      <button key={p.key} type="button" aria-pressed={p.key === multiplesKey} onClick={() => set({ mp: p.key })}>
                        {p.key}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="gn-seg" role="group" aria-label="Period">
                    {PERIODS.map((p) => (
                      <button key={p.key} type="button" aria-pressed={p.key === s.period} onClick={() => set({ period: p.key })}>
                        {p.key}
                      </button>
                    ))}
                  </div>
                )}
                {s.period === "Custom" && s.section !== "multiples" && (
                  <span className="gn-lbl">
                    <input
                      type="date"
                      className="gn-date"
                      aria-label="From"
                      value={s.from}
                      min={rows[0].date}
                      max={rows.at(-1)!.date}
                      onChange={(e) => set({ from: e.target.value })}
                    />
                    to
                    <input type="date" className="gn-date" aria-label="To" value={s.to} min={rows[0].date} max={rows.at(-1)!.date} onChange={(e) => set({ to: e.target.value })} />
                  </span>
                )}
                <label className="gn-lbl" hidden={s.section === "multiples"}>
                  Gold avg (days)
                  <input
                    type="number"
                    min={1}
                    max={250}
                    inputMode="numeric"
                    className="gn-num"
                    value={s.avgInput}
                    onChange={(e) => set({ avgInput: e.target.value })}
                  />
                </label>
                <span className="aa-fitbar-sep" aria-hidden />
                {s.section === "multiples" ? (
                  <span className="text-xs text-[var(--pl-color-text-muted)]">
                    {`Multiples window ${multiplesKey} — shared with the Valuation Model's reference table and the Summary${
                      s.mp && s.mp !== valuation.data?.settings.multiplesPeriod ? " (not saved; Save as default on the Valuation Model)" : ""
                    }`}
                  </span>
                ) : isDefault ? (
                  <span className="text-xs text-[var(--pl-color-text-muted)]">
                    Default view (3Y · 1D spot gold)
                    {model ? ` · ${model.span.endIdx - model.span.startIdx + 1} sessions, ${dayLabel(model.span.start)} → ${dayLabel(model.span.end)}` : ""}
                  </span>
                ) : (
                  <button type="button" className="aa-btn aa-btn--ghost" onClick={() => apply({ months: 36, avgDays: DEFAULT_AVG })}>
                    Back to default (3Y · 1D)
                  </button>
                )}
              </div>

              {s.section !== "multiples" && lastRow && lastRow.goldDate !== lastRow.date && (
                <p className="gn-warn">
                  {dayLabel(lastRow.date)} is priced on Gold M spot from {dayLabel(lastRow.goldDate)} — upload the latest MCX Spot Market file on /admin to update it.
                </p>
              )}

              {!model ? (
                <p className="aa-note">{s.period === "Custom" ? "Pick a From and To date (From before To)." : "No sessions in this window."}</p>
              ) : s.section === "summary" ? (
                <SummarySection
                  view={s.sv ?? savedSummary.view}
                  onView={(sv) => set({ sv })}
                  goldPoints={goldPoints}
                  sharePoints={sharePoints}
                  saved={savedSummary}
                  onSaved={() => summaryDefaults.mutate()}
                  model={model}
                  lookbackMonths={lookbackMonths}
                  apply={apply}
                  multiples={<MultiplesSnapshot data={multiples.data?.companies} period={multiplesPeriod} periodKey={multiplesKey} live={liveBy} priceOn={priceOnBy} />}
                />
              ) : s.section === "ratio" ? (
                <RatioSection model={model} company={s.company} />
              ) : s.section === "regression" ? (
                <RegressionSection model={model} company={s.company} />
              ) : s.section === "valuation" ? (
                <ValuationSection
                  company={s.company}
                  rows={rows}
                  multiples={multiples.data?.companies}
                  multiplesPeriod={multiplesKey}
                  onMultiplesPeriod={(mp) => set({ mp })}
                />
              ) : s.section === "multiples" ? (
                <MultiplesSection
                  data={multiples.data?.companies}
                  error={multiples.error ? String(multiples.error.message ?? multiples.error) : null}
                  company={s.company}
                  period={multiplesPeriod}
                  periodLabel={multiplesKey}
                  live={liveBy[s.company]}
                  priceOn={priceOnBy[s.company]}
                />
              ) : (
                <DataSection model={model} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
