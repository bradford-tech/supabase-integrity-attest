---
title: Design & architecture
nextjs:
  metadata:
    title: Design & architecture
    description: The verification pipeline, module structure, and key design decisions.
---

How the library is structured and why certain design decisions were made. {% .lead %}

---

## Verification pipeline

{% diagram name="verification-pipeline" alt="Verification pipeline: CBOR decode, parse authenticator data, verify certificate chain, verify nonce, extract public key, return AttestationResult." /%}

**Attestation** passes through the full pipeline: CBOR decoding, X.509 certificate chain validation against Apple's root CA, nonce verification, public key extraction, and authenticator data checks (rpIdHash, AAGUID, credentialId, signCount).

**Assertion** takes a shorter path: CBOR decoding, authenticator data parsing, counter check, and ECDSA signature verification against the stored public key.

---

## Module map

The library is 10 focused source files under `packages/lib/src/`:

| Module              | Responsibility                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `attestation.ts`    | `verifyAttestation()` + custom CBOR decoder for Apple's malformed receipt headers                                                |
| `assertion.ts`      | `verifyAssertion()` — lightweight path using `cborg` for CBOR                                                                    |
| `certificate.ts`    | X.509 certificate chain verification, nonce extraction, public key extraction via `asn1js` + `@noble/curves` (P-384) + WebCrypto |
| `authdata.ts`       | Binary parser for authenticator data (rpIdHash, flags, signCount, AAGUID, credentialId)                                          |
| `cose.ts`           | COSE EC2 key → raw 65-byte uncompressed point / CryptoKey                                                                        |
| `der.ts`            | DER ↔ raw `r\|\|s` signature conversion (WebCrypto requires raw format)                                                          |
| `constants.ts`      | Apple root CA PEM, production/development AAGUIDs, nonce extension OID                                                           |
| `errors.ts`         | `AttestationError` / `AssertionError` with typed error codes                                                                     |
| `utils.ts`          | Byte helpers (concat, constant-time compare), base64/UTF-8 coercion, PEM import/export                                           |
| `with-assertion.ts` | `withAssertion()` middleware wrapper                                                                                             |

---

## Key design decisions

### WebCrypto only

The library uses `crypto.subtle` exclusively — no `node:crypto` imports. This is a hard requirement: Deno's `node:crypto` compatibility layer is incomplete (`X509Certificate.prototype.verify()` throws `ERR_NOT_IMPLEMENTED`), and Supabase Edge Functions don't guarantee Node.js API availability. WebCrypto is the only crypto API that works reliably across Deno, Deno Deploy, and Supabase.

### No pkijs

pkijs is the standard WebCrypto-based X.509 library, but it crashes in Supabase's runtime. At module load time, pkijs calls `initCryptoEngine()` → `setEngine(self.crypto.name, ...)`. In Supabase, `self.crypto.name` is `undefined`, and the engine tries to assign to `globalThis['undefined']`, which is read-only. This causes a fatal `TypeError` before any user code runs.

The library uses `asn1js` (pkijs's underlying ASN.1 parser, which has no initialization side effects) combined with direct WebCrypto calls for signature verification.

### @noble/curves for P-384

Apple's intermediate certificate uses a P-384 key to sign with SHA-256. Deno's WebCrypto doesn't support P-384+SHA-256 (`importKey` throws for this combination). The library uses `@noble/curves/p384` for this single verification step during attestation. This dependency is only loaded via the attestation path — the assertion subpath doesn't need it.

### Custom CBOR decoder for attestation

Apple's CBOR encoding of the attestation receipt field has incorrect length headers (overstated by ~21 bytes). Standard CBOR libraries like `cborg` fail to decode this. The attestation module includes a lightweight structure-aware parser that locates known map keys by scanning for their CBOR text-string encoding, bypassing the length fields entirely.

The assertion path uses `cborg` normally — Apple's assertion CBOR encoding is well-formed.

### PEM string output

Public keys are returned as PEM strings rather than `CryptoKey` objects. This allows stateless edge functions to serialize keys to a database and deserialize them on the next request without managing `CryptoKey` lifecycle.

### Constant-time comparisons

All nonce, hash, and key comparisons use constant-time byte comparison (`constantTimeEqual`). This prevents timing attacks where an attacker measures response times to learn partial information about expected values.

### Subpath exports

The library exports three entry points:

- `.` — everything
- `./attestation` — attestation verification + types
- `./assertion` — assertion verification + `withAssertion` + types

The assertion subpath avoids importing `asn1js` and `@noble/curves`, keeping the bundle minimal for edge functions that only verify assertions (the hot path).

---

## Distribution

- **JSR** (primary): `jsr:@bradford-tech/supabase-integrity-attest` — published via `deno publish`
- **npm** (secondary): `@bradford-tech/supabase-integrity-attest` — built from Deno source via [`@deno/dnt`](https://github.com/denoland/dnt)
- **Releases**: Automated via [release-please](https://github.com/googleapis/release-please) on push to `main`

---

## Contributing

### Running tests

```shell
cd packages/lib
deno task check    # Format check + lint + test (CI gate)
deno task fix      # Auto-format + auto-fix lint + test
deno task test     # Tests only (no network access)
```

### Project structure

```text
packages/lib/
  mod.ts              # Full public API
  attestation.ts      # Attestation subpath export
  assertion.ts        # Assertion subpath export
  src/                # Implementation modules
  tests/              # Test files + fixtures
  scripts/            # Build scripts (npm build via dnt)
```

### PR expectations

- All tests pass (`deno task check`)
- No `node:crypto` imports
- Constant-time comparisons for any security-sensitive byte comparison
- Update CHANGELOG.md via conventional commits (release-please handles this)
