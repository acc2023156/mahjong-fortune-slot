import type { CellState, SymbolId } from '../config'
import { MATH_V002 } from './versions/v002'

/** Change this import only when deliberately promoting a new immutable math version. */
export const ACTIVE_MATH = MATH_V002
export const ACTIVE_MATH_VERSION = ACTIVE_MATH.id

export type RandomSource = () => number

export function drawSymbol(reel: number, freeMode = false, random: RandomSource = Math.random): SymbolId {
  const pools = freeMode ? ACTIVE_MATH.freeWeights : ACTIVE_MATH.weights
  const pool = pools[reel]
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

export function drawCell(reel: number, freeMode = false, random: RandomSource = Math.random): CellState {
  const symbol = drawSymbol(reel, freeMode, random)
  const canBeGold = symbol !== 'wild' && symbol !== 'scatter'
  const goldChances = freeMode ? ACTIVE_MATH.freeGoldChanceByReel : ACTIVE_MATH.goldChanceByReel
  return {
    symbol,
    gold: canBeGold && random() < goldChances[reel],
  }
}
