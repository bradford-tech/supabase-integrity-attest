export const navigation = [
  {
    title: 'Getting started',
    links: [
      { title: 'Overview', href: '/docs/overview' },
      {
        title: 'App Attest in 60 seconds',
        href: '/docs/app-attest-in-60-seconds',
      },
    ],
  },
  {
    title: 'Concepts',
    links: [
      { title: 'Attestation', href: '/docs/attestation' },
      { title: 'Assertion', href: '/docs/assertion' },
      {
        title: 'Challenges, nonces & security',
        href: '/docs/challenges-nonces-security',
      },
    ],
  },
  {
    title: 'Guides',
    links: [
      {
        title: 'Supabase Edge Functions',
        href: '/docs/supabase-edge-functions',
      },
      {
        title: 'Verifying attestations',
        href: '/docs/verifying-attestations',
      },
      {
        title: 'Verifying assertions',
        href: '/docs/verifying-assertions',
      },
      { title: 'The withAttestation wrapper', href: '/docs/with-attestation' },
      { title: 'The withAssertion wrapper', href: '/docs/with-assertion' },
    ],
  },
  {
    title: 'API reference',
    links: [
      { title: 'verifyAttestation()', href: '/docs/verify-attestation' },
      { title: 'verifyAssertion()', href: '/docs/verify-assertion' },
      {
        title: 'withAttestation() reference',
        href: '/docs/api-with-attestation',
      },
      {
        title: 'withAssertion() reference',
        href: '/docs/api-with-assertion',
      },
      { title: 'Types & error codes', href: '/docs/types-and-error-codes' },
    ],
  },
  {
    title: 'Design & architecture',
    links: [
      {
        title: 'Design & architecture',
        href: '/docs/design-and-architecture',
      },
    ],
  },
]

export function findPageByTitle(
  title: string,
): { href: string; sectionTitle: string } | null {
  for (const section of navigation) {
    for (const link of section.links) {
      if (link.title === title) {
        return { href: link.href, sectionTitle: section.title }
      }
    }
  }
  return null
}
