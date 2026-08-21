#!/usr/bin/env node
// Guards against references to decommissioned domains creeping back into the
// repo. The docs site is served from integrity-attest.sargent.dev; hardcoding a
// stale origin silently poisons canonical URLs, og:image URLs, the sitemap and
// the JSON-LD graph, none of which fail a build or a type check.
//
// Only bare domains are forbidden. The npm/JSR scope (@bradford-tech/*), the
// GitHub org (github.com/bradford-tech) and the demo bundle IDs
// (tech.bradford.*) are published identifiers, not domains, and are untouched.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FORBIDDEN = [
  {
    pattern: /bradford\.tech/,
    reason: 'decommissioned domain (no A record, no MX)',
  },
]

// This file is exempt: it necessarily contains the patterns it searches for.
// Lint-rule sources conventionally self-exempt for the same reason. Also skip
// binary and generated files that would produce noisy false positives.
const SKIP =
  /(^|\/)(check-domains\.mjs|package-lock\.json|.*\.(png|jpg|jpeg|gif|ico|woff2?|pdf))$/

// --cached covers tracked files; --others --exclude-standard also covers new,
// not-yet-staged files, so a stale URL is caught while it's still being written
// rather than at commit time. --exclude-standard honours .gitignore, keeping
// node_modules and build output out.
const files = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8' },
    ).split('\0'),
  ),
].filter((f) => f && !SKIP.test(f))

const violations = []

for (const file of files) {
  let contents
  try {
    contents = readFileSync(file, 'utf8')
  } catch {
    // Directories (submodule gitlinks) and tracked-but-deleted paths. Binary
    // files do not land here — utf8 decoding substitutes replacement
    // characters rather than throwing — so SKIP handles those by extension.
    continue
  }
  const lines = contents.split('\n')
  for (const { pattern, reason } of FORBIDDEN) {
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        violations.push({ file, line: i + 1, text: line.trim(), reason })
      }
    })
  }
}

if (violations.length > 0) {
  console.error(
    `Found ${violations.length} reference(s) to a decommissioned domain:\n`,
  )
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  (${v.reason})`)
    console.error(`    ${v.text.slice(0, 140)}`)
  }
  console.error('')
  process.exit(1)
}

console.log(`No decommissioned-domain references in ${files.length} files.`)
