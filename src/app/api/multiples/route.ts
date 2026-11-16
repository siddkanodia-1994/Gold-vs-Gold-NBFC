import { loadMultiples } from "@/lib/multiples/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companies = await loadMultiples();
    return Response.json({ companies }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } });
  } catch (err) {
    console.error("[multiples]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Could not load multiples" }, { status: 500 });
  }
}
