// Offline: the app's own files are cached on install; fonts are cached the first time they load.
// VERSION is set by `npm run build` from the files' content, so a release replaces the old cache.
const VERSION = 'k-28110f63f2'
const FILES = ['./', 'index.html', 'app.js', 'dice3d.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']
const FONTS = 'k-fonts'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  // Google Fonts: from the cache if we have it, otherwise the network (and keep a copy).
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(e.request)
      if (hit) return hit
      const res = await fetch(e.request)
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone())
      return res
    }))
    return
  }
  if (url.origin !== location.origin) return
  // The app: network first (fresh after a release), the cache when offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()))
    return res
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))))
})
