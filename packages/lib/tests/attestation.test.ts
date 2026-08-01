// tests/attestation.test.ts
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { decodeBase64 } from "@std/encoding/base64";
import {
  decodeAttestationCbor,
  verifyAttestation,
} from "../src/attestation.ts";
import { AttestationError, AttestationErrorCode } from "../src/errors.ts";
import { APPLE_TEST_VECTOR } from "./fixtures/apple-attestation.ts";

// The Apple test vector certs expired April 20, 2024.
// verifyAttestation must accept a checkDate option internally for testing.

// Apple's published test vector was generated with the raw challenge
// string "test_server_challenge" passed directly as clientDataHash —
// NOT hashed first. This is atypical: real client SDKs (Expo's
// attestKeyAsync, native wrappers around DCAppAttestService) hash
// their challenge with SHA-256 before passing to Apple. The
// withAttestation middleware mirrors this by hashing the raw challenge
// before calling verifyAttestation. When using verifyAttestation
// directly, callers must construct the clientDataHash themselves —
// typically SHA-256(challenge), sometimes a different derivation
// depending on client SDK behavior.
//
// The test below passes the raw challenge string because that is what
// was used as clientDataHash when Apple generated this specific test
// vector. This does NOT represent the normal integration pattern.

Deno.test("verifyAttestation succeeds with Apple test vector", async () => {
  // Pass raw challenge as clientDataHash — matches how Apple generated
  // this specific test vector (see comment above).
  const result = await verifyAttestation(
    { appId: APPLE_TEST_VECTOR.appId, developmentEnv: false },
    APPLE_TEST_VECTOR.keyId,
    APPLE_TEST_VECTOR.challenge, // raw string used as clientDataHash in test vector
    APPLE_TEST_VECTOR.attestationBase64,
    { checkDate: new Date("2024-04-18T00:00:00Z") },
  );

  assertEquals(result.signCount, 0);
  assertEquals(typeof result.publicKeyPem, "string");
  assertEquals(
    result.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----"),
    true,
  );
  assertEquals(result.receipt instanceof Uint8Array, true);
  assertEquals(result.receipt.length > 0, true);
});

Deno.test("verifyAttestation public key hash matches keyId", async () => {
  const result = await verifyAttestation(
    { appId: APPLE_TEST_VECTOR.appId, developmentEnv: false },
    APPLE_TEST_VECTOR.keyId,
    APPLE_TEST_VECTOR.challenge,
    APPLE_TEST_VECTOR.attestationBase64,
    { checkDate: new Date("2024-04-18T00:00:00Z") },
  );

  // Import the returned PEM and verify the hash matches keyId
  const base64 = result.publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const spki = decodeBase64(base64);
  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const rawKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", cryptoKey),
  );
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", rawKey));
  const expectedHash = decodeBase64(APPLE_TEST_VECTOR.keyId);
  assertEquals(hash, expectedHash);
});

Deno.test("verifyAttestation rejects wrong challenge", async () => {
  const err = await assertRejects(
    () =>
      verifyAttestation(
        { appId: APPLE_TEST_VECTOR.appId, developmentEnv: false },
        APPLE_TEST_VECTOR.keyId,
        "wrong_challenge",
        APPLE_TEST_VECTOR.attestationBase64,
        { checkDate: new Date("2024-04-18T00:00:00Z") },
      ),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.NONCE_MISMATCH);
});

Deno.test("verifyAttestation rejects wrong appId", async () => {
  const err = await assertRejects(
    () =>
      verifyAttestation(
        { appId: "WRONG.com.example.wrongapp", developmentEnv: false },
        APPLE_TEST_VECTOR.keyId,
        APPLE_TEST_VECTOR.challenge,
        APPLE_TEST_VECTOR.attestationBase64,
        { checkDate: new Date("2024-04-18T00:00:00Z") },
      ),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.RP_ID_MISMATCH);
});

Deno.test("verifyAttestation rejects wrong keyId", async () => {
  const err = await assertRejects(
    () =>
      verifyAttestation(
        { appId: APPLE_TEST_VECTOR.appId, developmentEnv: false },
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        APPLE_TEST_VECTOR.challenge,
        APPLE_TEST_VECTOR.attestationBase64,
        { checkDate: new Date("2024-04-18T00:00:00Z") },
      ),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.KEY_ID_MISMATCH);
});

Deno.test("verifyAttestation rejects wrong environment", async () => {
  // Apple test vector is production; requesting dev should fail on AAGUID
  const err = await assertRejects(
    () =>
      verifyAttestation(
        { appId: APPLE_TEST_VECTOR.appId, developmentEnv: true },
        APPLE_TEST_VECTOR.keyId,
        APPLE_TEST_VECTOR.challenge,
        APPLE_TEST_VECTOR.attestationBase64,
        { checkDate: new Date("2024-04-18T00:00:00Z") },
      ),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_AAGUID);
});

