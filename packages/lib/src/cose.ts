// src/cose.ts
import { decode } from "cborg";

export function coseKeyToRawPublicKey(coseBytes: Uint8Array): Uint8Array {
  const decoded = decode(coseBytes, { useMaps: true }) as Map<
    number,
    unknown
  >;

  const x = decoded.get(-2) as Uint8Array;
  const y = decoded.get(-3) as Uint8Array;

  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error("Invalid COSE key: missing or invalid x/y coordinates");
  }

  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  raw.set(x, 1);
  raw.set(y, 33);
  return raw;
}

export async function coseKeyToCryptoKey(
  coseBytes: Uint8Array,
): Promise<CryptoKey> {
  const raw = coseKeyToRawPublicKey(coseBytes);
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
}
