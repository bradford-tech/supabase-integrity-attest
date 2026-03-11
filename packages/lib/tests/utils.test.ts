// tests/utils.test.ts
import { assertEquals } from "@std/assert";
import {
  concat,
  constantTimeEqual,
  decodeBase64Bytes,
  exportKeyToPem,
  importPemPublicKey,
} from "../src/utils.ts";

Deno.test("concat joins multiple Uint8Arrays", () => {
  const a = new Uint8Array([1, 2]);
  const b = new Uint8Array([3, 4, 5]);
  const c = new Uint8Array([6]);
  const result = concat(a, b, c);
  assertEquals(result, new Uint8Array([1, 2, 3, 4, 5, 6]));
});

Deno.test("concat handles empty arrays", () => {
  const a = new Uint8Array([]);
  const b = new Uint8Array([1, 2]);
  assertEquals(concat(a, b), new Uint8Array([1, 2]));
});

Deno.test("constantTimeEqual returns true for equal arrays", () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 4]);
  assertEquals(constantTimeEqual(a, b), true);
});

Deno.test("constantTimeEqual returns false for different arrays", () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 5]);
  assertEquals(constantTimeEqual(a, b), false);
});

Deno.test("constantTimeEqual returns false for different lengths", () => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([1, 2, 3, 4]);
  assertEquals(constantTimeEqual(a, b), false);
});

Deno.test("decodeBase64Bytes decodes base64 string", () => {
  // "AQID" is base64 for [1, 2, 3]
  const result = decodeBase64Bytes("AQID");
  assertEquals(result, new Uint8Array([1, 2, 3]));
});

Deno.test("decodeBase64Bytes passes through Uint8Array", () => {
  const input = new Uint8Array([1, 2, 3]);
  const result = decodeBase64Bytes(input);
  assertEquals(result, input);
});

Deno.test("PEM round-trip: export then import produces usable key", async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pem = await exportKeyToPem(keyPair.publicKey);
  assertEquals(pem.startsWith("-----BEGIN PUBLIC KEY-----"), true);
  assertEquals(pem.endsWith("-----END PUBLIC KEY-----"), true);

  const imported = await importPemPublicKey(pem);
  // Verify we can use the imported key
  const data = new Uint8Array([1, 2, 3]);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    data,
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    imported,
    signature,
    data,
  );
  assertEquals(valid, true);
});
