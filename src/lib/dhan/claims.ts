export interface TokenClaims {
  /** When DHAN stops accepting the token. */
  expiresAt: Date | null;
  /** The DHAN client ID the token was issued to. */
  clientId: string | null;
}

/** DHAN access tokens are JWTs; reads their expiry and client ID without verifying the signature. Safe in the browser too. */
export function tokenClaims(token: string): TokenClaims {
  try {
    const part = (token.trim().split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))) as { exp?: unknown; dhanClientId?: unknown };
    return {
      expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null,
      clientId: typeof payload.dhanClientId === "string" || typeof payload.dhanClientId === "number" ? String(payload.dhanClientId) : null,
    };
  } catch {
    return { expiresAt: null, clientId: null };
  }
}
