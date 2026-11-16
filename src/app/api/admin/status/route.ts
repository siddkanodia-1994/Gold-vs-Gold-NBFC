import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { alignRows } from "@/lib/analytics/series";
import { addDays, istDate, isWeekday } from "@/lib/dates";
import { hasDatabase } from "@/lib/db/client";
import { getDhanStatus } from "@/lib/dhan/token";
import { multiplesStatus } from "@/lib/multiples/store";
import { loadHistory } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAdminSecret(request);
    const { rows, source } = await loadHistory();
    const lastOf = (f: "g" | "mu" | "ma") => [...rows].reverse().find((r) => r[f] !== undefined) ?? null;
    const gold = lastOf("g");
    const aligned = alignRows(rows);
    // Recent share sessions priced on carried-forward gold: the spot days still to upload.
    const since = addDays(istDate(), -45);
    const missingGold = aligned.filter((r) => r.date >= since && r.goldDate !== r.date && isWeekday(r.date)).map((r) => r.date);
    return Response.json({
      database: hasDatabase(),
      source,
      dhan: await getDhanStatus(),
      rows: rows.length,
      sessions: aligned.length,
      firstDate: rows[0]?.d ?? null,
      gold: gold ? { date: gold.d, price: gold.g } : null,
      muthoot: lastOf("mu") ? { date: lastOf("mu")!.d, price: lastOf("mu")!.mu } : null,
      manappuram: lastOf("ma") ? { date: lastOf("ma")!.d, price: lastOf("ma")!.ma } : null,
      missingGold,
      multiples: hasDatabase() ? await multiplesStatus().catch(() => null) : null,
    });
  } catch (err) {
    return adminError(err);
  }
}
