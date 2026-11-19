import { eq, sql } from "drizzle-orm";
import { db, hasDatabase } from "../db/client";
import { appSettings } from "../db/schema";
import { decryptSetting, encryptSetting, maskExceptLast4 } from "../encryption";

const TOKEN_KEY = "dhan_access_token";
const CLIENT_ID_KEY = "dhan_client_id";

export interface DhanCredentials {
  clientId: string;
  token: string;
}

export class DhanNotConfiguredError extends Error {
  constructor() {
    super("DHAN credentials are not set — add the client ID and access token on /admin.");
    this.name = "DhanNotConfiguredError";
  }
}

interface TokenClaims {
  /** When DHAN stops accepting the token. */
  expiresAt: Date | null;
  /** The DHAN client ID the token was issued to. */
  clientId: string | null;
}

/** DHAN access tokens are JWTs; reads their expiry and client ID without verifying the signature. */
export function tokenClaims(token: string): TokenClaims {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown; dhanClientId?: unknown };
    return {
      expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null,
      clientId: typeof payload.dhanClientId === "string" || typeof payload.dhanClientId === "number" ? String(payload.dhanClientId) : null,
    };
  } catch {
    return { expiresAt: null, clientId: null };
  }
}

export async function getDhanCredentials(): Promise<DhanCredentials> {
  if (!hasDatabase()) throw new DhanNotConfiguredError();
  const rows = await db.select().from(appSettings);
  const token = rows.find((r) => r.key === TOKEN_KEY);
  const clientId = rows.find((r) => r.key === CLIENT_ID_KEY);
  if (!token || !clientId) throw new DhanNotConfiguredError();
  return { clientId: decryptSetting(clientId.value), token: decryptSetting(token.value) };
}

/** Both keys in one statement, so two saves at once can't leave one person's client ID with another's token. */
export async function saveDhanCredentials(c: DhanCredentials): Promise<void> {
  await db
    .insert(appSettings)
    .values([
      { key: CLIENT_ID_KEY, value: encryptSetting(c.clientId) },
      { key: TOKEN_KEY, value: encryptSetting(c.token) },
    ])
    .onConflictDoUpdate({ target: appSettings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
}

/** For /admin: never returns the token, and only the last 4 of the client ID. */
export async function getDhanStatus(): Promise<{ configured: boolean; clientId: string | null; updatedAt: string | null; expiresAt: string | null }> {
  if (!hasDatabase()) return { configured: false, clientId: null, updatedAt: null, expiresAt: null };
  const [token] = await db.select().from(appSettings).where(eq(appSettings.key, TOKEN_KEY));
  const [clientId] = await db.select().from(appSettings).where(eq(appSettings.key, CLIENT_ID_KEY));
  return {
    configured: Boolean(token && clientId),
    clientId: clientId ? maskExceptLast4(decryptSetting(clientId.value)) : null,
    updatedAt: token ? token.updatedAt.toISOString() : null,
    expiresAt: token ? (tokenClaims(decryptSetting(token.value)).expiresAt?.toISOString() ?? null) : null,
  };
}
