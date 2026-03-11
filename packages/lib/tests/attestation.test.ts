// tests/attestation.test.ts
import { assertEquals, assertRejects } from "@std/assert";
import { decodeBase64 } from "@std/encoding/base64";
import { verifyAttestation } from "../src/attestation.ts";
import { AttestationError } from "../src/errors.ts";
import { APPLE_TEST_VECTOR } from "./fixtures/apple-attestation.ts";

// The Apple test vector certs expired April 20, 2024.
// verifyAttestation must accept a checkDate option internally for testing.

Deno.test("verifyAttestation succeeds with Apple test vector", async () => {
  const result = await verifyAttestation(
    { appId: APPLE_TEST_VECTOR.appId, developmentEnv: false },
    APPLE_TEST_VECTOR.keyId,
    APPLE_TEST_VECTOR.challenge,
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
  await assertRejects(
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
});

Deno.test("verifyAttestation rejects wrong appId", async () => {
  await assertRejects(
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
});

Deno.test("verifyAttestation rejects wrong keyId", async () => {
  await assertRejects(
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
});

Deno.test("verifyAttestation rejects wrong environment", async () => {
  // Apple test vector is production; requesting dev should fail on AAGUID
  await assertRejects(
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
});

Deno.test("verifyAttestation rejects malformed CBOR", async () => {
  await assertRejects(
    () =>
      verifyAttestation(
        { appId: APPLE_TEST_VECTOR.appId },
        APPLE_TEST_VECTOR.keyId,
        APPLE_TEST_VECTOR.challenge,
        new Uint8Array([0xff, 0xff]),
      ),
    AttestationError,
  );
});
