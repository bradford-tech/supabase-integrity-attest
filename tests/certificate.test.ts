// tests/certificate.test.ts
import { assertEquals, assertRejects } from "@std/assert";
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";
import {
  extractNonceFromCert,
  extractPublicKeyFromCert,
  verifyCertificateChain,
} from "../src/certificate.ts";

// Pre-extracted DER certificates from the Apple attestation test vector.
// Leaf cert (index 0) — expires April 20, 2024.
const LEAF_CERT_DER_BASE64 =
  "MIIDsjCCAzmgAwIBAgIGAY7x/U1KMAoGCCqGSM49BAMCME8xIzAhBgNVBAMMGkFwcGxlIEFwcCBBdHRlc3RhdGlvbiBDQSAxMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMB4XDTI0MDQxNzE2MTQ1M1oXDTI0MDQyMDE2MTQ1M1owgZExSTBHBgNVBAMMQDZkMmFjNDg0NWYxMzIzMzIyZjU5MjNmMGJkOWQyMmRiZTUwZTA2YjdiODAxMjFmY2UyYjJiNWU2NmU5ZTk4ZDYxGjAYBgNVBAsMEUFBQSBDZXJ0aWZpY2F0aW9uMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEjC4Mq2+SI5cOf1q26S/XpNbWIaYOVIZEvxl2TvHvhTYR9sK2u1Oyu6LTRoGX5L6rLDbKwOTiT0HzUTLJR15cJKOCAbwwggG4MAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgTwMIGIBgkqhkiG92NkCAUEezB5pAMCAQq/iTADAgEBv4kxAwIBAL+JMgMCAQG/iTMDAgEBv4k0KQQnMDM1MjE4NzM5MS5jb20uYXBwbGUuZXhhbXBsZV9hcHBfYXR0ZXN0pQYEBHNrcyC/iTYDAgEFv4k3AwIBAL+JOQMCAQC/iToDAgEAv4k7AwIBADCB1wYJKoZIhvdjZAgHBIHJMIHGv4p4BgQEMTguML+IUAcCBQD/////v4p7CQQHMjJBMjQ0Yr+KfAYEBDE4LjC/in0GBAQxOC4wv4p+AwIBAL+KfwMCAQC/iwADAgEAv4sBAwIBAL+LAgMCAQC/iwMDAgEAv4sEAwIBAb+LBQMCAQC/iwoQBA4yMi4xLjI0NC4wLjIsML+LCxAEDjIyLjEuMjQ0LjAuMiwwv4sMEAQOMjIuMS4yNDQuMC4yLDC/iAIKBAhpcGhvbmVvc7+IBQoECEludGVybmFsMDMGCSqGSIb3Y2QIAgQmMCShIgQg+20WKnF+yrF3iQBQb6lNZ+4MHcPUWxLN3oG+/Fblt+swCgYIKoZIzj0EAwIDZwAwZAIwIk4vHloC64CyG7xk6mEC2wNk4hFv+CryBxCTirG4ZOdRgu0CrvFuj3zQEmtLDUe2AjACi2YebCyyzhd8AwH1hvLgIrpmMj2AJiy0is9Z5OLDYkz9BNUX0IBWGJlewqdr2iU=";

// Intermediate cert (index 1) — Apple App Attestation CA 1.
const INTERMEDIATE_CERT_DER_BASE64 =
  "MIICQzCCAcigAwIBAgIQCbrF4bxAGtnUU5W8OBoIVDAKBggqhkjOPQQDAzBSMSYwJAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwKQXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODM5NTVaFw0zMDAzMTMwMDAwMDBaME8xIzAhBgNVBAMMGkFwcGxlIEFwcCBBdHRlc3RhdGlvbiBDQSAxMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAErls3oHdNebI1j0Dn0fImJvHCX+8XgC3qs4JqWYdP+NKtFSV4mqJmBBkSSLY8uWcGnpjTY71eNw+/oI4ynoBzqYXndG6jWaL2bynbMq9FXiEWWNVnr54mfrJhTcIaZs6Zo2YwZDASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1UdIwQYMBaAFKyREFMzvb5oQf+nDKnl+url5YqhMB0GA1UdDgQWBBQ+410cBBmpybQx+IR01uHhV3LjmzAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwMDaQAwZgIxALu+iI1zjQUCz7z9Zm0JV1A1vNaHLD+EMEkmKe3R+RToeZkcmui1rvjTqFQz97YNBgIxAKs47dDMge0ApFLDukT5k2NlU/7MKX8utN+fXr5aSsq2mVxLgg35BDhveAe7WJQ5tw==";

/** Build x5c array from pre-extracted DER certificates. */
function getX5c(): Uint8Array[] {
  return [
    decodeBase64(LEAF_CERT_DER_BASE64),
    decodeBase64(INTERMEDIATE_CERT_DER_BASE64),
  ];
}

// Use a date before the leaf cert expired (April 20, 2024)
const CHECK_DATE = new Date("2024-04-18T00:00:00Z");

Deno.test("verifyCertificateChain succeeds with valid x5c and check date", async () => {
  const x5c = getX5c();
  // Should not throw
  await verifyCertificateChain(x5c, CHECK_DATE);
});

Deno.test("verifyCertificateChain rejects empty certificate array", async () => {
  await assertRejects(
    () => verifyCertificateChain([], CHECK_DATE),
    Error,
  );
});

Deno.test("extractNonceFromCert returns the expected nonce", () => {
  const x5c = getX5c();
  const nonce = extractNonceFromCert(x5c[0]);
  const expectedBase64 = "+20WKnF+yrF3iQBQb6lNZ+4MHcPUWxLN3oG+/Fblt+s=";
  assertEquals(encodeBase64(nonce), expectedBase64);
});

Deno.test("extractPublicKeyFromCert returns 65-byte uncompressed point", async () => {
  const x5c = getX5c();
  const pubKey = await extractPublicKeyFromCert(x5c[0]);
  assertEquals(pubKey.length, 65);
  assertEquals(pubKey[0], 0x04);
});

Deno.test("SHA-256 of extracted public key matches credentialId derivation", async () => {
  const x5c = getX5c();
  const pubKey = await extractPublicKeyFromCert(x5c[0]);
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", pubKey),
  );
  const expectedBase64 = "bSrEhF8TIzIvWSPwvZ0i2+UOBre4ASH84rK15m6emNY=";
  assertEquals(encodeBase64(hash), expectedBase64);
});
