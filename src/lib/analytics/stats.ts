// The workbook's statistics, function for function.

export function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** STDEV.P */
export function stdevP(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/** STDEV.S */
export function stdevS(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface LinearFit {
  slope: number;
  intercept: number;
  /** CORREL */
  r: number;
  /** RSQ */
  r2: number;
  /** STEYX: standard error of the predicted y. */
  steyx: number;
  n: number;
}

/** SLOPE / INTERCEPT / CORREL / RSQ / STEYX of y on x. Null when x has no spread. */
export function linearFit(ys: number[], xs: number[]): LinearFit | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (!(sxx > 0) || !(syy > 0)) return null;
  const slope = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { slope, intercept: my - slope * mx, r, r2: r * r, steyx: Math.sqrt((syy - (sxy * sxy) / sxx) / (n - 2)), n };
}

/** RSQ only -- the optimiser grids call this ~150 times per render. */
export function rsq(ys: number[], xs: number[]): number | null {
  return linearFit(ys, xs)?.r2 ?? null;
}

/** PERCENTRANK.INC(values, x) with Excel's default 3-digit truncation. Null outside [min, max]. */
export function percentRankInc(values: number[], x: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2 || x < sorted[0] || x > sorted[n - 1]) return null;
  const below = (v: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const i = below(x);
  let rank: number;
  if (sorted[i] === x) rank = i / (n - 1);
  else {
    const a = sorted[i - 1];
    const b = sorted[i];
    const ra = below(a) / (n - 1);
    const rb = i / (n - 1);
    rank = ra + ((x - a) / (b - a)) * (rb - ra);
  }
  return Math.floor(rank * 1000 + 1e-9) / 1000;
}
