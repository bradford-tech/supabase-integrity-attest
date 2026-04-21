// supabase/functions/_shared/integrity.ts
//
// Core scaffolding for @bradford-tech/supabase-integrity-attest.
// Copy this file into your own project's supabase/functions/_shared/
// directory as a starting point — expect to edit env var names and
// the Supabase client bootstrap to match your conventions. The
// protect() / attest() / issueChallenge() / consumeChallenge*()
// closures are the stable surface.

import { createClient } from '@supabase/supabase-js';
import {
  type AttestationContext,
  withAttestation,
} from '@bradford-tech/supabase-integrity-attest';
import {
  type AssertionContext,
  withAssertion,
} from '@bradford-tech/supabase-integrity-attest';
import { decodeBase64, encodeBase64 } from '@std/encoding/base64';

// --- Supabase client (service role for admin writes) ---

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// --- bytea encoding helper ---

/**
 * Encode a Uint8Array as a Postgres bytea hex literal (`\x<hex>`).
 *
 * Required because supabase-js v2 serializes Uint8Array via
 * JSON.stringify, which produces the object form `{"0":byte,"1":byte,...}`
 * and writes those literal JSON text bytes into a bytea column —
 * NOT the raw bytes you intended. Worse, the same serialization
 * produces a *different* string in URL filter parameters, so
 * .insert() and .eq() round-trips silently mismatch.
 *
 * The fix: explicitly convert Uint8Array → `\x<hex>` on both sides.
 * Postgres parses `\x...` strings as bytea literals at insert time,
 * and PostgREST passes string filter values through unchanged, so
 * insert and query agree on the same bytes.
 */
function toPgBytea(bytes: Uint8Array): string {
  let hex = '\\x';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// --- App Attest configuration ---

// Derive APP_ID from the same EXPO_PUBLIC_* env vars the client uses.
// These are passed through from .env.local via config.toml
// [edge_runtime.secrets], so there's a single source of truth.
const teamId = Deno.env.get('EXPO_PUBLIC_TEAM_ID');
const bundleId = Deno.env.get('EXPO_PUBLIC_BUNDLE_IDENTIFIER');
const isProduction = Deno.env.get('ENVIRONMENT') === 'production';

const appId = teamId && bundleId ? `${teamId}.${bundleId}` : undefined;

if (!appId && isProduction) {
  throw new Error(
    'EXPO_PUBLIC_TEAM_ID and EXPO_PUBLIC_BUNDLE_IDENTIFIER env vars are ' +
      'required in production. Set them in .env.local.',
  );
}

export const APP_INFO = {
  appId: appId ?? 'TEAMID1234.com.example.demo',
  developmentEnv: !isProduction,
};

// --- Challenge lifecycle ---

/** How long a freshly-issued challenge is valid for. */
const CHALLENGE_TTL_SECONDS = 60;

/**
 * Issue a fresh single-use challenge. Returns the raw bytes and the
 * base64-encoded form for transport.
 */
export async function issueChallenge(
  purpose: 'attestation' | 'assertion',
): Promise<
  { challenge: Uint8Array; challengeBase64: string; expiresAt: Date }
> {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);

  const { error } = await supabase
    .from('app_attest_challenges')
    .insert({
      challenge: toPgBytea(challenge),
      purpose,
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    throw new Error(`Failed to insert challenge: ${error.message}`);
  }

  return {
    challenge,
    challengeBase64: encodeBase64(challenge),
    expiresAt,
  };
}

/**
 * Atomically consume an attestation-purpose challenge. Returns true if
 * the challenge was valid, unused, and unexpired (and is now consumed).
 */
export function consumeChallengeAttestation(
  challenge: Uint8Array,
): Promise<boolean> {
  return consumeChallenge(challenge, 'attestation');
}

/**
 * Atomically consume an assertion-purpose challenge. Returns true if
 * the challenge was valid, unused, and unexpired (and is now consumed).
 */
export function consumeChallengeAssertion(
  challenge: Uint8Array,
): Promise<boolean> {
  return consumeChallenge(challenge, 'assertion');
}

async function consumeChallenge(
  challenge: Uint8Array,
  purpose: 'attestation' | 'assertion',
): Promise<boolean> {
  // Atomic DELETE ... RETURNING with expires_at and purpose filters.
  // If zero rows are affected, the challenge was missing, expired, or
  // purpose-mismatched — all of which should reject.
  const { data, error } = await supabase
    .from('app_attest_challenges')
    .delete()
    .eq('challenge', toPgBytea(challenge))
    .eq('purpose', purpose)
    .gt('expires_at', new Date().toISOString())
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to consume challenge: ${error.message}`);
  }
  return data !== null;
}

// --- Device key lifecycle ---

/** Look up a stored device key by its device_id (= Apple keyId). */
async function getDeviceKey(deviceId: string) {
  const { data, error } = await supabase
    .from('app_attest_devices')
    .select('public_key_pem, sign_count')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read device key: ${error.message}`);
  }
  if (!data) return null;
  return {
    publicKeyPem: data.public_key_pem,
    signCount: Number(data.sign_count),
  };
}

