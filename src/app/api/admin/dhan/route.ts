import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { testDhanCredentials } from "@/lib/dhan/client";
import { saveDhanCredentials, tokenClaims } from "@/lib/dhan/token";
import { maskExceptLast4 } from "@/lib/encryption";

export const dynamic = "force-dynamic";

// Saves a DHAN client ID + access token pair, but only after one live quote
// call proves the pair works.
export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    const { clientId, token } = (await request.json()) as { clientId?: string; token?: string };
    if (!clientId?.trim() || !token?.trim()) return Response.json({ error: "Both client ID and access token are required" }, { status: 400 });
    const creds = { clientId: clientId.trim(), token: token.trim() };
    const issuedTo = tokenClaims(creds.token).clientId;
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
