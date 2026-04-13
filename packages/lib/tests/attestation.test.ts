// tests/attestation.test.ts
import { assertEquals, assertRejects } from "@std/assert";
import { decodeBase64 } from "@std/encoding/base64";
import { verifyAttestation } from "../src/attestation.ts";
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
