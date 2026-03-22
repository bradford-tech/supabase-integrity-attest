import { resolve } from 'path'
import { fileURLToPath } from 'url'

import withMarkdoc from '@markdoc/next.js'

import withSearch from './src/markdoc/search.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'ts', 'tsx'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

const markdocConfig = withMarkdoc({ schemaPath: './src/markdoc' })(nextConfig)

// @markdoc/next.js uses `options.defaultLoaders.babel` (the SWC loader) without
// setting `bundleLayer`. In Next.js 16.2+, the SWC transform checks
// `bundleLayer` to determine if a module is in the React Server Components
// layer. Without it, Markdoc-generated pages are treated as client components
// and `metadata` exports are rejected.
//
// Fix: set `bundleLayer: 'rsc'` on the SWC loader, and add a post-SWC loader
// to replace `private-next-rsc-mod-ref-proxy` placeholders that SWC emits
// (normally replaced by next-flight-loader, which doesn't match .md files).
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const postSwcLoader = resolve(__dirname, 'src/markdoc/metadata-loader.js')

const originalWebpack = markdocConfig.webpack
markdocConfig.webpack = (webpackConfig, options) => {
  const config = originalWebpack(webpackConfig, options)
  for (const rule of config.module.rules) {
    if (rule.test instanceof RegExp && rule.test.test('.md')) {
      const loaders = Array.isArray(rule.use) ? rule.use : [rule.use]
      const swcIdx = loaders.findIndex(
        (l) =>
          typeof l === 'object' &&
          typeof l.loader === 'string' &&
          l.loader.includes('next-swc-loader'),
      )
      if (swcIdx !== -1) {
        loaders[swcIdx] = {
          ...loaders[swcIdx],
          options: { ...loaders[swcIdx].options, bundleLayer: 'rsc' },
        }
        // Insert post-SWC loader to replace RSC module proxy placeholder
        loaders.splice(swcIdx, 0, postSwcLoader)
        rule.use = loaders
      }
    }
  }
  return config
}

export default withSearch(markdocConfig)
