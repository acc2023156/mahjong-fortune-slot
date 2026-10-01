function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateConfig(config) {
  assert(config.grid?.length === 5, 'grid must contain five reel heights')
  assert(config.grid.every((height) => Number.isInteger(height) && height > 0), 'grid heights must be positive integers')
  assert(config.weights?.length === 5, 'weights must contain one pool per reel')
  assert(config.payingSymbols?.length > 0, 'payingSymbols is required')
  for (const symbol of config.payingSymbols) {
    assert(config.paytable?.[symbol]?.['3'] !== undefined, `missing 3-reel pay for ${symbol}`)
    assert(config.paytable[symbol]['4'] !== undefined, `missing 4-reel pay for ${symbol}`)
    assert(config.paytable[symbol]['5'] !== undefined, `missing 5-reel pay for ${symbol}`)
  }
  config.weights.forEach((pool, reel) => {
    const total = Object.values(pool).reduce((sum, weight) => sum + weight, 0)
    assert(total > 0, `reel ${reel + 1} has no positive weights`)
    for (const [symbol, weight] of Object.entries(pool)) {
      assert(Number.isFinite(weight) && weight >= 0, `invalid weight for reel ${reel + 1} ${symbol}`)
    }
  })
  return config
}

export function weightedSymbol(pool, rng) {
  const entries = Object.entries(pool).filter(([, weight]) => weight > 0)
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [symbol, weight] of entries) {
    roll -= weight
    if (roll < 0) return symbol
  }
  return entries.at(-1)[0]
}

export function createCell(config, reel, rng) {
  const symbol = weightedSymbol(config.weights[reel], rng)
  const canBeGold = symbol !== config.scatterSymbol && symbol !== config.wildSymbol
  return { symbol, gold: canBeGold && rng() < config.goldChanceByReel[reel] }
}

export function generateBoard(config, rng) {
  return config.grid.map((height, reel) =>
    Array.from({ length: height }, () => createCell(config, reel, rng)),
  )
}

export function countScatters(board, scatterSymbol = 'SC') {
  return board.reduce((total, reel) => total + reel.filter((cell) => cell.symbol === scatterSymbol).length, 0)
}

/**
 * Board is reel-major: board[reel][row]. Each paying symbol is evaluated once,
 * with WILD included as a substitute. Winning cells are returned as a union so
 * a WILD shared by multiple symbol wins is removed/retained only once.
 */
export function evaluateWays(board, config) {
  const wins = []
  const winningCells = new Set()
  let payout = 0
  for (const symbol of config.payingSymbols) {
    const matchingRows = []
    for (let reel = 0; reel < board.length; reel += 1) {
      const rows = []
      for (let row = 0; row < board[reel].length; row += 1) {
        const candidate = board[reel][row].symbol
        if (candidate === symbol || candidate === config.wildSymbol) rows.push(row)
      }
      if (rows.length === 0) break
      matchingRows.push(rows)
    }
    const reelCount = matchingRows.length
    if (reelCount < 3) continue
    const ways = matchingRows.reduce((product, rows) => product * rows.length, 1)
    const pay = config.paytable[symbol][String(reelCount)] * ways
    payout += pay
    for (let reel = 0; reel < reelCount; reel += 1) {
      for (const row of matchingRows[reel]) winningCells.add(`${reel}:${row}`)
    }
    wins.push({ symbol, reelCount, ways, pay })
  }
  return { payout, wins, winningCells }
}

/** Winning gold tiles become persistent WILDs; other winners disappear, then each reel refills. */
export function cascadeBoard(board, winningCells, config, rng) {
  return board.map((reel, reelIndex) => {
    const survivors = []
    for (let row = 0; row < reel.length; row += 1) {
      const cell = reel[row]
      if (!winningCells.has(`${reelIndex}:${row}`)) survivors.push(cell)
      else if (cell.gold) survivors.push({ symbol: config.wildSymbol, gold: false })
    }
    while (survivors.length < reel.length) survivors.unshift(createCell(config, reelIndex, rng))
    return survivors
  })
}

export function multiplierFor(step, multipliers) {
  return multipliers[Math.min(step, multipliers.length - 1)]
}

export function playPaidSpin(config, rng, options = {}) {
  const freeMode = options.freeMode ?? false
  const multipliers = freeMode ? config.freeMultipliers : config.baseMultipliers
  let board = options.board ? structuredClone(options.board) : generateBoard(config, rng)
  const initialBoard = structuredClone(board)
  const scatterCount = countScatters(initialBoard, config.scatterSymbol)
  const cascades = []
  let totalWin = 0
  for (let step = 0; step < config.maxCascadeSteps; step += 1) {
    const result = evaluateWays(board, config)
    if (result.payout <= 0) return { totalWin, scatterCount, cascades, initialBoard, finalBoard: board }
    const multiplier = multiplierFor(step, multipliers)
    const win = result.payout * multiplier
    totalWin += win
    cascades.push({ step, multiplier, win, wins: result.wins, board: structuredClone(board) })
    board = cascadeBoard(board, result.winningCells, config, rng)
  }
  throw new Error(`cascade safety limit (${config.maxCascadeSteps}) reached`)
}

export function freeSpinAward(scatterCount, config) {
  const rules = config.freeSpins
  if (scatterCount < rules.triggerScatters) return 0
  return rules.initialAward + (scatterCount - rules.triggerScatters) * rules.extraPerAdditionalScatter
}

/** One purchased spin plus its complete free-spin feature, if triggered. */
export function playRound(config, rng, options = {}) {
  const base = playPaidSpin(config, rng, options)
  let freeSpinsRemaining = freeSpinAward(base.scatterCount, config)
  let freeSpinsPlayed = 0
  let bonusWin = 0
  const freeSpins = []
  while (freeSpinsRemaining > 0) {
    if (freeSpinsPlayed >= config.maxFreeSpinsPerFeature) {
      throw new Error(`free-spin safety limit (${config.maxFreeSpinsPerFeature}) reached`)
    }
    freeSpinsRemaining -= 1
    const spin = playPaidSpin(config, rng, { freeMode: true })
    const retrigger = freeSpinAward(spin.scatterCount, config)
    freeSpinsRemaining += retrigger
    freeSpinsPlayed += 1
    bonusWin += spin.totalWin
    if (options.captureFreeSpins) freeSpins.push({ ...spin, retrigger })
  }
  const uncappedWin = base.totalWin + bonusWin
  return {
    totalWin: Math.min(uncappedWin, config.maxWin),
    uncappedWin,
    baseWin: base.totalWin,
    bonusWin,
    featureTriggered: freeSpinsPlayed > 0,
    freeSpinsPlayed,
    base,
    freeSpins,
  }
}
