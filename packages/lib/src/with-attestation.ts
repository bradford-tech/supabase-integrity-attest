// src/with-attestation.ts
import { decodeBase64 } from "@std/encoding/base64";
import { verifyAttestation } from "./attestation.ts";
import type { AppInfo } from "./attestation.ts";
import { AttestationError, AttestationErrorCode } from "./errors.ts";

/**
 * Library-internal timing spans for an attestation verification, in
 * milliseconds. Exposed on {@linkcode AttestationContext.timings}.
 */
export type AttestationTimings = {
  /** Parse request body + decode base64 fields. */
  extractMs: number;
  /** `consumeChallenge` callback wall-clock duration. */
  consumeChallengeMs: number;
  /** Cryptographic verification (CBOR decode, cert chain, nonce, key extract). */
  verifyMs: number;
  /** `storeDeviceKey` callback wall-clock duration. */
  storeDeviceKeyMs: number;
};

/** Context passed to the inner handler after successful attestation verification. */
export type AttestationContext = {
  /** Device identifier (Apple-issued `keyId`) from the request. */
  deviceId: string;
  /** PEM-encoded ECDSA P-256 public key extracted from the attestation. */
  publicKeyPem: string;
  /** Initial sign count from the attestation (always `0`). */
  signCount: number;
  /** Raw App Attest receipt bytes. */
  receipt: Uint8Array;
  /** Library-internal timings, ready to merge into Server-Timing. */
  timings: AttestationTimings;
};

/** Custom function to extract attestation data from an incoming request. */
export type ExtractAttestationFn = (req: Request) => Promise<{
  deviceId: string;
  /** Raw challenge bytes for the `consumeChallenge` DB lookup. */
  challenge: Uint8Array;
  /**
   * The challenge in the exact form the client SDK received it, before
   * any server-side decoding. This is what the client SDK hashed to
   * produce `clientDataHash` — Expo's `attestKeyAsync` and native
   * `DCAppAttestService` wrappers convert this string to UTF-8 bytes
   * and SHA-256 hash them before passing to Apple. The middleware must
   * hash this same string to produce the matching `clientDataHash` for
   * `verifyAttestation`.
   */
  challengeAsSent: string;
  attestation: Uint8Array;
}>;

/** Configuration for the {@linkcode withAttestation} middleware. */
export type WithAttestationOptions = {
  /** Apple App ID in the format `TEAMID.bundleId`. */
  appId: string;
  /** Set to `true` for development environment attestations. */
  developmentEnv?: boolean;
  /**
   * Atomically consume a previously-issued challenge. Return `true` if the
   * challenge was valid, unused, and unexpired (and is now consumed);
   * `false` otherwise. Implementations should use `DELETE ... RETURNING`
   * to guarantee single-use semantics.
   *
   * The library converts `false` into `AttestationError(CHALLENGE_INVALID)`.
   */
  consumeChallenge: (challenge: Uint8Array) => Promise<boolean>;
  /**
   * Persist the verified device key row. Caller chooses INSERT vs UPSERT —
   * re-attesting an existing deviceId is cryptographically safe (Apple has
   * re-signed) so UPSERT is usually correct.
   */
  storeDeviceKey: (row: {
    deviceId: string;
    publicKeyPem: string;
    signCount: number;
    receipt: Uint8Array;
  }) => Promise<void>;
  /** Override the default body-based attestation extraction. */
  extractAttestation?: ExtractAttestationFn;
  /** Custom error response handler. Defaults to JSON error responses. */
  onError?: (
    error: AttestationError,
    req: Request,
  ) => Response | Promise<Response>;
};

/**
 * Default extractor: reads a JSON body of the shape
 * `{ keyId: string, challenge: string, attestation: string }` where all
 * three fields are base64-encoded per Apple's standard wire format.
 */
