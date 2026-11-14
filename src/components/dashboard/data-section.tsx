"use client";

import { useState } from "react";
import { dayLabel, inr } from "./format";
import { goldLabel, type Model } from "./model";

/** The window's sessions, newest first, with a CSV download of the whole window. */
export function DataSection({ model }: { model: Model }) {
  const [showAll, setShowAll] = useState(false);
  const { rows, avgGold, span, avgDays } = model;
  const gl = goldLabel(avgDays);
  const idx: number[] = [];
  for (let i = span.endIdx; i >= span.startIdx; i--) idx.push(i);
  const shown = showAll ? idx : idx.slice(0, 60);

  function download() {
    const head = ["Date", "Gold M spot", "Gold date", gl, "Muthoot", "Manappuram", "Muthoot ratio", "Manappuram ratio"];
    const lines = [...idx].reverse().map((i) => {
      const r = rows[i];
      return [r.date, r.gold, r.goldDate, avgGold[i].toFixed(2), r.muthoot, r.manappuram, (r.muthoot / avgGold[i]).toFixed(8), (r.manappuram / avgGold[i]).toFixed(8)].join(",");
    });
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gold-vs-gold-nbfc_${span.start}_${span.end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="pl-panel" aria-label="Daily data">
      <div className="pl-band">
        Daily data{" "}
        <span className="pl-band-unit">
          {idx.length} sessions · {dayLabel(span.start)} → {dayLabel(span.end)} · gold is MCX Gold M spot, ₹ per 10 g
        </span>
      </div>
      <div style={{ padding: 12 }}>
        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 10 }}>
          <button type="button" className="aa-btn" onClick={download}>
            Download CSV
          </button>
          <span className="aa-note" style={{ margin: 0 }}>
            * gold carried forward from an earlier date (no MCX spot uploaded for that session yet, or a weekend session).
          </span>
        </div>
        <div className="gn-scroll">
          <table className="gn-grid-t">
            <thead>
              <tr>
                <th>Date</th>
                <th>Gold M spot</th>
                <th>{gl}</th>
                <th>Muthoot</th>
                <th>Manappuram</th>
                <th>Muthoot ÷ gold</th>
                <th>Manappuram ÷ gold</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const r = rows[i];
                return (
                  <tr key={r.date}>
                    <th scope="row">
                      {dayLabel(r.date)}
                      {r.live ? " (live)" : ""}
                    </th>
                    <td title={r.goldDate !== r.date ? `from ${dayLabel(r.goldDate)}` : undefined}>
                      {inr(r.gold)}
                      {r.goldDate !== r.date ? "*" : ""}
                    </td>
                    <td>{inr(avgGold[i])}</td>
                    <td>{inr(r.muthoot, 2)}</td>
                    <td>{inr(r.manappuram, 2)}</td>
                    <td>{(r.muthoot / avgGold[i]).toFixed(6)}</td>
                    <td>{(r.manappuram / avgGold[i]).toFixed(6)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {idx.length > 60 && (
          <button type="button" className="aa-btn aa-btn--ghost" style={{ marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show latest 60" : `Show all ${idx.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
