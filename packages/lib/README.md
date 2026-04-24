# supabase-integrity-attest

Apple App Attest server-side verification for edge runtimes, using only WebCrypto.

## Install

```bash
# Deno
deno add jsr:@bradford-tech/supabase-integrity-attest

# npm
npm install @bradford-tech/supabase-integrity-attest
```

## Quick start

Verify a device attestation and extract its public key:

```ts
import { verifyAttestation } from "@bradford-tech/supabase-integrity-attest";

const clientDataHash = new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(challenge)),
);

const { publicKeyPem, signCount } = await verifyAttestation(
  { appId: "TEAMID.com.example.app" },
  keyId,          // base64 key identifier from client
  clientDataHash, // SHA-256 of the challenge you issued
  attestation,    // base64 CBOR attestation from client
);
// publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMFkw..."
// signCount: 0
```

Store `publicKeyPem` and `signCount` for this device. Use them to verify future assertions.

## Why this library

Existing App Attest verification libraries depend on `node:crypto` or packages that crash in edge runtimes. `appattest-checker-node` uses `X509Certificate.verify()`, which throws `ERR_NOT_IMPLEMENTED` in Deno. `pkijs` crashes at module load in Supabase Edge Functions because `self.crypto.name` is undefined. `@peculiar/x509` pulls in `tsyringe` and `reflect-metadata`, which rely on global side effects during module initialization.

