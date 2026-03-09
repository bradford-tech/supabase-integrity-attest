// assertion.ts — lightweight entry point (no asn1js / @noble/curves)

export { verifyAssertion } from "./src/assertion.ts";
export type { AppInfo, AssertionResult } from "./src/assertion.ts";
export { AssertionError, AssertionErrorCode } from "./src/errors.ts";

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
