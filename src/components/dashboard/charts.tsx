"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { RatioResult } from "@/lib/analytics/ratio";
import type { RegressionResult } from "@/lib/analytics/regression";
import { dayLabel, dayMs, inr, num, pct, tickMonth } from "./format";
import { SD_LABELS, SD_LEVELS } from "./common";
import { mean, stdevS } from "@/lib/analytics/stats";

const INK = "#16181d";
const GRID = "#eef0f3";
const MUTED = "#686b72";
const BLUE = "#2563eb";
const GOLD = "#b8860b";
const RED_FILL = "rgba(192, 57, 43, 0.28)";
const GREEN_FILL = "rgba(22, 163, 74, 0.28)";
const AXIS = { fontSize: 11, fill: MUTED };

function timeAxis() {
  return (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={["dataMin", "dataMax"]}
      tickFormatter={tickMonth}
      tick={AXIS}
      tickLine={false}
      axisLine={{ stroke: "#c9ccd1" }}
      minTickGap={36}
    />
  );
}

interface SdLineOpts {
  yAxisId?: string;
  /** Put before each label, e.g. "Gold". */
  prefix?: string;
}

const sdColor = (k: number) => (k === 0 ? "#555" : Math.abs(k) === 1 ? "#16a34a" : "#c0392b");

function sdLines(avg: number, sd: number, format: (v: number) => string, o: SdLineOpts = {}) {
  return SD_LEVELS.map((k) => (
    <ReferenceLine
      key={`${o.prefix ?? ""}${k}`}
      yAxisId={o.yAxisId}
      y={avg + k * sd}
      stroke={sdColor(k)}
      strokeDasharray={k === 0 ? undefined : "4 4"}
      strokeWidth={k === 0 ? 1.2 : 1}
      ifOverflow="extendDomain"
      label={{
        value: `${o.prefix ? `${o.prefix} ` : ""}${SD_LABELS[k]} ${format(avg + k * sd)}`,
        position: "insideBottomRight",
        fontSize: 10,
        fill: MUTED,
      }}
    />
  ));
}

/** A chart's mean and ±1 / ±2 SD levels, listed under the hovered values with the hovered value's z-score. */
interface TipLevels {
  label: string;
  avg: number;
  sd: number;
  value: number;
  format: (v: number) => string;
  color?: (k: number) => string;
}

