import './style.css'
import './feature-center.css'
import { Application } from 'pixi.js'
import { GAME_HEIGHT, GAME_WIDTH } from './game/config'
import { GameScene } from './game/GameScene'
import { loadSkin } from './game/skin'
import { createFeatureCenter } from './ui/featureCenter'

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
// First visits download ~160 textures; show progress instead of a blank board.
const loading = document.createElement('div')
loading.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#ffe36e;font:700 16px Arial,sans-serif;letter-spacing:1px;text-shadow:0 2px 4px #0008'
loading.textContent = 'LOADING 0%'
mount.appendChild(loading)
try {
  await loadSkin((progress) => { loading.textContent = `LOADING ${Math.round(progress * 100)}%` })
  loading.remove()
  const scene = new GameScene()
  app.stage.addChild(scene)
  // Dev-only handle for QA in the browser console (stripped from production builds).
  if (import.meta.env.DEV) Object.assign(window, { __slot: scene })
  createFeatureCenter(mount)
} catch (error) {
  // Surface startup failures instead of leaving a silent blank canvas.
  console.error(error)
  const message = document.createElement('pre')
  message.style.cssText = 'position:absolute;inset:auto 8px 8px;color:#fff;font:12px monospace;white-space:pre-wrap'
  message.textContent = `Failed to start: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
  mount.appendChild(message)
}
