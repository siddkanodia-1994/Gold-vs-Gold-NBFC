"use client";

import "../dashboard/dashboard.css";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { dayLabel, inr } from "../dashboard/format";

const SECRET_KEY = "gold-nbfc-admin-secret";

interface Status {
  database: boolean;
  source: "db" | "seed";
  dhan: { configured: boolean; clientId: string | null; updatedAt: string | null };
  rows: number;
  sessions: number;
  firstDate: string | null;
  gold: { date: string; price: number } | null;
  muthoot: { date: string; price: number } | null;
  manappuram: { date: string; price: number } | null;
  missingGold: string[];
}

interface PreviewRow {
  date: string;
  price: number;
  time: string | null;
  stored: number | null;
  status: "new" | "same" | "changed";
}

function readSecret(): string {
  try {
    return localStorage.getItem(SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

function stamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) + " IST";
}

export function AdminPanel() {
  const [secret, setSecret] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setSecret(readSecret()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const call = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const res = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "x-admin-secret": secret, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        try {
          localStorage.removeItem(SECRET_KEY);
        } catch {}
        setSecret("");
      }
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      return json as T;
    },
    [secret]
  );

  const refresh = useCallback(async () => {
    try {
      setStatus(await call<Status>("/api/admin/status"));
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Could not load status" });
    }
  }, [call]);

  useEffect(() => {
    if (secret) refresh(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [secret, refresh]);

  async function run(label: string, f: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ tone: "ok", text: await f() });
      await refresh();
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  if (!secret) {
    return (
      <div className="aa" style={{ display: "block" }}>
        <div className="aa-body" style={{ maxWidth: 420, margin: "60px auto" }}>
          <form
            className="gn-card"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                localStorage.setItem(SECRET_KEY, secretInput);
              } catch {}
              setSecret(secretInput);
            }}
          >
            <p className="gn-cap">Admin</p>
            <label className="aa-field">
              Admin secret
              <input className="aa-input" type="password" autoComplete="current-password" value={secretInput} onChange={(e) => setSecretInput(e.target.value)} />
            </label>
            <div style={{ marginTop: 12 }}>
              <button className="aa-btn" type="submit" disabled={!secretInput}>
                Unlock
              </button>
            </div>
            <p className="aa-note">Remembered in this browser until you log out.</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="aa" style={{ display: "block" }}>
      <div className="aa-strip">
        <span className="aa-strip-label">Gold vs Gold NBFC · Admin</span>
        <Link className="aa-chip-note" href="/">
          ← Dashboard
        </Link>
        <button
          type="button"
          className="aa-btn aa-btn--ghost"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            try {
              localStorage.removeItem(SECRET_KEY);
            } catch {}
            setSecret("");
          }}
        >
          Log out
        </button>
      </div>
      <div className="aa-body" style={{ maxWidth: 1100 }}>
        {message && (
          <p className={message.tone === "ok" ? "gn-tile gn-tile--ok" : "gn-tile gn-tile--bad"} style={{ marginBottom: 16 }} role="status">
            {message.text}
          </p>
        )}
        <div className="gn-stack">
          <StatusCard status={status} />
          <GoldUpload call={call} busy={busy} run={run} />
          <ManualGold call={call} busy={busy} run={run} />
          <DhanCard status={status} call={call} busy={busy} run={run} />
          <SyncCard call={call} busy={busy} run={run} />
        </div>
      </div>
    </div>
  );
}

type Call = <T>(path: string, body?: unknown) => Promise<T>;
type Run = (label: string, f: () => Promise<string>) => Promise<void>;

