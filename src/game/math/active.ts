import type { CellState, SymbolId } from '../config'
import { MATH_V001 } from './versions/v001'

/** Change this import only when deliberately promoting a new immutable math version. */
export const ACTIVE_MATH = MATH_V001
export const ACTIVE_MATH_VERSION = ACTIVE_MATH.id

export type RandomSource = () => number

export function drawSymbol(reel: number, random: RandomSource = Math.random): SymbolId {
  const pool = ACTIVE_MATH.weights[reel]
  if (!pool) throw new RangeError(`No probability pool for reel ${reel + 1}`)
  const entries = Object.entries(pool) as [SymbolId, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [symbol, weight] of entries) {
    roll -= weight
    if (roll < 0) return symbol
  }
  return entries[entries.length - 1][0]
}

export function drawCell(reel: number, random: RandomSource = Math.random): CellState {
  const symbol = drawSymbol(reel, random)
  const canBeGold = symbol !== 'wild' && symbol !== 'scatter'
  return {
    symbol,
    gold: canBeGold && random() < ACTIVE_MATH.goldChanceByReel[reel],
  }
}