This library uses only `crypto.subtle` for cryptographic operations, with `asn1js` for X.509 parsing and `@noble/curves` for one operation Deno's WebCrypto doesn't support (P-384 signature verification on Apple's intermediate certificate).

## Middleware

Both middleware wrappers below use a Supabase service-role client for database access:

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
```

### `withAttestation` -- device registration

`withAttestation` wraps a one-time device registration endpoint with automatic challenge consumption, attestation verification, and device key storage:

```ts
import { withAttestation } from "@bradford-tech/supabase-integrity-attest";

Deno.serve(withAttestation({
  appId: Deno.env.get("APP_ATTEST_APP_ID")!,
  consumeChallenge: async (challenge) => {
    const id = new TextDecoder().decode(challenge);
    const { data } = await supabase
      .from("attestation_challenges")
      .delete()
      .eq("id", id)
      .select("id");
    return (data?.length ?? 0) > 0;
  },
  storeDeviceKey: async ({ deviceId, publicKeyPem, signCount }) => {
    await supabase
      .from("device_attestations")
      .upsert({ key_id: deviceId, public_key_pem: publicKeyPem, sign_count: signCount });
  },
}, (_req, ctx) => {
  // ctx.deviceId, ctx.publicKeyPem, ctx.signCount, ctx.receipt, ctx.timings
  return Response.json({ deviceId: ctx.deviceId });
}));
```

`consumeChallenge` must be atomic: return `true` if the challenge was valid, unused, and unexpired (and is now consumed), `false` otherwise. Use `DELETE ... RETURNING` to guarantee single-use semantics.

The default extractor reads a JSON body:

```
POST /functions/v1/attest
Content-Type: application/json

{"keyId": "<base64>", "challenge": "<base64>", "attestation": "<base64>"}
```

### `withAssertion` -- protected requests

`withAssertion` wraps any protected endpoint with automatic assertion verification, device key lookup, and sign count commit:

```ts
import { withAssertion } from "@bradford-tech/supabase-integrity-attest";

Deno.serve(withAssertion({
  appId: Deno.env.get("APP_ATTEST_APP_ID")!,
  getDeviceKey: async (deviceId) => {
    const { data } = await supabase
      .from("device_attestations")
      .select("public_key_pem, sign_count")
      .eq("key_id", deviceId)
      .single();
    return data
      ? { publicKeyPem: data.public_key_pem, signCount: data.sign_count }
      : null;
  },
  commitSignCount: async (deviceId, newSignCount) => {
    const { data } = await supabase
      .from("device_attestations")
      .update({ sign_count: newSignCount })
      .eq("key_id", deviceId)
      .lt("sign_count", newSignCount)
      .select("key_id");
    return (data?.length ?? 0) > 0;
  },
}, async (_req, { rawBody }) => {
  const payload = JSON.parse(new TextDecoder().decode(rawBody));
  return Response.json({ ok: true });
}));
```

The client sends the assertion and device ID in headers. The request body is the signed client data:

```
POST /functions/v1/your-endpoint
X-App-Attest-Assertion: <base64-encoded assertion>
X-App-Attest-Device-Id: <base64-encoded keyId>
Content-Type: application/json

{"text": "Hello world", "voice": "en-US"}
```

### Sign count atomicity

`commitSignCount` **must** use compare-and-swap: only update the stored count if the current value is strictly less than `newSignCount`. An unconditional `UPDATE ... SET sign_count = $1` silently breaks replay protection when two requests arrive concurrently.

```sql
UPDATE device_attestations
   SET sign_count = $1, last_seen_at = now()
 WHERE key_id = $2 AND sign_count < $1
```

Return `true` if the row was updated. The library converts `false` into `AssertionError(SIGN_COUNT_STALE)`.

### Shared options

Once you have multiple protected functions, extract the shared options:

```ts
// supabase/functions/_shared/attest.ts
import type { WithAssertionOptions } from "@bradford-tech/supabase-integrity-attest";

export const assertionOptions: WithAssertionOptions = {
  appId: Deno.env.get("APP_ATTEST_APP_ID")!,
  // ... getDeviceKey, commitSignCount as above
};
```

```ts
// supabase/functions/text-to-speech/index.ts
import { withAssertion } from "@bradford-tech/supabase-integrity-attest";
import { assertionOptions } from "../_shared/attest.ts";

Deno.serve(withAssertion(assertionOptions, async (_req, { rawBody }) => {
  const { text, voice } = JSON.parse(new TextDecoder().decode(rawBody));
  return Response.json({ audio: "..." });
}));
```

## Low-level API

For full control over the verification flow, use `verifyAttestation` and `verifyAssertion` directly.

The quick start above shows `verifyAttestation`. Note that `clientDataHash` must be SHA-256 of the challenge, not the raw challenge. Client SDKs (Expo's `attestKeyAsync`, native `DCAppAttestService.attestKey`) hash the challenge internally before passing to Apple; you must produce the same hash server-side. The `withAttestation` middleware handles this automatically.

### Assertion

```ts
import { verifyAssertion } from "@bradford-tech/supabase-integrity-attest";

const { signCount } = await verifyAssertion(
  { appId: "TEAMID.com.example.app" },
  assertion,         // base64 CBOR from client
  clientData,        // the request payload that was signed
  storedPublicKeyPem,
  storedSignCount,
);
// Update stored signCount to signCount
```

## Subpath imports

Import only what you need to reduce bundle size:

```ts
// Full library (attestation + assertion)
import { verifyAttestation, verifyAssertion } from "@bradford-tech/supabase-integrity-attest";

// Assertion only -- skips asn1js and @noble/curves
import { verifyAssertion, withAssertion } from "@bradford-tech/supabase-integrity-attest/assertion";

// Attestation only
import { verifyAttestation, withAttestation } from "@bradford-tech/supabase-integrity-attest/attestation";
```

## Error handling

```ts
import {
  AttestationError,
  AssertionError,
} from "@bradford-tech/supabase-integrity-attest";

try {
  await verifyAttestation(appInfo, keyId, clientDataHash, attestation);
} catch (e) {
  if (e instanceof AttestationError) {
    console.log(e.code);
    // => "NONCE_MISMATCH"
  }
}
```

### Attestation error codes

| Code | Meaning |
| --- | --- |
| `INVALID_FORMAT` | CBOR decoding or structural validation failed |
| `INVALID_CERTIFICATE_CHAIN` | X.509 certificate chain verification failed |
| `NONCE_MISMATCH` | Computed nonce does not match the certificate nonce |
| `RP_ID_MISMATCH` | RP ID hash does not match SHA-256 of the app ID |
| `KEY_ID_MISMATCH` | Public key hash does not match the provided key ID |
| `INVALID_COUNTER` | Sign count is not zero (required for attestation) |
| `INVALID_AAGUID` | AAGUID does not match the expected environment |
| `CHALLENGE_INVALID` | Challenge missing, expired, or already consumed (`withAttestation` only) |
| `INTERNAL_ERROR` | Storage callback or internal error (`withAttestation` only) |

### Assertion error codes

| Code | Meaning |
| --- | --- |
| `INVALID_FORMAT` | CBOR decoding or structural validation failed |
| `RP_ID_MISMATCH` | RP ID hash does not match SHA-256 of the app ID |
| `COUNTER_NOT_INCREMENTED` | Sign count was not greater than the stored value |
| `SIGNATURE_INVALID` | ECDSA signature verification failed |
| `DEVICE_NOT_FOUND` | No device key for the given device ID (`withAssertion` only) |
| `INTERNAL_ERROR` | Storage callback or internal error (`withAssertion` only) |
| `SIGN_COUNT_STALE` | Concurrent request already advanced the counter (`withAssertion` only) |

## Development environment

For apps using Apple's development App Attest environment, pass `developmentEnv: true`:

```ts
await verifyAttestation(
  { appId: "TEAMID.com.example.app", developmentEnv: true },
  keyId,
  clientDataHash,
  attestation,
);
```

`withAttestation` also accepts `developmentEnv` in its options.

## Documentation

Full documentation at [integrity-attest.bradford.tech](https://integrity-attest.bradford.tech).

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/bradford-tech/supabase-integrity-attest).

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## License

MIT
