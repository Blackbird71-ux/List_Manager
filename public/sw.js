// Minimal service worker: makes the app installable. Everything is
// network-first — checklist data must never be stale.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // Intentionally empty: default network handling.
})
