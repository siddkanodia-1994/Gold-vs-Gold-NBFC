"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Period } from "@/lib/analytics/series";
import { edate } from "@/lib/dates";
import { COMPANIES, type CompanyKey } from "@/lib/instruments";
import { bandValue, computeBands, niceYAxis, type Bands } from "@/lib/multiples/bands";
import { withLivePoint } from "@/lib/multiples/derive";
import type { CompanyMultiples } from "@/lib/multiples/store";
import { METRIC_LABELS, METRICS, type Metric, type MultiplePoint } from "@/lib/multiples/types";
import { Pct, zText } from "./common";
import { dayLabel, dayMs, inr, pct, tickMonth } from "./format";

// PE, P/BV and Mcap/Sales band charts, styled as the AMC dashboard's
// valuation charts: navy series, solid grey average, dashed orange/red
// (+1/+2 SD) and light/dark green (−1/−2 SD). Mean and sample SD come from
// the window the toolbar selects.

export type MultiplesData = Record<CompanyKey, CompanyMultiples>;

const SERIES = "#1f2a5c";
const BAND_LINES = [
  { k: 0, label: "Average", color: "#4b5563", dashed: false },
  { k: 1, label: "SD+1", color: "#e07b26", dashed: true },
  { k: 2, label: "SD+2", color: "#b22222", dashed: true },
  { k: -1, label: "SD-1", color: "#7cad5b", dashed: true },
  { k: -2, label: "SD-2", color: "#2f4f2f", dashed: true },
] as const;
const LADDER = [2, 1, 0, -1, -2] as const;
const LADDER_LABEL: Record<number, string> = { 2: "+2 SD", 1: "+1 SD", 0: "Mean", [-1]: "−1 SD", [-2]: "−2 SD" };

export interface MetricView {
  rows: { date: string; value: number; source: MultiplePoint["source"] }[];
  bands: Bands;
  /** Share price the current multiple is at (live, or the close of the last day). */
  price: number | null;
}

/** Window by the toolbar's period, counted back from the series' own last day. */
function inWindow<T extends { date: string }>(rows: T[], period: Period): T[] {
  if (!rows.length) return rows;
  if (period.kind === "all") return rows;
  if (period.kind === "custom") return rows.filter((r) => r.date >= period.from && r.date <= period.to);
  const from = edate(rows[rows.length - 1].date, -period.months);
  return rows.filter((r) => r.date >= from);
}

/** The series with today's live point, ready for the charts, tables and the Summary. */
export function companySeries(data: CompanyMultiples, live: { date: string; price: number } | null): MultiplePoint[] {
  return withLivePoint(data.points, data.anchor, live);
}

export function metricView(points: MultiplePoint[], metric: Metric, period: Period, priceOn: (date: string) => number | null): MetricView | null {
  const all = points.flatMap((p) => (p[metric] === null ? [] : [{ date: p.date, value: p[metric]!, source: p.source }]));
  const rows = inWindow(all, period);
  const bands = computeBands(rows.map((r) => r.value));
  if (!bands) return null;
  return { rows, bands, price: priceOn(rows[rows.length - 1].date) };
}

/**
 * Price at band k: the band multiple × the per-share figure behind today's
 * multiple. Null (shown "n/m") when the band is at or below zero, which a
 * spiky series' −2 SD can be.
 */
export function bandPrice(v: MetricView, k: number): number | null {
  const band = bandValue(v.bands, k);
  return v.price && v.bands.current > 0 && band > 0 ? (band / v.bands.current) * v.price : null;
}

