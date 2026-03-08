// attestation.ts — full attestation entry point (includes cert chain deps)

export { verifyAttestation } from "./src/attestation.ts";
export type {
  AppInfo,
  AttestationResult,
  VerifyAttestationOptions,
} from "./src/attestation.ts";
export { AttestationError, AttestationErrorCode } from "./src/errors.ts";
