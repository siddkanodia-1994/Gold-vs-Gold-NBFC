import { sql } from "drizzle-orm";
import { db, hasDatabase } from "../db/client";
import { COMPANIES, type CompanyKey } from "../instruments";
import { DEFAULT_INPUTS, DEFAULT_SETTINGS, INPUT_FIELDS, type CompanyInputs, type InputField, type ValuationSettings } from "./model";

// One JSON row per company ("inputs:muthoot") plus one for the shared
// settings, in the valuation_model table.

export interface ValuationModelData {
  settings: ValuationSettings;
  inputs: Record<CompanyKey, CompanyInputs>;
}

async function read(key: string): Promise<unknown | null> {
  const r = (await db.execute(sql`select value from valuation_model where key = ${key}`)).rows as { value: string }[];
  return r[0] ? JSON.parse(r[0].value) : null;
}

async function write(key: string, value: unknown): Promise<void> {
  await db.execute(sql`
    insert into valuation_model (key, value, updated_at) values (${key}, ${JSON.stringify(value)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

export async function loadValuationModel(): Promise<ValuationModelData> {
  const inputs = Object.fromEntries(COMPANIES.map((c) => [c.key, { ...DEFAULT_INPUTS }])) as Record<CompanyKey, CompanyInputs>;
  if (!hasDatabase()) return { settings: DEFAULT_SETTINGS, inputs };
  const settings = { ...DEFAULT_SETTINGS, ...((await read("settings")) as Partial<ValuationSettings> | null) };
  for (const c of COMPANIES) inputs[c.key] = { ...DEFAULT_INPUTS, ...((await read(`inputs:${c.key}`)) as CompanyInputs | null) };
  return { settings, inputs };
}

export async function saveInput(company: CompanyKey, field: InputField, value: number | null): Promise<CompanyInputs> {
  const current = { ...DEFAULT_INPUTS, ...((await read(`inputs:${company}`)) as CompanyInputs | null) };
  const next = { ...current, [field]: value };
  await write(`inputs:${company}`, next);
  return next;
}

export async function saveSettings(settings: ValuationSettings): Promise<void> {
  await write("settings", settings);
}

export function isInputField(v: unknown): v is InputField {
  return typeof v === "string" && (INPUT_FIELDS as readonly string[]).includes(v);
}
