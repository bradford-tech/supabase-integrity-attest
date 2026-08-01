# Contributing

Thanks for your interest in improving supabase-integrity-attest.

## Repository layout

npm-workspaces monorepo: `packages/lib` (the Deno-first library, published
to JSR and npm), `docs` (Next.js documentation site), and
`demo/supabase-expo-demo` (Expo + Supabase reference app). Node >= 20 and
Deno are required.

## Development

Library work happens in `packages/lib`:

    cd packages/lib
    deno task test       # run the test suite (network access disabled)
    deno task check      # format check + lint + tests (the CI gate)
    deno task fix        # auto-format + lint fix + tests

From the repo root, `npm run check` runs every workspace's gate. One
gotcha: when Deno is invoked through npm/turbo, `DENO_NO_PACKAGE_JSON=1`
is required (the lib is both a JSR package and an npm workspace); the
package scripts already set it.

Docs site: `npm run dev:docs` from the root.

## Constraints worth knowing

- WebCrypto only — no `node:crypto`; the library must run in Supabase
  Edge Functions / Deno Deploy isolates.
- No new runtime dependencies without prior discussion in an issue.
- Tests must pass with `--allow-net=none`.

## Commits and pull requests

- Conventional commits, one-line messages, <= 72 characters
  (commitlint enforces this): `fix(lib): ...`, `docs: ...`, etc.
- Before pushing: `npm run check` from the root must be green.
- If a change alters the public API, update the docs site and the demo.

## Releases

Releases are automated with release-please: merged `feat`/`fix` commits
queue a version-bump PR; merging it publishes to JSR (`deno publish`) and
npm (via a `@deno/dnt` build). Contributors never publish manually.

## Security issues

Do not open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
