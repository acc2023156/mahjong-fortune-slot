import './style.css'
import './feature-center.css'
import { Application, Assets } from 'pixi.js'
import { GAME_HEIGHT, GAME_WIDTH } from './game/config'
import { GameScene } from './game/GameScene'
import { loadDeferredSkin, loadSkin, skinUrl, skinUrls } from './game/skin'
import { registerClientCache, seedClientCache } from './game/clientCache'
import { createFeatureCenter } from './ui/featureCenter'
import { createHelpPage } from './ui/helpPage'

const assetUrl = (fileName: string) => `${import.meta.env.BASE_URL}assets/${fileName}`

const syncVisualViewport = () => {
  const viewport = window.visualViewport
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--viewport-width', `${Math.round(width)}px`)
  document.documentElement.style.setProperty('--viewport-height', `${Math.round(height)}px`)
}

syncVisualViewport()
window.addEventListener('resize', syncVisualViewport, { passive: true })
window.addEventListener('orientationchange', syncVisualViewport, { passive: true })
window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true })
window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true })

document.documentElement.style.setProperty(
  '--backplate-image',
  `url("${assetUrl('mahjong-backplate.png')}")`,
)

registerClientCache()
// Load textures on the main thread so the media service worker sees (and caches) every request.
Assets.setPreferences({ preferWorkers: false })

// One authoritative coordinate system prevents resize drift between DOM and Pixi.
const app = new Application()
await app.init({
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundAlpha: 0,
  antialias: true,
  resolution: Math.min(devicePixelRatio, 2),
  autoDensity: true,
})

const mount = document.querySelector<HTMLDivElement>('#app')!
mount.appendChild(app.canvas)

let scene: GameScene | undefined
/**
 * Never stretch the 430-wide design. Tall screens get a taller logical canvas (the scene lays
 * the extra height out itself); wider screens letterbox the 430×760 design.
 */
const fitCanvas = () => {
  const viewport = window.visualViewport
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  const tall = height / width >= GAME_HEIGHT / GAME_WIDTH
  const logicalHeight = tall ? Math.round(GAME_WIDTH * height / width) : GAME_HEIGHT
  mount.style.width = `${Math.round(tall ? width : height * GAME_WIDTH / GAME_HEIGHT)}px`
  mount.style.height = `${Math.round(height)}px`
  if (app.renderer.height !== logicalHeight) app.renderer.resize(GAME_WIDTH, logicalHeight)
  scene?.setViewHeight(logicalHeight)
}
fitCanvas()
window.addEventListener('resize', fitCanvas, { passive: true })
window.addEventListener('orientationchange', fitCanvas, { passive: true })
window.visualViewport?.addEventListener('resize', fitCanvas, { passive: true })
// First visits download ~160 textures; show progress instead of a blank board.
const loading = document.createElement('div')
loading.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#ffe36e;font:700 16px Arial,sans-serif;letter-spacing:1px;text-shadow:0 2px 4px #0008'
loading.textContent = 'LOADING 0%'
mount.appendChild(loading)
try {
  await loadSkin((progress) => { loading.textContent = `LOADING ${Math.round(progress * 100)}%` })
  loading.remove()
  scene = new GameScene()
  app.stage.addChild(scene)
  fitCanvas()
  // Dev-only handle for QA in the browser console (stripped from production builds).
  if (import.meta.env.DEV) Object.assign(window, { __slot: scene, __app: app })
  createFeatureCenter(mount)
  const help = createHelpPage()
  scene.onHelp = help.open
  // Stage 2: feature-screen art streams in behind the running game, then everything is cached.
  void loadDeferredSkin().then(() => seedClientCache([
    ...skinUrls(),
    skinUrl('pgsoft-reference/audio/audio/mp3/general_audio.mp3'),
    skinUrl('pgsoft-reference/audio/audio/mp3/vox.mp3'),
  ]))
} catch (error) {
  // Surface startup failures instead of leaving a silent blank canvas.
  console.error(error)
  loading.remove()
  const message = document.createElement('div')
  message.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:80%;text-align:center;color:#ffe9b0;font:700 15px Arial,sans-serif;line-height:1.6'
  message.textContent = '網路不穩，部分素材下載失敗。'
  const retry = document.createElement('button')
  retry.textContent = '重新載入'
  retry.style.cssText = 'display:block;margin:14px auto 0;padding:10px 26px;border:2px solid #ffd366;border-radius:10px;background:#b4221c;color:#ffe790;font:700 16px Arial,sans-serif;cursor:pointer'
  // Files that did arrive are already cached, so a reload only fetches what is missing.
  retry.onclick = () => location.reload()
  message.appendChild(retry)
  mount.appendChild(message)
}
