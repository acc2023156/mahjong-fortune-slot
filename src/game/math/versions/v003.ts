import { MATH_V002 } from './v002'

/**
 * Immutable V003 delta from V002.
 * A playable reel may contain at most one scatter, including after cascade refills.
 */
export const MATH_V003 = {
  ...MATH_V002,
  id: 'MW1_LIKE_V003',
  note: 'V002 calibration; maximum one scatter per reel and staged reel-result reveal.',
  weights: MATH_V002.weights.map((pool) => ({ ...pool, scatter: 2.13 })),
  freeWeights: MATH_V002.freeWeights.map((pool) => ({ ...pool, scatter: 2.13 })),
  goldChanceByReel: [0, .055, .066, .055, 0],
  freeGoldChanceByReel: [0, .0925, .111, .0925, 0],
  maxScatterPerReel: 1,
} as const
