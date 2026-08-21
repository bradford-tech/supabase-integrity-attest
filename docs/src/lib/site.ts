// Single source of truth for the deployed origin.
//
// Canonical URLs, og:image URLs, the sitemap, robots.txt and the JSON-LD graph
// are the only things on this site that need an absolute origin — everything
// else (nav, prev/next, search results) uses relative hrefs and therefore
// follows the serving host on its own. Keeping the origin in one place is what
// stops those two halves from disagreeing.
export const SITE_URL = 'https://integrity-attest.sargent.dev'

/** JSON-LD `@id` for the site itself. */
export const WEBSITE_ID = `${SITE_URL}/#website`

/** JSON-LD `@id` and `url` for the publishing organization. */
export const ORGANIZATION_ID = 'https://sargent.dev/#organization'
export const ORGANIZATION_URL = 'https://sargent.dev'
export const ORGANIZATION_NAME = 'Sargent'
