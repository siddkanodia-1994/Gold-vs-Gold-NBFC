import { computeRatio } from "../analytics/ratio";
import { computeRegression } from "../analytics/regression";
import { rollingAverage, windowOf, type AlignedRow, type Period } from "../analytics/series";
import type { CompanyKey } from "../instruments";
import type { Metric } from "../multiples/types";
import { DEFAULT_TARGET_FY, isTargetFy } from "./target-year";

// The Valuation Model tab: Bear / Base / Bull share prices from three
// methods and their weighted average, as the AMC dashboard's Valuation
// Model does it, with gold in place of AUM:
//  - Ratio: price ÷ N-day-avg gold over its own period (mean, population SD,
//    as the Ratio tab and the workbook), × today's gold: −1 SD / Mean / +1 SD.
//  - Best fit: the price-on-gold line over its own period, read at today's
//    gold −x% / as is / +x%.
//  - Multiple (P/B by default, or PE / Mcap-Sales): target-year (FY28E by
//    default, see target-year.ts) net worth / PAT / revenue × target
//    multiple ÷ shares, discounted to today ÷ ((1 + step-1 rate)(1 + step-2
//    rate)). A blank multiple uses the Multiples chart's 3Y −1 SD / Mean /
//    +1 SD.
//  - Weighted average over the methods with a value and a weight > 0,
//    rescaled to 100%.

export const SCENARIOS = ["bear", "base", "bull"] as const;
export type ScenarioKey = (typeof SCENARIOS)[number];
export type Scenario = Record<ScenarioKey, number | null>;

/** `income` and `perShare` name the figure; the page adds the target year ("Net worth FY29E (₹ Cr)"). */
export const MULTIPLE_METHODS: Record<Metric, { name: string; income: string; perShare: string; multiple: string; incomeField: IncomeField; fields: [InputField, InputField, InputField] }> = {
  pbv: { name: "Price to book", income: "Net worth", perShare: "BV / share", multiple: "P/B (x)", incomeField: "netWorthFy28eCr", fields: ["pbBear", "pbBase", "pbBull"] },
  pe: { name: "PE", income: "PAT", perShare: "EPS", multiple: "PE (x)", incomeField: "patFy28eCr", fields: ["peBear", "peBase", "peBull"] },
  mcapSales: {
    name: "Mcap / Sales",
    income: "Revenue",
    perShare: "Revenue / share",
    multiple: "Mcap / Sales (x)",
    incomeField: "revenueFy28eCr",
    fields: ["msBear", "msBase", "msBull"],
  },
};

/** Per-company inputs typed into the FY28E table (rates as fractions; discountFy27 / discountFy26 are steps 1 and 2 back from the target year). */
export const INPUT_FIELDS = [
  "netWorthFy28eCr",
  "patFy28eCr",
  "revenueFy28eCr",
  "sharesCr",
  "discountFy27",
  "discountFy26",
  "pbBear",
  "pbBase",
  "pbBull",
  "peBear",
  "peBase",
  "peBull",
  "msBear",
  "msBase",
  "msBull",
] as const;
export type InputField = (typeof INPUT_FIELDS)[number];
export type IncomeField = "netWorthFy28eCr" | "patFy28eCr" | "revenueFy28eCr";
/** Other target years' figures, by fiscal year ("2029"). */
export type YearEstimates = Record<string, Partial<Record<"netWorthCr" | "patCr" | "revenueCr", number | null>>>;
export type CompanyInputs = Partial<Record<InputField, number | null>> & { estimates?: YearEstimates };

/** Gold the Ratio is multiplied by / the Best fit line is read at: 1 = latest spot, N = last N sessions' average. */
export const GOLD_AT_OPTIONS = [
  { value: 1, label: "Latest spot" },
  { value: 5, label: "5D avg" },
  { value: 10, label: "10D avg" },
  { value: 20, label: "20D avg" },
  { value: 45, label: "45D avg" },
] as const;

export const PERIOD_OPTIONS = [
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "2Y", months: 24 },
  { key: "3Y", months: 36 },
  { key: "4Y", months: 48 },
  { key: "5Y", months: 60 },
  { key: "All", months: null },
] as const;
export type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];

