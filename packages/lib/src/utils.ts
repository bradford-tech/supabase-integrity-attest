// src/utils.ts
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";

/** Concatenate multiple Uint8Arrays into one. */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Constant-time comparison of two byte arrays. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** Decode base64 string to bytes, or pass through Uint8Array unchanged. */
export function decodeBase64Bytes(input: Uint8Array | string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return decodeBase64(input);
}

/** Convert a UTF-8 string to bytes, or pass through Uint8Array unchanged. */
export function toBytes(input: Uint8Array | string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new TextEncoder().encode(input);
}

/** Import a PEM-encoded SPKI public key as a CryptoKey for ECDSA P-256 verification. */
export async function importPemPublicKey(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const spki = decodeBase64(base64);
  return await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
}

/** Export a CryptoKey to PEM-encoded SPKI format. */
export async function exportKeyToPem(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  const base64 = encodeBase64(spki).match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`;
}
