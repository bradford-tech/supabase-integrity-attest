// src/assertion.ts
import { decode } from "cborg";
import { parseAssertionAuthData } from "./authdata.ts";
import { derToRaw } from "./der.ts";
import { AssertionError, AssertionErrorCode } from "./errors.ts";
import {
  concat,
  constantTimeEqual,
  decodeBase64Bytes,
  importPemPublicKey,
  toBytes,
} from "./utils.ts";

/** Identifies the app whose assertions are being verified. */
export interface AppInfo {
  /** Apple App ID in the format `TEAMID.bundleId`. */
  appId: string;
  /** Set to `true` when verifying assertions from the development environment. */
  developmentEnv?: boolean;
}

/** Successful assertion verification result. */
export interface AssertionResult {
  /** Updated sign count to persist for the next assertion. */
  signCount: number;
}

/**
 * Verify an Apple App Attest assertion.
 *
 * Validates the CBOR-encoded assertion against the expected app ID,
 * checks the monotonic sign counter, and verifies the ECDSA signature
 * using the device's public key.
 *
 * @throws {AssertionError} If any verification step fails.
 */
export async function verifyAssertion(
  appInfo: AppInfo,
  assertion: Uint8Array | string,
  clientData: Uint8Array | string,
  publicKeyPem: string,
  previousSignCount: number,
): Promise<AssertionResult> {
  let assertionBytes: Uint8Array;
  try {
    assertionBytes = decodeBase64Bytes(assertion);
  } catch {
    throw new AssertionError(
      AssertionErrorCode.INVALID_FORMAT,
      "Invalid base64-encoded assertion",
    );
  }
  const clientDataBytes = toBytes(clientData);

  // Step 1: CBOR decode
  let decoded: { signature: Uint8Array; authenticatorData: Uint8Array };
  try {
    decoded = decode(assertionBytes) as typeof decoded;
    if (!decoded.signature || !decoded.authenticatorData) {
      throw new Error("Missing required fields");
    }
  } catch (e) {
    throw new AssertionError(
      AssertionErrorCode.INVALID_FORMAT,
      `Failed to decode assertion: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  // Step 2: Parse authenticatorData
  let authData;
  try {
    authData = parseAssertionAuthData(decoded.authenticatorData);
  } catch (e) {
    throw new AssertionError(
      AssertionErrorCode.INVALID_FORMAT,
      `Invalid authenticatorData: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  // Step 3: Verify rpIdHash
  const expectedRpIdHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(appInfo.appId),
    ),
  );
  if (!constantTimeEqual(authData.rpIdHash, expectedRpIdHash)) {
    throw new AssertionError(
      AssertionErrorCode.RP_ID_MISMATCH,
      "rpIdHash does not match expected appId",
    );
  }

  // Step 4: Verify counter
  if (authData.signCount <= previousSignCount) {
    throw new AssertionError(
      AssertionErrorCode.COUNTER_NOT_INCREMENTED,
      `signCount ${authData.signCount} is not greater than previous ${previousSignCount}`,
    );
  }

  // Step 5: Compute clientDataHash
  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", clientDataBytes),
  );

  // Step 6: Compute nonce = SHA-256(authenticatorData || clientDataHash)
  // Apple signs this nonce as the message to ES256 (not authData || clientDataHash directly)
  const nonce = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      concat(decoded.authenticatorData, clientDataHash),
    ),
  );

  // Step 7: Convert DER signature to raw r||s
  let signatureRaw: Uint8Array;
  try {
    signatureRaw = derToRaw(decoded.signature);
  } catch (e) {
    throw new AssertionError(
      AssertionErrorCode.INVALID_FORMAT,
      `Invalid DER signature: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Step 8: Import PEM public key
  let publicKey: CryptoKey;
  try {
    publicKey = await importPemPublicKey(publicKeyPem);
  } catch (e) {
    throw new AssertionError(
      AssertionErrorCode.INVALID_FORMAT,
      `Invalid public key PEM: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Step 9: Verify ECDSA signature over nonce
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signatureRaw,
    nonce,
  );

  if (!valid) {
    throw new AssertionError(
      AssertionErrorCode.SIGNATURE_INVALID,
      "ECDSA signature verification failed",
    );
  }

  return { signCount: authData.signCount };
}
