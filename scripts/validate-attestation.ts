#!/usr/bin/env -S deno run
/**
 * Step-by-step validation of the attestation object per Apple's
 * Attestation Object Validation Guide.
 *
 * Validates each intermediate result against the expected values
 * published by Apple, ensuring our implementation produces correct
 * results at every step.
 *
 * Run: deno task validate
 */

import { decodeBase64, encodeBase64 } from "@std/encoding/base64";
import { decodeAttestationCbor } from "../src/attestation.ts";
import { parseAttestationAuthData } from "../src/authdata.ts";
import {
  extractNonceFromCert,
  extractPublicKeyFromCert,
  verifyCertificateChain,
} from "../src/certificate.ts";
import { AAGUID_PRODUCTION } from "../src/constants.ts";
import { concat, constantTimeEqual, toBytes } from "../src/utils.ts";

// ── Apple test vector inputs ─────────────────────────────────────────
// From: https://developer.apple.com/documentation/devicecheck/attestation-object-validation-guide

const APP_ID = "0352187391.com.apple.example_app_attest";
const SERVER_CHALLENGE = "test_server_challenge";
const KEY_ID = "bSrEhF8TIzIvWSPwvZ0i2+UOBre4ASH84rK15m6emNY=";

const ATTESTATION_BASE64 =
  "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";

// ── Expected intermediate values from Apple's guide ──────────────────

const EXPECTED_LEAF_CERT_B64 =
  "MIIDsjCCAzmgAwIBAgIGAY7x/U1KMAoGCCqGSM49BAMCME8xIzAhBgNVBAMMGkFwcGxlIEFwcCBBdHRlc3RhdGlvbiBDQSAxMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMB4XDTI0MDQxNzE2MTQ1M1oXDTI0MDQyMDE2MTQ1M1owgZExSTBHBgNVBAMMQDZkMmFjNDg0NWYxMzIzMzIyZjU5MjNmMGJkOWQyMmRiZTUwZTA2YjdiODAxMjFmY2UyYjJiNWU2NmU5ZTk4ZDYxGjAYBgNVBAsMEUFBQSBDZXJ0aWZpY2F0aW9uMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEjC4Mq2+SI5cOf1q26S/XpNbWIaYOVIZEvxl2TvHvhTYR9sK2u1Oyu6LTRoGX5L6rLDbKwOTiT0HzUTLJR15cJKOCAbwwggG4MAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgTwMIGIBgkqhkiG92NkCAUEezB5pAMCAQq/iTADAgEBv4kxAwIBAL+JMgMCAQG/iTMDAgEBv4k0KQQnMDM1MjE4NzM5MS5jb20uYXBwbGUuZXhhbXBsZV9hcHBfYXR0ZXN0pQYEBHNrcyC/iTYDAgEFv4k3AwIBAL+JOQMCAQC/iToDAgEAv4k7AwIBADCB1wYJKoZIhvdjZAgHBIHJMIHGv4p4BgQEMTguML+IUAcCBQD/////v4p7CQQHMjJBMjQ0Yr+KfAYEBDE4LjC/in0GBAQxOC4wv4p+AwIBAL+KfwMCAQC/iwADAgEAv4sBAwIBAL+LAgMCAQC/iwMDAgEAv4sEAwIBAb+LBQMCAQC/iwoQBA4yMi4xLjI0NC4wLjIsML+LCxAEDjIyLjEuMjQ0LjAuMiwwv4sMEAQOMjIuMS4yNDQuMC4yLDC/iAIKBAhpcGhvbmVvc7+IBQoECEludGVybmFsMDMGCSqGSIb3Y2QIAgQmMCShIgQg+20WKnF+yrF3iQBQb6lNZ+4MHcPUWxLN3oG+/Fblt+swCgYIKoZIzj0EAwIDZwAwZAIwIk4vHloC64CyG7xk6mEC2wNk4hFv+CryBxCTirG4ZOdRgu0CrvFuj3zQEmtLDUe2AjACi2YebCyyzhd8AwH1hvLgIrpmMj2AJiy0is9Z5OLDYkz9BNUX0IBWGJlewqdr2iU=";

