import { loadHistory } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows, source } = await loadHistory();
    return Response.json(
      { rows, source, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } }
    );
  } catch (err) {
    console.error("[history]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Could not load history" }, { status: 500 });
  }
}