Deno.test("verifyAttestation rejects malformed CBOR", async () => {
  const err = await assertRejects(
    () =>
      verifyAttestation(
        { appId: APPLE_TEST_VECTOR.appId },
        APPLE_TEST_VECTOR.keyId,
        APPLE_TEST_VECTOR.challenge,
        new Uint8Array([0xff, 0xff]),
      ),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_FORMAT);
});

// --- Structural rejection of crafted attestation CBOR ---
//
// cborg produces well-formed canonical CBOR that the custom decoder can
// walk, letting these tests exercise verification branches that Apple's
// single test vector cannot reach.

Deno.test("verifyAttestation rejects fmt !== apple-appattest", async () => {
  const { encode } = await import("cborg");
  const crafted = encode({
    fmt: "packed",
    attStmt: {
      x5c: [new Uint8Array(8), new Uint8Array(8)],
      receipt: new Uint8Array(4),
    },
    authData: new Uint8Array(37),
  });
  const err = await assertRejects(
    () =>
      verifyAttestation(
        { appId: APPLE_TEST_VECTOR.appId },
        APPLE_TEST_VECTOR.keyId,
        APPLE_TEST_VECTOR.challenge,
        crafted,
      ),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_FORMAT);
});

Deno.test("verifyAttestation rejects x5c with fewer than 2 certificates", async () => {
  const { encode } = await import("cborg");
  const crafted = encode({
    fmt: "apple-appattest",
    attStmt: {
      x5c: [new Uint8Array(8)],
      receipt: new Uint8Array(4),
    },
    authData: new Uint8Array(37),
  });
  const err = await assertRejects(
    () =>
      verifyAttestation(
        { appId: APPLE_TEST_VECTOR.appId },
        APPLE_TEST_VECTOR.keyId,
        APPLE_TEST_VECTOR.challenge,
        crafted,
      ),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_CERTIFICATE_CHAIN);
});

// --- Structural decoder contract (hand-built CBOR bytes) ---
//
// These bytes are built manually so tests control declared lengths and key
// order exactly — including Apple's overstated-receipt-length quirk, which
// no well-formed encoder can produce.

function cbConcat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** CBOR text string (length < 24). */
function cbText(s: string): Uint8Array {
  const b = new TextEncoder().encode(s);
  return cbConcat([new Uint8Array([0x60 | b.length]), b]);
}

/** CBOR byte string with an optional overridden (wrong) declared length. */
function cbBytes(payload: Uint8Array, declaredLen?: number): Uint8Array {
  const len = declaredLen ?? payload.length;
  let head: Uint8Array;
  if (len < 24) head = new Uint8Array([0x40 | len]);
  else if (len < 256) head = new Uint8Array([0x58, len]);
  else head = new Uint8Array([0x59, len >> 8, len & 0xff]);
  return cbConcat([head, payload]);
}

/** CBOR byte string with an 8-byte (additional-info 27) length header. */
function cbBytes8ByteLen(payload: Uint8Array): Uint8Array {
  const head = new Uint8Array(9);
  head[0] = 0x5b;
  new DataView(head.buffer).setBigUint64(1, BigInt(payload.length), false);
  return cbConcat([head, payload]);
}

const cbMap = (n: number) => new Uint8Array([0xa0 | n]);
const cbArr = (n: number) => new Uint8Array([0x80 | n]);

/** A minimal valid attestation object with controllable pieces. */
function craftedAttestation(opts?: {
  receiptDeclaredLen?: number;
  order?: "apple" | "reversed" | "receiptLast";
  receiptPayload?: Uint8Array;
}): Uint8Array {
  const receiptPayload = opts?.receiptPayload ?? new Uint8Array(30).fill(7);
  const receipt = cbBytes(receiptPayload, opts?.receiptDeclaredLen);
  const x5c = cbConcat([
    cbArr(2),
    cbBytes(new Uint8Array(8).fill(1)),
    cbBytes(new Uint8Array(8).fill(2)),
  ]);
  const authData = cbBytes(new Uint8Array(37).fill(3));
  const fmt = cbText("apple-appattest");
  const attStmt = cbConcat([
    cbMap(2),
    cbText("x5c"),
    x5c,
    cbText("receipt"),
    receipt,
  ]);
  if (opts?.order === "reversed") {
    return cbConcat([
      cbMap(3),
      cbText("authData"),
      authData,
      cbText("attStmt"),
      attStmt,
      cbText("fmt"),
      fmt,
    ]);
  }
  if (opts?.order === "receiptLast") {
    // attStmt is the final top-level entry AND receipt is its final entry:
    // an overstated receipt length must repair to end-of-buffer.
    return cbConcat([
      cbMap(3),
      cbText("fmt"),
      fmt,
      cbText("authData"),
      authData,
      cbText("attStmt"),
      attStmt,
    ]);
  }
  return cbConcat([
    cbMap(3),
    cbText("fmt"),
    fmt,
    cbText("attStmt"),
    attStmt,
    cbText("authData"),
    authData,
  ]);
}

