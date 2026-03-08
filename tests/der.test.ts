// tests/der.test.ts
import { assertEquals, assertThrows } from "@std/assert";
import { derToRaw, rawToDer } from "../src/der.ts";

// A known DER-encoded ECDSA signature (P-256):
const KNOWN_DER = new Uint8Array([
  0x30,
  0x45, // SEQUENCE, length 69
  0x02,
  0x21, // INTEGER, length 33 (leading 0x00)
  0x00, // leading zero byte
  0x81,
  0x82,
  0x83,
  0x84,
  0x85,
  0x86,
  0x87,
  0x88,
  0x89,
  0x8a,
  0x8b,
  0x8c,
  0x8d,
  0x8e,
  0x8f,
  0x90,
  0x91,
  0x92,
  0x93,
  0x94,
  0x95,
  0x96,
  0x97,
  0x98,
  0x99,
  0x9a,
  0x9b,
  0x9c,
  0x9d,
  0x9e,
  0x9f,
  0xa0,
  0x02,
  0x20, // INTEGER, length 32 (no leading zero)
  0x01,
  0x02,
  0x03,
  0x04,
  0x05,
  0x06,
  0x07,
  0x08,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x0e,
  0x0f,
  0x10,
  0x11,
  0x12,
  0x13,
  0x14,
  0x15,
  0x16,
  0x17,
  0x18,
  0x19,
  0x1a,
  0x1b,
  0x1c,
  0x1d,
  0x1e,
  0x1f,
  0x20,
]);

const KNOWN_RAW = new Uint8Array([
  0x81,
  0x82,
  0x83,
  0x84,
  0x85,
  0x86,
  0x87,
  0x88,
  0x89,
  0x8a,
  0x8b,
  0x8c,
  0x8d,
  0x8e,
  0x8f,
  0x90,
  0x91,
  0x92,
  0x93,
  0x94,
  0x95,
  0x96,
  0x97,
  0x98,
  0x99,
  0x9a,
  0x9b,
  0x9c,
  0x9d,
  0x9e,
  0x9f,
  0xa0,
  0x01,
  0x02,
  0x03,
  0x04,
  0x05,
  0x06,
  0x07,
  0x08,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x0e,
  0x0f,
  0x10,
  0x11,
  0x12,
  0x13,
  0x14,
  0x15,
  0x16,
  0x17,
  0x18,
  0x19,
  0x1a,
  0x1b,
  0x1c,
  0x1d,
  0x1e,
  0x1f,
  0x20,
]);

Deno.test("derToRaw converts known DER to raw r||s", () => {
  const raw = derToRaw(KNOWN_DER);
  assertEquals(raw.length, 64);
  assertEquals(raw, KNOWN_RAW);
});

Deno.test("rawToDer converts known raw to DER", () => {
  const der = rawToDer(KNOWN_RAW);
  assertEquals(der, KNOWN_DER);
});

Deno.test("derToRaw(rawToDer(x)) round-trips", () => {
  for (let i = 0; i < 10; i++) {
    const raw = crypto.getRandomValues(new Uint8Array(64));
    const roundTripped = derToRaw(rawToDer(raw));
    assertEquals(roundTripped, raw);
  }
});

Deno.test("derToRaw handles integers shorter than 32 bytes", () => {
  const der = new Uint8Array([
    0x30,
    0x26, // SEQUENCE, length 38
    0x02,
    0x02, // INTEGER, length 2
    0x01,
    0x02, // r = 0x0102
    0x02,
    0x20, // INTEGER, length 32
    ...KNOWN_RAW.slice(32, 64), // s
  ]);
  const raw = derToRaw(der);
  assertEquals(raw.length, 64);
  assertEquals(raw[0], 0);
  assertEquals(raw[29], 0);
  assertEquals(raw[30], 0x01);
  assertEquals(raw[31], 0x02);
});

Deno.test("derToRaw rejects invalid input: not a SEQUENCE", () => {
  assertThrows(
    () => derToRaw(new Uint8Array([0x31, 0x00])),
    Error,
  );
});

Deno.test("derToRaw and rawToDer work with real WebCrypto P-256 signatures", async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const data = new TextEncoder().encode("test data");

  const rawSig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      data,
    ),
  );
  assertEquals(rawSig.length, 64);

  const der = rawToDer(rawSig);
  const backToRaw = derToRaw(der);
  assertEquals(backToRaw, rawSig);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.publicKey,
    backToRaw,
    data,
  );
  assertEquals(valid, true);
});

Deno.test("derToRaw(rawToDer(x)) round-trips for P-384 (componentSize=48)", () => {
  for (let i = 0; i < 10; i++) {
    const raw = crypto.getRandomValues(new Uint8Array(96));
    const der = rawToDer(raw, 48);
    const roundTripped = derToRaw(der, 48);
    assertEquals(roundTripped, raw);
  }
});

Deno.test("derToRaw and rawToDer work with real WebCrypto P-384 signatures", async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-384" },
    true,
    ["sign", "verify"],
  );
  const data = new TextEncoder().encode("test data for P-384");

  const rawSig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-384" },
      keyPair.privateKey,
      data,
    ),
  );
  assertEquals(rawSig.length, 96);

  const der = rawToDer(rawSig, 48);
  const backToRaw = derToRaw(der, 48);
  assertEquals(backToRaw, rawSig);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-384" },
    keyPair.publicKey,
    backToRaw,
    data,
  );
  assertEquals(valid, true);
});
