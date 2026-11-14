// Calendar helpers on "YYYY-MM-DD" strings, all in IST.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/** Today's IST calendar date. */
export function istDate(now: Date = new Date()): string {
  return istNow(now).toISOString().slice(0, 10);
}

/** Minutes since IST midnight. */
export function istMinutes(now: Date = new Date()): number {
  const t = istNow(now);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Excel's EDATE: the same day `months` months away, clamped to month end. */
export function edate(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function isWeekday(day: string): boolean {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13 Nov 2026" */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "13-Nov-26" (the workbook's dd-mmm-yy). */
export function formatShortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${String(y).slice(2)}`;
}

/** Parses "13 Nov 2026", "13-Nov-2026", "2026-11-13" or "13/11/2026" (day first). */
export function parseLooseDate(text: string): string | null {
  const s = text.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[A-Za-z]*[\s\-/](\d{2,4})$/);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m![2].toLowerCase());
    if (mi < 0) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
