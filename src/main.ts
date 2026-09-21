import './style.css'
import './feature-center.css'
import { Application, Assets, type Texture } from 'pixi.js'
import { GAME_HEIGHT, GAME_WIDTH } from './game/config'
import { GameScene } from './game/GameScene'
import { createFeatureCenter } from './ui/featureCenter'

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
const logoTexture = await Assets.load<Texture>('/assets/logo-300.png')
const showWinTexture = await Assets.load<Texture>('/assets/ShowWinpng.png')
app.stage.addChild(new GameScene(logoTexture, showWinTexture))
createFeatureCenter(document.querySelector<HTMLDivElement>('#app')!)
