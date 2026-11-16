import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { COMPANIES } from "@/lib/instruments";
import { validSettings } from "@/lib/valuation/model";
import { isInputField, saveInput, saveSettings } from "@/lib/valuation/store";

export const dynamic = "force-dynamic";

type Body = { company: string; field: string; value: number | null } | { settings: unknown };

// Saves one FY28E input for a company, or the shared settings ("Save as default").
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
    const inputs = await saveInput(body.company as (typeof COMPANIES)[number]["key"], body.field, v);
    return Response.json({ ok: true, inputs });
  } catch (err) {
    return adminError(err);
  }
}