/**
 * Atomic compare-and-swap on sign_count. Returns true if the row was
 * advanced, false if another concurrent request already passed this
 * counter value. See the library's commitSignCount docs for details.
 */
async function commitSignCount(
  deviceId: string,
  newSignCount: number,
): Promise<boolean> {
  // Atomic compare-and-swap: only advance sign_count if the stored value
  // is strictly less than newSignCount. The { count: 'exact' } option on
  // .update() (NOT on a chained .select) is the supabase-js v2 idiom for
  // getting the affected row count back without selecting any returning
  // rows. count > 0 means we won the CAS; count === 0 means another
  // concurrent request already advanced past this counter.
  const { count, error } = await supabase
    .from('app_attest_devices')
    .update(
      {
        sign_count: newSignCount,
        last_seen_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .eq('device_id', deviceId)
    .lt('sign_count', newSignCount);

  if (error) {
    throw new Error(`Failed to commit sign count: ${error.message}`);
  }
  return (count ?? 0) > 0;
}

/**
 * Persist a verified device key. UPSERT semantics — re-attesting an
 * existing device is cryptographically safe (Apple has re-signed).
 */
async function storeDeviceKey(row: {
  deviceId: string;
  publicKeyPem: string;
  signCount: number;
  receipt: Uint8Array;
}): Promise<void> {
  const { error } = await supabase
    .from('app_attest_devices')
    .upsert({
      device_id: row.deviceId,
      public_key_pem: row.publicKeyPem,
      sign_count: row.signCount,
      receipt: toPgBytea(row.receipt),
    });

  if (error) {
    throw new Error(`Failed to store device key: ${error.message}`);
  }
}

// --- One-liner handler wrappers ---

/**
 * Wrap a handler with App Attest attestation verification. Use on your
 * one-time device registration endpoint (e.g., verify-attestation).
 */
export function attest(
  handler: (
    req: Request,
    ctx: AttestationContext,
  ) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return withAttestation(
    {
      appId: APP_INFO.appId,
      developmentEnv: APP_INFO.developmentEnv,
      consumeChallenge: consumeChallengeAttestation,
      storeDeviceKey,
    },
    handler,
  );
}

/**
 * Wrap a handler with App Attest assertion verification. Use on every
 * protected business endpoint. This is the one-liner consumers copy
 * and paste for every function they want to protect.
 */
export function protect(
  handler: (
    req: Request,
    ctx: AssertionContext,
  ) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return withAssertion(
    {
      appId: APP_INFO.appId,
      getDeviceKey,
      commitSignCount,
    },
    handler,
  );
}

// Re-export base64 helpers for edge-function convenience.
export { decodeBase64, encodeBase64 };
