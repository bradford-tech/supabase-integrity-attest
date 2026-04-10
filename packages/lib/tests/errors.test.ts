// tests/errors.test.ts
import { assertEquals, assertIsError } from "@std/assert";
import {
  AssertionError,
  AssertionErrorCode,
  AttestationError,
  AttestationErrorCode,
} from "../src/errors.ts";

Deno.test("AttestationError has correct code and message", () => {
  const err = new AttestationError(
    AttestationErrorCode.NONCE_MISMATCH,
    "Computed nonce does not match certificate nonce",
  );
  assertIsError(err, AttestationError);
  assertEquals(err.code, "NONCE_MISMATCH");
  assertEquals(err.message, "Computed nonce does not match certificate nonce");
  assertEquals(err.name, "AttestationError");
});

Deno.test("AssertionError has correct code and message", () => {
  const err = new AssertionError(
    AssertionErrorCode.SIGNATURE_INVALID,
    "ECDSA signature verification failed",
  );
  assertIsError(err, AssertionError);
  assertEquals(err.code, "SIGNATURE_INVALID");
  assertEquals(err.message, "ECDSA signature verification failed");
  assertEquals(err.name, "AssertionError");
});

Deno.test("AttestationErrorCode has all expected values", () => {
  const codes: string[] = Object.values(AttestationErrorCode);
  assertEquals(codes.includes("INVALID_FORMAT"), true);
  assertEquals(codes.includes("INVALID_CERTIFICATE_CHAIN"), true);
  assertEquals(codes.includes("NONCE_MISMATCH"), true);
  assertEquals(codes.includes("RP_ID_MISMATCH"), true);
  assertEquals(codes.includes("KEY_ID_MISMATCH"), true);
  assertEquals(codes.includes("INVALID_COUNTER"), true);
  assertEquals(codes.includes("INVALID_AAGUID"), true);
  assertEquals(codes.includes("CHALLENGE_INVALID"), true);
  assertEquals(codes.includes("INTERNAL_ERROR"), true);
});

Deno.test("AssertionErrorCode has all expected values", () => {
  const codes: string[] = Object.values(AssertionErrorCode);
  assertEquals(codes.includes("INVALID_FORMAT"), true);
  assertEquals(codes.includes("RP_ID_MISMATCH"), true);
  assertEquals(codes.includes("COUNTER_NOT_INCREMENTED"), true);
  assertEquals(codes.includes("SIGNATURE_INVALID"), true);
  assertEquals(codes.includes("SIGN_COUNT_STALE"), true);
});

Deno.test("AssertionErrorCode has wrapper error codes", () => {
  const codes: string[] = Object.values(AssertionErrorCode);
  assertEquals(codes.includes("DEVICE_NOT_FOUND"), true);
  assertEquals(codes.includes("INTERNAL_ERROR"), true);
});

Deno.test("AssertionError supports cause option", () => {
  const cause = new Error("db connection failed");
  const err = new AssertionError(
    AssertionErrorCode.INTERNAL_ERROR,
    "Storage callback failed",
    { cause },
  );
  assertIsError(err, AssertionError);
  assertEquals(err.code, "INTERNAL_ERROR");
  assertEquals(err.cause, cause);
});

Deno.test("AttestationError supports cause option", () => {
  const cause = new Error("db connection failed");
  const err = new AttestationError(
    AttestationErrorCode.INTERNAL_ERROR,
    "storeDeviceKey callback failed",
    { cause },
  );
  assertIsError(err, AttestationError);
  assertEquals(err.code, "INTERNAL_ERROR");
  assertEquals(err.cause, cause);
});
