import { D2 } from '@terrastruct/d2'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const DIAGRAMS_DIR = 'src/diagrams'
const ICONS_DIR = join(DIAGRAMS_DIR, 'icons')
const OUTPUT_DIR = 'public/diagrams'

mkdirSync(OUTPUT_DIR, { recursive: true })

const d2 = new D2()

const LIGHT_THEME = 0
const DARK_THEME = 200

/**
 * Color overrides matching the Syntax template's sky/slate palette.
 * N1–N7: neutrals (darkest→lightest). B1–B6: primary (strokes→fills).
 */
const LIGHT_OVERRIDES = `vars: {
  d2-config: {
    theme-overrides: {
      N1: "#0F172A"
      N2: "#475569"
      N3: "#94A3B8"
      N4: "#CBD5E1"
      N5: "#E2E8F0"
      N6: "#F1F5F9"
      N7: "#FFFFFF"
      B1: "#0EA5E9"
      B2: "#0284C7"
      B3: "#E0F2FE"
      B4: "#E0F2FE"
      B5: "#F0F9FF"
      B6: "#F0F9FF"
      AA2: "#38BDF8"
      AA4: "#F0F9FF"
      AA5: "#F8FAFC"
      AB4: "#F0F9FF"
      AB5: "#F8FAFC"
    }
  }
}`

const DARK_OVERRIDES = `vars: {
  d2-config: {
    theme-overrides: {
      N1: "#F1F5F9"
      N2: "#CBD5E1"
      N3: "#94A3B8"
      N4: "#475569"
      N5: "#334155"
      N6: "#1E293B"
      N7: "#0F172A"
      B1: "#38BDF8"
      B2: "#0EA5E9"
      B3: "#1E293B"
      B4: "#1E293B"
      B5: "#172033"
      B6: "#0F172A"
      AA2: "#38BDF8"
      AA4: "#1E293B"
      AA5: "#0F172A"
      AB4: "#1E293B"
      AB5: "#0F172A"
    }
  }
}`

/** Load icon SVG contents keyed by filename for post-processing. */
const lightIcons = new Map()
const darkIcons = new Map()
for (const icon of readdirSync(ICONS_DIR).filter(
  (f) => f.endsWith('.svg') && !f.endsWith('-white.svg'),
)) {
  lightIcons.set(icon, readFileSync(join(ICONS_DIR, icon), 'utf-8'))
  const whiteName = icon.replace('.svg', '-white.svg')
  darkIcons.set(icon, readFileSync(join(ICONS_DIR, whiteName), 'utf-8'))
}

/** Build a virtual filesystem containing the diagram source and all icon SVGs. */
function buildFs(diagramPath, { dark = false, overrides = '' } = {}) {
  const icons = dark ? darkIcons : lightIcons
  let source = readFileSync(diagramPath, 'utf-8')
  if (overrides) {
    source = overrides + '\n\n' + source
  }
  const fs = {
    'index.d2': source,
  }
  for (const [icon, content] of icons) {
    fs[`icons/${icon}`] = content
  }
  return fs
}

/**
 * Replace external <image href="./icons/foo.svg"> references with inline
 * data URIs so the SVG is self-contained (required for <img> tag rendering).
 */
function inlineIcons(svg, { dark = false } = {}) {
  const icons = dark ? darkIcons : lightIcons
  return svg.replace(
    /<image\s([^>]*)href="\.\/icons\/([^"]+)"([^>]*)\/>/g,
    (_match, before, filename, after) => {
      const content = icons.get(filename)
      if (!content) return _match
      const base64 = Buffer.from(content).toString('base64')
      return `<image ${before}href="data:image/svg+xml;base64,${base64}"${after}/>`
    },
  )
}

try {
  const files = readdirSync(DIAGRAMS_DIR).filter((f) => f.endsWith('.d2'))

  for (const file of files) {
    const name = basename(file, '.d2')
    for (const [suffix, themeID, overrides] of [
      ['light', LIGHT_THEME, LIGHT_OVERRIDES],
      ['dark', DARK_THEME, DARK_OVERRIDES],
    ]) {
      const dark = suffix === 'dark'
      const fs = buildFs(join(DIAGRAMS_DIR, file), { dark, overrides })
      const result = await d2.compile({ fs, inputPath: 'index.d2' })
      const raw = await d2.render(result.diagram, {
        ...result.renderOptions,
        themeID,
        noXMLTag: true,
        pad: 20,
        salt: `${name}-${suffix}`,
      })
      const svg = inlineIcons(raw, { dark })
      const outPath = join(OUTPUT_DIR, `${name}-${suffix}.svg`)
      writeFileSync(outPath, svg)
      console.log(`  ${name}-${suffix}.svg (${svg.length} bytes)`)
    }
  }

  console.log(
    `\nGenerated ${files.length * 2} SVGs from ${files.length} diagrams.`,
  )
} catch (error) {
  console.error(error)
  process.exit(1)
}
