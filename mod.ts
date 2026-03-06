// mod.ts — public API surface

export type {
  AppInfo,
  AttestationResult,
  VerifyAttestationOptions,
} from "./src/attestation.ts";
export type { AssertionResult } from "./src/assertion.ts";
export { verifyAttestation } from "./src/attestation.ts";
export { verifyAssertion } from "./src/assertion.ts";
export {
  AssertionError,
  AssertionErrorCode,
  AttestationError,
  AttestationErrorCode,
} from "./src/errors.ts";
