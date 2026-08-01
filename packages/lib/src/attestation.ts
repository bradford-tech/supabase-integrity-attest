// src/attestation.ts

import { decodeBase64 } from "@std/encoding/base64";
import {
  extractNonceFromCert,
  extractPublicKeyFromCert,
  verifyCertificateChain,
} from "./certificate.ts";
import { AAGUID_DEVELOPMENT, AAGUID_PRODUCTION } from "./constants.ts";
import { AttestationError, AttestationErrorCode } from "./errors.ts";
import {
  type AttestationAuthData,
  parseAttestationAuthData,
} from "./authdata.ts";
import { concat, constantTimeEqual, exportKeyToPem, toBytes } from "./utils.ts";

/** Identifies the app being attested. */
export interface AppInfo {
  /** Apple App ID in the format `TEAMID.bundleId`. */
  appId: string;
  /** Set to `true` when verifying attestations from the development environment. */
  developmentEnv?: boolean;
}

/** Successful attestation verification result. */
export interface AttestationResult {
  /** PEM-encoded ECDSA P-256 public key extracted from the attestation. */
  publicKeyPem: string;
  /** Raw App Attest receipt bytes for server-side refresh. */
  receipt: Uint8Array;
  /** Initial sign count (always `0` for attestation). */
  signCount: number;
}

/** Options for {@linkcode verifyAttestation}. */
export interface VerifyAttestationOptions {
  /** Override date for certificate chain validation (for testing with expired certs). */
  checkDate?: Date;
}

/**
 * Minimal CBOR decoder for Apple App Attest attestation objects.
 *
 * Apple's CBOR encoding of the attestation object contains a receipt field whose
 * byte-string length header is sometimes incorrect (overstated by ~21 bytes).
 * Standard CBOR libraries (cborg) fail to decode this. We use a strict
 * structural parser for the known attestation object layout:
 *   { "fmt": text, "attStmt": { "x5c": [bstr, ...], "receipt": bstr }, "authData": bstr }
 *
 * The parser walks the maps entry by entry with bounds-checked headers,
 * accepting keys in any order and rejecting duplicates, unknown keys,
 * indefinite lengths, and trailing bytes. The single tolerated
 * malformation is the overstated receipt length, repaired in one
 * documented code path ({@linkcode readReceiptWithRepair}).
 */
export interface AttestationCbor {
  fmt: string;
  attStmt: {
    x5c: Uint8Array[];
    receipt: Uint8Array;
  };
  authData: Uint8Array;
}

interface CborHead {
  majorType: number;
  value: number;
  end: number;
}

/**
 * Read any CBOR data-item header with bounds checking. Handles
 * additional-info 0-27 (8-byte lengths via BigInt, rejected when the value
 * exceeds Number.MAX_SAFE_INTEGER); rejects indefinite lengths (31) and
 * reserved values (28-30).
 */
function readCborHead(data: Uint8Array, offset: number): CborHead {
  if (offset >= data.length) {
    throw new Error("CBOR: offset past end of input");
  }
  const initial = data[offset];
  const majorType = (initial >> 5) & 0x07;
  const additional = initial & 0x1f;
  if (additional < 24) {
    return { majorType, value: additional, end: offset + 1 };
  }
  const lengthBytes = additional === 24
    ? 1
    : additional === 25
    ? 2
    : additional === 26
    ? 4
    : additional === 27
    ? 8
    : -1;
  if (lengthBytes === -1) {
    throw new Error(`CBOR: unsupported additional info ${additional}`);
  }
  if (offset + 1 + lengthBytes > data.length) {
    throw new Error("CBOR: length bytes past end of input");
  }
  let value = 0n;
  for (let i = 0; i < lengthBytes; i++) {
    value = (value << 8n) | BigInt(data[offset + 1 + i]);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("CBOR: length exceeds safe integer range");
  }
  return { majorType, value: Number(value), end: offset + 1 + lengthBytes };
}

/** Read a CBOR text string at offset, bounds-checked. */
function readCborText(
  data: Uint8Array,
  offset: number,
): { value: string; end: number } {
  const head = readCborHead(data, offset);
  if (head.majorType !== 3) {
    throw new Error(
      `CBOR: expected text string at offset ${offset}, got major type ${head.majorType}`,
    );
  }
  if (head.end + head.value > data.length) {
    throw new Error("CBOR: text string overruns input");
  }
  return {
    value: new TextDecoder().decode(
      data.slice(head.end, head.end + head.value),
    ),
    end: head.end + head.value,
  };
}

