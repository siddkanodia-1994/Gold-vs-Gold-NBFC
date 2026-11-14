import { timingSafeEqual } from "crypto";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function requireAdminSecret(request: Request): void {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) throw new Error("ADMIN_SECRET is not configured on the server");
  const provided = request.headers.get("x-admin-secret");
  if (!provided || !safeEqual(provided, expected)) throw new UnauthorizedError();
}

/** Turns a thrown error into the admin routes' JSON error response. */
export function adminError(err: unknown): Response {
  if (err instanceof UnauthorizedError) return Response.json({ error: "Wrong admin secret" }, { status: 401 });
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[admin]", err);
  return Response.json({ error: message }, { status: 500 });
}
