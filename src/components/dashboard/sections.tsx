"use client";

import { ratioLevel } from "@/lib/analytics/ratio";
import { modelRatioLevel, retLevel } from "@/lib/analytics/regression";
import { COMPANIES, type CompanyKey } from "@/lib/instruments";
import { ActualVsModelChart, ModelRatioChart, RatioChart, ReturnToFitChart, ScatterFitChart } from "./charts";
import { AsideCard, FitStatGrid, GapText, LadderPanel, SD_LEVELS, zText } from "./common";
import { dayLabel, inr, num, pct } from "./format";
import { goldLabel, type Model } from "./model";

function companyOf(key: CompanyKey) {
  return COMPANIES.find((c) => c.key === key)!;
}

function priceNote(model: Model): string {
  return model.isLive ? "live price" : "last close";
}

function NotEnough() {
  return <p className="aa-note">Not enough sessions in this window to fit. Pick a longer period.</p>;
}

// ── Ratio: price ÷ N-day avg gold ─────────────────────────────────────────
export function RatioSection({ model, company }: { model: Model; company: CompanyKey }) {
  const r = model.ratio[company];
  const g = model.reg[company];
  const co = companyOf(company);
  if (!r) return <NotEnough />;
  const gl = goldLabel(model.avgDays);
  const dp = r.mean < 0.01 ? 6 : 5;
  return (
    <div className="gn-stack">
      <AsideCard aside={<FitStatGrid r={g?.fit.r ?? null} r2={g?.fit.r2 ?? null} />}>
        <p className="gn-cap">Price vs ratio fair value (mean)</p>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="gn-big">{inr(r.current.price, 2)}</span>
          <span className="text-xs text-[var(--pl-color-text-muted)]">vs mean-ratio value</span>
          <span className="gn-big gn-blue">{inr(r.fairValue, 2)}</span>
        </div>
        <p className="text-sm text-[var(--pl-color-text-muted)]">
          <GapText gap={r.current.price / r.fairValue - 1} against="the mean-ratio value" />. Today&apos;s ratio {r.current.ratio.toFixed(dp)} is {zText(r.z)} SD from its{" "}
          {model.periodLabel} mean ({r.band}), at the {r.percentile === null ? "—" : `${Math.round(r.percentile * 100)}th`} percentile of the window.
        </p>
        <div className="gn-eq">
          Price = {r.mean.toFixed(dp)} × {gl} = {r.mean.toFixed(dp)} × {inr(r.current.avgGold)} = {inr(r.fairValue, 2)}
        </div>
        <div className="gn-foot">
          n {r.points.length} sessions · mean of {co.symbol} ÷ {gl} from {dayLabel(r.points[0].date)} to {dayLabel(r.current.date)} · {co.symbol} {priceNote(model)}
          {model.rows[model.span.endIdx].goldDate !== model.rows[model.span.endIdx].date && (
            <> · gold carried from {dayLabel(model.rows[model.span.endIdx].goldDate)}</>
          )}
        </div>
      </AsideCard>

      <div className="gn-card">
        <p className="gn-cap">Gold vs share price</p>
        <p className="gn-sub">
          Mean {r.mean.toFixed(dp)} · current {r.current.ratio.toFixed(dp)} · z-score {zText(r.z)} · {r.points.length} trading days · {gl}. Period and gold average
          come from the toolbar above and re-fit the Regression section too.
        </p>
        <RatioChart r={r} avgDays={model.avgDays} symbol={co.symbol} />
      </div>

      <LadderPanel
        title="Ratio Analysis"
        unit={`${co.symbol} ÷ ${gl} · ₹ per share · vs ${priceNote(model)} ${inr(r.current.price, 2)}`}
        levelHeader="Ratio"
        rows={SD_LEVELS.map((k) => {
          const l = ratioLevel(r, k);
          return { k, level: l.ratio.toFixed(dp), price: l.price, upside: l.upside };
        })}
        facts={[
          ["Current ratio", r.current.ratio.toFixed(dp)],
          ["Z-score", zText(r.z)],
          ["Band position", r.band],
          ["Percentile in window", r.percentile === null ? "—" : pct(r.percentile, 0, false)],
          ["Window min / max", `${r.min.toFixed(dp)} / ${r.max.toFixed(dp)}`],
          [`Today's ${gl}`, inr(r.current.avgGold)],
          ["Sessions", `${r.points.length} · ${r.points[0].date} → ${r.current.date}`],
        ]}
      />
    </div>
  );
}

