// Minimal service worker: makes the app installable. Everything is
// network-first — checklist data must never be stale.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // Intentionally empty: default network handling.
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
