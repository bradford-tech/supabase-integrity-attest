# supabase-integrity-attest

Server-side TypeScript library for verifying Apple App Attest attestations and
assertions using the WebCrypto API. Built for Deno and Supabase Edge Functions.

## Installation

```bash
deno add jsr:@bradford/supabase-integrity-attest
```

## Usage

### Attestation (one-time per device)

```typescript
import { verifyAttestation } from "supabase-integrity-attest";

const result = await verifyAttestation(
  { appId: "TEAMID.com.your.bundleid" },
  keyId, // base64 from client
  challenge, // the challenge you issued
  attestation, // base64 CBOR from client
);

// Store result.publicKeyPem and signCount (0) for this device
```

### Assertion (every protected request)

```typescript
import { verifyAssertion } from "supabase-integrity-attest";

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
} from "supabase-integrity-attest";

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
