import { istDate } from "../dates";
import type { CompanyInputs, IncomeField } from "./model";

// The Valuation Model's target year (FY28E, FY29E, ...): the year the
// multiple's target is built on, then discounted two steps back --
// FY29 → FY28 → FY27 (current). As the AMC dashboard's switch.
//
// The two discount rates stay per STEP, not per year: the stored "FY27" rate
// is always the first step (target → target − 1) and the "FY26" rate the
// second (→ target − 2), whichever year is picked.
//
// Where each year's net worth / PAT / revenue lives: FY28E in the company's
// own netWorthFy28eCr / patFy28eCr / revenueFy28eCr fields (unchanged), every
// other year under `estimates[year]` in the same JSON row.

/** Unchanged until someone picks another year: today's FY28E table. */
export const DEFAULT_TARGET_FY = 2028;
export const MIN_TARGET_FY = 2026;
export const MAX_TARGET_FY = 2040;
/** How many years ahead of the current FY the switch offers. */
export const TARGET_FY_CHOICES = 3;

export function isTargetFy(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_TARGET_FY && value <= MAX_TARGET_FY;
}

/** "FY29" for 2029. */
export function fyLabel(fy: number): string {
  return `FY${String(fy % 100).padStart(2, "0")}`;
}

/** The Indian fiscal year (April–March) an IST date falls in, by its ending year: 2026-11-25 → 2027. */
export function fiscalYearOf(day: string = istDate()): number {
  const [y, m] = day.split("-").map(Number);
  return m >= 4 ? y + 1 : y;
}

/** The switch's years: the next three after the current FY, plus the chosen one if it has fallen out. */
export function targetYearOptions(currentFy: number, chosen: number): number[] {
  const years = Array.from({ length: TARGET_FY_CHOICES }, (_, i) => currentFy + 1 + i);
  if (!years.includes(chosen)) years.push(chosen);
  return years.sort((a, b) => a - b);
}

/** The key a year's figure is kept under in `estimates[year]`. */
export const ESTIMATE_KEY: Record<IncomeField, "netWorthCr" | "patCr" | "revenueCr"> = {
  netWorthFy28eCr: "netWorthCr",
  patFy28eCr: "patCr",
  revenueFy28eCr: "revenueCr",
};

export const INCOME_FIELDS = Object.keys(ESTIMATE_KEY) as IncomeField[];

export function isIncomeField(v: unknown): v is IncomeField {
  return typeof v === "string" && (INCOME_FIELDS as string[]).includes(v);
}

/** One year's net worth, PAT or revenue for a company. */
export function estimateFor(inputs: CompanyInputs, field: IncomeField, fy: number): number | null {
  if (fy === DEFAULT_TARGET_FY) return inputs[field] ?? null;
  return inputs.estimates?.[String(fy)]?.[ESTIMATE_KEY[field]] ?? null;
}

/**
 * The inputs with the target year's figures in the FY28E slots
 * computeMultipleBlock reads. At FY28 this is the inputs unchanged, so
 * today's targets come out identical.
 */
export function inputsForTargetYear(inputs: CompanyInputs, fy: number): CompanyInputs {
  if (fy === DEFAULT_TARGET_FY) return inputs;
  const out: CompanyInputs = { ...inputs };
  for (const f of INCOME_FIELDS) out[f] = estimateFor(inputs, f, fy);
  return out;
}

/** The inputs after saving one year's figure: FY28 in its own field, any other year under estimates. */
export function withEstimate(inputs: CompanyInputs, field: IncomeField, fy: number, value: number | null): CompanyInputs {
  if (fy === DEFAULT_TARGET_FY) return { ...inputs, [field]: value };
  const key = String(fy);
  const year = { ...inputs.estimates?.[key], [ESTIMATE_KEY[field]]: value };
  return { ...inputs, estimates: { ...inputs.estimates, [key]: year } };
}
