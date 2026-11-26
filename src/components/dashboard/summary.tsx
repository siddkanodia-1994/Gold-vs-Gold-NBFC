"use client";

import { useMemo, useState } from "react";
import { AVG_DAYS_GRID, computeOptimiser, LOOKBACK_GRID, type OptimiserResult } from "@/lib/analytics/optimiser";
import { COMPANIES, type CompanyKey } from "@/lib/instruments";
import { zText } from "./common";
import { GoldPriceSummary, offsetsFromSelections, selectionsFromOffsets, withSelection, type ShareLedger } from "./gold-ledger";
import type { LedgerSelections } from "./gold-ledger";
import { buildPeriodLedger } from "@/lib/analytics/period-ledger";
import type { SummaryDefaults, SummaryView } from "@/lib/summary-defaults";
import type { LedgerPoint } from "@/lib/analytics/period-ledger";
import { dayLabel, inr, num, pct } from "./format";
import { goldLabel, type Model } from "./model";

const r3 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toFixed(3));

/** Heat colour for an R² cell: pale red (0) → white (0.5) → green (1). */
function heat(v: number | null): string | undefined {
  if (v === null) return undefined;
  const t = Math.max(0, Math.min(1, v));
  if (t < 0.5) {
    const f = t / 0.5;
    return `rgb(${Math.round(248 + (255 - 248) * f)},${Math.round(215 + (255 - 215) * f)},${Math.round(218 + (255 - 218) * f)})`;
  }
  const f = (t - 0.5) / 0.5;
  return `rgb(${Math.round(255 - (255 - 198) * f)},${Math.round(255 - (255 - 239) * f)},${Math.round(255 - (255 - 206) * f)})`;
}

export interface ApplySettings {
  (s: { months?: number; avgDays?: number }): void;
}