/** Read a CBOR byte string at offset, bounds-checked. */
function readCborBytes(
  data: Uint8Array,
  offset: number,
): { value: Uint8Array; end: number } {
  const head = readCborHead(data, offset);
  if (head.majorType !== 2) {
    throw new Error(
      `CBOR: expected byte string at offset ${offset}, got major type ${head.majorType}`,
    );
  }
  if (head.end + head.value > data.length) {
    throw new Error("CBOR: byte string overruns input");
  }
  return {
    value: data.slice(head.end, head.end + head.value),
    end: head.end + head.value,
  };
}

/** The canonical CBOR encoding of a short text-string key. */
function encodeCborTextKey(key: string): Uint8Array {
  const bytes = new TextEncoder().encode(key);
  const out = new Uint8Array(1 + bytes.length);
  out[0] = 0x60 | bytes.length; // all keys used here are < 24 bytes
  out.set(bytes, 1);
  return out;
}

function bytesStartWith(
  data: Uint8Array,
  offset: number,
  prefix: Uint8Array,
): boolean {
  if (offset + prefix.length > data.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (data[offset + i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Read the receipt byte string, tolerating Apple's overstated length header.
 *
 * Apple's CBOR encoding sometimes overstates the receipt length by ~21
 * bytes; standard decoders fail on it. Strategy: trust the declared length
 * when the parse position after it lands exactly on a valid continuation
 * (the encoding of one of `nextKeys`, or end-of-input when no keys remain).
 * Otherwise scan BACKWARD from the declared end for the nearest position
 * where an expected key begins — the smallest correction wins, and scanning
 * only engages when the declared length is provably wrong, so key bytes
 * embedded inside an honestly-sized receipt can never truncate it.
 */
function readReceiptWithRepair(
  data: Uint8Array,
  offset: number,
  nextKeys: string[],
): { value: Uint8Array; end: number } {
  const head = readCborHead(data, offset);
  if (head.majorType !== 2) {
    throw new Error("CBOR: receipt is not a byte string");
  }
  const declaredEnd = head.end + head.value;
  const needles = nextKeys.map(encodeCborTextKey);
  const continuesValidly = (end: number): boolean => {
    if (end > data.length) return false;
    if (needles.length === 0) return end === data.length;
    return needles.some((n) => bytesStartWith(data, end, n));
  };
  if (continuesValidly(declaredEnd)) {
    return { value: data.slice(head.end, declaredEnd), end: declaredEnd };
  }
  if (needles.length === 0) {
    // Receipt is the final item: the rest of the buffer is the receipt.
    return { value: data.slice(head.end), end: data.length };
  }
  const scanStart = Math.min(declaredEnd, data.length);
  for (let end = scanStart; end >= head.end; end--) {
    if (needles.some((n) => bytesStartWith(data, end, n))) {
      return { value: data.slice(head.end, end), end };
    }
  }
  throw new Error("CBOR: cannot locate end of receipt");
}

/** Read the attStmt map: exactly x5c + receipt, any order. */
function readAttStmt(
  data: Uint8Array,
  offset: number,
  keysAfterAttStmt: string[],
): { value: AttestationCbor["attStmt"]; end: number } {
  const head = readCborHead(data, offset);
  if (head.majorType !== 5) throw new Error("CBOR: attStmt is not a map");
  if (head.value !== 2) {
    throw new Error(`CBOR: attStmt must have 2 entries, has ${head.value}`);
  }
  let x5c: Uint8Array[] | undefined;
  let receipt: Uint8Array | undefined;
  let pos = head.end;
  for (let entry = 0; entry < 2; entry++) {
    const { value: key, end: keyEnd } = readCborText(data, pos);
    if (key === "x5c") {
      if (x5c) throw new Error('CBOR: duplicate "x5c" key');
      const arrHead = readCborHead(data, keyEnd);
      if (arrHead.majorType !== 4) throw new Error("CBOR: x5c is not an array");
      const certs: Uint8Array[] = [];
      let p = arrHead.end;
      for (let i = 0; i < arrHead.value; i++) {
        const cert = readCborBytes(data, p);
        certs.push(cert.value);
        p = cert.end;
      }
      x5c = certs;
      pos = p;
    } else if (key === "receipt") {
      if (receipt) throw new Error('CBOR: duplicate "receipt" key');
      // What must follow the receipt: the sibling key if it hasn't been
      // read yet, otherwise whatever top-level keys follow attStmt.
      const nextKeys = entry === 0 ? ["x5c"] : keysAfterAttStmt;
      const r = readReceiptWithRepair(data, keyEnd, nextKeys);
      receipt = r.value;
      pos = r.end;
    } else {
      throw new Error(`CBOR: unexpected attStmt key "${key}"`);
    }
  }
  return { value: { x5c: x5c!, receipt: receipt! }, end: pos };
}

/**
 * Decode an Apple App Attest attestation object from raw CBOR bytes.
 *
 * Strict structural walk: the top-level map must contain exactly
 * fmt/attStmt/authData (any order) and attStmt exactly x5c/receipt (any
 * order); duplicate keys, unknown keys, indefinite lengths, and trailing
 * bytes are rejected. The single tolerated malformation is Apple's
 * overstated receipt length — see {@linkcode readReceiptWithRepair}.
 *
 * @throws {AttestationError} with code `INVALID_FORMAT` if the data is not
 *   a valid attestation CBOR structure.
 */
export function decodeAttestationCbor(data: Uint8Array): AttestationCbor {
  try {
    const top = readCborHead(data, 0);
    if (top.majorType !== 5) throw new Error("CBOR: top level is not a map");
    if (top.value !== 3) {
      throw new Error(
        `CBOR: top-level map must have 3 entries, has ${top.value}`,
      );
    }
    let fmt: string | undefined;
    let attStmt: AttestationCbor["attStmt"] | undefined;
    let authData: Uint8Array | undefined;
    const seen = new Set<string>();
    let pos = top.end;
    for (let entry = 0; entry < 3; entry++) {
      const { value: key, end: keyEnd } = readCborText(data, pos);
      if (seen.has(key)) throw new Error(`CBOR: duplicate key "${key}"`);
      seen.add(key);
      if (key === "fmt") {
        const r = readCborText(data, keyEnd);
        fmt = r.value;
        pos = r.end;
      } else if (key === "authData") {
        const r = readCborBytes(data, keyEnd);
        authData = r.value;
        pos = r.end;
      } else if (key === "attStmt") {
        const remaining = ["fmt", "authData"].filter((k) => !seen.has(k));
        const r = readAttStmt(data, keyEnd, remaining);
        attStmt = r.value;
        pos = r.end;
      } else {
        throw new Error(`CBOR: unexpected key "${key}"`);
      }
    }
    if (pos !== data.length) {
      throw new Error("CBOR: trailing bytes after attestation object");
    }
    return { fmt: fmt!, attStmt: attStmt!, authData: authData! };
  } catch (e) {
    if (e instanceof AttestationError) throw e;
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      `Failed to CBOR-decode attestation object: ${
        e instanceof Error ? e.message : String(e)
      }`,
      { cause: e },
    );
  }
}

/**
 * Verify an Apple App Attest attestation.
 *
 * Implements the full server-side verification described in
 * [Apple's documentation](https://developer.apple.com/documentation/devicecheck/validating_apps_that_connect_to_your_server):
 * CBOR decode, certificate chain validation, nonce check, key extraction,
 * AAGUID check, and credential ID verification.
 *
 * **Important:** The `clientDataHash` parameter corresponds to Apple's
 * `clientDataHash` argument on `DCAppAttestService.attestKey(_:clientDataHash:)`.
 * Most client SDKs (Expo's `attestKeyAsync`, native wrappers) hash the
 * caller's challenge with SHA-256 before passing to Apple. If you are using
 * the {@linkcode withAttestation} middleware, this hashing is handled
 * automatically. If calling `verifyAttestation` directly, you must pass
 * `SHA-256(challenge)` — not the raw challenge — as `clientDataHash`.
 *
 * @throws {AttestationError} If any verification step fails.
 */
export async function verifyAttestation(
  appInfo: AppInfo,
  keyId: string,
  clientDataHash: Uint8Array | string,
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
  const decoded = decodeAttestationCbor(attestationBytes);

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

  // Step 5-6: Compute nonce = SHA-256(authData || clientDataHash)
  // The clientDataHash is typically SHA-256(challenge) — see the JSDoc above.
  // The withAttestation middleware handles this hashing automatically.
  const clientDataHashBytes = toBytes(clientDataHash);
  const nonceInput = concat(authData, clientDataHashBytes);
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
  let parsedAuthData: AttestationAuthData;
  try {
    parsedAuthData = parseAttestationAuthData(authData);
  } catch (e) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      `Invalid authenticatorData: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

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