export interface ValuationSettings {
  multiple: Metric;
  /** The year the multiple's target is built on (FY28E = 2028), discounted two steps back to today. */
  targetFy: number;
  /** Window for the multiples' mean and SD: the Multiples tab, the reference table and blank-multiple fallbacks. */
  multiplesPeriod: PeriodKey;
  ratioPeriod: PeriodKey;
  ratioGoldDays: number;
  ratioGoldAt: number;
  bestFitPeriod: PeriodKey;
  bestFitGoldDays: number;
  bestFitGoldAt: number;
  bestFitPct: number;
  weights: { ratio: number; bestFit: number; multiple: number };
}

export const DEFAULT_SETTINGS: ValuationSettings = {
  multiple: "pbv",
  targetFy: DEFAULT_TARGET_FY,
  multiplesPeriod: "3Y",
  ratioPeriod: "3Y",
  ratioGoldDays: 1,
  ratioGoldAt: 1,
  bestFitPeriod: "3Y",
  bestFitGoldDays: 1,
  bestFitGoldAt: 1,
  bestFitPct: 10,
  weights: { ratio: 35, bestFit: 15, multiple: 50 },
};

export const DEFAULT_INPUTS: CompanyInputs = { discountFy27: 0.2, discountFy26: 0.1 };

export function periodOf(key: PeriodKey): Period {
  const p = PERIOD_OPTIONS.find((o) => o.key === key)!;
  return p.months === null ? { kind: "all" } : { kind: "months", months: p.months };
}

const isInt = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** Server-side check of a settings object posted by the page. */
export function validSettings(v: unknown): v is ValuationSettings {
  const s = v as ValuationSettings;
  const periods = PERIOD_OPTIONS.map((p) => p.key) as string[];
  const goldAt = GOLD_AT_OPTIONS.map((o) => o.value) as number[];
  return (
    !!s &&
    ["pbv", "pe", "mcapSales"].includes(s.multiple) &&
    isTargetFy(s.targetFy) &&
    periods.includes(s.ratioPeriod) &&
    periods.includes(s.multiplesPeriod) &&
    periods.includes(s.bestFitPeriod) &&
    isInt(s.ratioGoldDays, 1, 250) &&
    isInt(s.bestFitGoldDays, 1, 250) &&
    goldAt.includes(s.ratioGoldAt) &&
    goldAt.includes(s.bestFitGoldAt) &&
    typeof s.bestFitPct === "number" &&
    s.bestFitPct >= 0 &&
    s.bestFitPct < 100 &&
    !!s.weights &&
    (["ratio", "bestFit", "multiple"] as const).every((k) => isInt(s.weights[k], 0, 100))
  );
}

/** Bear / Base / Bull at the target year → one year back → today, for one multiple (fields named for FY28). */
export interface MultipleBlock {
  perShare: number | null;
  multiples: Scenario;
  fromBand: Record<ScenarioKey, boolean>;
  fy28: Scenario;
  fy27: Scenario;
  current: Scenario;
}

const map = (s: Scenario, f: (v: number) => number | null): Scenario => ({
  bear: s.bear === null ? null : f(s.bear),
  base: s.base === null ? null : f(s.base),
  bull: s.bull === null ? null : f(s.bull),
});

export function computeMultipleBlock(metric: Metric, inputs: CompanyInputs, band: { mean: number; sd: number } | null): MultipleBlock {
  const def = MULTIPLE_METHODS[metric];
  const income = inputs[def.incomeField] ?? null;
  const shares = inputs.sharesCr ?? null;
  const perShare = income !== null && shares ? income / shares : null;
  const typed = def.fields.map((f) => inputs[f] ?? null);
  const bandAt = (k: number) => (band ? band.mean + k * band.sd : null);
  const multiples: Scenario = { bear: typed[0] ?? bandAt(-1), base: typed[1] ?? bandAt(0), bull: typed[2] ?? bandAt(1) };
  const fromBand = { bear: typed[0] === null, base: typed[1] === null, bull: typed[2] === null };
  const fy28 = map(multiples, (m) => (perShare === null || m <= 0 ? null : perShare * m));
  const r27 = inputs.discountFy27 ?? null;
  const r26 = inputs.discountFy26 ?? null;
  const fy27 = map(fy28, (p) => (r27 === null ? null : p / (1 + r27)));
  const current = map(fy28, (p) => (r27 === null || r26 === null ? null : p / ((1 + r27) * (1 + r26))));
  return { perShare, multiples, fromBand, fy28, fy27, current };
}

