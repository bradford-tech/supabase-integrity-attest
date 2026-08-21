import { type Node } from '@markdoc/markdoc'

import { DocsHeader } from '@/components/DocsHeader'
import { PrevNextLinks } from '@/components/PrevNextLinks'
import { Prose } from '@/components/Prose'
import { TableOfContents } from '@/components/TableOfContents'
import { findPageByTitle } from '@/lib/navigation'
import pageDates from '@/lib/page-dates.json'
import { collectSections } from '@/lib/sections'
import { ORGANIZATION_ID, SITE_URL, WEBSITE_ID } from '@/lib/site'

interface Frontmatter {
  title?: string
  nextjs?: { metadata?: { title?: string; description?: string } }
}

export function DocsLayout({
  children,
  frontmatter,
  nodes,
}: {
  children: React.ReactNode
  frontmatter: Frontmatter
  nodes: Array<Node>
}) {
  const { title } = frontmatter
  let tableOfContents = collectSections(nodes)

  const page = title ? findPageByTitle(title) : null
  const dates = page
    ? (pageDates as Record<string, { published: string; modified: string }>)[
        page.href
      ]
    : null
  const description = frontmatter.nextjs?.metadata?.description

  const breadcrumbLd = page
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_URL}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: title,
          },
        ],
      }
    : null

  const techArticleLd = page
    ? {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: title,
        ...(description ? { description } : {}),
        url: `${SITE_URL}${page.href}`,
        ...(dates
          ? {
              datePublished: dates.published,
              dateModified: dates.modified,
            }
          : {}),
        publisher: { '@id': ORGANIZATION_ID },
        isPartOf: { '@id': WEBSITE_ID },
      }
    : null

  return (
    <>
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />
      )}
      {techArticleLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleLd) }}
        />
      )}
      <div className="max-w-2xl min-w-0 flex-auto px-4 py-16 lg:max-w-none lg:pr-0 lg:pl-8 xl:px-16">
        <article>
          <DocsHeader title={title} />
          <Prose>{children}</Prose>
        </article>
        <PrevNextLinks />
      </div>
      <TableOfContents tableOfContents={tableOfContents} />
    </>
  )
}
