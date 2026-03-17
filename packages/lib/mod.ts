/**
 * Verify Apple App Attest attestations and assertions using WebCrypto.
 *
 * This library implements Apple's full
 * [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)
 * server-side verification — CBOR decoding, X.509 certificate chain
 * validation, nonce verification, ECDSA signature checks — using only
 * WebCrypto APIs so it runs in Supabase Edge Functions, Deno Deploy,
 * and other edge runtimes with no native dependencies.
 *
 * ## Attestation
 *
 * Verify a new device and extract its public key:
 *
 * ```ts
 * import { verifyAttestation } from "@bradford-tech/supabase-integrity-attest";
 *
 * const { publicKeyPem, receipt, signCount } = await verifyAttestation(
 *   { appId: "TEAMID.com.example.app" },
 *   keyId,
 *   challenge,
 *   attestation,
 * );
 * // Store publicKeyPem and signCount for future assertion verification
 * ```
 *
 * ## Assertion
 *
 * Verify ongoing requests from an already-attested device:
 *
 * ```ts
 * import { verifyAssertion } from "@bradford-tech/supabase-integrity-attest";
 *
 * const { signCount } = await verifyAssertion(
 *   { appId: "TEAMID.com.example.app" },
 *   assertion,
 *   clientData,
 *   publicKeyPem,
 *   previousSignCount,
 * );
 * // Persist the updated signCount
 * ```
 *
 * ## Middleware
 *
 * Use the {@linkcode withAssertion} wrapper for automatic assertion
 * verification, device key lookup, and sign count management:
 *
 * ```ts
 * import { withAssertion } from "@bradford-tech/supabase-integrity-attest";
 *
 * const handler = withAssertion(
 *   { appId: "TEAMID.com.example.app", getDeviceKey, updateSignCount },
 *   (req, ctx) => new Response(`Verified device: ${ctx.deviceId}`),
 * );
 * ```
 *
 * ## Subpath imports
 *
 * For smaller bundles, import only what you need:
 *
 * - `@bradford-tech/supabase-integrity-attest/attestation` — attestation only
 * - `@bradford-tech/supabase-integrity-attest/assertion` — assertion + middleware (no `asn1js`/`@noble/curves`)
 *
 * Full documentation: {@link https://integrity-attest.bradford.tech}
 *
 * @module
 */

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
