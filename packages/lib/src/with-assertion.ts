// src/with-assertion.ts
import { verifyAssertion } from "./assertion.ts";
import type { AppInfo } from "./assertion.ts";
import { AssertionError, AssertionErrorCode } from "./errors.ts";

/** Default HTTP header name for the base64-encoded assertion. */
export const DEFAULT_ASSERTION_HEADER = "X-App-Attest-Assertion";
/** Default HTTP header name for the device identifier. */
export const DEFAULT_DEVICE_ID_HEADER = "X-App-Attest-Device-Id";

/** Stored device key material returned by the `getDeviceKey` callback. */
export type DeviceKey = {
  /** PEM-encoded ECDSA P-256 public key from attestation. */
  publicKeyPem: string;
  /** Last verified sign count for this device. */
  signCount: number;
};

/**
 * Library-internal timing spans for an assertion verification, in
 * milliseconds. Exposed on {@linkcode AssertionContext.timings} so the
 * wrapped handler can emit them as part of its own Server-Timing response.
 */
export type AssertionTimings = {
  /** Parse request headers and read raw body bytes. */
  extractMs: number;
  /** `getDeviceKey` callback wall-clock duration. */
  getDeviceKeyMs: number;
  /** Cryptographic verification (CBOR decode, ECDSA verify, counter check). */
  verifyMs: number;
  /** `commitSignCount` callback wall-clock duration. */
  commitMs: number;
};

/** Context passed to the inner handler after successful assertion verification. */
export type AssertionContext = {
  /** Device identifier from the request. */
  deviceId: string;
  /** Updated sign count after verification. */
  signCount: number;
  /** Raw request body bytes (the client data that was signed). */
  rawBody: Uint8Array;
  /** Library-internal timings, ready to merge into Server-Timing. */
  timings: AssertionTimings;
};

/** Custom function to extract assertion data from an incoming request. */
export type ExtractAssertionFn = (req: Request) => Promise<{
  assertion: string;
  deviceId: string;
  clientData: Uint8Array;
}>;

/** Configuration for the {@linkcode withAssertion} middleware. */
export type WithAssertionOptions = {
  /** Apple App ID in the format `TEAMID.bundleId`. */
  appId: string;
  /** Set to `true` for development environment attestations. */
  developmentEnv?: boolean;
  /** Retrieve the stored device key for a given device ID. Return `null` if not found. */
  getDeviceKey: (deviceId: string) => Promise<DeviceKey | null>;
  /**
   * Atomically advance the stored sign count. MUST be implemented as a
   * compare-and-swap: only update if the currently stored value is strictly
   * less than `newSignCount`. Returns `true` if the row was advanced,
   * `false` if another concurrent request already advanced past this value.
   *
   * Recommended SQL pattern against Postgres:
   *
   * ```sql
   * UPDATE app_attest_devices
   *    SET sign_count = $1, last_seen_at = now()
   *  WHERE device_id = $2 AND sign_count < $1
   * ```
   *
   * Return `rowCount > 0`. The library converts `false` into
   * `AssertionError(SIGN_COUNT_STALE)`.
   */
  commitSignCount: (deviceId: string, newSignCount: number) => Promise<boolean>;
  /** Override the default header-based assertion extraction. */
  extractAssertion?: ExtractAssertionFn;
  /** Custom error response handler. Defaults to JSON error responses. */
  onError?: (
    error: AssertionError,
    req: Request,
  ) => Response | Promise<Response>;
};

async function defaultExtractAssertion(req: Request): Promise<{
  assertion: string;
  deviceId: string;
  clientData: Uint8Array;
}> {
  const assertion = req.headers.get(DEFAULT_ASSERTION_HEADER);
  const deviceId = req.headers.get(DEFAULT_DEVICE_ID_HEADER);

  if (!assertion || !deviceId) {
    throw new AssertionError(
      AssertionErrorCode.INVALID_FORMAT,
      `Missing ${DEFAULT_ASSERTION_HEADER} or ${DEFAULT_DEVICE_ID_HEADER} header`,
    );
  }

  const clientData = new Uint8Array(await req.arrayBuffer());

  return { assertion, deviceId, clientData };
}

