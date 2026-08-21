import type { MetadataRoute } from 'next'

import { navigation } from '@/lib/navigation'
import pageDates from '@/lib/page-dates.json'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const pages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified:
        (pageDates as Record<string, { modified?: string }>)['/']?.modified ??
        now,
    },
  ]

  for (const section of navigation) {
    for (const link of section.links) {
      const dates = (pageDates as Record<string, { modified?: string }>)[
        link.href
      ]
      pages.push({
        url: `${SITE_URL}${link.href}`,
        lastModified: dates?.modified ?? now,
      })
    }
  }

  return pages
}
