import { Container, Graphics, Sprite } from 'pixi.js'
import { skin, skinSprite, SpriteNumber } from '../skin'

export type SpinActions = {
  spin: () => void
  decreaseBet: () => void
  increaseBet: () => void
  toggleTurbo: () => void
  toggleAuto: () => void
}

const ROW_Y = 46

export class SpinControls extends Container {
  private readonly spinButton = new Container()
  private readonly spinFace: Sprite
  private readonly spinArrows: Sprite
  private readonly counter = new SpriteNumber(40)
  private readonly turboIcon: Sprite
  private readonly turboRing: Graphics
  private readonly autoRing: Graphics
  private readonly autoIcon: Sprite
  private readonly autoStop: Graphics
  private isSpinning = false
  private spinSpeed = 0

  constructor(actions: SpinActions) {
    super()
    const turbo = this.iconButton(56, actions.toggleTurbo)
    this.turboRing = turbo.ring
    this.turboIcon = skinSprite('icon_turbo_off', 30)
    // The atlas bolt faces the wrong way; mirror it to match the reference TURBO icon.
    this.turboIcon.scale.x *= -1
    turbo.button.addChild(this.turboIcon)

    // −/+ sit symmetrically around the SPIN ring with an equal ~7px gap on both sides.
    const minus = this.iconButton(124, actions.decreaseBet)
    minus.button.addChild(new Graphics().roundRect(-10, -1.8, 20, 3.6, 1.8).fill('#f2dcc0'))

    this.spinFace = skinSprite('spin_round', 147)
    // Anchor on the gold ring's centre (the art carries a drop shadow on its right side).
    this.spinFace.anchor.set(.577, .49)
    this.spinArrows = skinSprite('spin_arrows', 70)
    this.counter.visible = false
    this.spinButton.position.set(215, ROW_Y)
    this.spinButton.addChild(this.spinFace, this.spinArrows, this.counter)
    this.activate(this.spinButton, actions.spin)
    this.addChild(this.spinButton)

    const plus = this.iconButton(306, actions.increaseBet)
    plus.button.addChild(skinSprite('icon_plus', 20))

    const auto = this.iconButton(374, actions.toggleAuto)
    this.autoRing = auto.ring
    this.autoIcon = skinSprite('icon_play', 16)
    this.autoIcon.x = 2
    this.autoStop = new Graphics().roundRect(-7, -7, 14, 14, 2).fill('#fff1c4')
    this.autoStop.visible = false
    auto.button.addChild(this.autoIcon, this.autoStop)

    const tick = () => {
      // Arrows idle-rotate slowly, spin up while reels move, then ease back.
      const target = this.isSpinning ? .32 : .012
      this.spinSpeed += (target - this.spinSpeed) * .12
      this.spinArrows.rotation += this.spinSpeed
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  private iconButton(x: number, action: () => void) {
    const button = new Container()
    button.position.set(x, ROW_Y)
    const ring = new Graphics()
    this.paintRing(ring, false)
    button.addChild(ring)
    this.activate(button, action)
    this.addChild(button)
    return { button, ring }
  }

  private paintRing(ring: Graphics, active: boolean) {
    ring.clear()
      .circle(0, 0, 23).fill({ color: active ? '#8a4a1c' : '#2a120b', alpha: active ? .95 : .55 })
      .circle(0, 0, 23).stroke({ color: active ? '#ffd76a' : '#c79a6a', width: 1.5, alpha: active ? 1 : .55 })
  }

  private activate(button: Container, action: () => void) {
    button.eventMode = 'static'
    button.cursor = 'pointer'
    button.on('pointerdown', () => button.scale.set(0.93))
    button.on('pointerupoutside', () => button.scale.set(1))
    button.on('pointerup', () => { button.scale.set(1); action() })
  }

  setSpinning(active: boolean) {
    this.isSpinning = active
  }

  /** Free spins show the jade square face with the remaining count, like the reference. */
  setCounter(value: number | null) {
    const showCount = value !== null
    this.spinFace.texture = skin()[showCount ? 'spin_idle' : 'spin_round']
    this.spinArrows.visible = !showCount
    this.counter.visible = showCount
    if (showCount) this.counter.text = String(value)
  }

  setTurbo(active: boolean) {
    this.turboIcon.texture = skin()[active ? 'icon_turbo_on' : 'icon_turbo_off']
    const size = (active ? 22 : 30) / this.turboIcon.texture.width
    this.turboIcon.scale.set(-size, size)
    this.turboIcon.tint = active ? 0xffe066 : 0xffffff
    this.paintRing(this.turboRing, active)
  }

  setAuto(active: boolean) {
    this.autoIcon.visible = !active
    this.autoStop.visible = active
    this.paintRing(this.autoRing, active)
  }
}
