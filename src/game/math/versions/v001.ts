import type { PayingSymbolId, SymbolId } from '../../config'

export const MATH_V001 = {
  id: 'MW1_LIKE_V001',
  note: 'Starter research model. Not a PG Soft PAR sheet.',
  weights: [
    { fa: 5, zhong: 6, bai: 7, wan8: 10, tong5: 12, suo5: 18, tong2: 20, suo2: 22 },
    { fa: 5, zhong: 6, bai: 7, wan8: 10, tong5: 12, suo5: 18, tong2: 20, suo2: 22, scatter: 2 },
    { fa: 5, zhong: 6, bai: 7, wan8: 10, tong5: 12, suo5: 18, tong2: 20, suo2: 22, scatter: 2 },
    { fa: 5, zhong: 6, bai: 7, wan8: 10, tong5: 12, suo5: 18, tong2: 20, suo2: 22, scatter: 2 },
    { fa: 5, zhong: 6, bai: 7, wan8: 10, tong5: 12, suo5: 18, tong2: 20, suo2: 22 },
  ] satisfies ReadonlyArray<Partial<Record<SymbolId, number>>>,
  paytable: {
    fa: { 3: .25, 4: .60, 5: 1.50 },
    zhong: { 3: .20, 4: .50, 5: 1.20 },
    bai: { 3: .15, 4: .40, 5: 1.00 },
    wan8: { 3: .10, 4: .30, 5: .75 },
    tong5: { 3: .08, 4: .25, 5: .60 },
    suo5: { 3: .06, 4: .18, 5: .45 },
    tong2: { 3: .05, 4: .15, 5: .35 },
    suo2: { 3: .04, 4: .12, 5: .30 },
  } satisfies Record<PayingSymbolId, Record<3 | 4 | 5, number>>,
  goldChanceByReel: [0, .10, .12, .10, 0],
  baseMultipliers: [1, 2, 3, 5],
  freeMultipliers: [2, 4, 6, 10],
  freeSpins: { triggerScatters: 3, initialAward: 10, extraPerAdditionalScatter: 2 },
} as const
