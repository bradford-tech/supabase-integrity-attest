// src/certificate.ts

import * as asn1js from "asn1js";
import { p384 } from "@noble/curves/nist.js";
import { decodeBase64 } from "@std/encoding/base64";
import {
  APPLE_APP_ATTESTATION_ROOT_CA_PEM,
  APPLE_NONCE_EXTENSION_OID,
} from "./constants.ts";
import { derToRaw } from "./der.ts";
import { AttestationError, AttestationErrorCode } from "./errors.ts";
import { constantTimeEqual } from "./utils.ts";

// ── Internal types ──────────────────────────────────────────────────

interface CertExtension {
  oid: string;
  critical: boolean;
  value: Uint8Array;
}

interface ParsedCertificate {
  tbsCertificateDer: Uint8Array;
  signatureAlgorithmOid: string;
  signatureValue: Uint8Array;
  issuer: Uint8Array;
  subject: Uint8Array;
  validityNotBefore: Date;
  validityNotAfter: Date;
  subjectPublicKeyInfoDer: Uint8Array;
  publicKeyCurveOid: string;
  extensions: CertExtension[];
}

// ── OID mappings ────────────────────────────────────────────────────

/** Signature algorithm OID → hash algorithm name */
const SIG_ALG_HASH: Record<string, string> = {
  "1.2.840.10045.4.3.2": "SHA-256",
  "1.2.840.10045.4.3.3": "SHA-384",
};

/** Curve OID → WebCrypto namedCurve */
const CURVE_OID_NAME: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
};

/** Curve name → ECDSA r||s component size in bytes */
const CURVE_COMPONENT_SIZE: Record<string, number> = {
  "P-256": 32,
  "P-384": 48,
};

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Safely create an ArrayBuffer from a Uint8Array, handling subarrays.
 * If `der` is a subarray, `der.buffer` includes the full underlying buffer,
 * so we must slice to get only the relevant portion.
 */
function safeBuffer(der: Uint8Array): ArrayBuffer {
  return (der.buffer as ArrayBuffer).slice(
    der.byteOffset,
    der.byteOffset + der.byteLength,
  );
}

/**
 * Slice bytes from a valueBeforeDecodeView, producing an independent copy.
 */
function sliceFromView(view: Uint8Array): Uint8Array {
  return new Uint8Array(
    (view.buffer as ArrayBuffer).slice(
      view.byteOffset,
      view.byteOffset + view.byteLength,
    ),
  );
}

/**
 * Parse a date from an ASN.1 time element (UTCTime or GeneralizedTime).
 */
function parseAsn1Date(element: asn1js.BaseBlock): Date {
  if (element instanceof asn1js.UTCTime) {
    return element.toDate();
  }
  if (element instanceof asn1js.GeneralizedTime) {
    return element.toDate();
  }
  throw new AttestationError(
    AttestationErrorCode.INVALID_FORMAT,
    "Unexpected ASN.1 time type in certificate validity",
  );
}

// ── parseCertificate ────────────────────────────────────────────────

/**
 * Parse an X.509 DER-encoded certificate into structured fields.
 * All byte slices come from the original input buffer.
 */