async function defaultExtractAttestation(req: Request): Promise<{
  deviceId: string;
  challenge: Uint8Array;
  challengeAsSent: string;
  attestation: Uint8Array;
}> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      `Failed to parse attestation request body as JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (
    typeof body !== "object" || body === null ||
    typeof (body as { keyId?: unknown }).keyId !== "string" ||
    typeof (body as { challenge?: unknown }).challenge !== "string" ||
    typeof (body as { attestation?: unknown }).attestation !== "string"
  ) {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "Attestation request body must include { keyId, challenge, attestation } as base64 strings",
    );
  }
  const typed = body as {
    keyId: string;
    challenge: string;
    attestation: string;
  };
  let challenge: Uint8Array;
  let attestation: Uint8Array;
  try {
    challenge = decodeBase64(typed.challenge);
  } catch {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "challenge is not valid base64",
    );
  }
  try {
    attestation = decodeBase64(typed.attestation);
  } catch {
    throw new AttestationError(
      AttestationErrorCode.INVALID_FORMAT,
      "attestation is not valid base64",
    );
  }
  return {
    deviceId: typed.keyId,
    challenge,
    challengeAsSent: typed.challenge,
    attestation,
  };
}

function defaultErrorResponse(error: AttestationError): Response {
  const status = error.code === AttestationErrorCode.INTERNAL_ERROR
    ? 500
    : error.code === AttestationErrorCode.INVALID_FORMAT
    ? 400
    : 401;
  return new Response(
    JSON.stringify({ error: error.message, code: error.code }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Request handler middleware that verifies App Attest attestations.
 *
 * Wraps a handler with automatic challenge consumption, cryptographic
 * attestation verification, and device key persistence. Returns a new
 * handler that rejects invalid attestations with appropriate HTTP
 * error responses.
 *
 * The symmetric pair of {@linkcode withAssertion} — use this on your
 * one-time device registration endpoint, then use `withAssertion` on
 * every protected business endpoint.
 */
export function withAttestation(
  options: WithAttestationOptions,
  handler: (
    req: Request,
    context: AttestationContext,
  ) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  const appInfo: AppInfo = {
    appId: options.appId,
    developmentEnv: options.developmentEnv ?? false,
  };
  const extract = options.extractAttestation ?? defaultExtractAttestation;

  return async (req: Request): Promise<Response> => {
    let deviceId: string;
    let publicKeyPem: string;
    let receipt: Uint8Array;
    const timings: AttestationTimings = {
      extractMs: 0,
      consumeChallengeMs: 0,
      verifyMs: 0,
      storeDeviceKeyMs: 0,
    };

    try {
      const extractStart = performance.now();
      const extracted = await extract(req);
      timings.extractMs = performance.now() - extractStart;
      deviceId = extracted.deviceId;

      // Consume the challenge BEFORE verification to prevent a TOCTOU race:
      // two concurrent requests with the same challenge could both pass
      // verifyAttestation before either consumes. The trade-off is that a
      // verification failure (malformed attestation, cert-chain error) burns
      // the challenge, requiring the client to request a new one.
      const consumeStart = performance.now();
      let challengeOk: boolean;
      try {
        challengeOk = await options.consumeChallenge(extracted.challenge);
      } catch (err) {
        // Static message — the original error is attached via `cause` and
        // never reaches the wire. Callback errors from Postgres drivers
        // routinely contain schema details, constraint names, and other
        // info that must not leak to unauthenticated clients.
        throw new AttestationError(
          AttestationErrorCode.INTERNAL_ERROR,
          "consumeChallenge callback failed",
          { cause: err },
        );
      }
      timings.consumeChallengeMs = performance.now() - consumeStart;

      if (!challengeOk) {
        throw new AttestationError(
          AttestationErrorCode.CHALLENGE_INVALID,
          "Challenge is missing, expired, or already consumed",
        );
      }

      // Hash the challenge AS THE CLIENT SAW IT — the exact string passed
      // to attestKeyAsync / DCAppAttestService.attestKey. Client SDKs
      // convert this string to UTF-8 bytes and SHA-256 hash them before
      // passing to Apple as clientDataHash. The attestation certificate's
      // nonce is SHA-256(authData || clientDataHash), so we must hash the
      // same string to produce the matching clientDataHash.
      //
      // This is different from the assertion path, which has no encoding
      // layer: the string passed to generateAssertionAsync IS the raw
      // body, and both sides hash identical bytes by definition.
      // Attestation has a transport encoding layer (base64 in a JSON
      // body), so the middleware must hash BEFORE decoding to match what
      // the client SDK hashed.
      const clientDataHash = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(extracted.challengeAsSent),
        ),
      );

      const verifyStart = performance.now();
      const result = await verifyAttestation(
        appInfo,
        deviceId,
        clientDataHash,
        extracted.attestation,
      );
      timings.verifyMs = performance.now() - verifyStart;
      publicKeyPem = result.publicKeyPem;
      receipt = result.receipt;

      const storeStart = performance.now();
      try {
        await options.storeDeviceKey({
          deviceId,
          publicKeyPem,
          signCount: result.signCount,
          receipt,
        });
      } catch (err) {
        // Static message — see consumeChallenge catch above.
        throw new AttestationError(
          AttestationErrorCode.INTERNAL_ERROR,
          "storeDeviceKey callback failed",
          { cause: err },
        );
      }
      timings.storeDeviceKeyMs = performance.now() - storeStart;
    } catch (err) {
      // Non-AttestationError escapes (unexpected runtime errors, programmer
      // bugs, etc.) are wrapped as INTERNAL_ERROR with a static message.
      // The original is attached via `cause` and never reaches the wire.
      const error = err instanceof AttestationError
        ? err
        : new AttestationError(
          AttestationErrorCode.INTERNAL_ERROR,
          "Internal error",
          { cause: err },
        );
      try {
        return await options.onError?.(error, req) ??
          defaultErrorResponse(error);
      } catch {
        return defaultErrorResponse(error);
      }
    }

    return await handler(req, {
      deviceId,
      publicKeyPem,
      signCount: 0,
      receipt,
      timings,
    });
  };
}
