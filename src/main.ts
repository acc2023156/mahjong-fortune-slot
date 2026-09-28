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

document.querySelector<HTMLDivElement>('#app')!.appendChild(app.canvas)
await loadSkin()
const scene = new GameScene()
app.stage.addChild(scene)
// Dev-only handle for QA in the browser console (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __slot: scene })
createFeatureCenter(document.querySelector<HTMLDivElement>('#app')!)
