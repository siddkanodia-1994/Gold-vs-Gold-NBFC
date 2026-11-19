import { describe, expect, it } from "vitest";
import { tokenClaims } from "./token";

const jwt = (payload: object) => `eyJhbGciOiJIUzUxMiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("tokenClaims", () => {
  it("reads the expiry and client ID from a DHAN token", () => {
    const c = tokenClaims(jwt({ iss: "dhan", exp: 1795061400, dhanClientId: "1100000001" }));
    expect(c.expiresAt?.toISOString()).toBe("2026-11-19T04:10:00.000Z");
    expect(c.clientId).toBe("1100000001");
  });

  it("returns nulls for anything that isn't a JWT", () => {
    expect(tokenClaims("not-a-token")).toEqual({ expiresAt: null, clientId: null });
    expect(tokenClaims(jwt({ iss: "dhan" }))).toEqual({ expiresAt: null, clientId: null });
  });
});