export type MethodKey = "ratio" | "bestFit" | "multiple";

export interface TargetPriceTable {
  methods: Record<MethodKey, Scenario>;
  average: Scenario;
  /** Each method's share of the Base average after rescaling (null when it didn't count). */
  shares: Record<MethodKey, number | null>;
  ratio: { n: number; mean: number; sd: number; gold: number; from: string } | null;
  bestFit: { n: number; r2: number; slope: number; intercept: number; gold: number; from: string } | null;
  block: MultipleBlock;
}

/** Average of the last n golds (n = 1: the latest). */
export function goldAt(rows: AlignedRow[], n: number): number | null {
  if (!rows.length) return null;
  const tail = rows.slice(-n).map((r) => r.gold);
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

export function computeTargetPrices(
  rows: AlignedRow[],
  company: CompanyKey,
  settings: ValuationSettings,
  inputs: CompanyInputs,
  band: { mean: number; sd: number } | null
): TargetPriceTable {
  const empty: Scenario = { bear: null, base: null, bull: null };
  const golds = rows.map((r) => r.gold);

  let ratio: TargetPriceTable["ratio"] = null;
  let ratioScenario = empty;
  const rSpan = windowOf(rows, periodOf(settings.ratioPeriod));
  const r = rSpan ? computeRatio(rows, rollingAverage(golds, settings.ratioGoldDays), rSpan, company) : null;
  const rGold = goldAt(rows, settings.ratioGoldAt);
  if (r && rGold !== null && rSpan) {
    ratio = { n: r.points.length, mean: r.mean, sd: r.sd, gold: rGold, from: rSpan.start };
    ratioScenario = { bear: (r.mean - r.sd) * rGold, base: r.mean * rGold, bull: (r.mean + r.sd) * rGold };
  }

  let bestFit: TargetPriceTable["bestFit"] = null;
  let fitScenario = empty;
  const fSpan = windowOf(rows, periodOf(settings.bestFitPeriod));
  const g = fSpan ? computeRegression(rows, rollingAverage(golds, settings.bestFitGoldDays), fSpan, company) : null;
  const fGold = goldAt(rows, settings.bestFitGoldAt);
  if (g && fGold !== null && fSpan) {
    const k = settings.bestFitPct / 100;
    bestFit = { n: g.fit.n, r2: g.fit.r2, slope: g.fit.slope, intercept: g.fit.intercept, gold: fGold, from: fSpan.start };
    const at = (x: number) => g.fit.intercept + g.fit.slope * x;
    fitScenario = { bear: at(fGold * (1 - k)), base: at(fGold), bull: at(fGold * (1 + k)) };
  }

  const block = computeMultipleBlock(settings.multiple, inputs, band);
  const methods: Record<MethodKey, Scenario> = { ratio: ratioScenario, bestFit: fitScenario, multiple: block.current };

  const keys: MethodKey[] = ["ratio", "bestFit", "multiple"];
  const w = settings.weights;
  const used = (s: ScenarioKey) => keys.filter((m) => methods[m][s] !== null && w[m] > 0);
  const average = { ...empty };
  for (const s of SCENARIOS) {
    const u = used(s);
    const total = u.reduce((a, m) => a + w[m], 0);
    average[s] = total > 0 ? u.reduce((a, m) => a + methods[m][s]! * w[m], 0) / total : null;
  }
  const baseUsed = used("base");
  const baseTotal = baseUsed.reduce((a, m) => a + w[m], 0);
  const shares = Object.fromEntries(keys.map((m) => [m, baseUsed.includes(m) && baseTotal > 0 ? w[m] / baseTotal : null])) as Record<MethodKey, number | null>;
  return { methods, average, shares, ratio, bestFit, block };
}
