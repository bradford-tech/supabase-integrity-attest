// src/attestation.ts

import { decodeBase64 } from "@std/encoding/base64";
import {
  extractNonceFromCert,
  extractPublicKeyFromCert,
  verifyCertificateChain,
} from "./certificate.ts";
import { AAGUID_DEVELOPMENT, AAGUID_PRODUCTION } from "./constants.ts";
import { AttestationError, AttestationErrorCode } from "./errors.ts";
import { parseAttestationAuthData } from "./authdata.ts";
import { concat, constantTimeEqual, exportKeyToPem, toBytes } from "./utils.ts";

export interface AppInfo {
  appId: string;
  developmentEnv?: boolean;
}

export interface AttestationResult {
  publicKeyPem: string;
  receipt: Uint8Array;
  signCount: number;
}

export interface VerifyAttestationOptions {
  /** Override date for certificate chain validation (for testing with expired certs) */
  checkDate?: Date;
}

/**
 * Minimal CBOR decoder for Apple App Attest attestation objects.
 *
 * Apple's CBOR encoding of the attestation object contains a receipt field whose
 * byte-string length header is sometimes incorrect (overstated by ~21 bytes).
 * Standard CBOR libraries (cborg) fail to decode this. We use a lightweight
 * structure-aware parser that handles the known attestation object layout:
 *   { "fmt": text, "attStmt": { "x5c": [bstr, ...], "receipt": bstr }, "authData": bstr }
 *
 * The parser locates map keys by scanning for known text-string CBOR keys and
 * extracts values based on their CBOR type headers, which avoids relying on
 * potentially incorrect length fields for opaque byte-string values.
 */
interface AttestationCbor {
  fmt: string;
  attStmt: {
    x5c: Uint8Array[];
    receipt: Uint8Array;
  };
  authData: Uint8Array;
}

/** Read a CBOR unsigned integer (additional info + following bytes). */
function readCborUint(
  data: Uint8Array,
  offset: number,
): { value: number; end: number } {
  const additional = data[offset] & 0x1f;
  if (additional < 24) return { value: additional, end: offset + 1 };
  if (additional === 24) return { value: data[offset + 1], end: offset + 2 };
  if (additional === 25) {
    return {
      value: (data[offset + 1] << 8) | data[offset + 2],
      end: offset + 3,
    };
  }
  if (additional === 26) {
    return {
      value: ((data[offset + 1] << 24) >>> 0) +
        (data[offset + 2] << 16) +
        (data[offset + 3] << 8) +
        data[offset + 4],
      end: offset + 5,
    };
  }
  throw new Error(`Unsupported CBOR additional info: ${additional}`);
}

/** Read a CBOR text string starting at offset. Returns {value, end}. */
function readCborText(
  data: Uint8Array,
  offset: number,
): { value: string; end: number } {
  const majorType = (data[offset] >> 5) & 0x07;
  if (majorType !== 3) {
    throw new Error(
      `Expected CBOR text string (type 3) at offset ${offset}, got type ${majorType}`,
    );
  }
  const { value: len, end: dataStart } = readCborUint(data, offset);
  const text = new TextDecoder().decode(data.slice(dataStart, dataStart + len));
  return { value: text, end: dataStart + len };
}

/** Read a CBOR byte string starting at offset. Returns {value, end}. */
function readCborBytes(
  data: Uint8Array,
  offset: number,
): { value: Uint8Array; end: number } {
  const majorType = (data[offset] >> 5) & 0x07;
  if (majorType !== 2) {
    throw new Error(
      `Expected CBOR byte string (type 2) at offset ${offset}, got type ${majorType}`,
    );
  }
  const { value: len, end: dataStart } = readCborUint(data, offset);
  return {
    value: data.slice(dataStart, dataStart + len),
    end: dataStart + len,
  };
}

/**
 * Find the position of a CBOR text-string key within a byte sequence.
 * Searches for the CBOR encoding of a text string (type 3 header + UTF-8 bytes).
 */
