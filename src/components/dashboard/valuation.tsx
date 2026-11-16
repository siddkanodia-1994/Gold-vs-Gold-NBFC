"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { AlignedRow } from "@/lib/analytics/series";
import { COMPANIES, type CompanyKey } from "@/lib/instruments";
import { METRIC_LABELS, type Metric } from "@/lib/multiples/types";
import {
  computeTargetPrices,
  GOLD_AT_OPTIONS,
  MULTIPLE_METHODS,
  PERIOD_OPTIONS,
  SCENARIOS,
  type CompanyInputs,
  type InputField,
  type MethodKey,
  type PeriodKey,
  type Scenario,
  type ValuationSettings,
} from "@/lib/valuation/model";
import type { ValuationModelData } from "@/lib/valuation/store";
import { Pct } from "./common";
import { dayLabel, inr, num } from "./format";
import { companySeries, metricView, type MultiplesData } from "./multiples";

// The Valuation Model tab, laid out as the AMC dashboard's: the FY28E
// table on top (P/B, PE or Mcap/Sales), then the Target Price table --
// Ratio, Best fit and that multiple, Bear / Base / Bull, weighted -- with
// its settings beside it. Anyone can view; edits need the admin password.

const SECRET_KEY = "gold-nbfc-admin-secret";
const SCENARIO_LABEL = { bear: "Bear", base: "Base", bull: "Bull" } as const;
const WEIGHT_OPTIONS = Array.from({ length: 21 }, (_, i) => i * 5);

