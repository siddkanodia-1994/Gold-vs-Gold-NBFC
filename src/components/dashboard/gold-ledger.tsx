"use client";

import { useState } from "react";
import { fromOffset, toOffset, type SummaryDefaults } from "@/lib/summary-defaults";
import {
  LEDGER_WEEKDAYS,
  LEDGER_WINDOWS,
  formatLedgerInr,
  formatLedgerPct,
  ledgerChange,
  type LedgerPeriodKind,
  type LedgerWeekday,
  type LedgerPoint,
  type LedgerWindow,
  type PeriodLedger,
} from "@/lib/analytics/period-ledger";

// The Period Ledger's three tables (period | weekday | quarter-by-weekday),
// ported from the AMC dashboard's AUM Summary with the same markup and class
// names, here for MCX Gold M spot. The row selections are owned by the
// parent so they survive switching views. A switch in the band hides the two
// weekday tables (hidden by default, every visit).

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

function Num({ w }: { w: LedgerWindow }) {
  return <span className="pl-num">{formatLedgerInr(w.value)}</span>;
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

function HeaderRow({ cells }: { cells: { text: string; title?: string }[] }) {
  return (
    <tr className="pl-hdr">
      {cells.map((c, i) => (
        <th key={i} scope="col" title={c.title}>
          {c.text}
        </th>
      ))}
    </tr>
  );
}

export function GoldLedger({
  model,
  title,
  unitLine,
  selections,
  onSelect,
  hideWeekdays,
  onHideWeekdays,
  live = null,
}: {
  model: PeriodLedger;
  title: string;
  unitLine: string;
  selections: LedgerSelections;
  onSelect: (key: LedgerSelectKey, label: string) => void;
  hideWeekdays: boolean;
  onHideWeekdays: (v: boolean) => void;
  /** Latest Gold M price, for the Live switch. */
  live?: { date: string; value: number } | null;
}) {
  const lists: Record<LedgerPeriodKind, string[]> = { fy: model.fys, q: model.quarters, m: model.months };
  // Live: the latest quarter and month take today's Gold M price instead of their average to date.
  const [liveOn, setLiveOn] = useState(false);
  const isLive = (kind: LedgerPeriodKind, label: string) => liveOn && live !== null && kind !== "fy" && label === lists[kind].at(-1);
  const periodOf = (kind: LedgerPeriodKind, label: string): LedgerWindow =>
    isLive(kind, label) ? { value: live!.value, days: 1 } : model.period(kind, label);

  const selRows = (kind: LedgerPeriodKind) => {
    const labels = selections[kind];
    const w0 = periodOf(kind, labels[0]);
    return labels.map((label, r) => {
      const w = r === 0 ? w0 : periodOf(kind, label);
      const lv = isLive(kind, label);
      return (
        <tr key={`${kind}-${r}`} className={r === 0 ? "pl-cur" : undefined}>
          <td className="pl-c-sel">
            <PeriodSelect
              labels={lists[kind]}
              value={label}
              ariaLabel={`${KIND_NAMES[kind]} row ${r + 1}${r ? ", compared with row 1" : ""}`}
              onChange={(l) => onSelect({ kind, row: r }, l)}
            />
          </td>
          <td className={lv ? "gn-live" : undefined} title={lv ? `Live: Gold M ${live!.date}` : undefined}>
            <Num w={w} />
          </td>
          <td className="pl-c-chg">{r === 0 ? null : <Badge change={ledgerChange(w0.value, w.value)} />}</td>
          <td />
        </tr>
      );
    });
  };

  const m0 = periodOf("m", selections.m[0]);
  const half = model.half(selections.m[0]);
  const last = model.tail(LEDGER_WINDOWS.week);
  const prev = model.tailPrev(LEDGER_WINDOWS.week);
  const mid = model.tail(LEDGER_WINDOWS.mid);
  const long = model.tail(LEDGER_WINDOWS.long);
  const latestWeek = model.latestWeek();
  const val = "₹ / 10 g";

  const plainRow = (key: string, label: string, w: LedgerWindow, opts: { cur?: boolean; muted?: boolean; chg?: number | null; chg2?: number | null } = {}) => (
    <tr key={key} className={opts.cur ? "pl-cur" : undefined}>
      <td className={opts.muted ? "pl-muted" : undefined}>{label}</td>
      <td>
        <Num w={w} />
      </td>
      <td className="pl-c-chg">{opts.chg !== undefined ? <Badge change={opts.chg} /> : null}</td>
      <td className="pl-c-chg">{opts.chg2 !== undefined ? <Badge change={opts.chg2} /> : null}</td>
    </tr>
  );

  const spacer = (key: string) => (
    <tr key={key} className="pl-w-spacer" aria-hidden="true">
      <td colSpan={4} />
    </tr>
  );

  return (
    <section className="pl-panel" aria-label={title}>
      <div className="pl-band">
        {title} <span className="pl-band-unit">{unitLine}</span>
        {live && (
          <label className="pl-band-toggle" title={`Latest quarter and month use the latest Gold M price (${live.date}) instead of their average`}>
            <input type="checkbox" checked={liveOn} onChange={(e) => setLiveOn(e.target.checked)} />
            Live gold
          </label>
        )}
        <label className={`pl-band-toggle${live ? " gn-band-toggle--next" : ""}`}>
          <input type="checkbox" checked={hideWeekdays} onChange={(e) => onHideWeekdays(e.target.checked)} />
          Hide weekday tables
        </label>
      </div>
      <div className="pl-row">
        <table className="pl-period">
          <colgroup>
            <col className="pl-col-period" />
            <col className="pl-col-val" />
            <col className="pl-col-chg1" />
            <col className="pl-col-chg2" />
          </colgroup>
          <tbody className="pl-sec">
            <HeaderRow cells={[{ text: "Financial Year" }, { text: val }, { text: "YoY %" }, { text: "" }]} />
            {selRows("fy")}
          </tbody>
          <tbody className="pl-sec">
            <HeaderRow cells={[{ text: "Quarter>>" }, { text: val }, { text: "QoQ %" }, { text: "" }]} />
            {selRows("q")}
          </tbody>
          <tbody className="pl-sec">
            <HeaderRow cells={[{ text: "Month>>" }, { text: val }, { text: "MoM %" }, { text: "" }]} />
            {selRows("m")}
            {plainRow("half", `Avg 6M (${LEDGER_WINDOWS.half} days)`, half, { muted: true, chg: ledgerChange(m0.value, half.value) })}
          </tbody>
          <tbody className="pl-sec">
            <HeaderRow
              cells={[
                { text: "Week>>" },
                { text: val },
                { text: "WoW" },
                { text: `vs ${LEDGER_WINDOWS.long}D`, title: `Last ${LEDGER_WINDOWS.week} days vs the last ${LEDGER_WINDOWS.long} days` },
              ]}
            />
            {plainRow("w0", `Last ${LEDGER_WINDOWS.week} Days`, last, {
              cur: true,
              chg: ledgerChange(last.value, prev.value),
              chg2: ledgerChange(last.value, long.value),
            })}
            {plainRow("w1", `Prev ${LEDGER_WINDOWS.week} Days`, prev)}
            {plainRow("w2", `Last ${LEDGER_WINDOWS.mid} Days`, mid)}
            {plainRow("w3", `Last ${LEDGER_WINDOWS.long} Days`, long)}
            {plainRow("w4", "Mon–Fri Avg (Latest)", latestWeek)}
          </tbody>
        </table>


        {!hideWeekdays && (
          <>
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
                        <td className="pl-w-val">{formatLedgerInr(x.latest.value)}</td>
                        <DeltaCell change={x.doShort} />
                        <DeltaCell change={x.doLong} />
                      </tr>,
                      <tr key={`${d}-s`} className="pl-w-detail">
                        <td>{`Average of last ${LEDGER_WINDOWS.dayShort} ${d}s`}</td>
                        <td className="pl-w-val">{formatLedgerInr(x.short.value)}</td>
                        <td />
                        <td />
                      </tr>,
                      <tr key={`${d}-l`} className="pl-w-detail">
                        <td>{`Average of last ${LEDGER_WINDOWS.dayLong} ${d}s`}</td>
                        <td className="pl-w-val">{formatLedgerInr(x.long.value)}</td>
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
                        <td className="pl-w-val">{formatLedgerInr(latest.value)}</td>
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
                          <td className="pl-w-val">{formatLedgerInr(model.dayInQuarter(d, q).value)}</td>
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
          </>
        )}
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

/** The Summary's Gold price view: the ledger over every MCX Gold M spot day (special sessions removed). */
export function GoldPriceSummary({
  model,
  points,
  selections,
  onSelect,
  hideWeekdays,
  onHideWeekdays,
}: {
  model: PeriodLedger;
  points: LedgerPoint[];
  selections: LedgerSelections;
  onSelect: (key: LedgerSelectKey, label: string) => void;
  hideWeekdays: boolean;
  onHideWeekdays: (v: boolean) => void;
}) {
  const last = points.at(-1);
  if (!last) return <p className="aa-note">No gold prices yet.</p>;
  return (
    <div className="pl-ledger gn-stack">
      <GoldLedger
        model={model}
        title="MCX Gold M spot"
        unitLine={`₹ per 10 g · daily average over each period · data to ${last.date}`}
        selections={selections}
        onSelect={onSelect}
        hideWeekdays={hideWeekdays}
        onHideWeekdays={onHideWeekdays}
        live={last}
      />
      <p className="aa-note">
        Every figure is the average daily Gold M spot over the window (sum of daily values ÷ trading days), Indian FY (April–March). Weekend sessions and Diwali Muhurat
        days are left out. With Live gold on, the latest quarter and month show the latest Gold M price instead of their average, and their changes are worked from it. Gold is updated from the MCX
        Spot Market file uploaded on /admin.
      </p>
    </div>
  );
}