function TooltipRow({ color, label, value, dashed }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontVariantNumeric: "tabular-nums" }}>
      <span style={{ display: "inline-block", width: 14, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      <span style={{ flex: 1 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function BandChart({ view, metric, company, periodLabel }: { view: MetricView; metric: Metric; company: string; periodLabel: string }) {
  const { rows, bands } = view;
  const y = useMemo(() => niceYAxis(rows.map((r) => r.value), bands), [rows, bands]);
  const data = useMemo(() => rows.map((r) => ({ ...r, t: dayMs(r.date) })), [rows]);
  const label = METRIC_LABELS[metric].long;
  const firstEstimate = rows.find((r) => r.source !== "ace");
  const chips = [
    { text: `Current ${bands.current.toFixed(1)}x`, strong: true },
    { text: `Mean ${bands.mean.toFixed(1)}x` },
    ...(bands.z !== null ? [{ text: `${zText(bands.z)} SD vs mean` }] : []),
    { text: `−2 SD ${bandValue(bands, -2).toFixed(1)} · +2 SD ${bandValue(bands, 2).toFixed(1)}` },
  ];
  return (
    <div className="gn-card">
      <p className="text-center text-sm" style={{ margin: "0 0 6px" }}>
        {company} | {label} – {periodLabel} ({dayLabel(rows[0].date)} to {dayLabel(rows[rows.length - 1].date)})
      </p>
      <div className="flex flex-wrap justify-center gap-1.5" style={{ marginBottom: 6 }}>
        {chips.map((c) => (
          <span
            key={c.text}
            className="rounded-full px-2.5 py-0.5 text-xs tabular-nums"
            style={c.strong ? { background: SERIES, color: "#fff" } : { background: "#eef0f3" }}
          >
            {c.text}
          </span>
        ))}
      </div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="#eef0f3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickMonth}
              tick={{ fontSize: 11, fill: "#686b72" }}
              minTickGap={30}
            />
            <YAxis domain={[y.min, y.max]} ticks={y.ticks} interval={0} tickFormatter={(v: number) => v.toFixed(1)} width={44} tick={{ fontSize: 11, fill: "#686b72" }} />
            <Tooltip
              content={({ active, payload }: { active?: boolean; payload?: readonly { payload?: (typeof data)[number] }[] }) => {
                const row = active ? payload?.[0]?.payload : undefined;
                if (!row) return null;
                const z = bands.sd > 0 ? (row.value - bands.mean) / bands.sd : null;
                return (
                  <div style={{ minWidth: 180, background: "#1b2130", color: "#eef1f6", padding: "8px 12px", fontSize: 12, borderRadius: 6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {dayLabel(row.date)}
                      {row.source === "derived" ? " · price-updated" : row.source === "live" ? " · live" : ""}
                    </div>
                    <TooltipRow color="#8fa3ff" label={label} value={`${row.value.toFixed(2)}x`} />
                    {BAND_LINES.map((b) => (
                      <TooltipRow key={b.k} color={b.k === 0 ? "#c5cad3" : b.k === -2 ? "#6fa36f" : b.color} label={b.label} value={`${bandValue(bands, b.k).toFixed(2)}x`} dashed={b.dashed} />
                    ))}
                    {z !== null && <div style={{ marginTop: 4, color: "#b9c0cf" }}>{zText(z)} SD vs mean</div>}
                  </div>
                );
              }}
            />
            {BAND_LINES.map((b) => (
              <ReferenceLine key={b.k} y={bandValue(bands, b.k)} stroke={b.color} strokeWidth={2} strokeDasharray={b.dashed ? "8 6" : undefined} />
            ))}
            {firstEstimate && <ReferenceLine x={dayMs(firstEstimate.date)} stroke="#9ca3af" strokeDasharray="2 3" />}
            <Line type="linear" dataKey="value" stroke={SERIES} strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="gn-legend">
        <span>
          <i style={{ background: SERIES, height: 3 }} />
          {label}
        </span>
        {BAND_LINES.map((b) => (
          <span key={b.k}>
            <i style={{ background: b.dashed ? `repeating-linear-gradient(90deg, ${b.color} 0 5px, transparent 5px 8px)` : b.color }} />
            {b.label}
          </span>
        ))}
      </div>
      {firstEstimate && (
        <p className="aa-note" style={{ textAlign: "center" }}>
          From {dayLabel(firstEstimate.date)} (dotted line): price-updated on the TTM figures from the last Ace Equity file.
        </p>
      )}
    </div>
  );
}

function ImpliedPriceTable({ view, metric }: { view: MetricView; metric: Metric }) {
  const short = METRIC_LABELS[metric].short;
  return (
    <table className="gn-grid-t" style={{ marginTop: 10 }}>
      <thead>
        <tr>
          <th>{short} band</th>
          <th>{short} (x)</th>
          <th>Implied price</th>
          <th>Upside / (downside)</th>
        </tr>
      </thead>
      <tbody>
        {LADDER.map((k) => {
          const price = bandPrice(view, k);
          return (
            <tr key={k} style={k === 0 ? { fontWeight: 700 } : undefined}>
              <th scope="row" style={k === 0 ? { fontWeight: 700 } : undefined}>
                {LADDER_LABEL[k]}
              </th>
              <td>{bandValue(view.bands, k).toFixed(2)}</td>
              <td>{price === null ? (bandValue(view.bands, k) <= 0 ? "n/m" : "—") : inr(price, price < 1000 ? 2 : 0)}</td>
              <td>{price === null || !view.price ? "—" : <Pct change={price / view.price - 1} />}</td>
            </tr>
          );
        })}
        <tr>
          <th scope="row">Current</th>
          <td>{view.bands.current.toFixed(2)}</td>
          <td>{inr(view.price, view.price !== null && view.price < 1000 ? 2 : 0)}</td>
          <td>{zText(view.bands.z)} SD</td>
        </tr>
      </tbody>
    </table>
  );
}

export function MultiplesSection({
  data,
  error,
  company,
  period,
  periodLabel,
  live,
  priceOn,
}: {
  data: MultiplesData | null | undefined;
  error: string | null;
  company: CompanyKey;
  period: Period;
  periodLabel: string;
  live: { date: string; price: number } | null;
  priceOn: (date: string) => number | null;
}) {
  const co = COMPANIES.find((c) => c.key === company)!;
  const series = useMemo(() => (data ? companySeries(data[company], live) : []), [data, company, live]);
  const views = useMemo(() => Object.fromEntries(METRICS.map((m) => [m, metricView(series, m, period, priceOn)])) as Record<Metric, MetricView | null>, [series, period, priceOn]);
  if (error) return <p className="aa-note">Could not load the multiples: {error}</p>;
  if (data === undefined) return <p className="aa-note">Loading multiples…</p>;
  if (data === null || data[company].points.length === 0) {
    return <p className="aa-note">No PE / P/BV / Mcap-Sales data yet. Upload the Ace Equity Query Expression export on /admin.</p>;
  }
  const c = data[company];
  const label = period.kind === "all" ? "all history" : period.kind === "custom" ? "custom range" : `last ${periodLabel}`;
  return (
    <div className="gn-stack">
      {c.staleSince && (
        <p className="gn-warn" style={{ margin: 0 }}>
          A quarter ended on {dayLabel(c.staleSince)} since the last Ace Equity file ({c.lastAce ? dayLabel(c.lastAce) : "—"}), so the TTM earnings, book value and
          sales behind the latest days may be out of date. Upload a fresh export on /admin after the results.
        </p>
      )}
      <div className="gn-2col">
        {METRICS.map((m) => {
          const v = views[m];
          return (
            <div key={m}>
              {v ? (
                <>
                  <BandChart view={v} metric={m} company={co.name} periodLabel={label} />
                  <ImpliedPriceTable view={v} metric={m} />
                </>
              ) : (
                <p className="gn-card aa-note">Not enough {METRIC_LABELS[m].short} data in this window.</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="aa-note">
        Consolidated TTM multiples from Ace Equity to {c.lastAce ? dayLabel(c.lastAce) : "—"}; later days are stored daily from DHAN closes with TTM EPS, book value and
        sales per share held at the last Ace file{c.anchor ? ` (${dayLabel(c.anchor.date)})` : ""}, and today moves with the live price. Mean and SD (sample) cover the
        window shown. Implied price = band multiple × the per-share figure behind today&apos;s multiple.
      </p>
    </div>
  );
}

/** The Summary's third snapshot table: current multiple, z-score and upside to the mean, both companies. */
export function MultiplesSnapshot({
  data,
  period,
  periodKey,
  live,
  priceOn,
}: {
  data: MultiplesData | null | undefined;
  period: Period;
  /** The multiples window's label (shared with the Multiples tab). */
  periodKey: string;
  live: Record<CompanyKey, { date: string; price: number } | null>;
  priceOn: Record<CompanyKey, (date: string) => number | null>;
}) {
  const views = useMemo(() => {
    if (!data) return null;
    return Object.fromEntries(
      COMPANIES.map((c) => {
        const s = companySeries(data[c.key], live[c.key]);
        return [c.key, Object.fromEntries(METRICS.map((m) => [m, metricView(s, m, period, priceOn[c.key])]))];
      })
    ) as Record<CompanyKey, Record<Metric, MetricView | null>>;
  }, [data, period, live, priceOn]);
  if (!views || COMPANIES.every((c) => !data?.[c.key].points.length)) return null;
  const cell = (c: CompanyKey, m: Metric, f: (v: MetricView) => string) => (views[c][m] ? f(views[c][m]!) : "—");
  return (
    <div className="gn-scroll" style={{ marginTop: 16 }}>
      <table className="gn-grid-t">
        <thead>
          <tr>
            <th>Valuation multiples (TTM, consolidated · {periodKey} window)</th>
            <th>Muthoot</th>
            <th>Manappuram</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const s = METRIC_LABELS[m].short;
            return [
              <tr key={`${m}-c`}>
                <th scope="row">
                  {s} (x): current / window mean
                </th>
                {COMPANIES.map((c) => (
                  <td key={c.key}>{cell(c.key, m, (v) => `${v.bands.current.toFixed(1)} / ${v.bands.mean.toFixed(1)}`)}</td>
                ))}
              </tr>,
              <tr key={`${m}-z`}>
                <th scope="row">{s} z-score (SDs from mean)</th>
                {COMPANIES.map((c) => (
                  <td key={c.key}>{cell(c.key, m, (v) => zText(v.bands.z))}</td>
                ))}
              </tr>,
              <tr key={`${m}-u`} style={{ fontWeight: 700 }}>
                <th scope="row" style={{ fontWeight: 700 }}>
                  Upside / (downside) to mean {s}
                </th>
                {COMPANIES.map((c) => (
                  <td key={c.key}>
                    {cell(c.key, m, (v) => {
                      const p = bandPrice(v, 0);
                      return p && v.price ? pct(p / v.price - 1) : "—";
                    })}
                  </td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
