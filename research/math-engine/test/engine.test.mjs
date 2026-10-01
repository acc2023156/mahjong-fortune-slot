import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { evaluateWays, cascadeBoard, freeSpinAward, multiplierFor, validateConfig } from '../src/engine.mjs'
import { createRng } from '../src/rng.mjs'

const config = validateConfig(JSON.parse(await readFile(new URL('../config/mw1-like-v001.json', import.meta.url), 'utf8')))
const cell = (symbol, gold = false) => ({ symbol, gold })

test('12 ways pay the longest H1 combination once', () => {
  const board = [
    [cell('H1'), cell('H1'), cell('L1'), cell('L2')],
    [cell('H1'), cell('H1'), cell('H1'), cell('L2')],
    [cell('H1'), cell('H1'), cell('L1'), cell('L2')],
    [cell('L1'), cell('L2'), cell('L3'), cell('M1')],
    [cell('H1'), cell('L1'), cell('L2'), cell('L3')],
  ]
  const result = evaluateWays(board, config)
  const h1 = result.wins.find((win) => win.symbol === 'H1')
  assert.equal(h1.ways, 12)
  assert.equal(h1.pay, 3)
})

test('wild substitutes without substituting scatter', () => {
  const board = [
    [cell('H1'), cell('L1'), cell('L2'), cell('L3')],
    [cell('W'), cell('L1'), cell('L2'), cell('L3')],
    [cell('H1'), cell('L1'), cell('L2'), cell('L3')],
    [cell('SC'), cell('L1'), cell('L2'), cell('L3')],
    [cell('H1'), cell('L1'), cell('L2'), cell('L3')],
  ]
  const win = evaluateWays(board, config).wins.find((item) => item.symbol === 'H1')
  assert.equal(win.reelCount, 3)
  assert.equal(win.ways, 1)
})

test('winning gold persists as wild while ordinary winner is replaced', () => {
  const board = Array.from({ length: 5 }, () => [cell('H1'), cell('L1'), cell('L2'), cell('L3')])
  board[1][0].gold = true
  const result = evaluateWays(board, config)
  const next = cascadeBoard(board, result.winningCells, config, createRng(7))
  assert.ok(next[1].some((item) => item.symbol === 'W' && item.gold === false))
  assert.equal(next[0].some((item) => item.symbol === 'W'), false)
})

test('multipliers clamp and free-spin awards follow config', () => {
  assert.equal(multiplierFor(9, config.baseMultipliers), 5)
  assert.equal(multiplierFor(9, config.freeMultipliers), 10)
  assert.equal(freeSpinAward(2, config), 0)
  assert.equal(freeSpinAward(3, config), 10)
  assert.equal(freeSpinAward(5, config), 14)
})

test('seeded RNG is reproducible', () => {
  const a = createRng(42)
  const b = createRng(42)
  assert.deepEqual(Array.from({ length: 10 }, a), Array.from({ length: 10 }, b))
})
