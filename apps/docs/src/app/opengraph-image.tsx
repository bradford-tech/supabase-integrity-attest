import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background:
          'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        padding: '60px',
        position: 'relative',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Gradient accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '6px',
          background: 'linear-gradient(90deg, #06b6d4, #6366f1)',
        }}
      />

      {/* Library name */}
      <div
        style={{
          fontSize: 56,
          fontWeight: 700,
          color: '#f1f5f9',
          letterSpacing: '-0.025em',
          marginBottom: '24px',
          textAlign: 'center',
        }}
      >
        supabase-integrity-attest
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 28,
          fontWeight: 400,
          color: '#94a3b8',
          textAlign: 'center',
          maxWidth: '900px',
          lineHeight: 1.5,
        }}
      >
        Server-side Apple App Attest verification for Supabase Edge Functions,
        built entirely on WebCrypto.
      </div>

      {/* Gradient accent bar bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '6px',
          background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
        }}
      />
    </div>,
    { ...size },
  )
}