function readSecret(): string {
  try {
    return localStorage.getItem(SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** The admin password, checked against the server before it unlocks editing. */
function useAdminSecret() {
  const [secret, setSecret] = useState("");
  useEffect(() => setSecret(readSecret()), []); // eslint-disable-line react-hooks/set-state-in-effect
  const unlock = useCallback(async (candidate: string) => {
    const res = await fetch("/api/admin/status", { headers: { "x-admin-secret": candidate } });
    if (!res.ok) throw new Error(res.status === 401 ? "Wrong password" : `Check failed (${res.status})`);
    try {
      localStorage.setItem(SECRET_KEY, candidate);
    } catch {}
    setSecret(candidate);
  }, []);
  const lock = useCallback(() => {
    try {
      localStorage.removeItem(SECRET_KEY);
    } catch {}
    setSecret("");
  }, []);
  return { secret, unlock, lock };
}

function inr0(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : num(v, 0);
}

/** A number box that saves on blur / Enter; blank saves null. `scale` maps shown → stored (rates: % → fraction). */
function SavedNumberInput({
  value,
  onSave,
  ariaLabel,
  decimals = 2,
  scale = 1,
  placeholder,
  muted,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
  ariaLabel: string;
  decimals?: number;
  scale?: number;
  placeholder?: string;
  muted?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === null ? "" : String(Number((value * scale).toFixed(decimals)));
  const commit = async () => {
    if (draft === null) return;
    const text = draft.replace(/,/g, "").trim();
    setDraft(null);
    const next = text === "" ? null : Number(text);
    if (next !== null && !Number.isFinite(next)) return;
    const stored = next === null ? null : next / scale;
    if (stored === value || (stored !== null && value !== null && Math.abs(stored - value) < 1e-9)) return;
    await onSave(stored);
  };
  return (
    <input
      className={`vm-in${muted && draft === null ? " is-band" : ""}`}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder ?? "—"}
      value={draft ?? shown}
      onFocus={() => setDraft(shown)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function ScenarioRow({ label, values, className, fmt = inr0 }: { label: string; values: Scenario; className?: string; fmt?: (v: number | null) => string }) {
  return (
    <tr className={className}>
      <th scope="row">{label}</th>
      {SCENARIOS.map((k) => (
        <td key={k}>{fmt(values[k])}</td>
      ))}
    </tr>
  );
}

function UpsideRow({ values, cmp }: { values: Scenario; cmp: number | null }) {
  return (
    <tr className="vs-up">
      <th scope="row">Upside</th>
      {SCENARIOS.map((k) => (
        <td key={k}>
          <Pct change={values[k] === null || !cmp ? null : values[k]! / cmp - 1} />
        </td>
      ))}
    </tr>
  );
}

function GapRow() {
  return (
    <tr className="vs-gap" aria-hidden="true">
      <td colSpan={4} />
    </tr>
  );
}

/** One value across all three columns, editable in Base (the AMC layout). */
function SharedInputRow({
  label,
  value,
  editable,
  onSave,
  decimals,
  scale = 1,
  fmt,
}: {
  label: string;
  value: number | null;
  editable: boolean;
  onSave: (v: number | null) => Promise<void>;
  decimals: number;
  scale?: number;
  fmt: (v: number | null) => string;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{fmt(value)}</td>
      <td className={editable ? "vs-in" : undefined}>
        {editable ? <SavedNumberInput value={value} onSave={onSave} ariaLabel={label} decimals={decimals} scale={scale} /> : fmt(value)}
      </td>
      <td>{fmt(value)}</td>
    </tr>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="gn-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// P/B first: it's the default method for gold-loan NBFCs here.
const MULTIPLE_ORDER: Metric[] = ["pbv", "pe", "mcapSales"];
const MULTIPLE_OPTIONS = MULTIPLE_ORDER.map((m) => ({ key: m, label: METRIC_LABELS[m].short }));
const PERIOD_SEG = PERIOD_OPTIONS.map((p) => ({ key: p.key, label: p.key }));

function goldAtText(n: number): string {
  return GOLD_AT_OPTIONS.find((o) => o.value === n)?.label.toLowerCase() ?? `${n}D avg`;
}

function goldDaysText(n: number): string {
  return n > 1 ? `${n}D-avg gold` : "spot gold";
}

export function ValuationSection({
  company,
  rows,
  multiples,
}: {
  company: CompanyKey;
  /** Aligned sessions with today's live point (if any) on the end. */
  rows: AlignedRow[];
  multiples: MultiplesData | null | undefined;
}) {
  const co = COMPANIES.find((c) => c.key === company)!;
  const { data, error, mutate } = useSWR<ValuationModelData>("/api/valuation-model", fetchJson, { revalidateOnFocus: false });
  const { secret, unlock, lock } = useAdminSecret();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [local, setLocal] = useState<Partial<ValuationSettings>>({});
  const [saving, setSaving] = useState(false);
  const editable = Boolean(secret) && Boolean(data);

  const saved = data?.settings;
  const settings: ValuationSettings | null = useMemo(() => (saved ? { ...saved, ...local, weights: { ...saved.weights, ...local.weights } } : null), [saved, local]);
  const inputs: CompanyInputs = useMemo(() => data?.inputs[company] ?? {}, [data, company]);
  const last = rows.at(-1);
  const cmp = last ? last[company] : null;
  const cmpIsLive = Boolean(last?.live);

  // The selected multiple's 3Y band (sample SD, live point included), for blank Bear / Base / Bull cells.
  const series = useMemo(() => (multiples ? companySeries(multiples[company], last?.live && cmp ? { date: last.date, price: cmp } : null) : []), [multiples, company, last, cmp]);
  const bandFor = useCallback(
    (m: Metric) => {
      const v = metricView(series, m, { kind: "months", months: 36 }, () => cmp);
      return v ? { mean: v.bands.mean, sd: v.bands.sd, current: v.bands.current } : null;
    },
    [series, cmp]
  );
  const band = settings ? bandFor(settings.multiple) : null;

  const table = useMemo(() => (settings ? computeTargetPrices(rows, company, settings, inputs, band) : null), [rows, company, settings, inputs, band]);

  async function post(body: unknown) {
    const res = await fetch("/api/admin/valuation-model", {
      method: "POST",
      headers: { "x-admin-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) lock();
    if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);
    return json;
  }

  const saveField = (field: InputField) => async (value: number | null) => {
    try {
      await post({ company, field, value });
      await mutate();
      setMsg(null);
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message : "Save failed" });
    }
  };

  async function saveDefaults() {
    if (!settings) return;
    setSaving(true);
    try {
      await post({ settings });
      await mutate();
      setLocal({});
      setMsg({ tone: "ok", text: "Saved as the default for everyone." });
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="aa-note">Could not load the valuation model: {String(error.message ?? error)}</p>;
  if (!settings || !table) return <p className="aa-note">Loading the valuation model…</p>;

  const def = MULTIPLE_METHODS[settings.multiple];
  const block = table.block;
  const set = (patch: Partial<ValuationSettings>) => setLocal((s) => ({ ...s, ...patch }));
  const dirty = Object.keys(local).length > 0;
  const anchor = multiples?.[company].anchor ?? null;

  const methodRows: { key: MethodKey; name: string; how: string }[] = [
    {
      key: "ratio",
      name: "Ratio",
      how: table.ratio
        ? `Price ÷ ${goldDaysText(settings.ratioGoldDays)} (${settings.ratioPeriod}, ${table.ratio.n} sessions): −1 SD / Mean / +1 SD × today's gold (${goldAtText(settings.ratioGoldAt)} ${inr(table.ratio.gold)})`
        : "Not enough sessions in this period.",
    },
    {
      key: "bestFit",
      name: "Best fit line",
      how: table.bestFit
        ? `Line fitted on ${settings.bestFitPeriod} with ${goldDaysText(settings.bestFitGoldDays)} (R² ${table.bestFit.r2.toFixed(2)}, ${table.bestFit.n} sessions), read at ${goldAtText(settings.bestFitGoldAt)} (${inr(table.bestFit.gold)}) −${settings.bestFitPct}% / as is / +${settings.bestFitPct}%`
        : "Not enough sessions in this period.",
    },
    {
      key: "multiple",
      name: def.name,
      how: `FY28E ${def.income.split(" FY28E")[0].toLowerCase()} × target ${METRIC_LABELS[settings.multiple].short} ÷ shares, discounted 2 periods (FY27, FY26 rates)${
        SCENARIOS.some((k) => block.fromBand[k]) ? "; blank multiples use the 3Y −1 SD / Mean / +1 SD" : ""
      }${block.perShare === null ? " — enter the FY28E inputs above" : ""}`,
    },
  ];
  const weightTotal = settings.weights.ratio + settings.weights.bestFit + settings.weights.multiple;
  const mix = (["ratio", "bestFit", "multiple"] as MethodKey[])
    .filter((m) => table.shares[m] !== null)
    .map((m) => `${methodRows.find((r) => r.key === m)!.name} ${Math.round(table.shares[m]! * 100)}%`)
    .join(" · ");

  return (
    <div className="gn-stack">
      {msg && <p className={`gn-tile gn-tile--${msg.tone === "ok" ? "ok" : "bad"}`} style={{ margin: 0 }}>{msg.text}</p>}

      <section className="pl-panel vm" aria-label="Valuation FY28E">
        <div className="pl-band">
          Valuation · FY28E <span className="pl-band-unit">Bear / Base / Bull · income ₹ Cr · targets ₹ per share · {co.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3" style={{ padding: "12px 12px 0" }}>
          <span className="gn-lbl">Method</span>
          <Seg value={settings.multiple} options={MULTIPLE_OPTIONS} onChange={(m) => set({ multiple: m })} label="Valuation multiple" />
          <span style={{ marginLeft: "auto" }} className="flex flex-wrap items-center gap-2">
            {secret ? (
              <>
                <span className="aa-live" style={{ color: "#08711e" }}>
                  EDITING
                </span>
                <button type="button" className="aa-btn aa-btn--ghost" onClick={lock}>
                  Lock
                </button>
              </>
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await unlock(pw);
                    setPw("");
                    setMsg(null);
                  } catch (err) {
                    setMsg({ tone: "bad", text: err instanceof Error ? err.message : "Unlock failed" });
                  }
                }}
              >
                <input
                  className="gn-date"
                  type="password"
                  placeholder="Admin password to edit"
                  autoComplete="current-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  style={{ width: 190 }}
                />
                <button className="aa-btn" type="submit" disabled={!pw}>
                  Unlock
                </button>
              </form>
            )}
          </span>
        </div>
        <div className="vs-grid">
          <div className="vs-block">
            <p className="vs-cap">
              <b>{def.name} method</b> FY28E {def.income.split(" FY28E")[0].toLowerCase()} × {METRIC_LABELS[settings.multiple].short} ÷ shares, discounted to today
            </p>
            <table className="vs-t">
              <thead>
                <tr>
                  <th scope="col">CMP {cmp === null ? "—" : `₹${num(cmp, 0)}`}</th>
                  {SCENARIOS.map((k) => (
                    <th key={k} scope="col" className={`vs-${k}`}>
                      {SCENARIO_LABEL[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SharedInputRow label={def.income} value={inputs[def.incomeField] ?? null} editable={editable} onSave={saveField(def.incomeField)} decimals={0} fmt={inr0} />
                <SharedInputRow label="Shares (Cr)" value={inputs.sharesCr ?? null} editable={editable} onSave={saveField("sharesCr")} decimals={2} fmt={(x) => (x === null ? "—" : num(x, 2))} />
                <ScenarioRow label={def.perShare} values={{ bear: block.perShare, base: block.perShare, bull: block.perShare }} fmt={(x) => (x === null ? "—" : num(x, 1))} />
                <tr className="vs-mult">
                  <th scope="row">{def.multiple}</th>
                  {def.fields.map((f, i) => {
                    const k = SCENARIOS[i];
                    const bandValue = band ? band.mean + (i - 1) * band.sd : null;
                    const value = inputs[f] ?? null;
                    return (
                      <td key={f} className={editable ? "vs-in" : undefined}>
                        {editable ? (
                          <SavedNumberInput
                            value={value}
                            onSave={saveField(f)}
                            ariaLabel={`${def.multiple} ${k}`}
                            decimals={2}
                            placeholder={bandValue === null ? "—" : bandValue.toFixed(2)}
                            muted={value === null}
                          />
                        ) : (
                          <span style={value === null ? { color: "#686b72", fontStyle: "italic" } : undefined}>{block.multiples[k]?.toFixed(2) ?? "—"}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                <ScenarioRow label="Price Target FY28" values={block.fy28} className="vs-strong" />
                <UpsideRow values={block.fy28} cmp={cmp} />
                <GapRow />
                <SharedInputRow
                  label="Discount % (FY27)"
                  value={inputs.discountFy27 ?? null}
                  editable={editable}
                  onSave={saveField("discountFy27")}
                  decimals={2}
                  scale={100}
                  fmt={(x) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`)}
                />
                <ScenarioRow label="Target Price FY27" values={block.fy27} className="vs-strong" />
                <GapRow />
                <SharedInputRow
                  label="Discount % (FY26)"
                  value={inputs.discountFy26 ?? null}
                  editable={editable}
                  onSave={saveField("discountFy26")}
                  decimals={2}
                  scale={100}
                  fmt={(x) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`)}
                />
                <ScenarioRow label="Target Price Current" values={block.current} className="vs-strong" />
                <UpsideRow values={block.current} cmp={cmp} />
              </tbody>
            </table>
          </div>
          <div className="vs-block">
            <p className="vs-cap">
              <b>Today, for reference</b> TTM consolidated (Ace Equity, price-updated) and each multiple&apos;s 3Y band
            </p>
            <table className="vs-t">
              <thead>
                <tr>
                  <th scope="col">Multiple</th>
                  <th scope="col">Current</th>
                  <th scope="col">3Y −1 SD / Mean / +1 SD</th>
                  <th scope="col">Per share (TTM)</th>
                </tr>
              </thead>
              <tbody>
                {MULTIPLE_ORDER.map((m) => {
                  const b = bandFor(m);
                  const perShare = anchor?.[m] ?? null;
                  return (
                    <tr key={m} className={m === settings.multiple ? "vs-strong" : undefined}>
                      <th scope="row">{METRIC_LABELS[m].short}</th>
                      <td>{b ? `${b.current.toFixed(2)}x` : "—"}</td>
                      <td>{b ? `${(b.mean - b.sd).toFixed(2)} / ${b.mean.toFixed(2)} / ${(b.mean + b.sd).toFixed(2)}` : "—"}</td>
                      <td>
                        {perShare === null ? "—" : `₹${num(perShare, 1)}`}
                        <br />
                        <small style={{ color: "#686b72" }}>{METRIC_LABELS[m].perShare}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="aa-note" style={{ padding: "0 12px 12px" }}>
          {editable
            ? "Blue cells save straight away. Grey multiples are the 3Y −1 SD / Mean / +1 SD of the chosen multiple; type to override, clear to go back to the band."
            : "Unlock with the admin password to edit. Grey italic multiples are the 3Y −1 SD / Mean / +1 SD of the chosen multiple (used until one is typed)."}{" "}
          Shares and discount rates are shared by all three multiples; each multiple keeps its own FY28E figure and targets. Upsides use{" "}
          {cmpIsLive ? "today's live price" : "the last close"}.
        </p>
      </section>

      <section className="pl-panel vm" aria-label="Target price">
        <div className="pl-band">
          Target Price{" "}
          <span className="pl-band-unit">
            ₹ per share · vs {cmpIsLive ? "live price" : "last close"} {inr(cmp, 2)}
          </span>
        </div>
        <div className="vm-grid">
          <table className="vm-t">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col" className="vm-wcol">
                  Weight
                </th>
                <th scope="col">Bear</th>
                <th scope="col">Base</th>
                <th scope="col">Bull</th>
              </tr>
            </thead>
            <tbody>
              {methodRows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    <b>{r.name}</b>
                    <small>{r.how}</small>
                  </th>
                  <td className="vm-wcol">
                    <select
                      className="vm-sel vm-w"
                      aria-label={`${r.name} weight`}
                      value={settings.weights[r.key]}
                      onChange={(e) => set({ weights: { ...settings.weights, [r.key]: Number(e.target.value) } })}
                    >
                      {WEIGHT_OPTIONS.map((w) => (
                        <option key={w} value={w}>
                          {w}%
                        </option>
                      ))}
                    </select>
                  </td>
                  {SCENARIOS.map((k) => {
                    const p = table.methods[r.key][k];
                    return (
                      <td key={k} className="vm-c">
                        <span className="vm-p">{inr0(p)}</span>
                        {p !== null && <Pct change={cmp ? p / cmp - 1 : null} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="vm-avg">
                <th scope="row">
                  <b>Weighted average</b>
                  <small>{mix || "no method has a value yet"}</small>
                </th>
                <td className="vm-wcol">
                  <span className={`vm-total vm-total--${weightTotal === 100 ? "ok" : "off"}`} title={weightTotal === 100 ? undefined : "Scaled to 100%"}>
                    {weightTotal}%
                  </span>
                </td>
                {SCENARIOS.map((k) => {
                  const p = table.average[k];
                  return (
                    <td key={k} className="vm-c">
                      <span className="vm-p">{inr0(p)}</span>
                      {p !== null && <Pct change={cmp ? p / cmp - 1 : null} />}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>

          <table className="vm-t vm-inputs">
            <colgroup>
              <col className="vm-col-label" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" colSpan={2}>
                  Settings
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="vm-grp">
                <td colSpan={2}>Ratio</td>
              </tr>
              <tr>
                <th scope="row">
                  Period <small>window for the mean and SD</small>
                </th>
                <td>
                  <Seg value={settings.ratioPeriod} options={PERIOD_SEG} onChange={(v: PeriodKey) => set({ ratioPeriod: v })} label="Ratio period" />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  History gold avg (days) <small>the ratio is built on</small>
                </th>
                <td>
                  <DaysInput value={settings.ratioGoldDays} onChange={(v) => set({ ratioGoldDays: v })} label="Ratio gold average (days)" />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  Today&apos;s gold <small>multiplied into the mean ratio</small>
                </th>
                <td>
                  <GoldAtSelect value={settings.ratioGoldAt} onChange={(v) => set({ ratioGoldAt: v })} label="Ratio today's gold" />
                </td>
              </tr>
              <tr className="vm-grp">
                <td colSpan={2}>Best fit</td>
              </tr>
              <tr>
                <th scope="row">
                  Period <small>window the line is fitted on</small>
                </th>
                <td>
                  <Seg value={settings.bestFitPeriod} options={PERIOD_SEG} onChange={(v: PeriodKey) => set({ bestFitPeriod: v })} label="Best fit period" />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  Line gold avg (days) <small>the line is fitted on</small>
                </th>
                <td>
                  <DaysInput value={settings.bestFitGoldDays} onChange={(v) => set({ bestFitGoldDays: v })} label="Best fit gold average (days)" />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  Gold <small>where the line is read</small>
                </th>
                <td>
                  <GoldAtSelect value={settings.bestFitGoldAt} onChange={(v) => set({ bestFitGoldAt: v })} label="Best fit gold" />
                </td>
              </tr>
              <tr>
                <th scope="row">Gold −/+ (%)</th>
                <td>
                  <input
                    className="vm-in"
                    inputMode="decimal"
                    aria-label="Best fit gold move (%)"
                    value={settings.bestFitPct}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value === "" || (Number.isFinite(n) && n >= 0 && n < 100)) set({ bestFitPct: e.target.value === "" ? 0 : n });
                    }}
                  />
                </td>
              </tr>
              <tr className="vm-grp">
                <td colSpan={2}>Multiple</td>
              </tr>
              <tr>
                <th scope="row">
                  Method <small>third row of the table</small>
                </th>
                <td>
                  <Seg value={settings.multiple} options={MULTIPLE_OPTIONS} onChange={(m) => set({ multiple: m })} label="Multiple method" />
                </td>
              </tr>
              <tr className="vm-ro">
                <td colSpan={2}>
                  {editable ? (
                    <>
                      <button type="button" className="aa-btn" disabled={saving || !dirty} onClick={saveDefaults}>
                        {saving ? "Saving…" : "Save as default"}
                      </button>{" "}
                      <small>{dirty ? "shared with everyone, for both companies" : "on the saved settings"}</small>
                    </>
                  ) : (
                    <small>Changes here are for this view only; unlock to save them as the default.</small>
                  )}
                  {dirty && (
                    <>
                      {" "}
                      <button type="button" className="aa-btn aa-btn--ghost" onClick={() => setLocal({})}>
                        Back to saved
                      </button>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {table.bestFit && table.bestFit.slope < 0 && (
          <p className="aa-warn" style={{ paddingTop: 10 }}>
            The {settings.bestFitPeriod} best fit line slopes down (R² {table.bestFit.r2.toFixed(2)}), so its Bear sits above its Bull: a weak fit for this period.
          </p>
        )}
        <p className="aa-note" style={{ padding: "0 12px 12px" }}>
          Gold is MCX Gold M spot (₹/10 g){table.ratio ? `, ratio window from ${dayLabel(table.ratio.from)}` : ""}. The {def.name} row is the Target Price Current of the FY28E table above;
          its FY28E figure, shares, multiples and discount rates are edited there. Weighted average: methods without a value are left out and the rest rescaled to 100%.
        </p>
      </section>
    </div>
  );
}

function DaysInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]); // eslint-disable-line react-hooks/set-state-in-effect
  return (
    <input
      className="vm-in"
      inputMode="numeric"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseInt(e.target.value, 10);
        if (Number.isInteger(n) && n >= 1 && n <= 250) onChange(n);
      }}
    />
  );
}

function GoldAtSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <select className="vm-sel" aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {GOLD_AT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
