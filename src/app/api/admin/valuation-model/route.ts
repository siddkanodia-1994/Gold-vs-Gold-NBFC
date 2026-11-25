import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { COMPANIES } from "@/lib/instruments";
import { validSettings } from "@/lib/valuation/model";
import { isInputField, saveEstimate, saveInput, saveSettings } from "@/lib/valuation/store";
import { isIncomeField, isTargetFy } from "@/lib/valuation/target-year";

export const dynamic = "force-dynamic";

type Body = { company: string; field: string; value: number | null; fiscalYear?: unknown } | { settings: unknown };

// Saves one input for a company, or the shared settings ("Save as default").
// With fiscalYear, a net worth / PAT / revenue field saves that target
// year's figure (FY28 in its own field, others under estimates).
export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    const body = (await request.json()) as Body;
    if ("settings" in body) {
      if (!validSettings(body.settings)) return Response.json({ error: "Invalid settings" }, { status: 400 });
      await saveSettings(body.settings);
      return Response.json({ ok: true });
    }
    if (!COMPANIES.some((c) => c.key === body.company)) return Response.json({ error: "Unknown company" }, { status: 400 });
    if (!isInputField(body.field)) return Response.json({ error: "Unknown field" }, { status: 400 });
    const v = body.value;
    if (v !== null && !(typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e9)) return Response.json({ error: "Not a number" }, { status: 400 });
    if (v !== null && v < 0) return Response.json({ error: "Must not be negative" }, { status: 400 });
    const company = body.company as (typeof COMPANIES)[number]["key"];
    if (body.fiscalYear !== undefined) {
      if (!isTargetFy(body.fiscalYear)) return Response.json({ error: "Unknown fiscal year" }, { status: 400 });
      if (!isIncomeField(body.field)) return Response.json({ error: "Only net worth, PAT and revenue are kept per year" }, { status: 400 });
      return Response.json({ ok: true, inputs: await saveEstimate(company, body.field, body.fiscalYear, v) });
    }
    const inputs = await saveInput(company, body.field, v);
    return Response.json({ ok: true, inputs });
  } catch (err) {
    return adminError(err);
  }
}
