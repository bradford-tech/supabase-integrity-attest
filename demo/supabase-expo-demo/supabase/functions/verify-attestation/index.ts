// supabase/functions/verify-attestation/index.ts
//
// TEMPORARY DIAGNOSTIC VERSION — add logging to trace NONCE_MISMATCH.
// Will revert to attest() wrapper once the bug is found.
import {
  type AttestationError,
  verifyAttestation,
} from '@bradford-tech/supabase-integrity-attest/attestation';
import {
  APP_INFO,
  consumeChallengeAttestation,
  decodeBase64,
  storeDeviceKey,
} from '../_shared/integrity.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  console.log('[verify-attestation] Request received');

  let body: { keyId?: string; challenge?: string; attestation?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
    });
  }

  if (!body.keyId || !body.challenge || !body.attestation) {
    return new Response(
      JSON.stringify({ error: 'Missing keyId, challenge, or attestation' }),
      { status: 400 },
    );
  }

  console.log('[verify-attestation] APP_INFO:', JSON.stringify(APP_INFO));
  console.log(
    '[verify-attestation] keyId (first 16):',
    body.keyId.slice(0, 16),
  );
  console.log(
    '[verify-attestation] challenge (first 16):',
    body.challenge.slice(0, 16),
  );
  console.log(
    '[verify-attestation] attestation length:',
    body.attestation.length,
  );

  // Decode raw challenge bytes
  const rawChallenge = decodeBase64(body.challenge);
  console.log(
    '[verify-attestation] rawChallenge bytes length:',
    rawChallenge.length,
  );

  // Step 1: Consume challenge
  const consumed = await consumeChallengeAttestation(rawChallenge);
  console.log('[verify-attestation] challenge consumed:', consumed);
  if (!consumed) {
    return new Response(
      JSON.stringify({
        error: 'Challenge invalid',
        code: 'CHALLENGE_INVALID',
      }),
      { status: 401 },
    );
  }

  // Step 2: Hash the challenge STRING (not the base64-decoded bytes).
  // Expo's attestKeyAsync receives the challenge as a string and does:
  //   let data = Data(challenge.utf8)
  //   let clientDataHash = SHA256.hash(data: data)
  // So we must hash the same UTF-8 string bytes to match.
  const challengeStringBytes = new TextEncoder().encode(body.challenge);
  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', challengeStringBytes),
  );
  console.log(
    '[verify-attestation] clientDataHash (hex, first 16 bytes):',
    Array.from(clientDataHash.slice(0, 16))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  );

  // Step 3: Verify attestation
  try {
    const result = await verifyAttestation(
      APP_INFO,
      body.keyId,
      clientDataHash,
      body.attestation,
    );
    console.log('[verify-attestation] SUCCESS! signCount:', result.signCount);

    // Step 4: Store device key
    await storeDeviceKey({
      deviceId: body.keyId,
      publicKeyPem: result.publicKeyPem,
      signCount: result.signCount,
      receipt: result.receipt,
    });

    return new Response(
      JSON.stringify({ ok: true, deviceId: body.keyId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const e = err as AttestationError;
    console.error('[verify-attestation] FAILED:', e.code, e.message);
    return new Response(
      JSON.stringify({ error: e.message, code: e.code }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
