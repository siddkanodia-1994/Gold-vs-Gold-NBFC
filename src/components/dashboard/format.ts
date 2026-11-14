const inrFmt = (dp: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** ₹1,41,032 / ₹2,855.40 */
export function inr(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v < 0 ? "−" : ""}₹${inrFmt(dp).format(Math.abs(v))}`;
}

export function num(v: number | null | undefined, dp = 0): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : inrFmt(dp).format(v);
}

/** +19.8% / −6.7% */
export function pct(v: number | null | undefined, dp = 1, signed = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = `${Math.abs(v * 100).toFixed(dp)}%`;
  return !signed ? s : v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

/** +1.20 / −0.90 */
export function signed(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`;
}

export function toneOf(v: number | null | undefined): "pos" | "neg" | "neu" {
  return v === null || v === undefined || !Number.isFinite(v) || Math.abs(v) < 0.0005 ? "neu" : v > 0 ? "pos" : "neg";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(day: string, withYear = true): string {
  const [y, m, d] = day.split("-").map(Number);
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

export function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Axis tick for a UTC-midnight timestamp: "Mar 24". */
export function tickMonth(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}
