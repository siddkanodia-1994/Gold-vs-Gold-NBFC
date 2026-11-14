import { addDays, istDate } from "@/lib/dates";
import { syncShareCloses } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron, 4:05 PM and 7:05 PM IST on weekdays: re-pulls the last two
// weeks so a missed day (expired token, DHAN outage) fills itself in.
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const to = istDate();
  try {
    const result = await syncShareCloses(addDays(to, -14), to);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/sync-shares]", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
