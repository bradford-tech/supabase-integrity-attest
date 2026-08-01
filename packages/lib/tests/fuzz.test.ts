// tests/fuzz.test.ts
//
// Deterministic mutation fuzzing for the binary parsers. Every mutant must
// either parse successfully or throw the parser's documented error type —
// never a raw TypeError/RangeError, never hang. Fixed seed => reproducible.
import { decodeBase64 } from "@std/encoding/base64";
import { decodeAttestationCbor } from "../src/attestation.ts";
import { derToRaw, rawToDer } from "../src/der.ts";
import {
  parseAssertionAuthData,
  parseAttestationAuthData,
} from "../src/authdata.ts";
import { AssertionError, AttestationError } from "../src/errors.ts";
import { verifyAssertion } from "../mod.ts";
import { APPLE_TEST_VECTOR } from "./fixtures/apple-attestation.ts";
import { generateSyntheticAssertion } from "./fixtures/generate-assertion.ts";

const SEED = 0x5eed2026;

/** mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Parser = {
  name: string;
  parse: (data: Uint8Array) => unknown;
  allowed: (e: unknown) => boolean;
};

/** Assert the invariant for one mutant; throw a descriptive error otherwise. */
function checkMutant(p: Parser, mutant: Uint8Array, label: string) {
  try {
    p.parse(mutant);
  } catch (e) {
    if (!p.allowed(e)) {
      throw new Error(
        `${p.name}: ${label} threw disallowed ${
          e instanceof Error ? e.constructor.name + ": " + e.message : String(e)
        }`,
      );
    }
  }
}

/** All mutation families, applied deterministically to one seed buffer. */
function fuzzParser(p: Parser, seedBytes: Uint8Array) {
  const rand = mulberry32(SEED);
  // 1. Truncations: all lengths for small inputs, 200 sampled + first 64
  //    for large ones.
  const lengths = new Set<number>();
  if (seedBytes.length <= 300) {
    for (let i = 0; i <= seedBytes.length; i++) lengths.add(i);
  } else {
    for (let i = 0; i <= 64; i++) lengths.add(i);
    for (let i = 0; i < 200; i++) {
      lengths.add(Math.floor(rand() * seedBytes.length));
    }
  }
  for (const len of lengths) {
    checkMutant(p, seedBytes.slice(0, len), `truncate(${len})`);
  }
  // 2. Single-byte bit flips at 500 seeded positions.
  for (let i = 0; i < 500; i++) {
    const pos = Math.floor(rand() * seedBytes.length);
    const bit = 1 << Math.floor(rand() * 8);
    const m = seedBytes.slice();
    m[pos] ^= bit;
    checkMutant(p, m, `flip(${pos},${bit})`);
  }
  // 3. Byte stomps: header-corrupting values at 300 seeded positions.
  const stomps = [0x00, 0xff, 0x9f, 0xbf, 0x7f, 0x5b, 0x3b, 0x1b];
  for (let i = 0; i < 300; i++) {
    const pos = Math.floor(rand() * seedBytes.length);
    const m = seedBytes.slice();
    m[pos] = stomps[Math.floor(rand() * stomps.length)];
    checkMutant(p, m, `stomp(${pos})`);
  }
}

const attestationBytes = decodeBase64(APPLE_TEST_VECTOR.attestationBase64);

Deno.test("fuzz: decodeAttestationCbor only throws AttestationError", () => {
  fuzzParser(
    {
      name: "decodeAttestationCbor",
      parse: decodeAttestationCbor,
      allowed: (e) => e instanceof AttestationError,
    },
    attestationBytes,
  );
});

Deno.test("fuzz: derToRaw only throws intentional Errors", () => {
  // A structurally valid DER ECDSA signature (r and s 32 bytes).
  const raw = new Uint8Array(64).fill(0x42);
  const der = rawToDer(raw);
  fuzzParser(
    {
      name: "derToRaw",
      parse: (d) => derToRaw(d),
      allowed: (e) => e instanceof Error && e.constructor === Error,
    },
    der,
  );
});

Deno.test("fuzz: authdata parsers only throw intentional Errors", () => {
  // Valid attestation authdata: 37 base + aaguid(16) + credIdLen(2) + credId(32).
  const authData = new Uint8Array(55 + 32);
  new DataView(authData.buffer).setUint16(53, 32, false);
  const allowed = (e: unknown) => e instanceof Error && e.constructor === Error;
  fuzzParser(
    {
      name: "parseAttestationAuthData",
      parse: parseAttestationAuthData,
      allowed,
    },
    authData,
  );
  fuzzParser(
    { name: "parseAssertionAuthData", parse: parseAssertionAuthData, allowed },
    authData.slice(0, 37),
  );
});

Deno.test("fuzz: verifyAssertion only throws AssertionError", async () => {
  const fixture = await generateSyntheticAssertion({
    appId: "TEAMID1234.com.example.testapp",
    clientData: new TextEncoder().encode('{"action":"fuzz"}'),
    signCount: 1,
  });
  const rand = mulberry32(SEED);
  const probe = async (mutant: Uint8Array, label: string) => {
    try {
      await verifyAssertion(
        { appId: "TEAMID1234.com.example.testapp" },
        mutant,
        fixture.clientData,
        fixture.publicKeyPem,
        0,
      );
    } catch (e) {
      if (!(e instanceof AssertionError)) {
        throw new Error(
          `verifyAssertion: ${label} threw disallowed ${
            e instanceof Error
              ? e.constructor.name + ": " + e.message
              : String(e)
          }`,
        );
      }
    }
  };
  const bytes = fixture.assertion;
  // Reduced counts vs fuzzParser: each probe does WebCrypto work, and this
  // test must stay under ~2s.
  for (let len = 0; len <= Math.min(bytes.length, 80); len += 4) {
    await probe(bytes.slice(0, len), `truncate(${len})`);
  }
  for (let i = 0; i < 150; i++) {
    const pos = Math.floor(rand() * bytes.length);
    const bit = 1 << Math.floor(rand() * 8);
    const m = bytes.slice();
    m[pos] ^= bit;
    await probe(m, `flip(${pos},${bit})`);
  }
  const stomps = [0x00, 0xff, 0x9f, 0xbf, 0x7f, 0x5b];
  for (let i = 0; i < 100; i++) {
    const pos = Math.floor(rand() * bytes.length);
    const m = bytes.slice();
    m[pos] = stomps[Math.floor(rand() * stomps.length)];
    await probe(m, `stomp(${pos})`);
  }
});
