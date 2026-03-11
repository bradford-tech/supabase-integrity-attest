/**
 * Full attestation entry point including certificate chain verification
 * dependencies (`asn1js`, `@noble/curves`).
 *
 * ```ts
 * import { verifyAttestation } from "@bradford-tech/supabase-integrity-attest/attestation";
 *
 * const { publicKeyPem } = await verifyAttestation(
 *   { appId: "TEAMID.com.example.app" },
 *   keyId,
 *   challenge,
 *   attestation,
 * );
 * ```
 *
 * @module
 */

export { verifyAttestation } from "./src/attestation.ts";
export type {
  AppInfo,
  AttestationResult,
  VerifyAttestationOptions,
} from "./src/attestation.ts";
export { AttestationError, AttestationErrorCode } from "./src/errors.ts";
