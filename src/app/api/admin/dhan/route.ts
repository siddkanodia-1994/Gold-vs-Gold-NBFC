import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { addDays, istDate } from "@/lib/dates";
import { testDhanCredentials } from "@/lib/dhan/client";
import { saveDhanCredentials, tokenClaims } from "@/lib/dhan/token";
import { maskExceptLast4 } from "@/lib/encryption";
import { syncShareCloses } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Saves a DHAN access token (client ID optional — read from the token), but only after one live quote
// call proves it works. Then back-fills the last 30 days of closes at once
// (what /admin's Sync now does), so days missed while the old token was
// expired don't wait for the next cron.
export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    const { clientId, token } = (await request.json()) as { clientId?: string; token?: string };
    if (!token?.trim()) return Response.json({ error: "Paste the access token" }, { status: 400 });
    const issuedTo = tokenClaims(token).clientId;
    const typed = clientId?.trim();
    if (!typed && !issuedTo) return Response.json({ error: "Couldn't read a client ID from this token — type it in." }, { status: 400 });
    // The client ID is optional: DHAN tokens carry it, so blank means "use the token's".
    const creds = { clientId: typed || issuedTo!, token: token.trim() };
    if (issuedTo && issuedTo !== creds.clientId) {
      return Response.json({ error: `This token was issued to client ID ${maskExceptLast4(issuedTo)}, not the one typed.` }, { status: 400 });
    }
    const test = await testDhanCredentials(creds);
    if (!test.ok) return Response.json({ error: test.message }, { status: 400 });
    await saveDhanCredentials(creds);
    const expiresAt = tokenClaims(creds.token).expiresAt?.toISOString() ?? null;
    const to = istDate();
    try {
      const sync = await syncShareCloses(addDays(to, -30), to);
      return Response.json({ ok: true, expiresAt, sync: { days: sync.days, from: sync.from, latest: sync.latest } });
    } catch (err) {
      // The token is saved either way; the cron and Sync now can still fill the closes.
      return Response.json({ ok: true, expiresAt, syncError: err instanceof Error ? err.message : "Sync failed" });
    }
  } catch (err) {
    return adminError(err);
  }
}
