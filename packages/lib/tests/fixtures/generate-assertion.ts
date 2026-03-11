// tests/fixtures/generate-assertion.ts
import { encode } from "cborg";
import { rawToDer } from "../../src/der.ts";
import { concat, exportKeyToPem } from "../../src/utils.ts";

export interface SyntheticAssertionOptions {
  appId: string;
  clientData: Uint8Array;
  signCount: number;
  keyPair?: CryptoKeyPair;
}

export interface SyntheticAssertionResult {
  assertion: Uint8Array;
  publicKeyPem: string;
  clientData: Uint8Array;
  signCount: number;
  keyPair: CryptoKeyPair;
}

/**
 * Generate a synthetic but structurally valid App Attest assertion.
 * Uses WebCrypto to sign, matching real App Attest behavior.
 */
export async function generateSyntheticAssertion(
  opts: SyntheticAssertionOptions,
): Promise<SyntheticAssertionResult> {
  const keyPair = opts.keyPair ?? await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  // Build authenticatorData (37 bytes)
  const rpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(opts.appId)),
  );
  const flags = new Uint8Array([0x01]); // UP flag
  const signCountBytes = new Uint8Array(4);
  new DataView(signCountBytes.buffer).setUint32(0, opts.signCount, false);
  const authenticatorData = concat(rpIdHash, flags, signCountBytes);

  // Compute clientDataHash
  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", opts.clientData),
  );

  // Compute nonce = SHA-256(authenticatorData || clientDataHash)
  // Apple signs this nonce as the message (not authData || clientDataHash directly)
  const nonce = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      concat(authenticatorData, clientDataHash),
    ),
  );
  const signatureRaw = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      nonce,
    ),
  );

  // Convert raw r||s to DER (Apple's format)
  const signatureDer = rawToDer(signatureRaw);

  // CBOR-encode the assertion
  const assertion = encode({
    signature: signatureDer,
    authenticatorData,
  });

  const publicKeyPem = await exportKeyToPem(keyPair.publicKey);

  return {
    assertion: new Uint8Array(assertion),
    publicKeyPem,
    clientData: opts.clientData,
    signCount: opts.signCount,
    keyPair,
  };
}