const EXPECTED_INTERMEDIATE_CERT_B64 =
  "MIICQzCCAcigAwIBAgIQCbrF4bxAGtnUU5W8OBoIVDAKBggqhkjOPQQDAzBSMSYwJAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwKQXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODM5NTVaFw0zMDAzMTMwMDAwMDBaME8xIzAhBgNVBAMMGkFwcGxlIEFwcCBBdHRlc3RhdGlvbiBDQSAxMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAErls3oHdNebI1j0Dn0fImJvHCX+8XgC3qs4JqWYdP+NKtFSV4mqJmBBkSSLY8uWcGnpjTY71eNw+/oI4ynoBzqYXndG6jWaL2bynbMq9FXiEWWNVnr54mfrJhTcIaZs6Zo2YwZDASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1UdIwQYMBaAFKyREFMzvb5oQf+nDKnl+url5YqhMB0GA1UdDgQWBBQ+410cBBmpybQx+IR01uHhV3LjmzAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwMDaQAwZgIxALu+iI1zjQUCz7z9Zm0JV1A1vNaHLD+EMEkmKe3R+RToeZkcmui1rvjTqFQz97YNBgIxAKs47dDMge0ApFLDukT5k2NlU/7MKX8utN+fXr5aSsq2mVxLgg35BDhveAe7WJQ5tw==";

const EXPECTED_COMPOSITE_B64 =
  "FVhAM8lQuf6dUUziohGjJtcaprEBSrTG+i+9qdmqGKZAAAAAAGFwcGF0dGVzdAAAAAAAAAAAIG0qxIRfEyMyL1kj8L2dItvlDga3uAEh/OKyteZunpjWpQECAyYgASFYIIwuDKtvkiOXDn9atukv16TW1iGmDlSGRL8Zdk7x74U2IlggEfbCtrtTsrui00aBl+S+qyw2ysDk4k9B81EyyUdeXCR0ZXN0X3NlcnZlcl9jaGFsbGVuZ2U=";

const EXPECTED_NONCE_B64 = "+20WKnF+yrF3iQBQb6lNZ+4MHcPUWxLN3oG+/Fblt+s=";

const EXPECTED_CERT_NONCE_B64 = "+20WKnF+yrF3iQBQb6lNZ+4MHcPUWxLN3oG+/Fblt+s=";

const EXPECTED_PUBKEY_HASH_B64 = "bSrEhF8TIzIvWSPwvZ0i2+UOBre4ASH84rK15m6emNY=";

const EXPECTED_APP_ID_HASH_B64 = "FVhAM8lQuf6dUUziohGjJtcaprEBSrTG+i+9qdmqGKY=";

const EXPECTED_RP_ID_HASH_B64 = "FVhAM8lQuf6dUUziohGjJtcaprEBSrTG+i+9qdmqGKY=";

const EXPECTED_COUNTER = 0;

const EXPECTED_AAGUID_PRODUCTION = new Uint8Array([
  0x61,
  0x70,
  0x70,
  0x61,
  0x74,
  0x74,
  0x65,
  0x73,
  0x74,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
]);

const EXPECTED_CREDENTIAL_ID_B64 =
  "bSrEhF8TIzIvWSPwvZ0i2+UOBre4ASH84rK15m6emNY=";

