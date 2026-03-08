// assertion.ts — lightweight entry point (no asn1js / @noble/curves)

export { verifyAssertion } from "./src/assertion.ts";
export type { AppInfo, AssertionResult } from "./src/assertion.ts";
export { AssertionError, AssertionErrorCode } from "./src/errors.ts";
