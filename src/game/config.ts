import { ACTIVE_MATH, drawCell } from './math/active'

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

export const SYMBOL_PAYS: Record<PayingSymbolId, Record<3 | 4 | 5, number>> = ACTIVE_MATH.paytable

export const TUMBLE_MULTIPLIERS = ACTIVE_MATH.baseMultipliers
export const FREE_TUMBLE_MULTIPLIERS = ACTIVE_MATH.freeMultipliers
export const FREE_SPINS_AWARDED = ACTIVE_MATH.freeSpins.initialAward

export function multiplierForTumble(tumble: number, freeMode: boolean) {
  const values = freeMode ? FREE_TUMBLE_MULTIPLIERS : TUMBLE_MULTIPLIERS
  return values[Math.min(tumble, values.length - 1)]
}

export function freeSpinsForScatters(scatterCount: number) {
  const rules = ACTIVE_MATH.freeSpins
  return scatterCount < rules.triggerScatters
    ? 0
    : FREE_SPINS_AWARDED + (scatterCount - rules.triggerScatters) * rules.extraPerAdditionalScatter
}

/**
 * Probability-backed source retaining the UI's historical ReelStrips interface.
 * Every visible result and cascade refill comes from the active per-reel pool.
 */
export class ReelStrips {
  /** Samples every playable cell at SPIN time and keeps the result fixed during the stop animation. */
  stop(rows: number) {
    const grid: CellState[][] = Array.from({ length: rows }, () => [])
    const above: CellState[] = []
    const below: CellState[] = []
    for (let col = 0; col < REEL_COLUMNS; col++) {
      for (let row = 0; row < rows; row++) grid[row][col] = drawCell(col)
      above[col] = drawCell(col)
      below[col] = drawCell(col)
    }
    return { grid, above, below }
  }

  /** Next probability result falling into `column` during a cascade. */
  next(column: number) {
    return drawCell(column)
  }

  /** A passing symbol while the reel is spinning. */
  blur(column: number) {
    return drawCell(column)
  }
}
