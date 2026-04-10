/**
 * Lightweight assertion-only entry point. Avoids pulling in `asn1js` and
 * `@noble/curves`, keeping the bundle minimal for assertion-only use cases.
 *
 * ```ts
 * import {
 *   verifyAssertion,
 *   withAssertion,
 * } from "@bradford-tech/supabase-integrity-attest/assertion";
 *
 * const { signCount } = await verifyAssertion(
 *   { appId: "TEAMID.com.example.app" },
 *   assertion,
 *   clientData,
 *   publicKeyPem,
 *   previousSignCount,
 * );
 * ```
 *
 * @module
 */

export { verifyAssertion } from "./src/assertion.ts";
export type { AppInfo, AssertionResult } from "./src/assertion.ts";
export { AssertionError, AssertionErrorCode } from "./src/errors.ts";

// withAssertion middleware
export { withAssertion } from "./src/with-assertion.ts";
export {
  DEFAULT_ASSERTION_HEADER,
  DEFAULT_DEVICE_ID_HEADER,
} from "./src/with-assertion.ts";
export type {
  AssertionContext,
  AssertionTimings,
  DeviceKey,
  ExtractAssertionFn,
  WithAssertionOptions,
} from "./src/with-assertion.ts";
