import { execFileSync } from 'node:child_process'
import { globSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const APP_DIR = 'src/app'
const OUTPUT_FILE = 'src/lib/page-dates.json'

/** Derive the URL path from a page.md file path. */
function toUrlPath(file) {
  // file is relative to cwd, e.g. "src/app/docs/overview/page.md"
  const dir = dirname(file)
  const rel = relative(APP_DIR, dir)
  return rel === '' ? '/' : `/${rel}`
}

/** Run a git log command and return trimmed stdout (empty string on failure). */
function gitDate(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

const files = globSync(join(APP_DIR, '**/page.md'))

const dates = {}

for (const file of files) {
  const urlPath = toUrlPath(file)

  // datePublished: first commit that added this file
  const published = gitDate([
    'log',
    '--diff-filter=A',
    '--format=%aI',
    '--',
    file,
  ])

  // dateModified: most recent commit touching this file
  const modified = gitDate(['log', '-1', '--format=%aI', '--', file])

  if (!modified) continue // untracked file, skip

  dates[urlPath] = {
    published: published || modified, // shallow-clone fallback
    modified,
  }
}

writeFileSync(OUTPUT_FILE, JSON.stringify(dates, null, 2) + '\n')
console.log(
  `Generated ${OUTPUT_FILE} with dates for ${Object.keys(dates).length} pages.`,
)
