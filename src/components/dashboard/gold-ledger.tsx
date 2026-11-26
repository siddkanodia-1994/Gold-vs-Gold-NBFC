"use client";

import { useState } from "react";
import { fromOffset, toOffset, type SummaryDefaults } from "@/lib/summary-defaults";
import {
  LEDGER_WEEKDAYS,
  LEDGER_WINDOWS,
  formatLedgerInr,
  formatLedgerPct,
  formatLedgerPrice,
  ledgerChange,
  type LedgerPeriodKind,
  type LedgerWeekday,
  type LedgerPoint,
  type LedgerWindow,
  type PeriodLedger,
} from "@/lib/analytics/period-ledger";

// The Period Ledger's tables (period | weekday | quarter-by-weekday), ported
// from the AMC dashboard's AUM Summary with the same markup and class names,
// here for MCX Gold M spot and the two share prices: one period table across
// all three, then each series' weekday tables. The row selections are owned
// by the parent so they survive switching views. A switch in the band hides
// the weekday tables (hidden by default).

export interface LedgerSelections {
  fy: string[];
  q: string[];
  m: string[];
  /** Per weekday: the quarter table's three selectable rows. */
  wq: Record<LedgerWeekday, string[]>;
}

export type LedgerSelectKey = { kind: LedgerPeriodKind; row: number } | { kind: "wq"; day: LedgerWeekday; row: number };

const KIND_NAMES: Record<LedgerPeriodKind, string> = { fy: "Financial year", q: "Quarter", m: "Month" };

function Badge({ change }: { change: number | null }) {
  const p = formatLedgerPct(change);
  return <span className={`pl-chg pl-chg--${p?.tone ?? "neu"}`}>{p?.text ?? "—"}</span>;
}

function DeltaCell({ change }: { change: number | null }) {
  const p = formatLedgerPct(change);
  if (!p) return <td />;
  return <td className={`pl-delta pl-delta--${p.tone}`}>{p.text}</td>;
}

function Num({ w, fmt }: { w: LedgerWindow; fmt: (v: number | null) => string }) {
  return <span className="pl-num">{fmt(w.value)}</span>;
}

