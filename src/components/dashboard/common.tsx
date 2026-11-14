"use client";

import type { ReactNode } from "react";
import { inr, pct, signed, toneOf } from "./format";

export const SD_LABELS: Record<number, string> = { 2: "+2 SD", 1: "+1 SD", 0: "Mean", [-1]: "−1 SD", [-2]: "−2 SD" };
export const SD_LEVELS = [2, 1, 0, -1, -2] as const;

/** The upside/downside badge used in the ladder tables. */
export function Pct({ change }: { change: number | null }) {
  return <span className={`pl-chg pl-chg--${toneOf(change)}`}>{pct(change)}</span>;
}

/** Card with the AMC tab's left text / right fit-tiles split. */
export function AsideCard({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  if (!aside) return <div className="gn-card">{children}</div>;
  return (
    <div className="gn-card gn-aside">
      <div className="min-w-0 space-y-2">{children}</div>
      <div className="min-w-0">{aside}</div>
    </div>
  );
}

function strengthOf(r: number | null): "strong" | "moderate" | "weak" | null {
  if (r === null || !Number.isFinite(r)) return null;
  const a = Math.abs(Math.round(r * 1000) / 1000);
  return a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : "weak";
}

const STRENGTH = { strong: "Strong", moderate: "Moderate", weak: "Weak" } as const;

/** Correlation (with a Strong / Moderate / Weak badge) and R², as two tiles. */
export function FitStatGrid({ r, r2, note }: { r: number | null; r2: number | null; note?: ReactNode }) {
  const strength = strengthOf(r);
  return (
    <div>
      <div className="aa-fit-k">Fit at these settings · price vs avg gold</div>
      <div className="aa-fitgrid" role="group" aria-label="Fit statistics">
        <div className="aa-fit-tile">
          <div className="aa-fit-k">Correlation (r)</div>
          <div className={`aa-fit-v ${r === null ? "" : r >= 0 ? "aa-fit-pos" : "aa-fit-neg"}`}>{r === null ? "—" : pct(r)}</div>
          <div className="aa-fit-s">{strength && <span className={`aa-fit-badge aa-fit-badge--${strength}`}>{STRENGTH[strength]}</span>}</div>
        </div>
        <div className="aa-fit-tile">
          <div className="aa-fit-k">R²</div>
          <div className="aa-fit-v">{r2 === null ? "—" : pct(r2, 1, false)}</div>
          <div className="aa-fit-s">{r2 === null ? "" : "of the price move explained"}</div>
        </div>
      </div>
      {note && <p className="aa-fit-s" style={{ marginTop: 8 }}>{note}</p>}
    </div>
  );
}

export interface LadderRow {
  k: number;
  /** The level's own value (a ratio, or a return-to-fit %), already formatted. */
  level: string;
  price: number;
  upside: number;
}

/** Red-banded "… Analysis" panel: the ±2 SD ladder on the left, key facts on the right. */
export function LadderPanel({
  title,
  unit,
  levelHeader,
  rows,
  facts,
}: {
  title: string;
  unit: ReactNode;
  levelHeader: string;
  rows: LadderRow[];
  facts: [string, ReactNode][];
}) {
  return (
    <section className="pl-panel vm" aria-label={title}>
      <div className="pl-band">
        {title} <span className="pl-band-unit">{unit}</span>
      </div>
      <div className="vm-grid">
        <table className="vm-t">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">{levelHeader}</th>
              <th scope="col">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.k} className={row.k === 0 ? "vm-avg" : undefined}>
                <th scope="row">
                  <b>{SD_LABELS[row.k]}</b>
                </th>
                <td className="vm-c">
                  <span className="vm-p">{row.level}</span>
                </td>
                <td className="vm-c">
                  <span className="vm-p">{inr(row.price, row.price < 1000 ? 2 : 0)}</span>
                  <Pct change={row.upside} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="aa-kv">
          <tbody>
            {facts.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function GapText({ gap, against }: { gap: number | null; against: string }) {
  if (gap === null || !Number.isFinite(gap)) return <>—</>;
  return (
    <>
      Price is <span className={gap < 0 ? "gn-pos" : "gn-neg"}>{pct(Math.abs(gap), 1, false)} {gap < 0 ? "below" : "above"}</span> {against}
    </>
  );
}

export function zText(z: number | null, dp = 2): string {
  return signed(z, dp);
}
