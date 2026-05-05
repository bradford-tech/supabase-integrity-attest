# Changelog

## 1.0.0 (2026-05-05)


### ⚠ BREAKING CHANGES

* **assertion:** developmentEnv is removed from the assertion-side AppInfo interface and WithAssertionOptions. Consumers passing it in object literals to verifyAssertion() or withAssertion() will get a TypeScript excess-property error. Fix: remove the property — it never had any effect on assertion verification.
* **demo:** custom extractAttestation implementations must return challengeAsSent alongside challenge.

### Features

* **demo:** Phase B backend template — edge functions, migrations, integration test ([#39](https://github.com/bradford-tech/supabase-integrity-attest/issues/39)) ([e91055f](https://github.com/bradford-tech/supabase-integrity-attest/commit/e91055f079c728a093046f2a659fa8e1890c5a77))
* **demo:** Phase C hero client UI + fix(lib)!: challengeAsSent attestation contract ([#46](https://github.com/bradford-tech/supabase-integrity-attest/issues/46)) ([63be406](https://github.com/bradford-tech/supabase-integrity-attest/commit/63be40684a8896210ea87caeb6b11c8db2c6bf9c))


### Bug Fixes

* **demo:** escape backslashes in Server-Timing desc values ([bf584e2](https://github.com/bradford-tech/supabase-integrity-attest/commit/bf584e2cf29069b6e4ef41a6213ac36b1bd1e220))


### Code Refactoring

* **assertion:** remove unused developmentEnv from API ([e61bc86](https://github.com/bradford-tech/supabase-integrity-attest/commit/e61bc86afb048309064bd4fa5a998aa3f0599162))
