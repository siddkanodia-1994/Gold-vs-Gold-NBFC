import { loadValuationModel } from "@/lib/valuation/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await loadValuationModel(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[valuation-model]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Could not load the valuation model" }, { status: 500 });
  }
}
