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

export interface AppInfo {
  appId: string;
  developmentEnv?: boolean;
}

export interface AssertionResult {
  signCount: number;
}

export async function verifyAssertion(
  appInfo: AppInfo,
  assertion: Uint8Array | string,
  clientData: Uint8Array | string,
  publicKeyPem: string,
  previousSignCount: number,
): Promise<AssertionResult> {
  const assertionBytes = decodeBase64Bytes(assertion);
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

  // Step 6: Build message = authenticatorData || clientDataHash
  const message = concat(decoded.authenticatorData, clientDataHash);

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

  // Step 9: Verify ECDSA signature
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signatureRaw,
    message,
  );

  if (!valid) {
    throw new AssertionError(
      AssertionErrorCode.SIGNATURE_INVALID,
      "ECDSA signature verification failed",
    );
  }

  return { signCount: authData.signCount };
}
