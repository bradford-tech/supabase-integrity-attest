# Changelog

## [0.8.2](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.8.1...v0.8.2) (2026-04-24)


### Bug Fixes

* **docs:** correct API examples and add missing middleware docs ([ba411f4](https://github.com/bradford-tech/supabase-integrity-attest/commit/ba411f46c964103dd72d16defd0e2a1928d4215f))

## [0.8.1](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.8.0...v0.8.1) (2026-04-24)


### Bug Fixes

* **attestation:** wrap authdata parse error as AttestationError ([d7933db](https://github.com/bradford-tech/supabase-integrity-attest/commit/d7933db64337a26be0263273a68d99b18cebc7bc))
* **attestation:** wrap CBOR decoder errors as AttestationError ([e3b8197](https://github.com/bradford-tech/supabase-integrity-attest/commit/e3b8197719bfc7162837f8325c5a6a90a97ff75f))
* **middleware:** return 409 for SIGN_COUNT_STALE instead of 401 ([2c1fcbf](https://github.com/bradford-tech/supabase-integrity-attest/commit/2c1fcbf67a4972768517865bbc7005718ab65b0e))

## [0.8.0](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.7.0...v0.8.0) (2026-04-21)


### ⚠ BREAKING CHANGES

* **assertion:** developmentEnv is removed from the assertion-side AppInfo interface and WithAssertionOptions. Consumers passing it in object literals to verifyAssertion() or withAssertion() will get a TypeScript excess-property error. Fix: remove the property — it never had any effect on assertion verification.

### Bug Fixes

* **assertion:** wrap base64 decode error as AssertionError ([2a59120](https://github.com/bradford-tech/supabase-integrity-attest/commit/2a59120819779f2edc3ba71f81e7ca3af9f21d37))
* **certificate:** wrap ASN.1 structural casts as AttestationError ([cc450e3](https://github.com/bradford-tech/supabase-integrity-attest/commit/cc450e3f72c141fbe4ddd5b9c7f82d2069f1e3ce))
* **middleware:** guard onError callback against throws ([a28e310](https://github.com/bradford-tech/supabase-integrity-attest/commit/a28e3106e785107fa5e5a950fa9e7535b3d9b891))


### Code Refactoring

* **assertion:** remove unused developmentEnv from API ([e61bc86](https://github.com/bradford-tech/supabase-integrity-attest/commit/e61bc86afb048309064bd4fa5a998aa3f0599162))

## [0.7.0](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.6.0...v0.7.0) (2026-04-13)


### ⚠ BREAKING CHANGES

* **demo:** custom extractAttestation implementations must return challengeAsSent alongside challenge.
* **lib:** hash challenge in withAttestation, rename parameter to clientDataHash ([#43](https://github.com/bradford-tech/supabase-integrity-attest/issues/43))
* **lib:** AssertionErrorCode and AttestationErrorCode gain new members. Exhaustive switch statements on these enums will need updating.

### Features

* **demo:** Phase C hero client UI + fix(lib)!: challengeAsSent attestation contract ([#46](https://github.com/bradford-tech/supabase-integrity-attest/issues/46)) ([63be406](https://github.com/bradford-tech/supabase-integrity-attest/commit/63be40684a8896210ea87caeb6b11c8db2c6bf9c))
* **lib:** withAttestation middleware + withAssertion TOCTOU fix (Phase A) ([#35](https://github.com/bradford-tech/supabase-integrity-attest/issues/35)) ([a89ddd8](https://github.com/bradford-tech/supabase-integrity-attest/commit/a89ddd8a8b3587f25a5de91d326d290553380f66))


### Bug Fixes

* **ci:** add DENO_NO_PACKAGE_JSON to release workflow ([23ae26c](https://github.com/bradford-tech/supabase-integrity-attest/commit/23ae26c7f6a46517d2084ae79b9964b477035699))
* **ci:** use path-based output keys for release-please ([30c10b8](https://github.com/bradford-tech/supabase-integrity-attest/commit/30c10b89d8d0a4df63e3219643cd73eb745e9ee3))
* **ci:** use separate release PRs to fix component matching ([c319a24](https://github.com/bradford-tech/supabase-integrity-attest/commit/c319a2480206e2e448133e8039f83c32c5a8c61e))
* **lib:** disable dnt test compilation in build_npm.ts ([cab281e](https://github.com/bradford-tech/supabase-integrity-attest/commit/cab281ea0b9fa2749821fdbbf7b4b3fe24945177))
* **lib:** hash challenge in withAttestation, rename parameter to clientDataHash ([#43](https://github.com/bradford-tech/supabase-integrity-attest/issues/43)) ([76f6be9](https://github.com/bradford-tech/supabase-integrity-attest/commit/76f6be9a948a983bb615fad5355f32a38c46afb0))
* prevent Deno from resolving full npm workspace ([436d64c](https://github.com/bradford-tech/supabase-integrity-attest/commit/436d64c09ff218dabad610476f2aed6ab84854a5))
* use bitwise OR in CBOR uint parser to avoid signed arithmetic ([295b1c8](https://github.com/bradford-tech/supabase-integrity-attest/commit/295b1c81601833d56c859155619d0dae95c324e7))

## [0.6.0](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.5.0...v0.6.0) (2026-04-13)

*Version skipped — no functional changes.*

## [0.5.0](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.4.1...v0.5.0) (2026-04-13)


### ⚠ BREAKING CHANGES

* **lib:** hash challenge in withAttestation, rename parameter to clientDataHash ([#43](https://github.com/bradford-tech/supabase-integrity-attest/issues/43))

### Bug Fixes

* **lib:** hash challenge in withAttestation, rename parameter to clientDataHash ([#43](https://github.com/bradford-tech/supabase-integrity-attest/issues/43)) ([76f6be9](https://github.com/bradford-tech/supabase-integrity-attest/commit/76f6be9a948a983bb615fad5355f32a38c46afb0))

## [0.4.1](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.4.0...v0.4.1) (2026-04-12)


### Bug Fixes

* **lib:** disable dnt test compilation in build_npm.ts ([cab281e](https://github.com/bradford-tech/supabase-integrity-attest/commit/cab281ea0b9fa2749821fdbbf7b4b3fe24945177))

## [0.4.0](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.3.2...v0.4.0) (2026-04-10)


### ⚠ BREAKING CHANGES

* **lib:** AssertionErrorCode and AttestationErrorCode gain new members. Exhaustive switch statements on these enums will need updating.

### Features

* **lib:** withAttestation middleware + withAssertion TOCTOU fix (Phase A) ([#35](https://github.com/bradford-tech/supabase-integrity-attest/issues/35)) ([a89ddd8](https://github.com/bradford-tech/supabase-integrity-attest/commit/a89ddd8a8b3587f25a5de91d326d290553380f66))

## [0.3.2](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.3.1...v0.3.2) (2026-03-12)


### Bug Fixes

* **ci:** add DENO_NO_PACKAGE_JSON to release workflow ([23ae26c](https://github.com/bradford-tech/supabase-integrity-attest/commit/23ae26c7f6a46517d2084ae79b9964b477035699))
* **ci:** use path-based output keys for release-please ([30c10b8](https://github.com/bradford-tech/supabase-integrity-attest/commit/30c10b89d8d0a4df63e3219643cd73eb745e9ee3))
* **ci:** use separate release PRs to fix component matching ([c319a24](https://github.com/bradford-tech/supabase-integrity-attest/commit/c319a2480206e2e448133e8039f83c32c5a8c61e))
* use bitwise OR in CBOR uint parser to avoid signed arithmetic ([295b1c8](https://github.com/bradford-tech/supabase-integrity-attest/commit/295b1c81601833d56c859155619d0dae95c324e7))

## [0.3.1](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.3.0...v0.3.1) (2026-03-11)


### Bug Fixes

* prevent Deno from resolving full npm workspace ([436d64c](https://github.com/bradford-tech/supabase-integrity-attest/commit/436d64c09ff218dabad610476f2aed6ab84854a5))

## [0.3.0](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.2.4...v0.3.0) (2026-03-08)


### Features

* add assertion subpath entry point ([de8afd9](https://github.com/bradford-tech/supabase-integrity-attest/commit/de8afd9fac52d125b70eb457492eba08759f62e7))
* add attestation subpath entry point ([46e54df](https://github.com/bradford-tech/supabase-integrity-attest/commit/46e54df88bc5e78bb93c128d4d22b59fd37bee87))
* add subpath exports to deno.json ([d8f2300](https://github.com/bradford-tech/supabase-integrity-attest/commit/d8f2300e1725cec11d46470d1878b3b6f387f113))
* add subpath exports to npm build ([1d4a88c](https://github.com/bradford-tech/supabase-integrity-attest/commit/1d4a88cdaff893adf8c829fec7816c103a79d28e))

## [0.2.4](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.2.3...v0.2.4) (2026-03-08)


### Bug Fixes

* **assertion:** sign nonce not raw concatenation ([596a87d](https://github.com/bradford-tech/supabase-integrity-attest/commit/596a87d1e6bfcf3da658b3b9dc611fff54341f27))

## [0.2.3](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.2.2...v0.2.3) (2026-03-08)


### Bug Fixes

* disable lowS in p384.verify for X.509 sigs ([f2a466d](https://github.com/bradford-tech/supabase-integrity-attest/commit/f2a466d6c62b7c2a68ee32fa8160cf1b30634be6))

## [0.2.2](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.2.1...v0.2.2) (2026-03-08)


### Bug Fixes

* replace pkijs with asn1js + WebCrypto ([bee5306](https://github.com/bradford-tech/supabase-integrity-attest/commit/bee5306c5608a56ca8adbe9fb0143c3e2d1d887d))

## [0.2.1](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.2.0...v0.2.1) (2026-03-08)


### Bug Fixes

* add ESNext and DOM libs to dnt compiler options ([e809b2b](https://github.com/bradford-tech/supabase-integrity-attest/commit/e809b2bac651b71b4e4fdefada945dc7dcfe507d))

## [0.2.0](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.1.0...v0.2.0) (2026-03-08)


### Features

* add Apple Root CA and AAGUID constants ([9b19b39](https://github.com/bradford-tech/supabase-integrity-attest/commit/9b19b3920407300c70302bf69bbebe07270b1bdd))
* add assertion verification ([852e750](https://github.com/bradford-tech/supabase-integrity-attest/commit/852e750a3860c0c6dc11b338f8464a2be72d1e4f))
* add attestation validation script ([b5aff04](https://github.com/bradford-tech/supabase-integrity-attest/commit/b5aff047aae3bfc1ae5b9cfd07f4d15f372dcd41))
* add attestation verification ([a9b1b24](https://github.com/bradford-tech/supabase-integrity-attest/commit/a9b1b2404789e5bb77da3cf62d287e68b6f2d76c))
* add authenticatorData binary parser ([f2eb8c1](https://github.com/bradford-tech/supabase-integrity-attest/commit/f2eb8c1dae8ae37efeb38c26297f8c06ada755b0))
* add COSE key to CryptoKey conversion ([838f55d](https://github.com/bradford-tech/supabase-integrity-attest/commit/838f55dc8e17a2b683981c30a968ef87ca978df3))
* add DER &lt;-&gt; raw ECDSA signature conversion ([ab12073](https://github.com/bradford-tech/supabase-integrity-attest/commit/ab1207318235cb2565501647345ad3d202c5b270))
* add test fixtures for attestation and assertion ([db3e15f](https://github.com/bradford-tech/supabase-integrity-attest/commit/db3e15ff7e9e50a574151498d9d239da72e623ff))
* add typed error classes for attestation and assertion ([49473cb](https://github.com/bradford-tech/supabase-integrity-attest/commit/49473cb350dcf04b77961fd86f0abf055820372f))
* add utility functions for crypto operations ([0d3e031](https://github.com/bradford-tech/supabase-integrity-attest/commit/0d3e031c8cd25e60465223ea26ecced00f0e3dd5))
* add X.509 certificate chain validation and nonce extraction ([f2c9273](https://github.com/bradford-tech/supabase-integrity-attest/commit/f2c9273ab05996614d0f85c97eacaf6510244b3b))
* **ci:** add release-please, CI, and npm build ([62212d6](https://github.com/bradford-tech/supabase-integrity-attest/commit/62212d6b8ad25e16b3f79f419d03fd4c8e612459))
* wire up public API in mod.ts ([d41cec8](https://github.com/bradford-tech/supabase-integrity-attest/commit/d41cec8ad596aa08d94fe0be13b306e7702a3cdd))


### Bug Fixes

* **docs:** correct package name in README examples ([544b290](https://github.com/bradford-tech/supabase-integrity-attest/commit/544b2904f40f19b1a9dfc55b7f2cd8147ddf42d8))