function TipBox({ title, rows, levels }: { title: string; rows: [string, string, string?][]; levels?: TipLevels }) {
  const z = levels && levels.sd > 0 ? (levels.value - levels.avg) / levels.sd : null;
  return (
    <div style={{ background: "#fff", border: "1px solid #d9d9d4", padding: "6px 10px", fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {rows.map(([k, v, color]) => (
        <div key={k} style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
          <span style={{ color: color ?? MUTED }}>{k}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{v}</span>
        </div>
      ))}
      {levels && (
        <div style={{ borderTop: "1px solid #e5e6e8", marginTop: 4, paddingTop: 4 }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between", color: MUTED, fontSize: 11 }}>
            <span>{levels.label}</span>
            {z !== null && <span style={{ fontVariantNumeric: "tabular-nums" }}>z {z < 0 ? "−" : "+"}{Math.abs(z).toFixed(2)}</span>}
          </div>
          {SD_LEVELS.map((k) => (
            <div key={k} style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
              <span style={{ color: (levels.color ?? sdColor)(k) }}>{SD_LABELS[k]}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{levels.format(levels.avg + k * levels.sd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// recharts hands custom tooltips the hovered row as payload[0].payload!.
type TipProps<T> = { active?: boolean; payload?: readonly { payload?: T }[] };

/** Share price ÷ avg gold with mean and ±1/±2 SD, or (Absolute) price and avg gold on two axes. */
export function RatioChart({ r, avgDays, symbol }: { r: RatioResult; avgDays: number; symbol: string }) {
  const [view, setView] = useState<"ratio" | "absolute">("ratio");
  // Absolute view: bands for one series at a time, shown alone (the other series is hidden).
  const [bands, setBands] = useState<"none" | "price" | "gold">("none");
  const toggleBands = (k: "price" | "gold") => setBands((b) => (b === k ? "none" : k));
  const data = useMemo(() => r.points.map((p) => ({ ...p, t: dayMs(p.date) })), [r]);
  // Absolute view's optional bands: each series' own window mean and STDEV.S, as the ratio's.
  const stats = useMemo(() => {
    const prices = r.points.map((p) => p.price);
    const golds = r.points.map((p) => p.avgGold);
    return { price: { mean: mean(prices), sd: stdevS(prices) }, gold: { mean: mean(golds), sd: stdevS(golds) } };
  }, [r]);
  const dp = r.mean < 0.01 ? 5 : 4;
  const goldLabel = avgDays > 1 ? `Gold ${avgDays}D avg` : "Gold M spot";
  return (
    <>
      <div className="flex flex-wrap items-center gap-4" style={{ marginBottom: 8 }}>
        <div className="gn-seg" role="group" aria-label="Chart view">
          <button type="button" aria-pressed={view === "absolute"} onClick={() => setView("absolute")}>
            Absolute
          </button>
          <button type="button" aria-pressed={view === "ratio"} onClick={() => setView("ratio")}>
            Ratio
          </button>
        </div>
        {view === "absolute" && (
          <div className="flex items-center gap-2" role="group" aria-label="Mean and SD lines">
            <span className="text-xs text-[var(--pl-color-text-muted)]">Mean &amp; SD lines</span>
            <div className="gn-seg">
              <button type="button" aria-pressed={bands === "price"} onClick={() => toggleBands("price")}>
                {symbol}
              </button>
              <button type="button" aria-pressed={bands === "gold"} onClick={() => toggleBands("gold")}>
                Gold
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ height: 340 }}>
        <ResponsiveContainer>
          {view === "ratio" ? (
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              {timeAxis()}
              <YAxis domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(dp)} tick={AXIS} width={64} tickLine={false} axisLine={false} />
              {sdLines(r.mean, r.sd, (v) => v.toFixed(dp))}
              <Tooltip
                content={({ active, payload }: TipProps<(typeof data)[number]>) =>
                  active && payload?.[0]?.payload ? (
                    <TipBox
                      title={dayLabel(payload[0].payload!.date)}
                      rows={[
                        ["Ratio", payload[0].payload!.ratio.toFixed(dp + 1)],
                        [symbol, inr(payload[0].payload!.price, 2)],
                        [goldLabel, inr(payload[0].payload!.avgGold)],
                      ]}
                      levels={{ label: "Ratio levels", avg: r.mean, sd: r.sd, value: payload[0].payload!.ratio, format: (v) => v.toFixed(dp) }}
                    />
                  ) : null
                }
              />
              <Line dataKey="ratio" stroke={INK} strokeWidth={1.4} dot={false} isAnimationActive={false} />
            </LineChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              {timeAxis()}
              <YAxis yAxisId="p" hide={bands === "gold"} domain={["auto", "auto"]} tickFormatter={(v: number) => num(v)} tick={AXIS} width={56} tickLine={false} axisLine={false} />
              <YAxis yAxisId="g" hide={bands === "price"} orientation="right" domain={["auto", "auto"]} tickFormatter={(v: number) => num(v)} tick={AXIS} width={64} tickLine={false} axisLine={false} />
              <Tooltip
                content={({ active, payload }: TipProps<(typeof data)[number]>) =>
                  active && payload?.[0]?.payload ? (
                    <TipBox
                      title={dayLabel(payload[0].payload!.date)}
                      rows={[
                        [symbol, inr(payload[0].payload!.price, 2), INK],
                        [goldLabel, inr(payload[0].payload!.avgGold), GOLD],
                      ]}
                      levels={
                        bands === "price"
                          ? { label: `${symbol} levels`, avg: stats.price.mean, sd: stats.price.sd, value: payload[0].payload!.price, format: (v) => inr(v) }
                          : bands === "gold"
                            ? { label: `${goldLabel} levels`, avg: stats.gold.mean, sd: stats.gold.sd, value: payload[0].payload!.avgGold, format: (v) => inr(v) }
                            : undefined
                      }
                    />
                  ) : null
                }
              />
              {bands === "price" && sdLines(stats.price.mean, stats.price.sd, (v) => inr(v), { yAxisId: "p", prefix: symbol })}
              {bands === "gold" && sdLines(stats.gold.mean, stats.gold.sd, (v) => inr(v), { yAxisId: "g", prefix: "Gold" })}
              {bands !== "gold" && <Line yAxisId="p" dataKey="price" stroke={INK} strokeWidth={1.4} dot={false} isAnimationActive={false} />}
              {bands !== "price" && <Line yAxisId="g" dataKey="avgGold" stroke={GOLD} strokeWidth={1.4} dot={false} isAnimationActive={false} />}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="gn-legend">
        {view === "ratio" ? (
          <>
            <span>
              <i style={{ background: INK }} />
              {symbol} ÷ {goldLabel}
            </span>
            <span>
              <i style={{ background: "#555" }} />
              Mean
            </span>
            <span>
              <i style={{ background: "#16a34a" }} />
              ±1 SD
            </span>
            <span>
              <i style={{ background: "#c0392b" }} />
              ±2 SD
            </span>
          </>
        ) : (
          <>
            {bands !== "gold" && (
              <span>
                <i style={{ background: INK }} />
                {symbol} (left, ₹)
              </span>
            )}
            {bands !== "price" && (
              <span>
                <i style={{ background: GOLD }} />
                {goldLabel} (right, ₹/10g)
              </span>
            )}
            {bands !== "none" && (
              <>
                <span>
                  <i style={{ background: "#555" }} />
                  Mean
                </span>
                <span>
                  <i style={{ background: "#16a34a" }} />
                  ±1 SD
                </span>
                <span>
                  <i style={{ background: "#c0392b" }} />
                  ±2 SD
                </span>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Close vs the best-fit line, shaded red where the close is above the line and green where below (as in the workbook). */
export function ActualVsModelChart({ g, symbol }: { g: RegressionResult; symbol: string }) {
  const data = useMemo(
    () =>
      g.points.map((p) => ({
        t: dayMs(p.date),
        date: p.date,
        y: p.y,
        fitted: p.fitted,
        base: Math.min(p.y, p.fitted),
        above: Math.max(p.y - p.fitted, 0),
        below: Math.max(p.fitted - p.y, 0),
      })),
    [g]
  );
  // The stacked shading starts at 0, so pin the axis to the prices themselves.
  const lo = Math.min(...data.map((d) => d.base));
  const hi = Math.max(...data.map((d) => d.base + d.above + d.below));
  const pad = (hi - lo) * 0.05;
  return (
    <>
      <div style={{ height: 340 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {timeAxis()}
            <YAxis
              domain={[Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)]}
              allowDataOverflow
              tickFormatter={(v: number) => num(v)}
              tick={AXIS}
              width={56}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload }: TipProps<(typeof data)[number]>) =>
                active && payload?.[0]?.payload ? (
                  <TipBox
                    title={dayLabel(payload[0].payload!.date)}
                    rows={[
                      ["Close", inr(payload[0].payload!.y, 2), INK],
                      ["Model", inr(payload[0].payload!.fitted, 2), BLUE],
                      ["Close vs model", pct(payload[0].payload!.y / payload[0].payload!.fitted - 1)],
                    ]}
                  />
                ) : null
              }
            />
            <Area dataKey="base" stackId="s" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area dataKey="above" stackId="s" stroke="none" fill={RED_FILL} isAnimationActive={false} />
            <Area dataKey="below" stackId="s" stroke="none" fill={GREEN_FILL} isAnimationActive={false} />
            <Line dataKey="fitted" stroke={BLUE} strokeWidth={1.4} dot={false} isAnimationActive={false} />
            <Line dataKey="y" stroke={INK} strokeWidth={1.4} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="gn-legend">
        <span>
          <i style={{ background: INK }} />
          {symbol} close
        </span>
        <span>
          <i style={{ background: BLUE }} />
          Model (fair value)
        </span>
        <span>
          <i style={{ background: RED_FILL, height: 10 }} />
          Close above model
        </span>
        <span>
          <i style={{ background: GREEN_FILL, height: 10 }} />
          Close below model
        </span>
      </div>
    </>
  );
}

/** The AMC dashboard's Regression "Share price ÷ model": close ÷ the best-fit line each session, with the window mean and ±1 / ±2 SD. */
export function ModelRatioChart({ g, symbol }: { g: RegressionResult; symbol: string }) {
  const data = useMemo(() => g.points.map((p) => ({ t: dayMs(p.date), date: p.date, ratio: p.ratio, y: p.y, fitted: p.fitted })), [g]);
  const m = g.ratioMean;
  const s = g.ratioSd;
  const values = data.map((d) => d.ratio).concat([m + 2 * s, m - 2 * s]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.06;
  const last = data[data.length - 1];
  return (
    <>
      <div style={{ height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {timeAxis()}
            <YAxis domain={[lo - pad, hi + pad]} tickFormatter={(v: number) => v.toFixed(3)} tick={AXIS} width={52} tickLine={false} axisLine={false} />
            {SD_LEVELS.map((k) => (
              <ReferenceLine
                key={k}
                y={m + k * s}
                stroke={k === 0 ? INK : Math.abs(k) === 1 ? "#9a9ca1" : "#c4c6ca"}
                strokeDasharray={k === 0 ? undefined : "4 3"}
                label={{ value: SD_LABELS[k], position: "right", fontSize: 10, fill: MUTED }}
              />
            ))}
            <Tooltip
              content={({ active, payload }: TipProps<(typeof data)[number]>) =>
                active && payload?.[0]?.payload ? (
                  <TipBox
                    title={dayLabel(payload[0].payload!.date)}
                    rows={[
                      ["Close ÷ model", payload[0].payload!.ratio.toFixed(4), "#7c3aed"],
                      [symbol, inr(payload[0].payload!.y, 2)],
                      ["Model", inr(payload[0].payload!.fitted, 2), BLUE],
                    ]}
                    levels={{
                      label: "Close ÷ model levels",
                      avg: m,
                      sd: s,
                      value: payload[0].payload!.ratio,
                      format: (v) => v.toFixed(3),
                      color: (k) => (k === 0 ? INK : MUTED),
                    }}
                  />
                ) : null
              }
            />
            <Line dataKey="ratio" stroke="#7c3aed" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            {last && <ReferenceDot x={last.t} y={last.ratio} r={5} fill="#fff" stroke="#111827" strokeWidth={2.5} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="gn-legend">
        <span>
          <i style={{ background: "#7c3aed" }} />
          {symbol} close ÷ model
        </span>
        <span>
          <i style={{ background: INK }} />
          Mean
        </span>
        <span>
          <i style={{ background: "#9a9ca1" }} />
          ±1 / ±2 SD
        </span>
      </div>
    </>
  );
}

/** The workbook's "Price vs Return to best fit": fitted ÷ actual − 1 with mean ±1/±2 SD, price on the right axis. */
export function ReturnToFitChart({ g, symbol }: { g: RegressionResult; symbol: string }) {
  const data = useMemo(() => g.points.map((p) => ({ t: dayMs(p.date), date: p.date, ret: p.retToFit, y: p.y })), [g]);
  return (
    <>
      <div style={{ height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {timeAxis()}
            <YAxis yAxisId="r" domain={["auto", "auto"]} tickFormatter={(v: number) => pct(v, 0)} tick={AXIS} width={52} tickLine={false} axisLine={false} />
            <YAxis yAxisId="p" orientation="right" domain={["auto", "auto"]} tickFormatter={(v: number) => num(v)} tick={AXIS} width={56} tickLine={false} axisLine={false} />
            {SD_LEVELS.map((k) => (
              <ReferenceLine
                key={k}
                yAxisId="r"
                y={g.retMean + k * g.retSd}
                stroke={sdColor(k)}
                strokeDasharray={k === 0 ? undefined : "4 4"}
                ifOverflow="extendDomain"
                label={{ value: `${SD_LABELS[k]} ${pct(g.retMean + k * g.retSd)}`, position: "insideBottomRight", fontSize: 10, fill: MUTED }}
              />
            ))}
            <Tooltip
              content={({ active, payload }: TipProps<(typeof data)[number]>) =>
                active && payload?.[0]?.payload ? (
                  <TipBox
                    title={dayLabel(payload[0].payload!.date)}
                    rows={[
                      ["Return to best fit", pct(payload[0].payload!.ret), "#7c3aed"],
                      [symbol, inr(payload[0].payload!.y, 2), "#9ca3af"],
                    ]}
                    levels={{ label: "Return to best fit levels", avg: g.retMean, sd: g.retSd, value: payload[0].payload!.ret, format: (v) => pct(v) }}
                  />
                ) : null
              }
            />
            <Line yAxisId="p" dataKey="y" stroke="#b6bac2" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="ret" stroke="#7c3aed" strokeWidth={1.4} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="gn-legend">
        <span>
          <i style={{ background: "#7c3aed" }} />
          Return to best fit (left)
        </span>
        <span>
          <i style={{ background: "#b6bac2" }} />
          {symbol} price (right, ₹)
        </span>
      </div>
    </>
  );
}

function shade(f: number): string {
  // Older sessions pale blue → recent navy.
  const a = [196, 207, 230];
  const b = [30, 58, 138];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`;
}

/** Avg gold → price, each session shaded by date, with the fit line. */
export function ScatterFitChart({ g, avgDays, symbol }: { g: RegressionResult; avgDays: number; symbol: string }) {
  const data = useMemo(() => g.points.map((p, i) => ({ ...p, f: g.points.length > 1 ? i / (g.points.length - 1) : 1 })), [g]);
  const xs = data.map((d) => d.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const goldLabel = avgDays > 1 ? `Gold ${avgDays}D avg` : "Gold M spot";
  return (
    <>
      <div style={{ height: 360 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 4 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => num(v)}
              tick={AXIS}
              name={goldLabel}
              label={{ value: `${goldLabel}, ₹ per 10 g`, position: "insideBottom", offset: -10, fontSize: 11, fill: MUTED }}
            />
            <YAxis dataKey="y" type="number" domain={["auto", "auto"]} tickFormatter={(v: number) => num(v)} tick={AXIS} width={56} name={symbol} />
            <ZAxis range={[22, 22]} />
            <Tooltip
              content={({ active, payload }: TipProps<(typeof data)[number]>) =>
                active && payload?.[0]?.payload ? (
                  <TipBox
                    title={dayLabel(payload[0].payload!.date)}
                    rows={[
                      [goldLabel, inr(payload[0].payload!.x)],
                      [symbol, inr(payload[0].payload!.y, 2)],
                      ["Model", inr(payload[0].payload!.fitted, 2)],
                    ]}
                  />
                ) : null
              }
            />
            <ReferenceLine
              segment={[
                { x: x0, y: g.fit.intercept + g.fit.slope * x0 },
                { x: x1, y: g.fit.intercept + g.fit.slope * x1 },
              ]}
              stroke={INK}
              strokeDasharray="5 4"
              strokeWidth={1.4}
              ifOverflow="extendDomain"
            />
            <Scatter data={data} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.date} fill={i === data.length - 1 ? "#fff" : shade(d.f)} stroke={i === data.length - 1 ? INK : "none"} strokeWidth={2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="gn-legend">
        <span>
          <i style={{ background: shade(0), height: 8, width: 8, borderRadius: 4 }} />
          Older
        </span>
        <span>
          <i style={{ background: shade(1), height: 8, width: 8, borderRadius: 4 }} />
          Recent
        </span>
        <span>
          <i style={{ background: "#fff", border: `2px solid ${INK}`, height: 8, width: 8, borderRadius: 4 }} />
          Latest ({dayLabel(g.current.date)})
        </span>
        <span>
          <i style={{ background: INK }} />
          Fit: y = {g.fit.slope.toFixed(5)}x + {g.fit.intercept.toFixed(2)}
        </span>
      </div>
    </>
  );
}
