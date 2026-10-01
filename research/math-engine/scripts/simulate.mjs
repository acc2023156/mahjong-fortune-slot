import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simulate } from '../src/monte-carlo.mjs'

function argument(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)
  return value ?? fallback
}

const defaultConfigPath = fileURLToPath(new URL('../config/mw1-like-v001.json', import.meta.url))
const configPath = resolve(argument('config', defaultConfigPath))
const spins = Number(argument('spins', '100000'))
const seed = Number(argument('seed', '123456789'))
const config = JSON.parse(await readFile(configPath, 'utf8'))
const report = simulate(config, spins, seed)

const percent = (value) => `${(value * 100).toFixed(4)}%`
console.log(`${report.game} | ${report.spins.toLocaleString()} spins | seed ${report.seed}`)
console.table({
  'Total RTP': { actual: percent(report.rtp), target: percent(report.targets.totalRtp) },
  'Base RTP': { actual: percent(report.baseRtp), target: percent(report.targets.baseRtp) },
  'Free Spins RTP': { actual: percent(report.freeSpinRtp), target: percent(report.targets.freeSpinRtp) },
  'Overall Hit Rate': { actual: percent(report.overallHitRate), target: percent(report.targets.overallHitRate) },
  'Base Hit Rate': { actual: percent(report.baseHitRate), target: percent(report.targets.baseHitRate) },
  'Feature Hit Rate': { actual: percent(report.featureHitRate), target: percent(report.targets.featureHitRate) },
})
console.log(`Bonus RTP concentration: ${percent(report.bonusRtpConcentration)}`)
console.log(`Average spins / feature: ${report.averageSpinsPerFeature?.toFixed(2) ?? 'n/a'}`)
console.log(`Average free spins / feature: ${report.averageFreeSpinsPerFeature?.toFixed(2) ?? 'n/a'}`)
console.log(`Max observed win: ${report.maxWin.toFixed(2)}x`)
console.log(`Round-win standard deviation: ${report.standardDeviation.toFixed(4)}`)
console.table(Object.fromEntries(Object.entries(report.distribution).map(([key, value]) => [key, {
  count: value.count,
  probability: percent(value.probability),
  oneIn: value.oneIn?.toFixed(2) ?? 'n/a',
}])) )

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
