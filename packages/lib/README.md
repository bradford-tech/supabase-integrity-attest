# supabase-integrity-attest

Server-side TypeScript library for verifying Apple App Attest attestations and
assertions using the WebCrypto API. Built for Deno and Supabase Edge Functions.

## Installation

```bash
# Deno
deno add jsr:@bradford-tech/supabase-integrity-attest

# npm
npm install @bradford-tech/supabase-integrity-attest
```

## Subpath imports

If you only need assertion verification, import from the lighter entry point:

```typescript
// Full library (attestation + assertion)
import { verifyAttestation, verifyAssertion } from "@bradford-tech/supabase-integrity-attest";

// Assertion only — skips asn1js and @noble/curves
import { verifyAssertion } from "@bradford-tech/supabase-integrity-attest/assertion";

// Attestation only
import { verifyAttestation } from "@bradford-tech/supabase-integrity-attest/attestation";
```

## Usage

### Attestation (one-time per device)

```typescript
import { verifyAttestation } from "@bradford-tech/supabase-integrity-attest";

const result = await verifyAttestation(
  { appId: "TEAMID.com.your.bundleid" },
  keyId, // base64 from client
  challenge, // the challenge you issued
  attestation, // base64 CBOR from client
);

// Store result.publicKeyPem and signCount (0) for this device
```

### Protecting edge functions with `withAssertion`

`withAssertion` wraps a request handler so that assertion verification,
device lookup, and sign count updates happen before your business logic runs.

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import { withAssertion } from "@bradford-tech/supabase-integrity-attest";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(withAssertion({
  appId: Deno.env.get("APP_ATTEST_APP_ID")!,
  developmentEnv: Deno.env.get("APP_ATTEST_ENV") === "development",
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
  updateSignCount: async (deviceId, newSignCount) => {
    await supabase
      .from("device_attestations")
      .update({ sign_count: newSignCount })
      .eq("key_id", deviceId);
  },
}, async (_req, { rawBody }) => {
  const { text, voice } = JSON.parse(new TextDecoder().decode(rawBody));
  // business logic
  return new Response(JSON.stringify({ audio: "..." }), {
    headers: { "Content-Type": "application/json" },
  });
}));
```

The client sends the assertion and device ID in headers. The request body
is the client data that was signed:

```
POST /functions/v1/your-endpoint
Headers:
  Content-Type: application/json
  X-App-Attest-Assertion: <base64-encoded assertion>
  X-App-Attest-Device-Id: <base64-encoded keyId>
Body:
  {"text": "Hello world", "voice": "en-US"}
```

Once you have multiple protected functions, extract the shared options into
a helper:

```typescript
// supabase/functions/_shared/attest.ts
import type { WithAssertionOptions } from "@bradford-tech/supabase-integrity-attest";

export const attestOptions: WithAssertionOptions = {
  appId: Deno.env.get("APP_ATTEST_APP_ID")!,
  // ... getDeviceKey, updateSignCount as above
};
```

```typescript
// supabase/functions/text-to-speech/index.ts
import { withAssertion } from "@bradford-tech/supabase-integrity-attest";
import { attestOptions } from "../_shared/attest.ts";

Deno.serve(withAssertion(attestOptions, async (_req, { rawBody }) => {
  const { text, voice } = JSON.parse(new TextDecoder().decode(rawBody));
  return new Response(JSON.stringify({ audio: "..." }));
}));
```

### Assertion (low-level)

For full control over the verification flow, use `verifyAssertion` directly:

```typescript
import { verifyAssertion } from "@bradford-tech/supabase-integrity-attest";

const result = await verifyAssertion(
  { appId: "TEAMID.com.your.bundleid" },
  assertion, // base64 CBOR from client
  clientData, // the request payload that was signed
  storedPublicKeyPem, // from attestation
  storedSignCount, // last known counter
);

// Update stored signCount to result.signCount
```

### Error handling

```typescript
import {
  AttestationError,
  AttestationErrorCode,
  AssertionError,
  AssertionErrorCode,
} from "@bradford-tech/supabase-integrity-attest";

try {
  await verifyAttestation(appInfo, keyId, challenge, attestation);
} catch (e) {
  if (e instanceof AttestationError) {
    console.log(e.code); // e.g. "NONCE_MISMATCH", "INVALID_CERTIFICATE_CHAIN"
  }
}
```

## Development environment

For apps using Apple's development App Attest environment:

```typescript
await verifyAttestation(
  { appId: "TEAMID.com.your.bundleid", developmentEnv: true },
  keyId,
  challenge,
  attestation,
);
```

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## License

MIT
