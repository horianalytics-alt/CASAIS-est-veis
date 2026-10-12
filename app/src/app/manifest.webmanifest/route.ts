import { NextResponse } from 'next/server'

export function GET() {
  const manifest = {
    name: 'Finanças a Dois',
    short_name: 'Finanças',
    description: 'Controle de contas, faturas e acerto do mês para o casal.',
    start_url: '/inicio',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F8F7',
    theme_color: '#14594A',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
