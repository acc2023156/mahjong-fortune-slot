import { ASSET_VERSION } from './assetVersion'

/** Must match MEDIA_CACHE in public/sw.js. */
const MEDIA_CACHE = `mjw-media-${ASSET_VERSION}`

/** Registers the media cache worker (production only; dev keeps plain network loading). */
export function registerClientCache() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  navigator.serviceWorker
    .register(`${base}sw.js?v=${encodeURIComponent(ASSET_VERSION)}`, { scope: base })
    .catch((error) => console.warn('Service worker registration failed', error))
}

/**
 * Copies media the page has already downloaded into the worker's cache. The worker only takes
 * control after the first visit, so without this the first visit would not be cached.
 */
export async function seedClientCache(urls: string[]) {
  if (!import.meta.env.PROD || !('caches' in window)) return
  try {
    const cache = await caches.open(MEDIA_CACHE)
    for (const url of urls) {
      if (await cache.match(url, { ignoreSearch: true })) continue
      // Served from the HTTP cache after the page's own load, so this is cheap.
      const response = await fetch(url)
      if (response.ok && response.status === 200) await cache.put(url, response)
    }
  } catch (error) {
    console.warn('Client cache seeding skipped', error)
  }
}
