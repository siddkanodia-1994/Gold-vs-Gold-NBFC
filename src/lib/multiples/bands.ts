// Mean and ±1/±2 SD of a multiple over the window shown -- sample SD (n − 1),
// as the AMC dashboard's band charts (and Excel's STDEV.S) use.

export interface Bands {
  mean: number;
  sd: number;
  current: number;
  z: number | null;
  n: number;
}

export function computeBands(values: number[]): Bands | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const current = values[n - 1];
  return { mean, sd, current, z: sd > 0 ? (current - mean) / sd : null, n };
}

export function bandValue(b: Bands, k: number): number {
  return b.mean + k * b.sd;
}

/**
 * Y-axis spanning the series and all five band lines, padded 5%, on a
 * "nice" step (1/2/2.5/5 × 10^k). Unlike the AMC chart it may go below 0,
 * so a negative −2 SD line (a spiky series) stays visible.
 */
export function niceYAxis(values: number[], b: Bands): { min: number; max: number; ticks: number[] } {
  let lo = Math.min(...values, bandValue(b, -2));
  let hi = Math.max(...values, bandValue(b, 2));
  const pad = hi > lo ? (hi - lo) * 0.05 : 1;
  lo -= pad;
  hi += pad;
  const raw = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let i = 0; min + i * step <= max + step / 1e6; i++) ticks.push(Number((min + i * step).toFixed(6)));
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}
