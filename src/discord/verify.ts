function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], byte => Number.parseInt(byte, 16));
}

export async function verifyRequest(request: Request, body: ArrayBuffer, publicKeyHex: string): Promise<boolean> {
  const signature = fromHex(request.headers.get("X-Signature-Ed25519") ?? "");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const publicKey = fromHex(publicKeyHex);
  if (!signature || signature.length !== 64 || !timestamp || !publicKey || publicKey.length !== 32) return false;
  try {
    const key = await crypto.subtle.importKey("raw", publicKey.buffer as ArrayBuffer, { name: "Ed25519" } as AlgorithmIdentifier, false, ["verify"]);
    const message = new Uint8Array(new TextEncoder().encode(timestamp).length + body.byteLength);
    const timestampBytes = new TextEncoder().encode(timestamp);
    message.set(timestampBytes);
    message.set(new Uint8Array(body), timestampBytes.length);
    return await crypto.subtle.verify({ name: "Ed25519" } as AlgorithmIdentifier, key, signature.buffer as ArrayBuffer, message.buffer as ArrayBuffer);
  } catch {
    return false;
  }
}