function parseCertificate(der: Uint8Array): ParsedCertificate {
  const buf = safeBuffer(der);
  const asn1 = asn1js.fromBER(buf);
  if (asn1.offset === -1) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "Failed to parse certificate DER",
    );
  }

  const certSeq = asn1.result as asn1js.Sequence;
  const certChildren = certSeq.valueBlock.value;

  // certChildren: [tbsCertificate, signatureAlgorithm, signatureValue]
  const tbsElement = certChildren[0] as asn1js.Sequence;
  const sigAlgElement = certChildren[1] as asn1js.Sequence;
  const sigValueElement = certChildren[2] as asn1js.BitString;

  // TBS bytes — slice from the element's full encoding (tag + length + value)
  const tbsView =
    (tbsElement as unknown as { valueBeforeDecodeView: Uint8Array })
      .valueBeforeDecodeView;
  const tbsCertificateDer = sliceFromView(tbsView);

  // Signature algorithm OID
  const sigAlgOid =
    (sigAlgElement.valueBlock.value[0] as asn1js.ObjectIdentifier).valueBlock
      .toString();

  // Signature value — unused-bits byte already stripped by asn1js
  const signatureValue = new Uint8Array(
    sigValueElement.valueBlock.valueHexView,
  );

  // TBS children — check for v3 version tag
  const tbsChildren = tbsElement.valueBlock.value;
  let offset = 0;

  // First child is explicit [0] version tag for v3 certs
  const firstChild = tbsChildren[0];
  if (
    firstChild.idBlock.tagClass === 3 && // CONTEXT-SPECIFIC
    firstChild.idBlock.tagNumber === 0
  ) {
    offset = 1; // Version tag present, shift all indices
  }

  // TBS layout (with offset): serial, sigAlg, issuer, validity, subject, SPKI, [extensions]
  // [offset+0]=serial, [offset+1]=sigAlg, [offset+2]=issuer, [offset+3]=validity,
  // [offset+4]=subject, [offset+5]=SPKI

  const issuerElement = tbsChildren[offset + 2];
  const issuerView =
    (issuerElement as unknown as { valueBeforeDecodeView: Uint8Array })
      .valueBeforeDecodeView;
  const issuer = sliceFromView(issuerView);

  const validityElement = tbsChildren[offset + 3] as asn1js.Sequence;
  const validityChildren = validityElement.valueBlock.value;
  const validityNotBefore = parseAsn1Date(validityChildren[0]);
  const validityNotAfter = parseAsn1Date(validityChildren[1]);

  const subjectElement = tbsChildren[offset + 4];
  const subjectView =
    (subjectElement as unknown as { valueBeforeDecodeView: Uint8Array })
      .valueBeforeDecodeView;
  const subject = sliceFromView(subjectView);

  const spkiElement = tbsChildren[offset + 5];
  const spkiView =
    (spkiElement as unknown as { valueBeforeDecodeView: Uint8Array })
      .valueBeforeDecodeView;
  const subjectPublicKeyInfoDer = sliceFromView(spkiView);

  // Extract curve OID from SPKI's AlgorithmIdentifier
  const spkiSeq = spkiElement as asn1js.Sequence;
  const spkiAlgId = spkiSeq.valueBlock.value[0] as asn1js.Sequence;
  const curveOidElement = spkiAlgId.valueBlock
    .value[1] as asn1js.ObjectIdentifier;
  const publicKeyCurveOid = curveOidElement.valueBlock.toString();

  // Extensions — found in explicit [3] tag within TBS
  const extensions: CertExtension[] = [];
  for (let i = offset + 6; i < tbsChildren.length; i++) {
    const child = tbsChildren[i];
    if (
      child.idBlock.tagClass === 3 && // CONTEXT-SPECIFIC
      child.idBlock.tagNumber === 3
    ) {
      // This is the extensions wrapper: explicit [3] containing a SEQUENCE of extensions
      const extWrapper = child as asn1js.Constructed;
      const extSeqOfSeq = extWrapper.valueBlock.value[0] as asn1js.Sequence;
      for (const extSeq of extSeqOfSeq.valueBlock.value) {
        const extChildren = (extSeq as asn1js.Sequence).valueBlock.value;
        const oid = (extChildren[0] as asn1js.ObjectIdentifier).valueBlock
          .toString();

        let critical = false;
        let valueElement: asn1js.OctetString;

        if (extChildren[1] instanceof asn1js.Boolean) {
          critical = extChildren[1].getValue();
          valueElement = extChildren[2] as asn1js.OctetString;
        } else {
          valueElement = extChildren[1] as asn1js.OctetString;
        }

        extensions.push({
          oid,
          critical,
          value: new Uint8Array(valueElement.valueBlock.valueHexView),
        });
      }
      break;
    }
  }

  return {
    tbsCertificateDer,
    signatureAlgorithmOid: sigAlgOid,
    signatureValue,
    issuer,
    subject,
    validityNotBefore,
    validityNotAfter,
    subjectPublicKeyInfoDer,
    publicKeyCurveOid,
    extensions,
  };
}

