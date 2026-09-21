import './style.css'
import './feature-center.css'
import { Application, Assets, type Texture } from 'pixi.js'
import { GAME_HEIGHT, GAME_WIDTH } from './game/config'
import { GameScene } from './game/GameScene'
import { createFeatureCenter } from './ui/featureCenter'

const assetUrl = (fileName: string) => `${import.meta.env.BASE_URL}assets/${fileName}`
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
const logoTexture = await Assets.load<Texture>(assetUrl('logo-300.png'))
const showWinTexture = await Assets.load<Texture>(assetUrl('ShowWinpng.png'))
app.stage.addChild(new GameScene(logoTexture, showWinTexture))
createFeatureCenter(document.querySelector<HTMLDivElement>('#app')!)
