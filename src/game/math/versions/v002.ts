import type { PayingSymbolId, SymbolId } from '../../config'

const lowValueBase = [
  { fa: 4.5, zhong: 4.5, bai: 4.5, wan8: 4.5, tong5: 20, suo5: 20, tong2: 20, suo2: 20, scatter: 1.7 },
  { fa: 20, zhong: 20, bai: 20, wan8: 20, tong5: 4.5, suo5: 4.5, tong2: 4.5, suo2: 4.5, scatter: 1.7 },
  { fa: 4.5, zhong: 4.5, bai: 4.5, wan8: 4.5, tong5: 20, suo5: 20, tong2: 20, suo2: 20, scatter: 1.7 },
  { fa: 4.5, zhong: 4.5, bai: 4.5, wan8: 4.5, tong5: 20, suo5: 20, tong2: 20, suo2: 20, scatter: 1.7 },
  { fa: 20, zhong: 20, bai: 20, wan8: 20, tong5: 4.5, suo5: 4.5, tong2: 4.5, suo2: 4.5, scatter: 1.7 },
] satisfies ReadonlyArray<Partial<Record<SymbolId, number>>>

const highValueFree = [
  { fa: 20, zhong: 20, bai: 20, wan8: 20, tong5: 4.5, suo5: 4.5, tong2: 4.5, suo2: 4.5, scatter: 1.7 },
  { fa: 4.5, zhong: 4.5, bai: 4.5, wan8: 4.5, tong5: 20, suo5: 20, tong2: 20, suo2: 20, scatter: 1.7 },
  { fa: 20, zhong: 20, bai: 20, wan8: 20, tong5: 4.5, suo5: 4.5, tong2: 4.5, suo2: 4.5, scatter: 1.7 },
  { fa: 20, zhong: 20, bai: 20, wan8: 20, tong5: 4.5, suo5: 4.5, tong2: 4.5, suo2: 4.5, scatter: 1.7 },
  { fa: 4.5, zhong: 4.5, bai: 4.5, wan8: 4.5, tong5: 20, suo5: 20, tong2: 20, suo2: 20, scatter: 1.7 },
] satisfies ReadonlyArray<Partial<Record<SymbolId, number>>>

export const MATH_V002 = {
  id: 'MW1_LIKE_V002',
  note: 'PDF paytable, 12 free spins, all-reel scatters; calibrated Base/FS pools.',
  weights: lowValueBase,
  freeWeights: highValueFree,
  paytable: {
    fa: { 3: .75, 4: 3, 5: 5 },
    zhong: { 3: .50, 4: 2, 5: 4 },
    bai: { 3: .40, 4: 1, 5: 3 },
    wan8: { 3: .30, 4: .75, 5: 2 },
    tong5: { 3: .20, 4: .50, 5: 1 },
    suo5: { 3: .20, 4: .50, 5: 1 },
    tong2: { 3: .10, 4: .25, 5: .50 },
    suo2: { 3: .10, 4: .25, 5: .50 },
  } satisfies Record<PayingSymbolId, Record<3 | 4 | 5, number>>,
  goldChanceByReel: [0, .0495, .0594, .0495, 0],
  freeGoldChanceByReel: [0, .095, .114, .095, 0],
  baseMultipliers: [1, 2, 3, 5],
  freeMultipliers: [2, 4, 6, 10],
  freeSpins: { triggerScatters: 3, initialAward: 12, extraPerAdditionalScatter: 2 },
} as const