// ── extractRawPublicKeyFromSpki ─────────────────────────────────────

/**
 * Extract the raw public key bytes from a DER-encoded SubjectPublicKeyInfo.
 * Returns the uncompressed EC point (0x04 || x || y).
 */
function extractRawPublicKeyFromSpki(spkiDer: Uint8Array): Uint8Array {
  const buf = safeBuffer(spkiDer);
  const asn1 = asn1js.fromBER(buf);
  if (asn1.offset === -1) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      "Failed to parse SPKI DER",
    );
  }
  const spkiSeq = asn1.result as asn1js.Sequence;
  const publicKeyBitString = spkiSeq.valueBlock.value[1] as asn1js.BitString;
  return new Uint8Array(publicKeyBitString.valueBlock.valueHexView);
}

// ── verifySignature ─────────────────────────────────────────────────

/**
 * Verify the signature of a child certificate against the parent's public key.
 *
 * Deno WebCrypto throws "Not implemented" for cross-paired curve+hash
 * (e.g., P-384 key signing with SHA-256). Apple's intermediate (P-384)
 * signs the leaf cert with SHA-256. Use @noble/curves for this case.
 */
async function verifySignature(
  child: ParsedCertificate,
  parent: ParsedCertificate,
): Promise<boolean> {
  const hash = SIG_ALG_HASH[child.signatureAlgorithmOid];
  if (!hash) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      `Unsupported signature algorithm OID: ${child.signatureAlgorithmOid}`,
    );
  }

  const namedCurve = CURVE_OID_NAME[parent.publicKeyCurveOid];
  if (!namedCurve) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      `Unsupported curve OID: ${parent.publicKeyCurveOid}`,
    );
  }

  const componentSize = CURVE_COMPONENT_SIZE[namedCurve];
  const sigRaw = derToRaw(child.signatureValue, componentSize);

  // Apple's intermediate (P-384 key) signs the leaf cert with SHA-256.
  // Deno WebCrypto throws "Not implemented" for this cross-pairing.
  // Use @noble/curves p384 to verify instead.
  if (namedCurve === "P-384" && hash === "SHA-256") {
    // Pre-hash TBS, then verify with @noble/curves.
    // lowS: false — X.509 signatures don't enforce BIP-62 low-S normalization.
    // prehash: false — we hash manually since the hash algorithm differs from the curve's default.
    const digest = new Uint8Array(
      await crypto.subtle.digest(hash, child.tbsCertificateDer),
    );
    const rawPubKey = extractRawPublicKeyFromSpki(
      parent.subjectPublicKeyInfoDer,
    );
    return p384.verify(sigRaw, digest, rawPubKey, {
      prehash: false,
      lowS: false,
    });
  }

  // Standard pairing — WebCrypto
  const parentKey = await crypto.subtle.importKey(
    "spki",
    parent.subjectPublicKeyInfoDer,
    { name: "ECDSA", namedCurve },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash },
    parentKey,
    sigRaw,
    child.tbsCertificateDer,
  );
}

// ── parseRootCaDer ──────────────────────────────────────────────────

/**
 * Decode the Apple App Attestation Root CA from PEM to DER bytes.
 */
function parseRootCaDer(): Uint8Array {
  const b64 = APPLE_APP_ATTESTATION_ROOT_CA_PEM
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");
  return decodeBase64(b64);
}

// ── Exported functions ──────────────────────────────────────────────

/**
 * Verify the x5c certificate chain against the Apple App Attestation Root CA.
 *
 * @param x5c - Array of DER-encoded certificates (index 0 = leaf, last = closest to root)
 * @param checkDate - Date to use for validity checking (defaults to now; override for testing expired certs)
 */
