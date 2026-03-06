// tests/cose.test.ts
import { assertEquals } from "@std/assert";
import { coseKeyToCryptoKey, coseKeyToRawPublicKey } from "../src/cose.ts";
import { encode } from "cborg";

Deno.test("coseKeyToRawPublicKey extracts x and y into uncompressed point", () => {
  const x = new Uint8Array(32).fill(0xaa);
  const y = new Uint8Array(32).fill(0xbb);

  const coseMap = new Map<number, number | Uint8Array>();
  coseMap.set(1, 2); // kty = EC2
  coseMap.set(3, -7); // alg = ES256
  coseMap.set(-1, 1); // crv = P-256
  coseMap.set(-2, x); // x coordinate
  coseMap.set(-3, y); // y coordinate
  const coseBytes = encode(coseMap);

  const raw = coseKeyToRawPublicKey(coseBytes);
  assertEquals(raw.length, 65);
  assertEquals(raw[0], 0x04);
  assertEquals(raw.slice(1, 33), x);
  assertEquals(raw.slice(33, 65), y);
});

Deno.test("coseKeyToCryptoKey produces a usable CryptoKey", async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const x = new Uint8Array(
    atob(jwk.x!.replace(/-/g, "+").replace(/_/g, "/"))
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
  const y = new Uint8Array(
    atob(jwk.y!.replace(/-/g, "+").replace(/_/g, "/"))
      .split("")
      .map((c) => c.charCodeAt(0)),
  );

  const coseMap = new Map<number, number | Uint8Array>();
  coseMap.set(1, 2);
  coseMap.set(3, -7);
  coseMap.set(-1, 1);
  coseMap.set(-2, x);
  coseMap.set(-3, y);
  const coseBytes = encode(coseMap);

  const cryptoKey = await coseKeyToCryptoKey(coseBytes);

  const data = new TextEncoder().encode("test");
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    data,
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    sig,
    data,
  );
  assertEquals(valid, true);
});
