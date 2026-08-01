// supabase/functions/_shared/integrity.ts
//
// Core scaffolding for @bradford-tech/supabase-integrity-attest.
// Copy this file into your own project's supabase/functions/_shared/
// directory as a starting point — expect to edit env var names and
// the Supabase client bootstrap to match your conventions. The
// protect() / attest() / issueChallenge() / consumeChallenge*()
// closures are the stable surface.
//
// All storage plumbing (challenge lifecycle, device key upsert/lookup,
// CAS sign-count commit, bytea encoding) comes from the library's
// createSupabaseAdapter() — see the /supabase subpath docs. The schema
// it expects ships with the package as sql/app_attest.sql.

import { createClient } from '@supabase/supabase-js';
import {
  type AssertionContext,
  type AttestationContext,
  withAssertion,
  withAttestation,
} from '@bradford-tech/supabase-integrity-attest';
import { createSupabaseAdapter } from '@bradford-tech/supabase-integrity-attest/supabase';
import { decodeBase64, encodeBase64 } from '@std/encoding/base64';

// --- Supabase client (service role for admin writes) ---

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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

// --- Storage adapter ---

const adapter = createSupabaseAdapter(supabase, { challengeTtlSeconds: 60 });

// --- Challenge lifecycle ---

/**
 * Issue a fresh single-use challenge. Returns the raw bytes and the
 * base64-encoded form for transport.
 */
export const issueChallenge = adapter.issueChallenge;

/**
 * Atomically consume an attestation-purpose challenge. Returns true if
 * the challenge was valid, unused, and unexpired (and is now consumed).
 */
export function consumeChallengeAttestation(
  challenge: Uint8Array,
): Promise<boolean> {
  return adapter.consumeChallenge(challenge, 'attestation');
}

/**
 * Atomically consume an assertion-purpose challenge. Returns true if
 * the challenge was valid, unused, and unexpired (and is now consumed).
 */
export function consumeChallengeAssertion(
  challenge: Uint8Array,
): Promise<boolean> {
  return adapter.consumeChallenge(challenge, 'assertion');
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
      storeDeviceKey: adapter.storeDeviceKey,
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
      getDeviceKey: adapter.getDeviceKey,
      commitSignCount: adapter.commitSignCount,
    },
    handler,
  );
}

// Re-export base64 helpers for edge-function convenience.
export { decodeBase64, encodeBase64 };
