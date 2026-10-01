import { playRound, validateConfig } from './engine.mjs'
import { createRng } from './rng.mjs'

const BINS = [
  { key: '0x', min: 0, max: 0 },
  { key: '0-1x', min: 0, max: 1 },
  { key: '1-2x', min: 1, max: 2 },
  { key: '2-5x', min: 2, max: 5 },
  { key: '5-10x', min: 5, max: 10 },
  { key: '10-20x', min: 10, max: 20 },
  { key: '20-35x', min: 20, max: 35 },
  { key: '35-50x', min: 35, max: 50 },
  { key: '50-100x', min: 50, max: 100 },
  { key: '100-500x', min: 100, max: 500 },
  { key: '500x+', min: 500, max: Infinity }
]

function binFor(win) {
  if (win === 0) return '0x'
  return BINS.slice(1).find((bin) => win >= bin.min && win < bin.max).key
}

export function simulate(config, spins, seed = 123456789) {
  validateConfig(config)
  if (!Number.isInteger(spins) || spins <= 0) throw new Error('spins must be a positive integer')
  const rng = createRng(seed)
  const distribution = Object.fromEntries(BINS.map((bin) => [bin.key, 0]))
  let baseWin = 0
  let bonusWin = 0
  let totalWin = 0
  let baseHits = 0
  let overallHits = 0
  let features = 0
  let freeSpins = 0
  let maxWin = 0
  let sumSquares = 0
  for (let index = 0; index < spins; index += 1) {
    const round = playRound(config, rng)
    baseWin += round.baseWin
    bonusWin += round.bonusWin
    totalWin += round.totalWin
    if (round.baseWin > 0) baseHits += 1
    if (round.totalWin > 0) overallHits += 1
    if (round.featureTriggered) features += 1
    freeSpins += round.freeSpinsPlayed
    maxWin = Math.max(maxWin, round.totalWin)
    sumSquares += round.totalWin ** 2
    distribution[binFor(round.totalWin)] += 1
  }
  const mean = totalWin / spins
  return {
    game: config.game,
    spins,
    seed,
    rtp: totalWin / spins,
    baseRtp: baseWin / spins,
    freeSpinRtp: bonusWin / spins,
    bonusRtpConcentration: totalWin > 0 ? bonusWin / totalWin : 0,
    overallHitRate: overallHits / spins,
    baseHitRate: baseHits / spins,
    featureHitRate: features / spins,
    averageSpinsPerFeature: features > 0 ? spins / features : null,
    averageFreeSpinsPerFeature: features > 0 ? freeSpins / features : null,
    maxWin,
    standardDeviation: Math.sqrt(Math.max(0, sumSquares / spins - mean ** 2)),
    distribution: Object.fromEntries(Object.entries(distribution).map(([key, count]) => [key, {
      count,
      probability: count / spins,
      oneIn: count > 0 ? spins / count : null,
    }])),
    targets: config.targets,
  }
}
