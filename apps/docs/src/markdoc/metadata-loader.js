// Verified against next@16.2.1 — revisit on major Next.js upgrades.
// Track https://github.com/markdoc/next.js/issues for upstream fix.
//
// Post-SWC loader for Markdoc pages that fixes two Next.js 16.2+ issues:
//
// 1. The SWC loader (without bundleLayer) treats Markdoc-generated pages as
//    client components and rejects `metadata` exports. Setting bundleLayer to
//    'rsc' fixes this, but causes SWC to emit `private-next-rsc-mod-ref-proxy`
//    placeholders that the next-flight-loader normally replaces.
//
// 2. Since the Markdoc rule's .md files aren't matched by next-flight-loader's
//    rule, we perform the same replacement here.
module.exports = function metadataLoader(source) {
  return source.replaceAll(
    'private-next-rsc-mod-ref-proxy',
    'next/dist/build/webpack/loaders/next-flight-loader/module-proxy',
  )
}
