import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { parseLooseDate } from "@/lib/dates";
import { parseMcxSpotFile } from "@/lib/mcx-spot";
import { loadHistory, upsertGold } from "@/lib/prices";

export const dynamic = "force-dynamic";

type Body =
  | { mode: "preview" | "commit"; text: string }
  | { mode: "manual"; date: string; price: number };

// MCX Spot Market file upload (preview first, then commit) or one typed-in price.
export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    const body = (await request.json()) as Body;
    if (body.mode === "manual") {
      const date = parseLooseDate(String(body.date ?? ""));
      const price = Number(body.price);
      if (!date || !(price > 1000)) return Response.json({ error: "Enter a date and a Gold M price in ₹ per 10 g" }, { status: 400 });
      await upsertGold([{ date, price }], "manual");
      return Response.json({ ok: true, saved: 1 });
    }

    const parsed = parseMcxSpotFile(body.text ?? "");
    if (parsed.rows.length === 0) return Response.json({ error: parsed.warnings.join(" ") || "No Gold M rows found" }, { status: 400 });
    const stored = new Map((await loadHistory()).rows.filter((r) => r.g !== undefined).map((r) => [r.d, r.g!]));
    const rows = parsed.rows.map((r) => ({
      ...r,
      stored: stored.get(r.date) ?? null,
      status: !stored.has(r.date) ? "new" : stored.get(r.date) === r.price ? "same" : "changed",
    }));
    if (body.mode === "commit") {
      const toWrite = rows.filter((r) => r.status !== "same");
      await upsertGold(toWrite, "mcx_spot");
      return Response.json({ ok: true, saved: toWrite.length });
    }
    return Response.json({ rows, skipped: parsed.skipped, warnings: parsed.warnings });
  } catch (err) {
    return adminError(err);
  }
}
