// src/certificate.ts

import * as pkijs from "pkijs";
import * as asn1js from "asn1js";
import {
  APPLE_APP_ATTESTATION_ROOT_CA_PEM,
  APPLE_NONCE_EXTENSION_OID,
} from "./constants.ts";
import { AttestationError, AttestationErrorCode } from "./errors.ts";

/**
 * Parse the Apple App Attestation Root CA from PEM into a pkijs Certificate.
 */
function parseRootCa(): pkijs.Certificate {
  const b64 = APPLE_APP_ATTESTATION_ROOT_CA_PEM
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return pkijs.Certificate.fromBER(der);
}

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

  const rootCa = parseRootCa();

  // Parse all x5c certs
  const certs = x5c.map((der) => pkijs.Certificate.fromBER(der));

  const chainEngine = new pkijs.CertificateChainValidationEngine({
    trustedCerts: [rootCa],
    certs: certs,
    checkDate: checkDate ?? new Date(),
  });

  const result = await chainEngine.verify();

  if (!result.result) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_CERTIFICATE_CHAIN,
      `Certificate chain verification failed: ${result.resultMessage}`,
    );
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
  const cert = pkijs.Certificate.fromBER(certDer);

  const extensions = cert.extensions;
  if (!extensions) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "Certificate has no extensions",
    );
  }

  const nonceExt = extensions.find(
    (ext) => ext.extnID === APPLE_NONCE_EXTENSION_OID,
  );
  if (!nonceExt) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      `Certificate missing nonce extension (OID ${APPLE_NONCE_EXTENSION_OID})`,
    );
  }

  // Parse the extension value as ASN.1
  const extValue = nonceExt.extnValue.getValue();
  const asn1 = asn1js.fromBER(extValue);
  if (asn1.offset === -1) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "Failed to parse nonce extension ASN.1",
    );
  }

  // Navigate: SEQUENCE -> tagged [1] -> OCTET STRING
  const sequence = asn1.result as asn1js.Sequence;
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
  const cert = pkijs.Certificate.fromBER(certDer);

  // Get the SubjectPublicKeyInfo and convert to DER
  const spkiDer = cert.subjectPublicKeyInfo.toSchema().toBER(false);

  // Import as SPKI to get a CryptoKey
  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    spkiDer,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );

  // Export as raw (uncompressed point)
  const rawKey = await crypto.subtle.exportKey("raw", cryptoKey);
  return new Uint8Array(rawKey);
}
