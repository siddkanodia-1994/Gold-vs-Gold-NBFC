import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { testDhanCredentials } from "@/lib/dhan/client";
import { saveDhanCredentials } from "@/lib/dhan/token";

export const dynamic = "force-dynamic";

// Saves a DHAN client ID + access token pair, but only after one live quote
// call proves the pair works.
export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    const { clientId, token } = (await request.json()) as { clientId?: string; token?: string };
    if (!clientId?.trim() || !token?.trim()) return Response.json({ error: "Both client ID and access token are required" }, { status: 400 });
    const creds = { clientId: clientId.trim(), token: token.trim() };
    const test = await testDhanCredentials(creds);
    if (!test.ok) return Response.json({ error: test.message }, { status: 400 });
    await saveDhanCredentials(creds);
    return Response.json({ ok: true });
  } catch (err) {
    return adminError(err);
  }
}
