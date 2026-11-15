import { adminError, requireAdminSecret } from "@/lib/admin-guard";
import { hasDatabase } from "@/lib/db/client";
import { ensureTables, seedIfEmpty } from "@/lib/db/setup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Creates the tables if missing and loads the 5-year workbook history into an empty database.
export async function POST(request: Request) {
  try {
    requireAdminSecret(request);
    if (!hasDatabase()) return Response.json({ error: "DATABASE_URL is not set" }, { status: 400 });
    await ensureTables();
    return Response.json({ ok: true, ...(await seedIfEmpty()) });
  } catch (err) {
    return adminError(err);
  }
}