Deno.test("decodeAttestationCbor: correct lengths decode without repair", () => {
  const decoded = decodeAttestationCbor(craftedAttestation());
  assertEquals(decoded.fmt, "apple-appattest");
  assertEquals(decoded.attStmt.x5c.length, 2);
  assertEquals(decoded.attStmt.receipt, new Uint8Array(30).fill(7));
  assertEquals(decoded.authData.length, 37);
});

Deno.test("decodeAttestationCbor: overstated receipt length repairs (Apple quirk)", () => {
  const decoded = decodeAttestationCbor(
    craftedAttestation({ receiptDeclaredLen: 30 + 21 }),
  );
  assertEquals(decoded.attStmt.receipt, new Uint8Array(30).fill(7));
  assertEquals(decoded.authData.length, 37);
});

Deno.test("decodeAttestationCbor: overstated receipt as final item repairs to buffer end", () => {
  const decoded = decodeAttestationCbor(
    craftedAttestation({ order: "receiptLast", receiptDeclaredLen: 30 + 21 }),
  );
  assertEquals(decoded.attStmt.receipt, new Uint8Array(30).fill(7));
});

Deno.test("decodeAttestationCbor: receipt containing an 'authData' key needle decodes intact", () => {
  // Regression for the old scanning decoder, which located keys by raw
  // byte search and truncated the receipt at this embedded needle.
  const needle = cbText("authData");
  const payload = new Uint8Array(40).fill(9);
  payload.set(needle, 10);
  const decoded = decodeAttestationCbor(
    craftedAttestation({ receiptPayload: payload }),
  );
  assertEquals(decoded.attStmt.receipt, payload);
});

Deno.test("decodeAttestationCbor: non-Apple key order decodes", () => {
  const decoded = decodeAttestationCbor(
    craftedAttestation({ order: "reversed" }),
  );
  assertEquals(decoded.fmt, "apple-appattest");
  assertEquals(decoded.authData.length, 37);
});

Deno.test("decodeAttestationCbor: duplicate key rejected", () => {
  const fmt = cbText("apple-appattest");
  const crafted = cbConcat([
    cbMap(3),
    cbText("fmt"),
    fmt,
    cbText("fmt"),
    fmt,
    cbText("authData"),
    cbBytes(new Uint8Array(37)),
  ]);
  const err = assertThrows(
    () => decodeAttestationCbor(crafted),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_FORMAT);
});

Deno.test("decodeAttestationCbor: unknown key rejected", () => {
  const crafted = cbConcat([
    cbMap(3),
    cbText("fmt"),
    cbText("apple-appattest"),
    cbText("extra"),
    cbBytes(new Uint8Array(4)),
    cbText("authData"),
    cbBytes(new Uint8Array(37)),
  ]);
  const err = assertThrows(
    () => decodeAttestationCbor(crafted),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_FORMAT);
});

Deno.test("decodeAttestationCbor: wrong top-level entry count rejected", () => {
  const crafted = cbConcat([
    cbMap(4),
    cbText("fmt"),
    cbText("apple-appattest"),
  ]);
  const err = assertThrows(
    () => decodeAttestationCbor(crafted),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_FORMAT);
});

Deno.test("decodeAttestationCbor: 8-byte length header accepted", () => {
  const authData = cbBytes8ByteLen(new Uint8Array(37).fill(3));
  const receipt = cbBytes(new Uint8Array(30).fill(7));
  const crafted = cbConcat([
    cbMap(3),
    cbText("fmt"),
    cbText("apple-appattest"),
    cbText("attStmt"),
    cbConcat([
      cbMap(2),
      cbText("x5c"),
      cbConcat([cbArr(1), cbBytes(new Uint8Array(8))]),
      cbText("receipt"),
      receipt,
    ]),
    cbText("authData"),
    authData,
  ]);
  const decoded = decodeAttestationCbor(crafted);
  assertEquals(decoded.authData.length, 37);
});

Deno.test("decodeAttestationCbor: indefinite-length map rejected", () => {
  const crafted = cbConcat([
    new Uint8Array([0xbf]),
    cbText("fmt"),
    cbText("apple-appattest"),
    new Uint8Array([0xff]),
  ]);
  const err = assertThrows(
    () => decodeAttestationCbor(crafted),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_FORMAT);
});

Deno.test("decodeAttestationCbor: trailing bytes rejected", () => {
  const crafted = cbConcat([craftedAttestation(), new Uint8Array([0x00])]);
  const err = assertThrows(
    () => decodeAttestationCbor(crafted),
    AttestationError,
  );
  assertEquals(err.code, AttestationErrorCode.INVALID_FORMAT);
});
