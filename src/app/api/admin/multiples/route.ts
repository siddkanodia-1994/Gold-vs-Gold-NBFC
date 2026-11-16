import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { validateAceRows } from "@/lib/multiples/parse-ace";
import { storeAceUpload } from "@/lib/multiples/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ace Equity multiples upload. The admin page parses the .xlsx and posts the
// rows; they're re-validated here, stored (Ace wins over any stored day) and
// the price-updated days after the newest Ace row are recomputed.
export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    const { rows: input } = (await request.json()) as { rows?: unknown };
    const { rows, error } = validateAceRows(input);
    if (error) return Response.json({ error }, { status: 400 });
    return Response.json({ ok: true, summary: await storeAceUpload(rows) });
  } catch (err) {
    return adminError(err);
  }
}
