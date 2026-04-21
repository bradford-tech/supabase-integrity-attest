# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this library, please report it responsibly.

**Email:** security@bradford.tech

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Scope

This library performs cryptographic verification of Apple App Attest artifacts. Security issues in the verification logic (bypasses, incorrect validation, timing attacks) are considered critical.

## Known Limitations

### No CRL/OCSP revocation checking

Certificate chain verification validates signatures, issuer/subject chaining, and validity dates, but does not check certificate revocation status (CRL or OCSP). This is a deliberate trade-off for edge-runtime environments (Supabase Edge Functions, Deno Deploy) where outbound network requests add latency, can fail unpredictably, and may not be permitted. If Apple revoked the App Attest intermediate CA, this library would continue to accept attestations signed by it until the certificate's validity period expires. In practice, Apple has never revoked their App Attest CA, and client-side attestation would fail before reaching the server in such a scenario.
