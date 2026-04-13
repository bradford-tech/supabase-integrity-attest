// src/api.ts
//
// Typed HTTP wrappers for the Phase B edge functions. All calls go
// through FUNCTIONS_URL from config.ts. The iPhone must be on the
// same LAN as the host running supabase start.

import { FUNCTIONS_URL } from "./config";

// --- Response types ---

export type ChallengeResponse = {
  challenge: string;
  expiresAt: string;
  spans: Record<string, number>;
  cold: boolean;
  boot_age_ms: number;
};

export type UnprotectedEventResponse = {
  ok: boolean;
  event: {
    id: number;
    device_id: string | null;
    protected: boolean;
    payload: Record<string, unknown>;
    created_at: string;
  };
  spans: Record<string, number>;
  cold: boolean;
  boot_age_ms: number;
};

export type ProtectedEventResponse = {
  ok: boolean;
  event: {
    id: number;
    device_id: string;
    protected: boolean;
    payload: Record<string, unknown>;
    created_at: string;
  };
  deviceId: string;
  signCount: number;
  spans: Record<string, number>;
  cold: boolean;
  boot_age_ms: number;
};

export type VerifyAttestationResponse = {
  ok: boolean;
  deviceId: string;
  spans: Record<string, number>;
  cold: boolean;
  boot_age_ms: number;
};

export type ResetDeviceResponse = {
  ok: boolean;
  deletedDeviceRows: number;
  spans: Record<string, number>;
  cold: boolean;
  boot_age_ms: number;
};

export type ErrorResponse = {
  error: string;
  code?: string;
  _timing?: {
    spans: Record<string, number>;
    cold: boolean;
    boot_age_ms: number;
  };
};

export type ApiResult<T> = {
  status: number;
  ok: boolean;
  data: T | null;
  error: ErrorResponse | null;
  serverTiming: string | null;
  durationMs: number;
};

// --- Fetch helpers ---

/** Shared fetch core. Callers prepare the body string; this handles
 *  timing, response mapping, and network-error catching. */
async function request<T>(
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
  const start = performance.now();
  try {
    const res = await fetch(`${FUNCTIONS_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
    const durationMs = performance.now() - start;
    const json = await res.json();
    return {
      status: res.status,
      ok: res.ok,
      data: res.ok ? (json as T) : null,
      error: res.ok ? null : (json as ErrorResponse),
      serverTiming: res.headers.get("server-timing"),
      durationMs,
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      data: null,
      error: {
        error: err instanceof Error ? err.message : String(err),
        code: "NETWORK_ERROR",
      },
      serverTiming: null,
      durationMs: performance.now() - start,
    };
  }
}

function post<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
  return request<T>(
    path,
    typeof body === "string" ? body : JSON.stringify(body),
    headers,
  );
}

/**
 * POST raw bytes. Used for protected-event where the body bytes are
 * the exact bytes the assertion was signed over — any re-serialization
 * would break the signature.
 *
 * Converts Uint8Array back to string via TextDecoder for React Native
 * fetch compatibility (RN's BodyInit types don't include Uint8Array).
 * The bytes were created from a JSON string via TextEncoder, so
 * TextDecoder perfectly reverses the encoding — the wire bytes are
 * identical to what the assertion was signed over.
 */
function postRaw<T>(
  path: string,
  rawBody: Uint8Array,
  headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
  return request<T>(path, new TextDecoder().decode(rawBody), headers);
}

// --- Endpoint wrappers ---

export function issueChallenge(
  purpose: "attestation" | "assertion",
): Promise<ApiResult<ChallengeResponse>> {
  return post("/challenge", { purpose });
}

export function verifyAttestation(body: {
  keyId: string;
  challenge: string;
  attestation: string;
}): Promise<ApiResult<VerifyAttestationResponse>> {
  return post("/verify-attestation", body);
}

export function callUnprotectedEvent(): Promise<
  ApiResult<UnprotectedEventResponse>
> {
  return post("/unprotected-event", {});
}

export function callProtectedEvent(
  rawBody: Uint8Array,
  assertion: string,
  deviceId: string,
): Promise<ApiResult<ProtectedEventResponse>> {
  return postRaw("/protected-event", rawBody, {
    "X-App-Attest-Assertion": assertion,
    "X-App-Attest-Device-Id": deviceId,
  });
}

export function resetDevice(
  keyId: string,
): Promise<ApiResult<ResetDeviceResponse>> {
  return post("/reset-device", { keyId });
}