export async function verifyCertificateChain(
  x5c: Uint8Array[],
  checkDate?: Date,
): Promise<void> {
  if (x5c.length === 0) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      "Certificate chain (x5c) is empty",
    );
  }

  // Parse root CA and all x5c certs
  const rootCaDer = parseRootCaDer();
  const rootCa = parseCertificate(rootCaDer);
  const certs = x5c.map((der) => parseCertificate(der));

  // Build chain: [leaf, ..., intermediate, rootCA]
  const chain = [...certs, rootCa];

  // Verify root is self-signed
  if (!constantTimeEqual(rootCa.issuer, rootCa.subject)) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      "Root CA is not self-signed (issuer !== subject)",
    );
  }

  const rootSelfSigned = await verifySignature(rootCa, rootCa);
  if (!rootSelfSigned) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      "Root CA self-signature verification failed",
    );
  }

  // Verify each child→parent pair in the chain
  for (let i = 0; i < chain.length - 1; i++) {
    const child = chain[i];
    const parent = chain[i + 1];

    // Issuer must match parent's subject
    if (!constantTimeEqual(child.issuer, parent.subject)) {
      throw new AttestationError(
        AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
        `Certificate ${i} issuer does not match certificate ${i + 1} subject`,
      );
    }

    // Verify signature
    const valid = await verifySignature(child, parent);
    if (!valid) {
      throw new AttestationError(
        AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
        `Certificate ${i} signature verification failed`,
      );
    }
  }

  // Check validity periods
  const now = checkDate ?? new Date();
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    if (now < cert.validityNotBefore || now > cert.validityNotAfter) {
      throw new AttestationError(
        AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
        `Certificate ${i} is not valid at ${now.toISOString()} (valid from ${cert.validityNotBefore.toISOString()} to ${cert.validityNotAfter.toISOString()})`,
      );
    }
  }
}

/**
 * Extract the nonce from the Apple App Attest credential certificate.
 *
 * The nonce is stored in an extension with OID 1.2.840.113635.100.8.2.
 * The extension value is ASN.1: SEQUENCE { [1] EXPLICIT { OCTET STRING <nonce> } }
 *
 * @param certDer - DER-encoded leaf certificate
 * @returns The 32-byte nonce
 */
export function extractNonceFromCert(certDer: Uint8Array): Uint8Array {
  const cert = parseCertificate(certDer);

  const nonceExt = cert.extensions.find(
    (ext) => ext.oid === APPLE_NONCE_EXTENSION_OID,
  );
  if (!nonceExt) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      `Certificate missing nonce extension (OID ${APPLE_NONCE_EXTENSION_OID})`,
    );
  }

  // Parse the extension value as ASN.1
  const extBuf = safeBuffer(nonceExt.value);
  const extAsn1 = asn1js.fromBER(extBuf);
  if (extAsn1.offset === -1) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "Failed to parse nonce extension ASN.1",
    );
  }

  // Navigate: SEQUENCE -> tagged [1] -> OCTET STRING
  const sequence = extAsn1.result as asn1js.Sequence;
  const tagged = sequence.valueBlock.value[0] as asn1js.Constructed;
  const octetString = tagged.valueBlock.value[0] as asn1js.OctetString;

  return new Uint8Array(octetString.valueBlock.valueHexView);
}

/**
 * Extract the raw (uncompressed) public key from a DER-encoded certificate.
 *
 * @param certDer - DER-encoded certificate
 * @returns 65-byte uncompressed EC point (0x04 || x || y)
 */
export async function extractPublicKeyFromCert(
  certDer: Uint8Array,
): Promise<Uint8Array> {
  const cert = parseCertificate(certDer);
  const namedCurve = CURVE_OID_NAME[cert.publicKeyCurveOid];
  if (!namedCurve) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      `Unsupported curve OID: ${cert.publicKeyCurveOid}`,
    );
  }

  // Import SPKI as CryptoKey, then export as raw uncompressed point
  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    cert.subjectPublicKeyInfoDer,
    { name: "ECDSA", namedCurve },
    true,
    ["verify"],
  );

  const rawKey = await crypto.subtle.exportKey("raw", cryptoKey);
  return new Uint8Array(rawKey);
}
