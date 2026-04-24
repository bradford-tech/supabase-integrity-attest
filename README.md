# supabase-integrity-attest

Apple App Attest server-side verification for edge runtimes, using only WebCrypto.

Any mobile app with a backend API faces a fundamental problem: API keys embedded in the client are extractable. An attacker can intercept traffic, extract the key, and issue arbitrary requests outside the app. Apple's [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) uses the device's Secure Enclave to prove that a request came from a genuine instance of your app on a real Apple device. This library implements the server-side half of that verification using only `crypto.subtle`, so it runs in Supabase Edge Functions, Deno Deploy, and any runtime where `node:crypto` is incomplete or unavailable.

## Packages

| Package                                                                | Description                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`@bradford-tech/supabase-integrity-attest`](./packages/lib/README.md) | Attestation and assertion verification library                                                 |
| [Docs](./docs/)                                                        | Documentation site at [integrity-attest.bradford.tech](https://integrity-attest.bradford.tech) |
| [Demo](./demo/supabase-expo-demo/README.md)                            | Expo starter app with Supabase edge functions                                                  |

## Quick start

```bash
deno add jsr:@bradford-tech/supabase-integrity-attest
```

```ts
import { verifyAttestation } from '@bradford-tech/supabase-integrity-attest'

const clientDataHash = new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge)),
)

const { publicKeyPem } = await verifyAttestation(
  { appId: 'TEAMID.com.example.app' },
  keyId,
  clientDataHash,
  attestation,
)
// publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMFkw..."
```

See the [library README](./packages/lib/README.md) for middleware wrappers, assertion verification, and full API details.

## Development

```bash
git clone https://github.com/bradford-tech/supabase-integrity-attest.git
cd supabase-integrity-attest
npm install
```

### Library

```bash
cd packages/lib
deno task check    # format + lint + test
```

### Docs

```bash
npm run dev:docs   # start dev server (from root)
```

### Monorepo

```bash
npm run check      # CI gate: prettier + turbo check
npm run fix        # auto-format + lint fix + test
```

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/bradford-tech/supabase-integrity-attest).

## License

MIT
