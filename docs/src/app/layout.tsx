import clsx from 'clsx'
import { type Metadata } from 'next'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'

import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'

import { Analytics } from '@vercel/analytics/next'

import '@/styles/tailwind.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// Use local version of Lexend so that we can use OpenType features
const lexend = localFont({
  src: '../fonts/lexend.woff2',
  display: 'swap',
  variable: '--font-lexend',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://integrity-attest.bradford.tech'),
  alternates: { canonical: './' },
  title: {
    template: '%s - supabase-integrity-attest',
    default:
      'supabase-integrity-attest - Apple App Attest verification for Supabase Edge Functions',
  },
  description:
    'Server-side Apple App Attest verification for Supabase Edge Functions, built entirely on WebCrypto.',
  openGraph: {
    type: 'website',
    siteName: 'supabase-integrity-attest',
    title: {
      template: '%s - supabase-integrity-attest',
      default: 'supabase-integrity-attest',
    },
    description:
      'Server-side Apple App Attest verification for Supabase Edge Functions, built entirely on WebCrypto.',
  },
  twitter: { card: 'summary_large_image' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://integrity-attest.bradford.tech/#website',
      name: 'supabase-integrity-attest',
      url: 'https://integrity-attest.bradford.tech',
      description:
        'Server-side Apple App Attest verification for Supabase Edge Functions, built entirely on WebCrypto.',
      publisher: { '@id': 'https://bradford.tech/#organization' },
    },
    {
      '@type': 'Organization',
      '@id': 'https://bradford.tech/#organization',
      name: 'Bradford Tech',
      url: 'https://bradford.tech',
      sameAs: ['https://github.com/bradford-tech'],
    },
    {
      '@type': 'SoftwareSourceCode',
      name: 'supabase-integrity-attest',
      description:
        'Server-side Apple App Attest verification for Supabase Edge Functions, built entirely on WebCrypto.',
      codeRepository:
        'https://github.com/bradford-tech/supabase-integrity-attest',
      programmingLanguage: 'TypeScript',
      runtimePlatform: ['Deno', 'Node.js'],
      author: { '@id': 'https://bradford.tech/#organization' },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={clsx('h-full antialiased', inter.variable, lexend.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-full bg-white dark:bg-slate-900">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