function Takeaways({ model, opt, lookbackMonths }: { model: Model; opt: OptimiserResult; lookbackMonths: number | null }) {
  const items: string[] = [];
  for (const c of COMPANIES) {
    const r = model.ratio[c.key];
    if (r) {
      items.push(
        `${c.short} ratio: ${zText(r.z)} SD from mean (${r.band}), ${r.percentile === null ? "—" : pct(r.percentile, 0, false)} percentile in window; mean-ratio price ${num(r.fairValue)} vs ${num(r.current.price)} (${pct(r.upsideToFair)}).`
      );
    }
  }
  const [mu, ma] = [model.reg.muthoot, model.reg.manappuram];
  if (mu && ma) {
    items.push(
      `Regression: Muthoot fitted ${num(mu.current.fitted)} vs actual ${num(mu.current.y)} — ${mu.signal} (z ${zText(mu.residualZ, 1)}, R² ${r3(mu.fit.r2)}); Manappuram fitted ${num(ma.current.fitted)} vs ${num(ma.current.y)} — ${ma.signal} (z ${zText(ma.residualZ, 1)}, R² ${r3(ma.fit.r2)}).`
    );
  }
  const bm = opt.bestAvgDays.muthoot;
  const ba = opt.bestAvgDays.manappuram;
  if (bm && ba && mu && ma) {
    items.push(
      `Optimum gold avg days (current ${model.periodLabel} window): Muthoot ${bm.value}D (R² ${r3(bm.r2)}), Manappuram ${ba.value}D (R² ${r3(ba.r2)}) vs current ${model.avgDays}D setting (R² ${r3(mu.fit.r2)} / ${r3(ma.fit.r2)}).`
    );
    const sessions = model.span.endIdx - model.span.startIdx + 1;
    items.push(
      sessions < 500
        ? "Caution: window under ~2 years — R² is low/unstable and swings with avg days; rely on the 36M+ columns in the grids."
        : Math.max(bm.value, ba.value) <= 5
          ? "In this window, short averages (≈ spot gold) explain share prices best; heavier smoothing lowers R² (esp. Muthoot)."
          : "In this window, smoothed gold explains share prices better than spot."
    );
  }
  const lm = opt.bestLookback.muthoot;
  const la = opt.bestLookback.manappuram;
  if (lm && la) {
    const cur = lookbackMonths === null ? "" : ` vs current ${lookbackMonths}M`;
    items.push(`Optimum lookback @ ${model.avgDays}D avg: Muthoot ${lm.value}M (R² ${r3(lm.r2)}), Manappuram ${la.value}M (R² ${r3(la.r2)})${cur}.`);
  }
  return (
    <ul className="gn-takeaways">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

type Row = [label: string, a: string, b: string];

// The regression table's first six rows mirror the ratio table's, so the two
// bold upside rows sit side by side; the fit details follow underneath.
function SnapshotTable({ model }: { model: Model }) {
  const [mu, ma] = [model.ratio.muthoot, model.ratio.manappuram];
  const [gm, ga] = [model.reg.muthoot, model.reg.manappuram];
  const gl = goldLabel(model.avgDays);
  const row = ([label, a, b]: Row, bold = false) => (
    <tr key={label} style={bold ? { fontWeight: 700 } : undefined}>
      <th scope="row" style={bold ? { fontWeight: 700 } : undefined}>
        {label}
      </th>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  );
  const head = (title: string) => (
    <thead>
      <tr>
        <th>{title}</th>
        <th>Muthoot</th>
        <th>Manappuram</th>
      </tr>
    </thead>
  );
  if (!mu || !ma || !gm || !ga) return null;
  const goldRow: Row = [`Latest ${gl}`, inr(mu.current.avgGold), inr(ma.current.avgGold)];
  return (
    <div className="gn-2col">
      <div className="gn-scroll">
        <table className="gn-grid-t">
          {head(`Ratio analysis (price ÷ ${gl})`)}
          <tbody>
            {row(["Latest share price", inr(mu.current.price, 2), inr(ma.current.price, 2)])}
            {row(goldRow)}
            {row(["Current ratio", mu.current.ratio.toFixed(6), ma.current.ratio.toFixed(6)])}
            {row(["Current z-score (SDs from mean)", zText(mu.z), zText(ma.z)])}
            {row(["Price at mean ratio (fair value)", inr(mu.fairValue), inr(ma.fairValue, 2)])}
            {row(["Upside / (downside) to mean-ratio price", pct(mu.upsideToFair), pct(ma.upsideToFair)], true)}
          </tbody>
        </table>
      </div>
      <div className="gn-scroll">
        <table className="gn-grid-t">
          {head(`Regression (price = a + b × ${gl})`)}
          <tbody>
            {row(["Actual price (latest)", inr(gm.current.y, 2), inr(ga.current.y, 2)])}
            {row(goldRow)}
            {row(["R²", r3(gm.fit.r2), r3(ga.fit.r2)])}
            {row(["Residual z (residual ÷ std error)", zText(gm.residualZ), zText(ga.residualZ)])}
            {row(["Fitted price (fair value)", inr(gm.current.fitted, 2), inr(ga.current.fitted, 2)])}
            {row(["Upside / (downside) to fitted price", pct(gm.current.retToFit), pct(ga.current.retToFit)], true)}
            {row(["Slope (b)", gm.fit.slope.toFixed(6), ga.fit.slope.toFixed(6)])}
            {row(["Intercept (a)", num(gm.fit.intercept, 2), num(ga.fit.intercept, 2)])}
            {row(["Correlation", r3(gm.fit.r), r3(ga.fit.r)])}
            {row(["Residual (actual − fitted)", inr(gm.residual, 2), inr(ga.residual, 2)])}
            {row(["Std error of regression", inr(gm.fit.steyx, 2), inr(ga.fit.steyx, 2)])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function R2Grid({
  opt,
  company,
  avgDays,
  lookbackMonths,
  apply,
}: {
  opt: OptimiserResult;
  company: CompanyKey;
  avgDays: number;
  lookbackMonths: number | null;
  apply: ApplySettings;
}) {
  const co = COMPANIES.find((c) => c.key === company)!;
  const best = opt.bestCombo[company];
  return (
    <div className="gn-scroll">
      <table className="gn-grid-t">
        <thead>
          <tr>
            <th>
              {co.short}: avg days \ lookback
            </th>
            {LOOKBACK_GRID.map((m) => (
              <th key={m}>{m}M</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AVG_DAYS_GRID.map((n, i) => (
            <tr key={n}>
              <th scope="row">{n}D</th>
              {LOOKBACK_GRID.map((m, j) => {
                const v = opt.grid[company][i][j];
                const isBest = best?.avgDays === n && best.lookback === m;
                const isCurrent = n === avgDays && m === lookbackMonths;
                return (
                  <td
                    key={m}
                    className={`is-click${isBest ? " is-best" : ""}${isCurrent ? " is-current" : ""}`}
                    style={{ background: heat(v) }}
                    title={`Use ${m}M lookback with ${n}D gold average`}
                    onClick={() => apply({ months: m, avgDays: n })}
                  >
                    {r3(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="gn-foot-row">
            <th scope="row">Best avg days</th>
            {opt.bestPerLookback[company].map((b, j) => (
              <td key={j}>{b ? `${b.value}D` : "—"}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Max R²</th>
            {opt.bestPerLookback[company].map((b, j) => (
              <td key={j}>{r3(b?.r2)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function SummarySection({
  model,
  lookbackMonths,
  apply,
  multiples,
  view,
  onView,
  goldPoints,
  sharePoints,
  saved,
  onSaved,
}: {
  model: Model;
  lookbackMonths: number | null;
  apply: ApplySettings;
  /** The valuation-multiples snapshot table, shown under the ratio and regression ones. */
  multiples?: React.ReactNode;
  /** Gold price (the default) or the ratio & regression summary. */
  view: SummaryView;
  /** Picks a view for this visit; null goes back to the saved default. */
  onView: (v: SummaryView | null) => void;
  goldPoints: LedgerPoint[];
  /** Each company's NSE closes, for its ledger beside the gold one. */
  sharePoints: Record<CompanyKey, LedgerPoint[]>;
  /** The shared saved default (view, weekday tables, row picks). */
  saved: SummaryDefaults;
  /** Re-reads the saved default after a save. */
  onSaved: () => Promise<unknown>;
}) {
  const opt = useMemo(() => computeOptimiser(model.rows, model.span, model.avgDays), [model]);
  const [gridCo, setGridCo] = useState<CompanyKey>("muthoot");
  const sessions = model.span.endIdx - model.span.startIdx + 1;
  const ledger = useMemo(() => buildPeriodLedger(goldPoints), [goldPoints]);
  const lastRow = model.rows.at(-1);
  const shares: ShareLedger[] = useMemo(
    () =>
      COMPANIES.map((c) => ({
        symbol: c.symbol,
        model: buildPeriodLedger(sharePoints[c.key]),
        points: sharePoints[c.key],
        live: lastRow?.live ? { date: lastRow.date, value: lastRow[c.key] } : null,
      })),
    [sharePoints, lastRow]
  );
  const [hideChoice, setHideChoice] = useState<boolean | null>(null);
  const [selChoice, setSelChoice] = useState<LedgerSelections | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hideWeekdays = hideChoice ?? saved.hideWeekdays;
  const selections = selChoice ?? selectionsFromOffsets(ledger, saved.rows);
  const rows = offsetsFromSelections(ledger, selections);
  const dirty = view !== saved.view || hideWeekdays !== saved.hideWeekdays || JSON.stringify(rows) !== JSON.stringify(saved.rows);

  async function saveDefault() {
    setSaveState("saving");
    try {
      const res = await fetch("/api/summary-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, hideWeekdays, rows } satisfies SummaryDefaults),
      });
      if (!res.ok) throw new Error();
      await onSaved();
      setHideChoice(null);
      setSelChoice(null);
      onView(null);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function backToSaved() {
    setHideChoice(null);
    setSelChoice(null);
    onView(null);
    setSaveState("idle");
  }

  const toggle = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="gn-seg" role="group" aria-label="Summary view">
        <button type="button" aria-pressed={view === "gold"} onClick={() => onView("gold")}>
          Gold price
        </button>
        <button type="button" aria-pressed={view === "model"} onClick={() => onView("model")}>
          Ratio &amp; regression
        </button>
      </div>
      <span className="aa-fitbar-sep" aria-hidden />
      <button type="button" className="aa-btn" disabled={!dirty || saveState === "saving"} onClick={saveDefault}>
        {saveState === "saving" ? "Saving…" : "Save as default"}
      </button>
      {dirty ? (
        <button type="button" className="aa-btn aa-btn--ghost" onClick={backToSaved}>
          Back to saved
        </button>
      ) : (
        <span className="text-xs text-[var(--pl-color-text-muted)]">
          {saveState === "saved" ? "Saved — this view, the weekday tables and the row picks now open for everyone." : "On the saved default (view, weekday tables, row picks)"}
        </span>
      )}
      {saveState === "error" && <span className="text-xs" style={{ color: "#a30c15" }}>Couldn&apos;t save — try again.</span>}
    </div>
  );
  if (view === "gold") {
    return (
      <div className="gn-stack">
        {toggle}
        <GoldPriceSummary
          model={ledger}
          points={goldPoints}
          shares={shares}
          selections={selections}
          onSelect={(key, label) => {
            setSelChoice(withSelection(selections, key, label));
            setSaveState("idle");
          }}
          hideWeekdays={hideWeekdays}
          onHideWeekdays={(v) => {
            setHideChoice(v);
            setSaveState("idle");
          }}
        />
      </div>
    );
  }
  return (
    <div className="gn-stack">
      {toggle}
      <div className="gn-card">
        <p className="gn-cap">Key takeaways (auto-updating)</p>
        <p className="gn-sub">
          Window {dayLabel(model.span.start)} to {dayLabel(model.span.end)} · {model.periodLabel} · {sessions} trading days · {goldLabel(model.avgDays)}
          {model.isLive ? " · includes today's live prices" : ""}
        </p>
        <Takeaways model={model} opt={opt} lookbackMonths={lookbackMonths} />
      </div>

      <section className="pl-panel" aria-label="Snapshot">
        <div className="pl-band">
          Ratio &amp; regression snapshot <span className="pl-band-unit">same figures as the Ratio and Regression sections</span>
        </div>
        <div style={{ padding: 12 }}>
          <SnapshotTable model={model} />
          {multiples}
        </div>
      </section>

      <section className="pl-panel" aria-label="R² by gold average days">
        <div className="pl-band">
          R² vs gold avg days <span className="pl-band-unit">current window · click a row to use that average</span>
        </div>
        <div style={{ padding: 12 }} className="gn-scroll">
          <table className="gn-grid-t">
            <thead>
              <tr>
                <th>Gold avg days</th>
                {AVG_DAYS_GRID.map((n) => (
                  <th key={n}>{n}D</th>
                ))}
                <th>Best</th>
              </tr>
            </thead>
            <tbody>
              {COMPANIES.map((c) => (
                <tr key={c.key}>
                  <th scope="row">{c.short} R²</th>
                  {opt.byAvgDays[c.key].map((v, i) => (
                    <td
                      key={i}
                      className={`is-click${opt.bestAvgDays[c.key]?.value === AVG_DAYS_GRID[i] ? " is-best" : ""}${AVG_DAYS_GRID[i] === model.avgDays ? " is-current" : ""}`}
                      style={{ background: heat(v) }}
                      onClick={() => apply({ avgDays: AVG_DAYS_GRID[i] })}
                    >
                      {r3(v)}
                    </td>
                  ))}
                  <td>
                    <b>{opt.bestAvgDays[c.key] ? `${opt.bestAvgDays[c.key]!.value}D` : "—"}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="aa-note">Green outline: highest R². Red outline: the current setting.</p>
        </div>
      </section>

      <section className="pl-panel" aria-label="Optimum lookback">
        <div className="pl-band">
          Optimum lookback period <span className="pl-band-unit">R² at the current {model.avgDays}D gold average, counted back from {dayLabel(model.span.end)}</span>
        </div>
        <div style={{ padding: 12 }} className="gn-scroll">
          <table className="gn-grid-t">
            <thead>
              <tr>
                <th>Lookback</th>
                {LOOKBACK_GRID.map((m) => (
                  <th key={m}>{m}M</th>
                ))}
                <th>Best lookback</th>
                <th>Best overall combo</th>
              </tr>
            </thead>
            <tbody>
              {COMPANIES.map((c) => (
                <tr key={c.key}>
                  <th scope="row">{c.short} R²</th>
                  {opt.byLookback[c.key].map((v, j) => (
                    <td
                      key={j}
                      className={`is-click${opt.bestLookback[c.key]?.value === LOOKBACK_GRID[j] ? " is-best" : ""}${LOOKBACK_GRID[j] === lookbackMonths ? " is-current" : ""}`}
                      style={{ background: heat(v) }}
                      onClick={() => apply({ months: LOOKBACK_GRID[j] })}
                    >
                      {r3(v)}
                    </td>
                  ))}
                  <td>
                    <b>{opt.bestLookback[c.key] ? `${opt.bestLookback[c.key]!.value}M` : "—"}</b>
                  </td>
                  <td>
                    {opt.bestCombo[c.key] ? (
                      <button
                        type="button"
                        className="aa-btn aa-btn--ghost"
                        onClick={() => apply({ months: opt.bestCombo[c.key]!.lookback, avgDays: opt.bestCombo[c.key]!.avgDays })}
                      >
                        {opt.bestCombo[c.key]!.lookback}M · {opt.bestCombo[c.key]!.avgDays}D · R² {r3(opt.bestCombo[c.key]!.r2)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pl-panel" aria-label="R² grid">
        <div className="pl-band">
          R² grid <span className="pl-band-unit">gold avg days (rows) × lookback months (columns) · click a cell to apply it</span>
        </div>
        <div style={{ padding: 12 }}>
          <div className="gn-seg" role="group" aria-label="Company" style={{ marginBottom: 10 }}>
            {COMPANIES.map((c) => (
              <button key={c.key} type="button" aria-pressed={gridCo === c.key} onClick={() => setGridCo(c.key)}>
                {c.short}
              </button>
            ))}
          </div>
          <R2Grid opt={opt} company={gridCo} avgDays={model.avgDays} lookbackMonths={lookbackMonths} apply={apply} />
          <p className="aa-note">
            {`Lookbacks are counted back from the window's last session (${sessions} sessions in the current window). Short lookbacks (6–12M) swing a lot with the average; the workbook's guidance is to lean on the 36M+ columns.`}
          </p>
        </div>
      </section>
    </div>
  );
}