function defaultErrorResponse(error: AssertionError): Response {
  const status = error.code === AssertionErrorCode.INTERNAL_ERROR
    ? 500
    : error.code === AssertionErrorCode.INVALID_FORMAT
    ? 400
    : 401;

  return new Response(
    JSON.stringify({ error: error.message, code: error.code }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Request handler middleware that verifies App Attest assertions.
 *
 * Wraps a handler function with automatic assertion verification,
 * device key lookup, and atomic sign-count commit. Returns a new handler
 * that rejects unauthenticated requests with appropriate HTTP error responses.
 *
 * The `commitSignCount` callback MUST implement compare-and-swap semantics
 * (see {@linkcode WithAssertionOptions.commitSignCount}) — a non-atomic
 * unconditional write will silently corrupt replay protection under
 * concurrent load.
 */
export function withAssertion(
  options: WithAssertionOptions,
  handler: (
    req: Request,
    context: AssertionContext,
  ) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  const appInfo: AppInfo = {
    appId: options.appId,
    developmentEnv: options.developmentEnv ?? false,
  };
  const extract = options.extractAssertion ?? defaultExtractAssertion;

  return async (req: Request): Promise<Response> => {
    let deviceId: string;
    let clientData: Uint8Array;
    let newSignCount: number;
    const timings: AssertionTimings = {
      extractMs: 0,
      getDeviceKeyMs: 0,
      verifyMs: 0,
      commitMs: 0,
    };

    // Steps 1-4: extract, verify, commit sign count
    try {
      const extractStart = performance.now();
      const extracted = await extract(req);
      timings.extractMs = performance.now() - extractStart;

      deviceId = extracted.deviceId;
      clientData = extracted.clientData;

      const getKeyStart = performance.now();
      let deviceKey: DeviceKey | null;
      try {
        deviceKey = await options.getDeviceKey(deviceId);
      } catch (err) {
        throw new AssertionError(
          AssertionErrorCode.INTERNAL_ERROR,
          "Storage callback failed",
          { cause: err },
        );
      }
      timings.getDeviceKeyMs = performance.now() - getKeyStart;

      if (!deviceKey) {
        throw new AssertionError(
          AssertionErrorCode.DEVICE_NOT_FOUND,
          "Device not found",
        );
      }

      const verifyStart = performance.now();
      const result = await verifyAssertion(
        appInfo,
        extracted.assertion,
        clientData,
        deviceKey.publicKeyPem,
        deviceKey.signCount,
      );
      timings.verifyMs = performance.now() - verifyStart;

      const commitStart = performance.now();
      let committed: boolean;
      try {
        committed = await options.commitSignCount(deviceId, result.signCount);
      } catch (err) {
        throw new AssertionError(
          AssertionErrorCode.INTERNAL_ERROR,
          "Failed to commit sign count",
          { cause: err },
        );
      }
      timings.commitMs = performance.now() - commitStart;

      if (!committed) {
        throw new AssertionError(
          AssertionErrorCode.SIGN_COUNT_STALE,
          `Sign count ${result.signCount} is stale — another concurrent request already advanced past it`,
        );
      }

      newSignCount = result.signCount;
    } catch (err) {
      const error = err instanceof AssertionError
        ? err
        : new AssertionError(AssertionErrorCode.INTERNAL_ERROR, String(err), {
          cause: err,
        });
      return options.onError?.(error, req) ?? defaultErrorResponse(error);
    }

    // Step 5: handler — outside try/catch, errors bubble up
    return await handler(req, {
      deviceId,
      signCount: newSignCount,
      rawBody: clientData,
      timings,
    });
  };
}