// ── Validation runner ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(
  label: string,
  pass: boolean,
  expected?: string,
  actual?: string,
) {
  if (pass) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}`);
    if (expected !== undefined) {
      console.log(`         Expected: ${expected}`);
    }
    if (actual !== undefined) {
      console.log(`         Actual:   ${actual}`);
    }
    failed++;
  }
}

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function checkBase64(
  label: string,
  actualBytes: Uint8Array,
  expectedB64: string,
) {
  const actualB64 = encodeBase64(actualBytes);
  check(
    label,
    actualB64 === expectedB64,
    truncate(expectedB64),
    truncate(actualB64),
  );
}

// ── Main validation ──────────────────────────────────────────────────

async function main() {
  console.log("Apple App Attest - Attestation Object Validation Guide");
  console.log("=".repeat(60));
  console.log();

  // Decode the CBOR attestation object
  const attestationBytes = decodeBase64(ATTESTATION_BASE64);
  const decoded = decodeAttestationCbor(attestationBytes);

  // ── Step 1: Verify x5c certificate chain ──────────────────────────
  console.log(
    "1. Verify x5c contains leaf and intermediate certificates,",
  );
  console.log(
    "   and validate the chain against Apple's root CA.",
  );
  console.log();

  checkBase64(
    "Leaf certificate (credcert)",
    decoded.attStmt.x5c[0],
    EXPECTED_LEAF_CERT_B64,
  );
  checkBase64(
    "Intermediate certificate",
    decoded.attStmt.x5c[1],
    EXPECTED_INTERMEDIATE_CERT_B64,
  );

  // The test vector certs expired April 20, 2024; use a valid date.
  try {
    await verifyCertificateChain(
      decoded.attStmt.x5c,
      new Date("2024-04-18T00:00:00Z"),
    );
    check("Certificate chain validates against Apple root CA", true);
  } catch (e) {
    check(
      "Certificate chain validates against Apple root CA",
      false,
      "valid chain",
      String(e),
    );
  }
  console.log();

  // ── Step 2: Create composite (authData || challenge) ──────────────
  console.log(
    "2. Create clientDataHash and append to authData.",
  );
  console.log();

  const challengeBytes = toBytes(SERVER_CHALLENGE);
  const composite = concat(decoded.authData, challengeBytes);
  checkBase64(
    "Composite (authData || challenge)",
    composite,
    EXPECTED_COMPOSITE_B64,
  );
  console.log();

  // ── Step 3: Compute nonce = SHA-256(composite) ────────────────────
  console.log("3. Compute nonce as SHA-256 of composite.");
  console.log();

  const nonce = new Uint8Array(
    await crypto.subtle.digest("SHA-256", composite),
  );
  checkBase64("Computed nonce", nonce, EXPECTED_NONCE_B64);
  console.log();

  // ── Step 4: Extract nonce from credCert extension OID ─────────────
  console.log(
    "4. Extract nonce from credCert extension OID 1.2.840.113635.100.8.2",
  );
  console.log("   and verify it equals the computed nonce.");
  console.log();

  const certNonce = extractNonceFromCert(decoded.attStmt.x5c[0]);
  checkBase64(
    "Octet string from credCert extension",
    certNonce,
    EXPECTED_CERT_NONCE_B64,
  );
  check(
    "Cert nonce equals computed nonce",
    constantTimeEqual(certNonce, nonce),
  );
  console.log();

  // ── Step 5: Public key hash matches keyId ─────────────────────────
  console.log(
    "5. SHA-256 of credCert public key (X9.62 uncompressed) equals keyId.",
  );
  console.log();

  const publicKeyRaw = await extractPublicKeyFromCert(decoded.attStmt.x5c[0]);
  const publicKeyHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", publicKeyRaw),
  );
  checkBase64(
    "Public key SHA-256 hash",
    publicKeyHash,
    EXPECTED_PUBKEY_HASH_B64,
  );
  console.log();

  // ── Step 6: RP ID hash matches SHA-256(appId) ─────────────────────
  console.log("6. Verify RP ID hash equals SHA-256 of App ID.");
  console.log();

  const authData = parseAttestationAuthData(decoded.authData);
  const appIdHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(APP_ID),
    ),
  );
  checkBase64("SHA-256(App ID)", appIdHash, EXPECTED_APP_ID_HASH_B64);
  checkBase64(
    "RP ID hash from authData",
    authData.rpIdHash,
    EXPECTED_RP_ID_HASH_B64,
  );
  check(
    "RP ID hash equals SHA-256(App ID)",
    constantTimeEqual(authData.rpIdHash, appIdHash),
  );
  console.log();

  // ── Step 7: Counter equals 0 ──────────────────────────────────────
  console.log("7. Verify counter field equals 0.");
  console.log();

  check(
    `Counter = ${authData.signCount}`,
    authData.signCount === EXPECTED_COUNTER,
    String(EXPECTED_COUNTER),
    String(authData.signCount),
  );
  console.log();

  // ── Step 8: AAGUID matches production ─────────────────────────────
  console.log("8. Verify AAGUID matches production environment.");
  console.log();

  check(
    "AAGUID matches production (appattest + 7 null bytes)",
    constantTimeEqual(authData.aaguid, EXPECTED_AAGUID_PRODUCTION),
  );
  check(
    "AAGUID matches library constant AAGUID_PRODUCTION",
    constantTimeEqual(authData.aaguid, AAGUID_PRODUCTION),
  );
  console.log();

  // ── Step 9: credentialId matches keyId ─────────────────────────────
  console.log("9. Verify credentialId equals keyId.");
  console.log();

  checkBase64(
    "credentialId from authData",
    authData.credentialId,
    EXPECTED_CREDENTIAL_ID_B64,
  );
  check(
    "credentialId equals decoded keyId",
    constantTimeEqual(authData.credentialId, decodeBase64(KEY_ID)),
  );
  console.log();

  // ── Summary ────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log(
    `Results: ${passed} passed, ${failed} failed out of ${
      passed + failed
    } checks`,
  );

  if (failed > 0) {
    Deno.exit(1);
  }
}

main();
