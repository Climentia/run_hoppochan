import { describe, expect, it } from "vitest";
import { verifyRequest } from "../src/discord/verify";

const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

describe("Discord signature verification", () => {
  it("accepts a signed body and rejects tampering", async () => {
    const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    const timestamp = "1720000000";
    const body = new TextEncoder().encode('{"type":1}');
    const message = new Uint8Array(new TextEncoder().encode(timestamp).length + body.length);
    message.set(new TextEncoder().encode(timestamp));
    message.set(body, timestamp.length);
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, message));
    const headers = { "X-Signature-Ed25519": hex(signature), "X-Signature-Timestamp": timestamp };
    const request = new Request("https://example.test/interactions", { method: "POST", headers });
    expect(await verifyRequest(request, body.buffer, hex(publicKey))).toBe(true);
    const altered = new TextEncoder().encode('{"type":2}');
    expect(await verifyRequest(request, altered.buffer, hex(publicKey))).toBe(false);
  });
});