function PeriodSelect({
  labels,
  value,
  ariaLabel,
  onChange,
}: {
  labels: string[];
  value: string;
  ariaLabel: string;
  onChange: (label: string) => void;
}) {
  return (
    <select className="pl-sel" aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      {[...labels].reverse().map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** One series' weekday table and quarter-by-weekday table, side by side under its own band. */
function WeekdayTables({
  series,
  selections,
  onSelect,
}: {
  series: LedgerSeries;
  selections: LedgerSelections;
  onSelect: (key: LedgerSelectKey, label: string) => void;
}) {
  const { model, fmt } = series;
  const val = series.valueHeader;
  const spacer = (key: string) => (
    <tr key={key} className="pl-w-spacer" aria-hidden="true">
      <td colSpan={4} />
    </tr>
  );
  return (
    <section className="pl-panel" aria-label={`${series.name} by weekday`}>
      <div className="pl-band">
        {series.name} <span className="pl-band-unit">by weekday · {val}</span>
      </div>
      <div className="pl-row">
        <div className="pl-scroll pl-scroll--weekday">
          <table className="pl-wire pl-wire--weekday">
            <thead>
              <tr>
                <th scope="col">Week&gt;&gt;</th>
                <th scope="col">{val}</th>
                <th scope="col">Do {LEDGER_WINDOWS.dayShort}D</th>
                <th scope="col">Do {LEDGER_WINDOWS.dayLong}D</th>
              </tr>
            </thead>
            <tbody>
              {LEDGER_WEEKDAYS.flatMap((d, i) => {
                const x = model.day(d);
                const rows = [
                  <tr key={`${d}-main`} className="pl-w-main">
                    <th scope="row">{d}</th>
                    <td className="pl-w-val">{fmt(x.latest.value)}</td>
                    <DeltaCell change={x.doShort} />
                    <DeltaCell change={x.doLong} />
                  </tr>,
                  <tr key={`${d}-s`} className="pl-w-detail">
                    <td>{`Average of last ${LEDGER_WINDOWS.dayShort} ${d}s`}</td>
                    <td className="pl-w-val">{fmt(x.short.value)}</td>
                    <td />
                    <td />
                  </tr>,
                  <tr key={`${d}-l`} className="pl-w-detail">
                    <td>{`Average of last ${LEDGER_WINDOWS.dayLong} ${d}s`}</td>
                    <td className="pl-w-val">{fmt(x.long.value)}</td>
                    <td />
                    <td />
                  </tr>,
                ];
                return i === 0 ? rows : [spacer(`${d}-sp`), ...rows];
              })}
            </tbody>
          </table>
        </div>

        <div className="pl-scroll pl-scroll--quarter">
          <table className="pl-wire pl-wire--quarter">
            <thead>
              <tr>
                <th scope="col">Quarter</th>
                <th scope="col">{val}</th>
                <th scope="col">QoQ</th>
                <th scope="col">YoY</th>
              </tr>
            </thead>
            <tbody>
              {LEDGER_WEEKDAYS.flatMap((d, i) => {
                const x = model.dayQuarter(d);
                const latest = model.dayLast(d, 1);
                const rows = [
                  <tr key={`${d}-main`} className="pl-w-main">
                    <th scope="row">{d}</th>
                    <td className="pl-w-val">{fmt(latest.value)}</td>
                    <DeltaCell change={x.qoq} />
                    <DeltaCell change={x.yoy} />
                  </tr>,
                  ...selections.wq[d].map((q, r) => (
                    <tr key={`${d}-q${r}`} className="pl-w-detail">
                      <td className="pl-c-sel">
                        <PeriodSelect
                          labels={model.quarters}
                          value={q}
                          ariaLabel={`${d}, quarter row ${r + 1}`}
                          onChange={(l) => onSelect({ kind: "wq", day: d, row: r }, l)}
                        />
                      </td>
                      <td className="pl-w-val">{fmt(model.dayInQuarter(d, q).value)}</td>
                      <td />
                      <td />
                    </tr>
                  )),
                ];
                return i === 0 ? rows : [spacer(`${d}-sp`), ...rows];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

interface LedgerSeries {
  name: string;
  model: PeriodLedger;
  valueHeader: string;
  fmt: (v: number | null) => string;
  /** Latest price, for the Live switch. */
  live: { date: string; value: number } | null;
}

/**
 * Gold and the two share prices in one period table: a shared period column,
 * then value | change | change for each series. The row picks drive every
 * series, so each row compares the same window.
 */
function CombinedLedger({
  series,
  selections,
  onSelect,
  unitLine,
  hideWeekdays,
  onHideWeekdays,
}: {
  series: LedgerSeries[];
  selections: LedgerSelections;
  onSelect: (key: LedgerSelectKey, label: string) => void;
  unitLine: string;
  hideWeekdays: boolean;
  onHideWeekdays: (v: boolean) => void;
}) {
  const [liveOn, setLiveOn] = useState(false);
  const lead = series[0].model;
  const lists: Record<LedgerPeriodKind, string[]> = { fy: lead.fys, q: lead.quarters, m: lead.months };
  const periodOf = (s: LedgerSeries, kind: LedgerPeriodKind, label: string): LedgerWindow => {
    const own = { fy: s.model.fys, q: s.model.quarters, m: s.model.months }[kind];
    return liveOn && s.live && kind !== "fy" && label === own.at(-1) ? { value: s.live.value, days: 1 } : s.model.period(kind, label);
  };
  const header = (first: string, chg: string, chg2 = "", chg2Title?: string) => (
    <tr className="pl-hdr">
      <th scope="col">{first}</th>
      {series.flatMap((s) => [
        <th key={`${s.name}-v`} scope="col">
          {s.valueHeader}
        </th>,
        <th key={`${s.name}-c`} scope="col">
          {chg}
        </th>,
        <th key={`${s.name}-c2`} scope="col" title={chg2Title}>
          {chg2}
        </th>,
      ])}
    </tr>
  );
  const selRows = (kind: LedgerPeriodKind) =>
    selections[kind].map((label, r) => (
      <tr key={`${kind}-${r}`} className={r === 0 ? "pl-cur" : undefined}>
        <td className="pl-c-sel">
          <PeriodSelect
            labels={lists[kind]}
            value={label}
            ariaLabel={`${KIND_NAMES[kind]} row ${r + 1}${r ? ", compared with row 1" : ""}`}
            onChange={(l) => onSelect({ kind, row: r }, l)}
          />
        </td>
        {series.flatMap((s) => {
          const w = periodOf(s, kind, label);
          const w0 = periodOf(s, kind, selections[kind][0]);
          return [
            <td key={`${s.name}-v`} className="gn-cl-val">
              <Num w={w} fmt={s.fmt} />
            </td>,
            <td key={`${s.name}-c`} className="pl-c-chg">
              {r === 0 ? null : <Badge change={ledgerChange(w0.value, w.value)} />}
            </td>,
            <td key={`${s.name}-c2`} />,
          ];
        })}
      </tr>
    ));
  const plainRow = (key: string, label: string, pick: (s: LedgerSeries) => { w: LedgerWindow; chg?: number | null; chg2?: number | null }, opts: { cur?: boolean; muted?: boolean } = {}) => (
    <tr key={key} className={opts.cur ? "pl-cur" : undefined}>
      <td className={opts.muted ? "pl-muted" : undefined}>{label}</td>
      {series.flatMap((s) => {
        const x = pick(s);
        return [
          <td key={`${s.name}-v`} className="gn-cl-val">
            <Num w={x.w} fmt={s.fmt} />
          </td>,
          <td key={`${s.name}-c`} className="pl-c-chg">
            {x.chg !== undefined ? <Badge change={x.chg} /> : null}
          </td>,
          <td key={`${s.name}-c2`} className="pl-c-chg">
            {x.chg2 !== undefined ? <Badge change={x.chg2} /> : null}
          </td>,
        ];
      })}
    </tr>
  );
  const W = LEDGER_WINDOWS;
  return (
    <section className="pl-panel" aria-label="Gold and share prices by period">
      <div className="pl-band">
        Gold M spot · Muthoot · Manappuram <span className="pl-band-unit">{unitLine}</span>
        <label className="pl-band-toggle" title="Latest quarter and month use the latest price (live in market hours) instead of their average">
          <input type="checkbox" checked={liveOn} onChange={(e) => setLiveOn(e.target.checked)} />
          Live prices
        </label>
        <label className="pl-band-toggle gn-band-toggle--next">
          <input type="checkbox" checked={hideWeekdays} onChange={(e) => onHideWeekdays(e.target.checked)} />
          Hide weekday tables
        </label>
      </div>
      <div className="pl-scroll">
        <table className="pl-period gn-combined">
          <colgroup>
            <col className="gn-cl-period" />
            {series.flatMap((s) => [<col key={`${s.name}-v`} className="gn-cl-v" />, <col key={`${s.name}-c`} className="gn-cl-c" />, <col key={`${s.name}-c2`} className="gn-cl-c" />])}
          </colgroup>
          <thead>
            <tr className="gn-cl-names">
              <th scope="col" />
              {series.map((s) => (
                <th key={s.name} scope="colgroup" colSpan={3}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="pl-sec">
            {header("Financial Year", "YoY %")}
            {selRows("fy")}
          </tbody>
          <tbody className="pl-sec">
            {header("Quarter>>", "QoQ %")}
            {selRows("q")}
          </tbody>
          <tbody className="pl-sec">
            {header("Month>>", "MoM %")}
            {selRows("m")}
            {plainRow(
              "half",
              `Avg 6M (${W.half} days)`,
              (s) => {
                const half = s.model.half(selections.m[0]);
                return { w: half, chg: ledgerChange(periodOf(s, "m", selections.m[0]).value, half.value) };
              },
              { muted: true }
            )}
          </tbody>
          <tbody className="pl-sec">
            {header("Week>>", "WoW", `vs ${W.long}D`, `Last ${W.week} days vs the last ${W.long} days`)}
            {plainRow(
              "w0",
              `Last ${W.week} Days`,
              (s) => {
                const last = s.model.tail(W.week);
                return { w: last, chg: ledgerChange(last.value, s.model.tailPrev(W.week).value), chg2: ledgerChange(last.value, s.model.tail(W.long).value) };
              },
              { cur: true }
            )}
            {plainRow("w1", `Prev ${W.week} Days`, (s) => ({ w: s.model.tailPrev(W.week) }))}
            {plainRow("w2", `Last ${W.mid} Days`, (s) => ({ w: s.model.tail(W.mid) }))}
            {plainRow("w3", `Last ${W.long} Days`, (s) => ({ w: s.model.tail(W.long) }))}
            {plainRow("w4", "Mon–Fri Avg (Latest)", (s) => ({ w: s.model.latestWeek() }))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Row picks from saved offsets (0 = latest), so a saved default rolls forward with new periods. */
export function selectionsFromOffsets(model: PeriodLedger, rows: SummaryDefaults["rows"]): LedgerSelections {
  const wq = {} as Record<LedgerWeekday, string[]>;
  for (const day of LEDGER_WEEKDAYS) wq[day] = rows.wq[day].map((o) => fromOffset(model.quarters, o));
  return {
    fy: rows.fy.map((o) => fromOffset(model.fys, o)),
    q: rows.q.map((o) => fromOffset(model.quarters, o)),
    m: rows.m.map((o) => fromOffset(model.months, o)),
    wq,
  };
}

export function offsetsFromSelections(model: PeriodLedger, sel: LedgerSelections): SummaryDefaults["rows"] {
  const wq = {} as Record<LedgerWeekday, number[]>;
  for (const day of LEDGER_WEEKDAYS) wq[day] = sel.wq[day].map((l) => toOffset(model.quarters, l));
  return {
    fy: sel.fy.map((l) => toOffset(model.fys, l)),
    q: sel.q.map((l) => toOffset(model.quarters, l)),
    m: sel.m.map((l) => toOffset(model.months, l)),
    wq,
  };
}

export function withSelection(sel: LedgerSelections, key: LedgerSelectKey, label: string): LedgerSelections {
  const next: LedgerSelections = { fy: [...sel.fy], q: [...sel.q], m: [...sel.m], wq: { ...sel.wq } };
  if (key.kind === "wq") next.wq[key.day] = next.wq[key.day].map((v, i) => (i === key.row ? label : v));
  else next[key.kind] = next[key.kind].map((v, i) => (i === key.row ? label : v));
  return next;
}

export interface ShareLedger {
  symbol: string;
  model: PeriodLedger;
  points: LedgerPoint[];
  /** Today's live price when the market is open, else null (the Live switch then uses the last close). */
  live: { date: string; value: number } | null;
}

/**
 * The Summary's Gold price view: MCX Gold M spot (special sessions removed)
 * and each company's NSE close in one period table, with each series'
 * weekday tables below it when they're switched on.
 */
export function GoldPriceSummary({
  model,
  points,
  shares,
  selections,
  onSelect,
  hideWeekdays,
  onHideWeekdays,
}: {
  model: PeriodLedger;
  points: LedgerPoint[];
  shares: ShareLedger[];
  selections: LedgerSelections;
  onSelect: (key: LedgerSelectKey, label: string) => void;
  hideWeekdays: boolean;
  onHideWeekdays: (v: boolean) => void;
}) {
  const last = points.at(-1);
  if (!last) return <p className="aa-note">No gold prices yet.</p>;
  const series: LedgerSeries[] = [
    { name: "MCX Gold M spot", model, valueHeader: "₹ / 10 g", fmt: formatLedgerInr, live: last },
    ...shares.map((sh) => ({ name: sh.symbol, model: sh.model, valueHeader: "₹ / share", fmt: formatLedgerPrice, live: sh.live ?? sh.points.at(-1) ?? null })),
  ];
  return (
    <div className="pl-ledger gn-stack">
      <CombinedLedger
        series={series}
        selections={selections}
        onSelect={onSelect}
        unitLine={`daily average over each period · gold to ${last.date} · shares to ${shares[0]?.points.at(-1)?.date ?? "—"}`}
        hideWeekdays={hideWeekdays}
        onHideWeekdays={onHideWeekdays}
      />
      {!hideWeekdays && series.map((s) => <WeekdayTables key={s.name} series={s} selections={selections} onSelect={onSelect} />)}
      <p className="aa-note">
        Every figure is the average daily price over the window (sum of daily values ÷ trading days), Indian FY (April–March): Gold M spot for gold, the NSE close for
        Muthoot and Manappuram. Weekend sessions and Diwali Muhurat days are left out. Each row&apos;s period applies to all three. With Live prices on, the latest
        quarter and month show the latest price (live DHAN quote in market hours, else the last close) instead of their average, and their changes are worked from it.
        Gold is updated from the MCX Spot Market file uploaded on /admin; share closes sync from DHAN.
      </p>
    </div>
  );
}
