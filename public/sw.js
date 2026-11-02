// Service worker: makes the app installable and lets checklists already opened on
// this device work without a connection. Pages and checklist data are
// network-first — the cached copy is only used when the network fails, so data is
// never stale while online. Build assets are content-hashed, so cache-first.
// Sign-out deletes these caches (AppShell).
const PAGES = 'lm-pages'
const STATIC = 'lm-static'
const MAX_STATIC = 400

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">You're offline</h1>
<p>This page hasn't been opened on this device yet, so there's no copy to show. Checklists you've opened before still work offline.</p>
<p><a href="javascript:history.back()">Go back</a></p></body>`

function cacheable(url, request) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false
  if (request.mode === 'navigate') return !url.pathname.startsWith('/api/')
  return /^\/api\/checklists\/[^/]+$/.test(url.pathname) || url.pathname === '/api/users'
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES)
  try {
    const res = await fetch(request)
    // Never keep a redirect (e.g. to the login page) under the page's address.
    if (res.ok && !res.redirected && res.type === 'basic') cache.put(request, res.clone())
    return res
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true })
    if (cached) return cached
    if (request.mode === 'navigate') {
      return new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    throw err
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC)
  const cached = await cache.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) {
    await cache.put(request, res.clone())
    const keys = await cache.keys()
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(old)
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event.request))
  } else if (cacheable(url, event.request)) {
    event.respondWith(networkFirst(event.request))
  }
  // Everything else (auth, uploads, other API calls): default network handling.
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Ignore malformed payloads.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Lists Manager', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { checklistId: payload.checklistId },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const checklistId = event.notification.data && event.notification.data.checklistId
  const url = checklistId ? '/checklists/' + checklistId : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
