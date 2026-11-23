import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { testDhanCredentials } from "@/lib/dhan/client";
import { saveDhanCredentials, tokenClaims } from "@/lib/dhan/token";
import { maskExceptLast4 } from "@/lib/encryption";

export const dynamic = "force-dynamic";

// Saves a DHAN access token (client ID optional — read from the token), but only after one live quote
// call proves it works.
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
    return Response.json({ ok: true, expiresAt: tokenClaims(creds.token).expiresAt?.toISOString() ?? null });
  } catch (err) {
    return adminError(err);
  }
}
