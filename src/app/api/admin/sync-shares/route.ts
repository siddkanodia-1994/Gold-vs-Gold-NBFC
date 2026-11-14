import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { addDays, istDate, parseLooseDate } from "@/lib/dates";
import { syncShareCloses } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    const { from } = (await request.json().catch(() => ({}))) as { from?: string };
    const to = istDate();
    const start = (from && parseLooseDate(from)) || addDays(to, -30);
    return Response.json({ ok: true, ...(await syncShareCloses(start, to)) });
  } catch (err) {
    return adminError(err);
  }
}