function StatusCard({ status }: { status: Status | null }) {
  if (!status) return <div className="gn-card">Loading status…</div>;
  return (
    <section className="pl-panel" aria-label="Data status">
      <div className="pl-band">
        Data status <span className="pl-band-unit">{status.database ? "Neon Postgres" : "no DATABASE_URL — read-only seed history"}</span>
      </div>
      <table className="aa-kv">
        <tbody>
          <tr>
            <th>Latest Gold M spot</th>
            <td>{status.gold ? `${inr(status.gold.price)} · ${dayLabel(status.gold.date)}` : "—"}</td>
          </tr>
          <tr>
            <th>Latest Muthoot close</th>
            <td>{status.muthoot ? `${inr(status.muthoot.price, 2)} · ${dayLabel(status.muthoot.date)}` : "—"}</td>
          </tr>
          <tr>
            <th>Latest Manappuram close</th>
            <td>{status.manappuram ? `${inr(status.manappuram.price, 2)} · ${dayLabel(status.manappuram.date)}` : "—"}</td>
          </tr>
          <tr>
            <th>History</th>
            <td>
              {status.rows} dates · {status.sessions} sessions with both shares · from {status.firstDate ?? "—"}
            </td>
          </tr>
          <tr>
            <th>DHAN</th>
            <td>{status.dhan.configured ? `client ${status.dhan.clientId} · token saved ${stamp(status.dhan.updatedAt)}` : "not set"}</td>
          </tr>
          <tr>
            <th>Sessions still on carried-forward gold (last 45 days)</th>
            <td>{status.missingGold.length ? status.missingGold.map((d) => dayLabel(d, false)).join(", ") : "none"}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function GoldUpload({ call, busy, run }: { call: Call; busy: string | null; run: Run }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setPreview(null);
    setError(null);
    if (!file) return;
    const t = await file.text();
    setText(t);
    setFileName(file.name);
    try {
      const res = await call<{ rows: PreviewRow[]; warnings: string[] }>("/api/admin/gold", { mode: "preview", text: t });
      setPreview(res.rows);
      if (res.warnings.length) setError(res.warnings.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file");
    }
  }

  const changes = preview?.filter((r) => r.status !== "same") ?? [];
  return (
    <section className="pl-panel" aria-label="Upload MCX spot file">
      <div className="pl-band">
        Upload MCX Gold M spot <span className="pl-band-unit">mcxindia.com → Market Data → Spot Market → GOLDM → download (.xls or .csv)</span>
      </div>
      <div className="aa-controls">
        <input type="file" accept=".xls,.xlsx,.csv,.htm,.html,text/csv,text/html" onChange={(e) => onFile(e.target.files?.[0])} />
        {preview && (
          <button
            type="button"
            className="aa-btn"
            disabled={busy !== null || changes.length === 0}
            onClick={() =>
              run("gold", async () => {
                const res = await call<{ saved: number }>("/api/admin/gold", { mode: "commit", text });
                setPreview(null);
                return `Saved ${res.saved} Gold M spot price${res.saved === 1 ? "" : "s"} from ${fileName}.`;
              })
            }
          >
            {busy === "gold" ? "Saving…" : changes.length ? `Save ${changes.length} new / changed day${changes.length === 1 ? "" : "s"}` : "Nothing new to save"}
          </button>
        )}
      </div>
      {error && <p className="aa-warn">{error}</p>}
      {preview && (
        <div className="gn-scroll" style={{ padding: "0 12px 12px", maxHeight: 360, overflowY: "auto" }}>
          <table className="gn-grid-t">
            <thead>
              <tr>
                <th>Date</th>
                <th>MCX spot (₹/10 g)</th>
                <th>Stored now</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...preview].reverse().map((r) => (
                <tr key={r.date}>
                  <th scope="row">{dayLabel(r.date)}</th>
                  <td>{inr(r.price)}</td>
                  <td>{inr(r.stored)}</td>
                  <td>
                    <span className={`pl-chg pl-chg--${r.status === "new" ? "pos" : r.status === "changed" ? "neg" : "neu"}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ManualGold({ call, busy, run }: { call: Call; busy: string | null; run: Run }) {
  const [date, setDate] = useState("");
  const [price, setPrice] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    run("manual", async () => {
      await call("/api/admin/gold", { mode: "manual", date, price: Number(price.replace(/,/g, "")) });
      setPrice("");
      return `Saved Gold M spot ${inr(Number(price.replace(/,/g, "")))} for ${dayLabel(date)}.`;
    });
  }
  return (
    <section className="pl-panel" aria-label="Enter a gold price">
      <div className="pl-band">
        Enter one day by hand <span className="pl-band-unit">MCX Gold M spot, ₹ per 10 g — replaces that day&apos;s stored value</span>
      </div>
      <form className="aa-controls" onSubmit={submit}>
        <label className="aa-field">
          Date
          <input className="aa-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="aa-field">
          Gold M spot (₹/10 g)
          <input className="aa-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="135797" required />
        </label>
        <button className="aa-btn" type="submit" disabled={busy !== null}>
          {busy === "manual" ? "Saving…" : "Save"}
        </button>
      </form>
    </section>
  );
}

function DhanCard({ status, call, busy, run }: { status: Status | null; call: Call; busy: string | null; run: Run }) {
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    run("dhan", async () => {
      await call("/api/admin/dhan", { clientId, token });
      setToken("");
      return "DHAN credentials tested and saved.";
    });
  }
  return (
    <section className="pl-panel" aria-label="DHAN credentials">
      <div className="pl-band">
        DHAN credentials{" "}
        <span className="pl-band-unit">
          tokens expire every ~24 h · Dhan Web → Profile → DhanHQ Trading APIs · last saved {stamp(status?.dhan.updatedAt ?? null)}
        </span>
      </div>
      <form className="aa-controls" onSubmit={submit}>
        <label className="aa-field">
          Client ID
          <input className="aa-input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={status?.dhan.clientId ?? ""} autoComplete="off" required />
        </label>
        <label className="aa-field" style={{ flex: 1, minWidth: 260 }}>
          Access token
          <input className="aa-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required style={{ textAlign: "left" }} />
        </label>
        <button className="aa-btn" type="submit" disabled={busy !== null}>
          {busy === "dhan" ? "Testing…" : "Test & save"}
        </button>
      </form>
      <p className="aa-note" style={{ padding: "0 12px 12px", margin: 0 }}>
        The pair is checked with one live quote call before it&apos;s stored (encrypted). The token is never shown again.
      </p>
    </section>
  );
}

function SyncCard({ call, busy, run }: { call: Call; busy: string | null; run: Run }) {
  const [from, setFrom] = useState("");
  return (
    <section className="pl-panel" aria-label="Sync share prices">
      <div className="pl-band">
        Sync share closes from DHAN <span className="pl-band-unit">runs automatically at 4:05 PM and 7:05 PM IST on weekdays (last 14 days)</span>
      </div>
      <div className="aa-controls">
        <label className="aa-field">
          From (default: 30 days ago)
          <input className="aa-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <button
          type="button"
          className="aa-btn"
          disabled={busy !== null}
          onClick={() =>
            run("sync", async () => {
              const res = await call<{ days: number; latest: string | null; from: string }>("/api/admin/sync-shares", from ? { from } : {});
              return `Stored ${res.days} sessions from ${dayLabel(res.from)}${res.latest ? ` to ${dayLabel(res.latest)}` : ""}.`;
            })
          }
        >
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </button>
      </div>
    </section>
  );
}