function findCborTextKey(
  data: Uint8Array,
  key: string,
  startOffset: number,
): number {
  const keyBytes = new TextEncoder().encode(key);
  // Build the expected CBOR encoding: type 3 header + key bytes
  let header: Uint8Array;
  if (keyBytes.length < 24) {
    header = new Uint8Array([0x60 | keyBytes.length]);
  } else if (keyBytes.length < 256) {
    header = new Uint8Array([0x78, keyBytes.length]);
  } else {
    header = new Uint8Array([
      0x79,
      keyBytes.length >> 8,
      keyBytes.length & 0xff,
    ]);
  }
  const needle = new Uint8Array(header.length + keyBytes.length);
  needle.set(header);
  needle.set(keyBytes, header.length);

  for (let i = startOffset; i <= data.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (data[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

function decodeAttestationCbor(data: Uint8Array): AttestationCbor {
  // Verify top-level is a CBOR map
  const majorType = (data[0] >> 5) & 0x07;
  if (majorType !== 5) {
    throw new Error("Expected CBOR map at top level");
  }

  // Find "fmt" key and read its value
  const fmtKeyPos = findCborTextKey(data, "fmt", 0);
  if (fmtKeyPos === -1) throw new Error('Missing "fmt" key');
  const fmtKeyEnd = fmtKeyPos + 1 + 3; // 0x63 + "fmt"
  const { value: fmt } = readCborText(data, fmtKeyEnd);

  // Find "attStmt" key
  const attStmtKeyPos = findCborTextKey(data, "attStmt", 0);
  if (attStmtKeyPos === -1) throw new Error('Missing "attStmt" key');
  // After "attStmt" key: 0x67 + "attStmt" = 8 bytes
  const attStmtValuePos = attStmtKeyPos + 8;

  // attStmt value should be a map
  const attStmtMajor = (data[attStmtValuePos] >> 5) & 0x07;
  if (attStmtMajor !== 5) throw new Error("attStmt is not a CBOR map");

  // Find "x5c" key within attStmt
  const x5cKeyPos = findCborTextKey(data, "x5c", attStmtValuePos);
  if (x5cKeyPos === -1) throw new Error('Missing "x5c" key in attStmt');
  const x5cValuePos = x5cKeyPos + 4; // 0x63 + "x5c"

  // x5c value is an array
  const x5cMajor = (data[x5cValuePos] >> 5) & 0x07;
  if (x5cMajor !== 4) throw new Error("x5c is not a CBOR array");
  const { value: x5cCount, end: x5cFirstItemPos } = readCborUint(
    data,
    x5cValuePos,
  );

  // Read each certificate byte string
  const x5c: Uint8Array[] = [];
  let pos = x5cFirstItemPos;
  for (let i = 0; i < x5cCount; i++) {
    const { value: cert, end } = readCborBytes(data, pos);
    x5c.push(cert);
    pos = end;
  }

  // After x5c, find "receipt" key
  const receiptKeyPos = findCborTextKey(data, "receipt", pos);
  if (receiptKeyPos === -1) throw new Error('Missing "receipt" key in attStmt');

  // Find "authData" key - search from after the receipt key position
  const authDataKeyPos = findCborTextKey(data, "authData", receiptKeyPos);
  if (authDataKeyPos === -1) {
    throw new Error('Missing "authData" key');
  }

  // The receipt value is the bytes between the receipt key end and the authData key start.
  // Receipt key: 0x67 + "receipt" = 8 bytes
  const receiptValueStart = receiptKeyPos + 8;
  // Read the receipt CBOR header to get the data start offset
  const receiptMajor = (data[receiptValueStart] >> 5) & 0x07;
  if (receiptMajor !== 2) throw new Error("receipt is not a CBOR byte string");
  const { end: receiptDataStart } = readCborUint(data, receiptValueStart);

  // The actual receipt data extends to just before the authData key.
  // This handles the case where Apple's CBOR length header is incorrect.
  const receipt = data.slice(receiptDataStart, authDataKeyPos);

  // Read authData value
  // authData key: 0x68 + "authData" = 9 bytes
  const authDataValuePos = authDataKeyPos + 9;
  const { value: authData } = readCborBytes(data, authDataValuePos);

  return { fmt, attStmt: { x5c, receipt }, authData };
}

export async function verifyAttestation(
  appInfo: AppInfo,
  keyId: string,
  challenge: Uint8Array | string,
  attestation: Uint8Array | string,
  options?: VerifyAttestationOptions,
): Promise<AttestationResult> {
  // Decode attestation bytes from base64 if string
  let attestationBytes: Uint8Array;
  if (typeof attestation === "string") {
    try {
      attestationBytes = decodeBase64(attestation);
    } catch {
      throw new AttestationError(
        AttestationErrorCode.INVALID_FORMAT,
        "Failed to decode attestation base64",
      );
    }
  } else {
    attestationBytes = attestation;
  }

  // Step 1: CBOR decode attestation -> { fmt, attStmt: { x5c, receipt }, authData }
  let decoded: AttestationCbor;
  try {
    decoded = decodeAttestationCbor(attestationBytes);
  } catch {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "Failed to CBOR-decode attestation object",
    );
  }

  // Step 2: Validate fmt === "apple-appattest"
  if (decoded.fmt !== "apple-appattest") {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      `Invalid attestation format: expected "apple-appattest", got "${decoded.fmt}"`,
    );
  }

  const { x5c, receipt } = decoded.attStmt;
  const authData = decoded.authData;

  // Step 3: Verify x5c cert chain exists (length >= 2)
  if (x5c.length < 2) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      "Certificate chain (x5c) must contain at least 2 certificates",
    );
  }

  // Step 4: Verify certificate chain
  await verifyCertificateChain(x5c, options?.checkDate);

  // Step 5-6: Compute nonce = SHA-256(authData || challenge)
  // Apple's nonce verification uses the raw challenge bytes concatenated with authData,
  // NOT a hash of the challenge.
  const challengeBytes = toBytes(challenge);
  const nonceInput = concat(authData, challengeBytes);
  const computedNonce = new Uint8Array(
    await crypto.subtle.digest("SHA-256", nonceInput),
  );

  // Step 7: Extract nonce from leaf cert
  const certNonce = extractNonceFromCert(x5c[0]);

  // Step 8: constantTimeEqual(computedNonce, certNonce)
  if (!constantTimeEqual(computedNonce, certNonce)) {
    throw new AttestationError(
      AttestationErrorCode.NONCE_MISMATCH,
      "Computed nonce does not match certificate nonce",
    );
  }

  // Step 9: Extract public key from leaf cert (65 bytes raw)
  const publicKeyRaw = await extractPublicKeyFromCert(x5c[0]);

  // Step 10: SHA-256(publicKeyRaw) must equal base64-decoded keyId
  const publicKeyHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", publicKeyRaw),
  );
  const keyIdBytes = decodeBase64(keyId);
  if (!constantTimeEqual(publicKeyHash, keyIdBytes)) {
    throw new AttestationError(
      AttestationErrorCode.KEY_ID_MISMATCH,
      "Public key hash does not match keyId",
    );
  }

  // Step 11: Parse authData
  const parsedAuthData = parseAttestationAuthData(authData);

  // Step 12: Verify rpIdHash === SHA-256(appId)
  const appIdHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(appInfo.appId),
    ),
  );
  if (!constantTimeEqual(parsedAuthData.rpIdHash, appIdHash)) {
    throw new AttestationError(
      AttestationErrorCode.RP_ID_MISMATCH,
      "RP ID hash does not match SHA-256 of appId",
    );
  }

  // Step 13: Verify signCount === 0
  if (parsedAuthData.signCount !== 0) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_COUNTER,
      `Expected signCount 0 for attestation, got ${parsedAuthData.signCount}`,
    );
  }

  // Step 14: Verify AAGUID matches expected (prod or dev)
  const expectedAaguid = appInfo.developmentEnv
    ? AAGUID_DEVELOPMENT
    : AAGUID_PRODUCTION;
  if (!constantTimeEqual(parsedAuthData.aaguid, expectedAaguid)) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_AAGUID,
      `AAGUID mismatch: expected ${
        appInfo.developmentEnv ? "development" : "production"
      } environment`,
    );
  }

  // Step 15: Verify credentialId === keyIdBytes
  if (!constantTimeEqual(parsedAuthData.credentialId, keyIdBytes)) {
    throw new AttestationError(
      AttestationErrorCode.KEY_ID_MISMATCH,
      "Credential ID does not match keyId",
    );
  }

  // Step 16: Export public key as PEM
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    publicKeyRaw,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const publicKeyPem = await exportKeyToPem(cryptoKey);

  // Step 17: Return result
  return {
    publicKeyPem,
    receipt,
    signCount: 0,
  };
}
