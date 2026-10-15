// Service Worker para Finanças a Dois
const CACHE_NAME = 'financas-v1'

const ASSETS_ESTATICOS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.svg',
  '/favicon.ico',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_ESTATICOS).catch(() => {
        // Ignora falhas em rotas dinâmicas durante o install
      })
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) => {
      return Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_NAME)
          .map((chave) => caches.delete(chave))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignora requisições que não sejam GET ou sejam para APIs externas/Supabase
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // Assets estáticos de _next/static ou icons: cache-first ou stale-while-revalidate
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Navegação e páginas dinâmicas: network-first
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request).then((cached) => {
        return cached || caches.match('/')
      })
    })
  )
})

self.addEventListener('push', (event) => {
  let dados = {}
  if (event.data) {
    try {
      dados = event.data.json()
    } catch {
      dados = { corpo: event.data.text() }
    }
  }
  // dados = { titulo: string, corpo: string, url: string }
  event.waitUntil(
    self.registration.showNotification(dados.titulo ?? 'Finanças a Dois', {
      body: dados.corpo ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: dados.url ?? '/inicio' },
      vibrate: [200, 100, 200],
      silent: false,
      tag: 'financas-a-dois',
      renotify: true,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const urlDestino =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/inicio'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientes) => {
        for (const cliente of clientes) {
          if (cliente.url.includes(self.location.origin) && 'focus' in cliente) {
            if ('navigate' in cliente) {
              cliente.navigate(urlDestino)
            }
            return cliente.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlDestino)
        }
      }),
  )
})

