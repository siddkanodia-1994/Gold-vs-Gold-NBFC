import { eq } from "drizzle-orm";
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

export async function getDhanCredentials(): Promise<DhanCredentials> {
  if (!hasDatabase()) throw new DhanNotConfiguredError();
  const rows = await db.select().from(appSettings);
  const token = rows.find((r) => r.key === TOKEN_KEY);
  const clientId = rows.find((r) => r.key === CLIENT_ID_KEY);
  if (!token || !clientId) throw new DhanNotConfiguredError();
  return { clientId: decryptSetting(clientId.value), token: decryptSetting(token.value) };
}

async function put(key: string, plaintext: string): Promise<void> {
  const value = encryptSetting(plaintext);
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function saveDhanCredentials(c: DhanCredentials): Promise<void> {
  await put(CLIENT_ID_KEY, c.clientId);
  await put(TOKEN_KEY, c.token);
}

/** For /admin: never returns the token, and only the last 4 of the client ID. */
export async function getDhanStatus(): Promise<{ configured: boolean; clientId: string | null; updatedAt: string | null }> {
  if (!hasDatabase()) return { configured: false, clientId: null, updatedAt: null };
  const [token] = await db.select().from(appSettings).where(eq(appSettings.key, TOKEN_KEY));
  const [clientId] = await db.select().from(appSettings).where(eq(appSettings.key, CLIENT_ID_KEY));
  return {
    configured: Boolean(token && clientId),
    clientId: clientId ? maskExceptLast4(decryptSetting(clientId.value)) : null,
    updatedAt: token ? token.updatedAt.toISOString() : null,
  };
}
