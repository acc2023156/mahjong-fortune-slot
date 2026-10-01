/*
 * Mahjong Ways client cache (service worker).
 *
 * - Images and audio under assets/skin/ and assets/pgsoft-reference/ are cache-first: they only
 *   change when ASSET_VERSION (src/game/assetVersion.ts) is bumped, which re-registers this
 *   worker as sw.js?v=<version> and drops the previous cache.
 * - HTML and hashed JS/CSS are left to the network/HTTP cache so new deploys apply at once.
 * - All games share the acc2023156.github.io origin, so every cache name carries the "mjw-"
 *   prefix and only mjw- caches are ever deleted here.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const PREFIX = 'mjw-'
const MEDIA_CACHE = `${PREFIX}media-${VERSION}`
const SCOPE_PATH = new URL(self.registration.scope).pathname
const MEDIA_PATHS = ['assets/skin/', 'assets/pgsoft-reference/'].map((path) => SCOPE_PATH + path)

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter((name) => name.startsWith(PREFIX) && name !== MEDIA_CACHE)
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('range')) return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!MEDIA_PATHS.some((path) => url.pathname.startsWith(path))) return
  event.respondWith(cacheFirst(request))
})

async function cacheFirst(request) {
  const cache = await caches.open(MEDIA_CACHE)
  const hit = await cache.match(request, { ignoreSearch: true })
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok && response.status === 200) await cache.put(request, response.clone())
  return response
}