// ── Regression: price = a + b × N-day avg gold ────────────────────────────
export function RegressionSection({ model, company }: { model: Model; company: CompanyKey }) {
  const g = model.reg[company];
  const co = companyOf(company);
  if (!g) return <NotEnough />;
  const gl = goldLabel(model.avgDays);
  const gap = g.current.y / g.current.fitted - 1;
  const signalTone = g.signal.startsWith("Cheap") ? "ok" : g.signal.startsWith("Rich") ? "bad" : "info";
  return (
    <div className="gn-stack">
      <AsideCard aside={<FitStatGrid r={g.fit.r} r2={g.fit.r2} />}>
        <p className="gn-cap">Price vs regression fair value</p>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="gn-big">{inr(g.current.y, 2)}</span>
          <span className="text-xs text-[var(--pl-color-text-muted)]">vs fair value</span>
          <span className="gn-big gn-blue">{inr(g.current.fitted, 2)}</span>
        </div>
        <p className="text-sm text-[var(--pl-color-text-muted)]">
          <GapText gap={gap} against="the model" />. The residual of {inr(g.residual, 2)} is {zText(g.residualZ)} standard errors from the line:{" "}
          <b>{g.signal}</b>. Upside to fitted price {pct(g.current.retToFit)}.
        </p>
        <div className="gn-eq">
          Price = {g.fit.slope.toFixed(6)} × {gl} + {num(g.fit.intercept, 2)} = {g.fit.slope.toFixed(6)} × {inr(g.current.x)} + {num(g.fit.intercept, 2)} ={" "}
          {inr(g.current.fitted, 2)}
        </div>
        <div className="gn-foot">
          n {g.fit.n} sessions · fitted {dayLabel(g.points[0].date)} to {dayLabel(g.current.date)} · R² {g.fit.r2.toFixed(3)} · std error {inr(g.fit.steyx, 2)} ·{" "}
          {co.symbol} {priceNote(model)}
        </div>
      </AsideCard>

      <div className="gn-tiles">
        <div className={`gn-tile gn-tile--${g.fit.n >= 60 ? "ok" : "warn"}`}>
          <b>{g.fit.n} sessions</b>
          <span>{g.fit.n >= 250 ? "a year or more of data" : "short window — R² is less stable"}</span>
        </div>
        <div className="gn-tile gn-tile--info">
          <b>Slope {g.fit.slope.toFixed(5)}</b>
          <span>₹ per share for each ₹1 in gold (per 10 g)</span>
        </div>
        <div className="gn-tile gn-tile--info">
          <b>Std error {inr(g.fit.steyx, 2)}</b>
          <span>typical distance of the close from the line</span>
        </div>
        <div className={`gn-tile gn-tile--${signalTone}`}>
          <b>{g.signal}</b>
          <span>residual z {zText(g.residualZ)} (±1 SE band)</span>
        </div>
        <div className={`gn-tile gn-tile--${Math.abs(g.retZ) >= 2 ? "warn" : "info"}`}>
          <b>Return to fit {pct(g.current.retToFit)}</b>
          <span>{zText(g.retZ)} SD vs its window mean {pct(g.retMean)}</span>
        </div>
      </div>

      <div className="gn-card">
        <p className="gn-cap">Share price: actual vs model</p>
        <ActualVsModelChart g={g} symbol={co.symbol} />
      </div>

      <div className="gn-card">
        <p className="gn-cap">Share price ÷ model</p>
        <p className="gn-sub">
          Each session&apos;s close over the best-fit line ({gl}), with the window mean and ±1 / ±2 SD. Above 1.00 the close was above the line, below 1.00 under it. Today{" "}
          {g.current.ratio.toFixed(4)} ({zText(g.ratioZ)} SD). The line is fitted on these same sessions, so the mean sits near 1.00; the SD lines show how far the price has
          typically strayed from it, not the odds of reaching a level.
        </p>
        <ModelRatioChart g={g} symbol={co.symbol} />
      </div>

      <LadderPanel
        title="Model Ratio Analysis"
        unit={`close ÷ model · ₹ per share · today's model value ${inr(g.current.fitted, 2)} · vs ${priceNote(model)} ${inr(g.current.y, 2)}`}
        levelHeader="Ratio"
        rows={SD_LEVELS.map((k) => {
          const l = modelRatioLevel(g, k);
          return { k, level: l.ratio.toFixed(4), price: l.price, upside: l.upside };
        })}
        facts={[
          ["Today's ratio", g.current.ratio.toFixed(4)],
          ["Z-score", zText(g.ratioZ)],
          ["Today's model value", inr(g.current.fitted, 2)],
          ["Sessions", `${g.fit.n} · ${g.points[0].date} → ${g.current.date}`],
        ]}
      />

      <div className="gn-card">
        <p className="gn-cap">Return to best fit</p>
        <p className="gn-sub">
          Each session&apos;s fitted price ÷ close − 1: the move back to the line. Above zero the share sat below the model (cheap vs gold), below zero above it. Bands are
          the window mean ±1 / ±2 SD (sample SD, as in the workbook). Today {pct(g.current.retToFit)} ({zText(g.retZ)} SD).
        </p>
        <ReturnToFitChart g={g} symbol={co.symbol} />
      </div>

      <LadderPanel
        title="Return-to-fit Analysis"
        unit={`fitted ÷ price − 1 · ₹ per share · today's model value ${inr(g.current.fitted, 2)} · vs ${priceNote(model)} ${inr(g.current.y, 2)}`}
        levelHeader="Return to fit"
        rows={SD_LEVELS.map((k) => {
          const l = retLevel(g, k);
          return { k, level: pct(l.ret), price: l.price, upside: l.upside };
        })}
        facts={[
          ["Today's return to fit", pct(g.current.retToFit)],
          ["Z-score", zText(g.retZ)],
          ["Slope (b) / intercept (a)", `${g.fit.slope.toFixed(5)} / ${num(g.fit.intercept, 2)}`],
          ["Residual (actual − fitted)", inr(g.residual, 2)],
          [`Today's ${gl}`, inr(g.current.x)],
          ["Sessions", `${g.fit.n} · ${g.points[0].date} → ${g.current.date}`],
        ]}
      />

      <div className="gn-card">
        <p className="gn-cap">
          {gl} → price · each session, shaded by date
        </p>
        <ScatterFitChart g={g} avgDays={model.avgDays} symbol={co.symbol} />
      </div>
    </div>
  );
}
