// tests/attestation-entry.test.ts
import { assertEquals } from "@std/assert";

Deno.test("attestation entry point exports verifyAttestation", async () => {
  const mod = await import("../attestation.ts");
  assertEquals(typeof mod.verifyAttestation, "function");
});

Deno.test("attestation entry point exports AttestationError", async () => {
  const mod = await import("../attestation.ts");
  assertEquals(typeof mod.AttestationError, "function");
});

Deno.test("attestation entry point exports AttestationErrorCode", async () => {
  const mod = await import("../attestation.ts");
  assertEquals(typeof mod.AttestationErrorCode, "object");
});
