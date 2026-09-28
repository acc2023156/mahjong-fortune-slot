export const GAME_WIDTH = 430
export const GAME_HEIGHT = 760
export const REEL_COLUMNS = 5
export const REEL_ROWS = 4

export const SYMBOLS = ['wild', 'scatter', 'fa', 'zhong', 'bai', 'wan8', 'tong5', 'suo5', 'tong2', 'suo2'] as const
export type SymbolId = (typeof SYMBOLS)[number]
export type PayingSymbolId = Exclude<SymbolId, 'wild' | 'scatter'>

export type CellState = {
  symbol: SymbolId
  gold: boolean
}

export const SYMBOL_LABELS: Record<SymbolId, string> = {
  wild: 'WILD',
  scatter: '胡',
  fa: '發',
  zhong: '中',
  bai: '白',
  wan8: '八\n萬',
  tong5: '⑤筒',
  suo5: '⑤條',
  tong2: '②筒',
  suo2: '②條',
}

export const SYMBOL_COLORS: Record<SymbolId, string> = {
  wild: '#ffd12f',
  scatter: '#ff3a18',
  fa: '#16864c',
  zhong: '#d92f2f',
  bai: '#553dcc',
  wan8: '#553dcc',
  tong5: '#6550bb',
  suo5: '#238b55',
  tong2: '#6550bb',
  suo2: '#238b55',
}

export const PAYING_SYMBOLS: PayingSymbolId[] = ['fa', 'zhong', 'bai', 'wan8', 'tong5', 'suo5', 'tong2', 'suo2']

export const SYMBOL_PAYS: Record<PayingSymbolId, Record<3 | 4 | 5, number>> = {
  fa: { 3: 15, 4: 60, 5: 100 },
  zhong: { 3: 10, 4: 40, 5: 80 },
  bai: { 3: 8, 4: 20, 5: 60 },
  wan8: { 3: 6, 4: 15, 5: 40 },
  tong5: { 3: 4, 4: 10, 5: 20 },
  suo5: { 3: 4, 4: 10, 5: 20 },
  tong2: { 3: 2, 4: 5, 5: 10 },
  suo2: { 3: 2, 4: 5, 5: 10 },
}

// WILD never lands on its own in the reference: it only comes from winning gold tiles.
// Tuned by simulation to the reference feel: ~48% of spins pay, Free Spins about 1 in 150.
export const SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  wild: 0,
  scatter: 2.2,
  fa: 6,
  zhong: 7,
  bai: 8,
  wan8: 9,
  tong5: 15,
  suo5: 15,
  tong2: 20,
  suo2: 20,
}

/** Chance that a reel-2..4 tile is gold plated (the reference boards show roughly 1-3 per spin). */
export const GOLD_CHANCE = .14
/** Chance a strip entry repeats the previous symbol, producing the stacked pairs seen in the reference. */
const STACK_CHANCE = .12
const STRIP_LENGTH = 90

export const TUMBLE_MULTIPLIERS = [1, 2, 3, 5] as const
export const FREE_TUMBLE_MULTIPLIERS = [2, 4, 6, 10] as const
export const FREE_SPINS_AWARDED = 12

export function multiplierForTumble(tumble: number, freeMode: boolean) {
  const values = freeMode ? FREE_TUMBLE_MULTIPLIERS : TUMBLE_MULTIPLIERS
  return values[Math.min(tumble, values.length - 1)]
}

export function freeSpinsForScatters(scatterCount: number) {
  return scatterCount < 3 ? 0 : FREE_SPINS_AWARDED + (scatterCount - 3) * 2
}

export function randomSymbol(): SymbolId {
  const total = SYMBOLS.reduce((sum, symbol) => sum + SYMBOL_WEIGHTS[symbol], 0)
  let roll = Math.random() * total
  for (const symbol of SYMBOLS) {
    roll -= SYMBOL_WEIGHTS[symbol]
    if (roll <= 0) return symbol
  }
  return 'suo2'
}

function goldFor(column: number, symbol: SymbolId) {
  return column > 0 && column < REEL_COLUMNS - 1 && symbol !== 'wild' && symbol !== 'scatter' && Math.random() < GOLD_CHANCE
}

export function randomCell(column: number): CellState {
  const symbol = randomSymbol()
  return { symbol, gold: goldFor(column, symbol) }
}

/**
 * Per-reel symbol strips. A spin stops each reel at a random strip index; cascades
 * refill from the symbols above that stop, so new tiles continue the same strip.
 */
export class ReelStrips {
  private readonly strips: SymbolId[][]
  private readonly cursors: number[]

  constructor() {
    this.strips = Array.from({ length: REEL_COLUMNS }, () => {
      const strip: SymbolId[] = []
      while (strip.length < STRIP_LENGTH) {
        const previous = strip[strip.length - 1]
        const stack = previous && previous !== 'scatter' && Math.random() < STACK_CHANCE
        strip.push(stack ? previous : randomSymbol())
      }
      return strip
    })
    this.cursors = this.strips.map((strip) => Math.floor(Math.random() * strip.length))
  }

  private at(column: number, index: number): CellState {
    const strip = this.strips[column]
    const symbol = strip[((index % strip.length) + strip.length) % strip.length]
    return { symbol, gold: goldFor(column, symbol) }
  }

  /** Stops every reel at a fresh random index; returns rows (top to bottom) plus the peeks above/below. */
  stop(rows: number) {
    const grid: CellState[][] = Array.from({ length: rows }, () => [])
    const above: CellState[] = []
    const below: CellState[] = []
    for (let col = 0; col < REEL_COLUMNS; col++) {
      const stop = Math.floor(Math.random() * this.strips[col].length)
      for (let row = 0; row < rows; row++) grid[row][col] = this.at(col, stop + row)
      above[col] = this.at(col, stop - 1)
      below[col] = this.at(col, stop + rows)
      // Refills read upward from the tile above the visible window.
      this.cursors[col] = stop - 2
    }
    return { grid, above, below }
  }

  /** Next symbol falling into `column` during a cascade (continues up the strip). */
  next(column: number) {
    return this.at(column, this.cursors[column]--)
  }

  /** A passing symbol while the reel is spinning. */
  blur(column: number) {
    return this.at(column, Math.floor(Math.random() * this.strips[column].length))
  }
}
