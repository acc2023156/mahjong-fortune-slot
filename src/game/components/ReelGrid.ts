import { Container, Graphics, Text } from 'pixi.js'
import { REEL_COLUMNS, REEL_ROWS, SYMBOL_COLORS, SYMBOL_PAYS, randomSymbol, type SymbolId } from '../config'

export class ReelGrid extends Container {
  private readonly cells: Text[][] = []
  private readonly symbols: SymbolId[][] = []
  private running = false

  constructor() {
    super()
    const frame = new Graphics()
      .roundRect(0, 0, 398, 485, 18).fill({ color: '#751d1d', alpha: 0.98 })
      .roundRect(0, 0, 398, 485, 18).stroke({ color: '#f7c84b', width: 4 })
    this.addChild(frame)

    for (let row = 0; row < REEL_ROWS; row++) {
      this.cells[row] = []
      this.symbols[row] = []
      for (let col = 0; col < REEL_COLUMNS; col++) {
        const x = 10 + col * 77
        const y = 12 + row * 92
        const tile = new Graphics()
          .roundRect(x, y, 70, 84, 10).fill('#f6f0db')
          .roundRect(x, y, 70, 84, 10).stroke({ color: '#d1b77f', width: 2 })
        this.addChild(tile)
        const value = randomSymbol()
        this.symbols[row][col] = value
        const label = new Text({ text: value, style: { fontFamily: 'Microsoft JhengHei, serif', fontSize: 38, fontWeight: '900', fill: SYMBOL_COLORS[value], dropShadow: { color: '#ffffff', distance: 1, blur: 1 } } })
        label.anchor.set(0.5)
        label.position.set(x + 35, y + 42)
        this.cells[row][col] = label
        this.addChild(label)
      }
    }
  }

  private setSymbol(row: number, col: number, value: SymbolId) {
    this.symbols[row][col] = value
    this.cells[row][col].text = value
    this.cells[row][col].style.fill = SYMBOL_COLORS[value]
  }

  spin(onComplete: (multiplier: number) => void) {
    if (this.running) return
    this.running = true
    const start = performance.now()
    let lastShuffle = 0
    const animate = () => {
      const elapsed = performance.now() - start
      if (elapsed - lastShuffle > 52) {
        lastShuffle = elapsed
        for (let col = 0; col < REEL_COLUMNS; col++) {
          if (elapsed < 620 + col * 155) {
            for (let row = 0; row < REEL_ROWS; row++) this.setSymbol(row, col, randomSymbol())
          }
        }
      }
      if (elapsed < 1320) return requestAnimationFrame(animate)
      this.running = false
      onComplete(this.evaluate())
    }
    requestAnimationFrame(animate)
  }

  private evaluate() {
    let multiplier = 0
    for (let row = 0; row < REEL_ROWS; row++) {
      const first = this.symbols[row][0]
      let matches = 1
      while (matches < REEL_COLUMNS && this.symbols[row][matches] === first) matches++
      if (matches >= 3) multiplier += SYMBOL_PAYS[first] * (matches - 2)
    }
    return multiplier
  }
}
