# Changelog

## [0.3.2](https://github.com/bradford-tech/supabase-integrity-attest/compare/v0.3.1...v0.3.2) (2026-03-12)


### Bug Fixes

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
