import { Container, Graphics, Text } from 'pixi.js'

export type SpinActions = {
  spin: () => void
  decreaseBet: () => void
  increaseBet: () => void
  toggleTurbo: () => void
  toggleAuto: () => void
}

export class SpinControls extends Container {
  private readonly spinButton: Container
  private readonly spinGlyph: Text
  private readonly turboText: Text
  private readonly autoText: Text
  private isSpinning = false

  constructor(actions: SpinActions) {
    super()
    this.addChild(new Graphics().roundRect(0, 0, 430, 170, 34).fill({ color: '#7d341f', alpha: 0.98 }).stroke({ color: '#e1a854', width: 2 }))

    // Symmetric centers: 56, 119, 215, 311, 374.
    // With radii 26, 24, 58, 24, 26 this gives equal 13–14 px visible gaps.
    this.turboText = this.smallButton('⚡\nTURBO', 56, 72, actions.toggleTurbo)
    this.roundButton('−', 119, 72, actions.decreaseBet)
    this.spinButton = this.makeSpin(actions.spin)
    this.roundButton('+', 311, 72, actions.increaseBet)
    this.autoText = this.smallButton('▶\nAUTO', 374, 72, actions.toggleAuto)
    this.spinGlyph = this.spinButton.children[2] as Text

    const rotateIdle = () => {
      if (!this.isSpinning) this.spinGlyph.rotation += 0.003
      requestAnimationFrame(rotateIdle)
    }
    requestAnimationFrame(rotateIdle)
  }

  private roundButton(text: string, x: number, y: number, action: () => void) {
    const button = new Container()
    button.position.set(x, y)
    button.addChild(new Graphics().circle(0, 0, 24).fill('#9b482e').stroke({ color: '#d8864d', width: 2 }))
    const label = new Text({ text, style: { fontFamily: 'Arial', fontSize: 30, fill: '#f3bd7b' } })
    label.anchor.set(0.5)
    button.addChild(label)
    this.activate(button, action)
    this.addChild(button)
  }

  private smallButton(text: string, x: number, y: number, action: () => void) {
    const button = new Container()
    button.position.set(x, y)
    const label = new Text({ text, style: { align: 'center', fontFamily: 'Arial', fontSize: 11, fontWeight: '800', fill: '#e8ae66', lineHeight: 14 } })
    label.anchor.set(0.5)
    button.addChild(new Graphics().circle(0, 0, 26).fill({ color: '#401d18', alpha: 0.65 }), label)
    this.activate(button, action)
    this.addChild(button)
    return label
  }

  private makeSpin(action: () => void) {
    const button = new Container()
    button.position.set(215, 72)
    button.addChild(
      new Graphics().circle(0, 0, 58).fill('#e6c16e').stroke({ color: '#fff1bd', width: 5 }),
      new Graphics().circle(0, 0, 48).fill('#23a889').stroke({ color: '#157461', width: 5 }),
    )
    const glyph = new Text({ text: '↻', style: { fontFamily: 'Arial', fontSize: 68, fontWeight: '900', fill: '#e9f4d8' } })
    glyph.anchor.set(0.5)
    glyph.position.y = -3
    button.addChild(glyph)
    this.activate(button, action)
    this.addChild(button)
    return button
  }

  private activate(button: Container, action: () => void) {
    button.eventMode = 'static'
    button.cursor = 'pointer'
    button.on('pointerdown', () => button.scale.set(0.94))
    button.on('pointerupoutside', () => button.scale.set(1))
    button.on('pointerup', () => { button.scale.set(1); action() })
  }

  setSpinning(active: boolean) {
    this.isSpinning = active
    this.spinButton.alpha = active ? 0.65 : 1
    this.spinGlyph.rotation = 0
    this.spinGlyph.text = active ? '…' : '↻'
  }

  setTurbo(active: boolean) {
    this.turboText.style.fill = active ? '#fff08a' : '#e8ae66'
  }

  setAuto(active: boolean) {
    this.autoText.text = active ? '■\nAUTO' : '▶\nAUTO'
    this.autoText.style.fill = active ? '#fff08a' : '#e8ae66'
  }
}
