const encoder = new TextEncoder();
const SESSION_SECONDS = 30 * 24 * 60 * 60;

export type Session = { uid: string; name: string; exp: number };

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function fromBase64url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch { return null; }
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) difference |= (left[i % (left.length || 1)] ?? 0) ^ (right[i % (right.length || 1)] ?? 0);
  return difference === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const raw = encoder.encode(secret);
  if (raw.byteLength < 32) throw new Error("SESSION_SECRET must be at least 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(user: { uid: string; name: string }, secret: string, now = Date.now()): Promise<string> {
  const payload: Session = { ...user, exp: Math.floor(now / 1000) + SESSION_SECONDS };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(encoded)));
  return `${encoded}.${base64url(signature)}`;
}

export async function verifySession(value: string | null | undefined, secret: string, now = Date.now()): Promise<Session | null> {
  if (!value) return null;
  const [payloadPart, signaturePart, extra] = value.split(".");
  if (!payloadPart || !signaturePart || extra !== undefined) return null;
  const payloadBytes = fromBase64url(payloadPart);
  const signature = fromBase64url(signaturePart);
  if (!payloadBytes || !signature) return null;
  try {
    const key = await hmacKey(secret);
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payloadPart)));
    if (!constantTimeEqual(signature, expected)) return null;
    const payload: unknown = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload || typeof payload !== "object") return null;
    const session = payload as Partial<Session>;
    if (typeof session.uid !== "string" || !session.uid || typeof session.name !== "string" ||
        !session.name || typeof session.exp !== "number" || !Number.isInteger(session.exp) || session.exp <= Math.floor(now / 1000)) return null;
    return { uid: session.uid, name: session.name, exp: session.exp };
  } catch { return null; }
}

export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export const sessionMaxAge = SESSION_SECONDS;
