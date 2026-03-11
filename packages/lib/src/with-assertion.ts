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

/** Context passed to the inner handler after successful assertion verification. */
export type AssertionContext = {
  /** Device identifier from the request. */
  deviceId: string;
  /** Updated sign count after verification. */
  signCount: number;
  /** Raw request body bytes (the client data that was signed). */
  rawBody: Uint8Array;
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
  /** Persist the new sign count after successful verification. */
  updateSignCount: (deviceId: string, newSignCount: number) => Promise<void>;
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
 * device key lookup, and sign count management. Returns a new handler
 * that rejects unauthenticated requests with appropriate HTTP error responses.
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

    // Steps 1-4: extract, verify, update sign count
    try {
      const extracted = await extract(req);
      deviceId = extracted.deviceId;
      clientData = extracted.clientData;

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

      if (!deviceKey) {
        throw new AssertionError(
          AssertionErrorCode.DEVICE_NOT_FOUND,
          "Device not found",
        );
      }

      const result = await verifyAssertion(
        appInfo,
        extracted.assertion,
        clientData,
        deviceKey.publicKeyPem,
        deviceKey.signCount,
      );

      try {
        await options.updateSignCount(deviceId, result.signCount);
      } catch (err) {
        throw new AssertionError(
          AssertionErrorCode.INTERNAL_ERROR,
          "Failed to update sign count",
          { cause: err },
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
    });
  };
}
