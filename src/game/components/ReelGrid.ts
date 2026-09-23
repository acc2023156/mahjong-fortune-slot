import { Container, Graphics, Text } from 'pixi.js'
import { REEL_COLUMNS, REEL_ROWS, SYMBOL_COLORS, SYMBOL_PAYS, TUMBLE_MULTIPLIERS, randomSymbol, type SymbolId } from '../config'

export class ReelGrid extends Container {
  private readonly cells: Text[][] = []
  private readonly symbols: SymbolId[][] = []
  private running = false

  constructor() {
    super()
    const frame = new Graphics()
      .roundRect(0, 0, 398, 374, 18).fill({ color: '#7f1518', alpha: 0.98 })
      .roundRect(0, 0, 398, 374, 18).stroke({ color: '#f7c84b', width: 4 })
    this.addChild(frame)

    for (let row = 0; row < REEL_ROWS; row++) {
      this.cells[row] = []
      this.symbols[row] = []
      for (let col = 0; col < REEL_COLUMNS; col++) {
        const x = 10 + col * 77
        const y = 10 + row * 89
        const tile = new Graphics()
          .roundRect(x + 2, y + 5, 70, 82, 10).fill('#196747')
          .roundRect(x, y, 70, 82, 10).fill('#fff4d8')
          .roundRect(x, y, 70, 82, 10).stroke({ color: '#d2aa56', width: 2 })
        this.addChild(tile)
        const value = randomSymbol()
        this.symbols[row][col] = value
        const label = new Text({ text: value === '百搭' ? '百搭' : value, style: { fontFamily: 'Microsoft JhengHei, serif', fontSize: value === '百搭' ? 22 : 38, fontWeight: '900', fill: SYMBOL_COLORS[value], dropShadow: { color: '#ffffff', distance: 1, blur: 1 } } })
        label.anchor.set(0.5)
        label.position.set(x + 35, y + 41)
        this.cells[row][col] = label
        this.addChild(label)
      }
    }
  }

  private setSymbol(row: number, col: number, value: SymbolId) {
    this.symbols[row][col] = value
    this.cells[row][col].text = value
    this.cells[row][col].style.fontSize = value === '百搭' ? 22 : 38
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
      if (elapsed < 1180) return requestAnimationFrame(animate)
      void this.runTumbles(onComplete)
    }
    requestAnimationFrame(animate)
  }

  private evaluateWays() {
    let payout = 0
    const wins = new Set<string>()
    for (const target of ['中', '發', '萬', '筒', '索', '東'] as SymbolId[]) {
      const columns: number[][] = []
      for (let col = 0; col < REEL_COLUMNS; col++) {
        const rows: number[] = []
        for (let row = 0; row < REEL_ROWS; row++) {
          const symbol = this.symbols[row][col]
          if (symbol === target || symbol === '百搭') rows.push(row)
        }
        if (!rows.length) break
        columns.push(rows)
      }
      if (columns.length >= 3) {
        const ways = columns.reduce((total, rows) => total * rows.length, 1)
        payout += ways * SYMBOL_PAYS[target] * (columns.length - 2) / 20
        columns.forEach((rows, col) => rows.forEach(row => wins.add(`${row}:${col}`)))
      }
    }
    return { payout, wins }
  }

  private wait(ms: number) { return new Promise(resolve => window.setTimeout(resolve, ms)) }

  private async runTumbles(onComplete: (multiplier: number) => void) {
    let total = 0
    for (let tumble = 0; tumble < TUMBLE_MULTIPLIERS.length; tumble++) {
      const result = this.evaluateWays()
      if (!result.wins.size) break
      const mult = TUMBLE_MULTIPLIERS[tumble]
      total += result.payout * mult
      result.wins.forEach(key => {
        const [row, col] = key.split(':').map(Number)
        this.cells[row][col].alpha = 0.25
        this.cells[row][col].scale.set(1.18)
      })
      await this.wait(330)
      for (let col = 0; col < REEL_COLUMNS; col++) {
        const survivors = [] as SymbolId[]
        for (let row = REEL_ROWS - 1; row >= 0; row--) {
          if (!result.wins.has(`${row}:${col}`)) survivors.unshift(this.symbols[row][col])
        }
        const incoming = Array.from({ length: REEL_ROWS - survivors.length }, randomSymbol)
        const next = [...incoming, ...survivors]
        for (let row = 0; row < REEL_ROWS; row++) {
          this.cells[row][col].alpha = 1
          this.cells[row][col].scale.set(1)
          this.setSymbol(row, col, next[row])
        }
      }
      await this.wait(220)
    }
    this.running = false
    onComplete(total)
  }
}
