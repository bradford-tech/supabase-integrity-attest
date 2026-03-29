# supabase-integrity-attest

Monorepo for the `@bradford-tech/supabase-integrity-attest` library, documentation site, and demo app.

## Packages

| Package | Path                                                   | Description                                                                                    |
| ------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Library | [`packages/lib`](./packages/lib)                       | Apple App Attest verification for Deno / Supabase Edge Functions                               |
| Docs    | [`docs`](./docs)                                       | Documentation site at [integrity-attest.bradford.tech](https://integrity-attest.bradford.tech) |
| Demo    | [`demo/supabase-expo-demo`](./demo/supabase-expo-demo) | Expo starter app with Supabase edge functions                                                  |

## Development

### Library

```bash
cd packages/lib
deno task check    # format + lint + test
```

### Docs

```bash
npm install        # from root
npm run dev:docs   # start dev server
```

## License

MIT
