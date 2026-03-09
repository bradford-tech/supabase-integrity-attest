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

// withAssertion wrapper
export { withAssertion } from "./src/with-assertion.ts";
export {
  DEFAULT_ASSERTION_HEADER,
  DEFAULT_DEVICE_ID_HEADER,
} from "./src/with-assertion.ts";
export type {
  AssertionContext,
  DeviceKey,
  ExtractAssertionFn,
  WithAssertionOptions,
} from "./src/with-assertion.ts";
