import { describe, expect, it } from "vitest";
import { cookieValue, signSession, verifySession } from "../src/session";

const secret = "a-random-session-secret-with-at-least-32-bytes";

describe("signed sessions", () => {
  it("round trips an unexpired session", async () => {
    const token = await signSession({ uid: "42", name: "ほっぽ" }, secret, 1_000_000);
    expect(await verifySession(token, secret, 1_000_001)).toEqual({ uid: "42", name: "ほっぽ", exp: 2_593_000 });
  });

  it("rejects altered payloads, signatures, and expired payloads", async () => {
    const token = await signSession({ uid: "42", name: "ほっぽ" }, secret, 1_000_000);
    const [payload, signature] = token.split(".");
    const changedSignature = `${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(await verifySession(`${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${signature}`, secret, 1_000_001)).toBeNull();
    expect(await verifySession(changedSignature, secret, 1_000_001)).toBeNull();
    expect(await verifySession(token, secret, 2_593_000_000)).toBeNull();
  });

  it("parses cookie values without confusing similarly named cookies", () => {
    expect(cookieValue("other=x; hoppo_session=abc_DEF.123; next=y", "hoppo_session")).toBe("abc_DEF.123");
    expect(cookieValue("hoppo_session_extra=no", "hoppo_session")).toBeNull();
    expect(cookieValue(null, "hoppo_session")).toBeNull();
  });
});
