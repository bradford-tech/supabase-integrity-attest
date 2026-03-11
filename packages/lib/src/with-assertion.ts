// src/with-assertion.ts
import { verifyAssertion } from "./assertion.ts";
import type { AppInfo } from "./assertion.ts";
import { AssertionError, AssertionErrorCode } from "./errors.ts";

export const DEFAULT_ASSERTION_HEADER = "X-App-Attest-Assertion";
export const DEFAULT_DEVICE_ID_HEADER = "X-App-Attest-Device-Id";

export type DeviceKey = {
  publicKeyPem: string;
  signCount: number;
};

export type AssertionContext = {
  deviceId: string;
  signCount: number;
  rawBody: Uint8Array;
};

export type ExtractAssertionFn = (req: Request) => Promise<{
  assertion: string;
  deviceId: string;
  clientData: Uint8Array;
}>;

export type WithAssertionOptions = {
  appId: string;
  developmentEnv?: boolean;
  getDeviceKey: (deviceId: string) => Promise<DeviceKey | null>;
  updateSignCount: (deviceId: string, newSignCount: number) => Promise<void>;
  extractAssertion?: ExtractAssertionFn;
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
