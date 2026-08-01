// bench/verify.bench.ts
//
// Compute-cost benchmarks for the verification paths. Run with:
//     deno task bench
// Not part of `deno task check` — numbers, not pass/fail.
import { decodeBase64 } from "@std/encoding/base64";
import { verifyAssertion, verifyAttestation } from "../mod.ts";
import { decodeAttestationCbor } from "../src/attestation.ts";
import { generateSyntheticAssertion } from "../tests/fixtures/generate-assertion.ts";
import { APPLE_TEST_VECTOR } from "../tests/fixtures/apple-attestation.ts";

const APP_ID = "TEAMID1234.com.example.testapp";

// Fixture setup happens once, outside the measured bodies.
const fixture = await generateSyntheticAssertion({
  appId: APP_ID,
  clientData: new TextEncoder().encode('{"action":"bench"}'),
  signCount: 1,
});
const attestationBytes = decodeBase64(APPLE_TEST_VECTOR.attestationBase64);
const CHECK_DATE = new Date("2024-04-18T00:00:00Z");

Deno.bench("verifyAssertion (hot path, per protected request)", async () => {
  await verifyAssertion(
    { appId: APP_ID },
    fixture.assertion,
    fixture.clientData,
    fixture.publicKeyPem,
    0,
  );
});

Deno.bench("verifyAttestation (cold path, once per device)", async () => {
  await verifyAttestation(
    { appId: APPLE_TEST_VECTOR.appId, developmentEnv: false },
    APPLE_TEST_VECTOR.keyId,
    APPLE_TEST_VECTOR.challenge,
    APPLE_TEST_VECTOR.attestationBase64,
    { checkDate: CHECK_DATE },
  );
});

Deno.bench("decodeAttestationCbor (decoder alone)", () => {
  decodeAttestationCbor(attestationBytes);
});
