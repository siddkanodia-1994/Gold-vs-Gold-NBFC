import { loadSummaryDefaults, saveSummaryDefaults, validSummaryDefaults } from "@/lib/summary-defaults";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await loadSummaryDefaults(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[summary-defaults]", err);
    return Response.json({ error: "Could not load the Summary defaults" }, { status: 500 });
  }
}

// Open to every visitor (no admin password, by request); only a fully valid
// defaults object is stored.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!validSummaryDefaults(body)) return Response.json({ error: "Invalid defaults" }, { status: 400 });
    await saveSummaryDefaults(body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[summary-defaults]", err);
    return Response.json({ error: "Could not save the Summary defaults" }, { status: 500 });
  }
}
