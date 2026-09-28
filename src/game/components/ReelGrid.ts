import { AnimatedSprite, BlurFilter, Container, Graphics, Sprite } from 'pixi.js'
import {
  PAYING_SYMBOLS, REEL_COLUMNS, REEL_ROWS,
  ReelStrips, SYMBOL_PAYS, multiplierForTumble, type CellState,
} from '../config'
import { GLYPHS, skin } from '../skin'

export type ReelEvent = 'reelStop' | 'scatter' | 'nearMiss' | 'highlight' | 'flip' | 'wild' | 'dropStart' | 'drop'

export type ReelSpinCallbacks = {
  freeMode: boolean
  turbo: boolean
  settle: () => void
  anticipation: (active: boolean) => void
  /** A winning set is being highlighted, paid at `multiplier`. */
  tumble: (chain: number, multiplier: number, win: number) => void
  /** Winners are cleared; the rail advances to the next round's multiplier before the refill. */
  advance: (nextMultiplier: number) => void
  sound: (event: ReelEvent, index?: number) => void
  complete: (totalWin: number, scatters: number) => void
}

// Measured from the reference capture: tiles nearly touch, and the header /
// win plaque cut off part of the row above and below the 4 playable rows.
export const BOARD_WIDTH = 430
export const BOARD_HEIGHT = 392
// Cells are the cream tile faces, which touch horizontally like the reference. The tile art
// (159x188) carries an ~8px teal side strip on the left and a depth edge at the bottom; those
// tuck under the neighbouring tile so no seam shows.
const PITCH_X = 80.5
const CELL_WIDTH = PITCH_X
const ART_SCALE = CELL_WIDTH / 149
const CELL_HEIGHT = 169 * ART_SCALE
/** Art-space centre of the tile image mapped into cell space (face starts at art x=8, y=2). */
const TILE_CENTER_X = (79.5 - 8) * ART_SCALE
const TILE_CENTER_Y = (94 - 2) * ART_SCALE
const PITCH_Y = 89.5
const GRID_X = (BOARD_WIDTH - (PITCH_X * (REEL_COLUMNS - 1) + CELL_WIDTH)) / 2
const GRID_Y = 24
/** Slot 0 peeks above the board, slots 1..4 are the playable rows, slot 5 peeks below. */
const SLOTS = REEL_ROWS + 2
const STRIP_HEIGHT = PITCH_Y * SLOTS
/** Spinning tiles cycle through [STRIP_TOP, STRIP_TOP + STRIP_HEIGHT), fully hidden at the top end. */
const STRIP_TOP = BOARD_HEIGHT - STRIP_HEIGHT
const DIM_TINT = 0x505050
/** Each near-miss reel spins this long (measured: consecutive near-miss cues 4.04 s apart). */
const NEAR_MISS_MS = 4040
/** Near-miss reels spin slowly enough to read the tiles. */
const NEAR_MISS_SPEED = .55

type TileView = Container & { tile: Sprite; aura: Container; rays: Sprite; flame: Sprite; glyph: Sprite; ingot: Sprite; glow: Sprite; frame: Sprite }

type WinResult = { payout: number; wins: Set<string> }

const easeOutBack = (t: number, overshoot = 1.4) =>
  1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2)

export class ReelGrid extends Container {
  /** views[col][slot] */
  private readonly views: TileView[][] = []
  /** states[col][slot]; slots 1..4 are the playable rows. */
  private readonly states: CellState[][] = []
  private readonly reelLayer = new Container()
  private readonly columns: Container[] = []
  private readonly blurs: BlurFilter[] = []
  private readonly dim = new Graphics().rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill('#000')
  private readonly fxLayer = new Container()
  private readonly nearMissLayer = new Container()
  private running = false
  private quickStopRequested = false
  private readonly strips = new ReelStrips()
  private pendingPeeks: { above: CellState[]; below: CellState[] } | undefined

  constructor() {
    super()
    const felt = new Sprite(skin().felt)
    felt.setSize(BOARD_WIDTH, BOARD_HEIGHT)
    // Toggle visibility rather than starting at alpha 0: Pixi v8 skips re-rendering zero-alpha nodes.
    this.dim.visible = false
    const reelMask = new Graphics().rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill('#fff')
    this.addChild(felt, this.reelLayer, reelMask)
    this.reelLayer.mask = reelMask

    const initial = this.strips.stop(REEL_ROWS)
    for (let col = 0; col < REEL_COLUMNS; col++) {
      const column = new Container()
      column.sortableChildren = true
      const blur = new BlurFilter({ strengthX: 0, strengthY: 9, quality: 2 })
      blur.enabled = false
      column.filters = [blur]
      this.columns.push(column)
      this.blurs.push(blur)
      this.views[col] = []
      this.states[col] = []
      for (let slot = 0; slot < SLOTS; slot++) {
        const view = this.createView()
        this.views[col][slot] = view
        this.states[col][slot] = slot === 0 ? initial.above[col]
          : slot === SLOTS - 1 ? initial.below[col]
            : initial.grid[slot - 1][col]
        this.paint(col, slot)
        this.place(col, slot, this.slotY(slot))
        column.addChild(view)
      }
    }
    // The dim sits between reels and highlighted tiles: highlighted tiles are raised above it.
    this.reelLayer.addChild(...[...this.columns].reverse(), this.dim)
    this.nearMissLayer.visible = false
    this.buildNearMiss()
    this.addChild(this.nearMissLayer, this.fxLayer)
    this.animateAuras()
  }

  quickStop() {
    if (this.running) this.quickStopRequested = true
  }

  // ---------------------------------------------------------------- layout

  private createView() {
    const view = new Container() as TileView
    view.tile = new Sprite(skin().tile_white)
    view.tile.anchor.set(.5)
    view.tile.position.set(TILE_CENTER_X, TILE_CENTER_Y)
    view.tile.scale.set(ART_SCALE)
    view.ingot = new Sprite(skin().ingot)
    view.ingot.anchor.set(.5)
    view.ingot.scale.set(74 / skin().ingot.width)
    view.ingot.position.set(CELL_WIDTH / 2, 60)
    view.glyph = new Sprite()
    view.glyph.anchor.set(.5)
    // Win highlight from the reference effect sheet: inner glow on the face plus a gold outline.
    const [outline, innerGlow] = skin().frames.hl
    view.glow = new Sprite(innerGlow)
    view.glow.anchor.set(.5)
    view.glow.setSize(CELL_WIDTH + 6, CELL_HEIGHT + 4)
    view.glow.position.set(CELL_WIDTH / 2, CELL_HEIGHT / 2 - 2)
    view.glow.blendMode = 'add'
    view.glow.visible = false
    view.frame = new Sprite(outline)
    view.frame.anchor.set(.5)
    view.frame.setSize(CELL_WIDTH + 14, CELL_HEIGHT + 12)
    view.frame.position.set(CELL_WIDTH / 2, CELL_HEIGHT / 2 - 2)
    view.frame.blendMode = 'add'
    view.frame.visible = false
    // 胡 aura from the reference sheet: rotating light rays and a blurred orange 胡 flame behind the glyph.
    const [flame, rays] = skin().frames.hufx
    view.aura = new Container()
    view.aura.position.set(CELL_WIDTH / 2, CELL_HEIGHT / 2 - 2)
    view.rays = new Sprite(rays)
    view.rays.anchor.set(.5)
    view.rays.blendMode = 'add'
    view.rays.setSize(CELL_WIDTH * 1.5, CELL_WIDTH * 1.5)
    view.flame = new Sprite(flame)
    view.flame.anchor.set(.5)
    view.flame.blendMode = 'add'
    view.flame.setSize(CELL_WIDTH * 1.25, CELL_HEIGHT * 1.2)
    view.aura.addChild(view.rays, view.flame)
    view.aura.visible = false
    view.addChild(view.tile, view.aura, view.ingot, view.glyph, view.glow, view.frame)
    return view
  }

  private baseX(col: number) { return GRID_X + col * PITCH_X }
  private slotY(slot: number) { return GRID_Y + (slot - 1) * PITCH_Y }
  private rowY(row: number) { return this.slotY(row + 1) }

  /** Positions a tile by its top-left corner, keeping scale centred on the tile. */
  private place(col: number, slot: number, y: number, scaleX = 1, scaleY = scaleX) {
    const view = this.views[col][slot]
    view.scale.set(scaleX, scaleY)
    view.position.set(this.baseX(col) + CELL_WIDTH * (1 - scaleX) / 2, y + CELL_HEIGHT * (1 - scaleY) / 2)
    view.zIndex = y
  }

  private paint(col: number, slot: number) {
    const state = this.states[col][slot]
    const view = this.views[col][slot]
    const textures = skin()
    view.alpha = 1
    view.tint = 0xffffff
    view.frame.visible = false
    view.glow.visible = false
    view.glyph.visible = true
    view.tile.texture = state.gold ? textures.tile_gold : textures.tile_white
    view.tile.scale.set(ART_SCALE)
    // WILD and the 胡 scatter sit directly on the felt, without a white tile.
    view.tile.visible = state.symbol !== 'wild' && state.symbol !== 'scatter'
    view.ingot.visible = state.symbol === 'wild'
    view.aura.visible = state.symbol === 'scatter'
    if (state.symbol === 'wild') {
      view.glyph.texture = textures.text_wild
      this.fitGlyph(view.glyph, 74, 38, 26)
      return
    }
    view.glyph.texture = textures[GLYPHS[state.symbol]]
    if (state.symbol === 'scatter') this.fitGlyph(view.glyph, 86, 96, CELL_HEIGHT / 2 - 2)
    else this.fitGlyph(view.glyph, 52, state.gold ? 58 : 64, state.gold ? 40 : 42)
  }

  private fitGlyph(glyph: Sprite, maxWidth: number, maxHeight: number, centerY: number) {
    const { width, height } = glyph.texture
    glyph.scale.set(Math.min(maxWidth / width, maxHeight / height))
    glyph.position.set(CELL_WIDTH / 2, centerY)
  }

  private rowState(row: number, col: number) { return this.states[col][row + 1] }

  // ---------------------------------------------------------------- spin

  spin(callbacks: ReelSpinCallbacks) {
    if (this.running) return
    this.running = true
    this.quickStopRequested = false
    const outcome = this.makeOutcome(false)
    const stopTimes = callbacks.turbo ? [430, 430, 430, 430, 430] : [780, 870, 960, 1050, 1140]
    // Reference near miss: once two 胡 have landed, every later reel becomes a slow near-miss
    // reel in turn, each spinning NEAR_MISS_MS after the previous reel stops.
    let firstNearMiss = -1
    if (!callbacks.turbo) {
      let landed = 0
      for (let col = 0; col < REEL_COLUMNS - 1 && firstNearMiss < 0; col++) {
        landed += outcome.filter((row) => row[col].symbol === 'scatter').length
        if (landed >= 2) firstNearMiss = col + 1
      }
      if (firstNearMiss > 0) {
        for (let col = firstNearMiss; col < REEL_COLUMNS; col++) stopTimes[col] = stopTimes[col - 1] + NEAR_MISS_MS
      }
    }
    let nearMissCol = -1
    const phases = Array.from({ length: REEL_COLUMNS }, () => 0) // 0 spinning, 1 settling, 2 stopped
    const settleStarts = Array.from({ length: REEL_COLUMNS }, () => 0)
    const offsets = Array.from({ length: REEL_COLUMNS }, () => 0)
    const lastY = this.views.map((column) => column.map((view) => view.y))
    const start = performance.now()
    let lastFrame = start

    this.blurs.forEach((blur) => { blur.enabled = true; blur.strengthY = 9 })
    const settleColumn = (col: number) => {
      if (phases[col] !== 0) return
      phases[col] = 1
      this.blurs[col].enabled = false
      settleStarts[col] = performance.now()
      this.states[col][0] = this.pendingPeeks?.above[col] ?? this.strips.blur(col)
      this.states[col][SLOTS - 1] = this.pendingPeeks?.below[col] ?? this.strips.blur(col)
      for (let row = 0; row < REEL_ROWS; row++) this.states[col][row + 1] = outcome[row][col]
      for (let slot = 0; slot < SLOTS; slot++) this.paint(col, slot)
    }

    const animate = () => {
      const now = performance.now()
      const elapsed = now - start
      const delta = Math.min(34, now - lastFrame)
      lastFrame = now
      const forceStop = this.quickStopRequested
      for (let col = 0; col < REEL_COLUMNS; col++) {
        if (phases[col] === 0 && (forceStop || elapsed >= stopTimes[col])) settleColumn(col)
        if (phases[col] === 0) {
          const acceleration = Math.min(1, elapsed / (callbacks.turbo ? 70 : 150))
          const remaining = stopTimes[col] - elapsed
          const braking = remaining < 220 ? .32 + .68 * Math.max(0, remaining / 220) : 1
          const speed = col === nearMissCol ? NEAR_MISS_SPEED : callbacks.turbo ? 2.45 : 1.72
          offsets[col] += delta * speed * acceleration * braking
          for (let slot = 0; slot < SLOTS; slot++) {
            const y = STRIP_TOP + (this.slotY(slot) - STRIP_TOP + offsets[col]) % STRIP_HEIGHT
            // A tile that wrapped back to the top re-enters as a fresh random symbol.
            if (y < lastY[col][slot]) {
              this.states[col][slot] = this.strips.blur(col)
              this.paint(col, slot)
            }
            lastY[col][slot] = y
            this.place(col, slot, y)
          }
        } else if (phases[col] === 1) {
          const progress = Math.min(1, (now - settleStarts[col]) / (callbacks.turbo ? 90 : 150))
          const drop = 16 * (1 - easeOutBack(progress, 1.6))
          for (let slot = 0; slot < SLOTS; slot++) this.place(col, slot, this.slotY(slot) - drop)
          if (progress >= 1) {
            phases[col] = 2
            for (let slot = 0; slot < SLOTS; slot++) this.place(col, slot, this.slotY(slot))
            callbacks.sound('reelStop', col)
            this.celebrateScatters(col, callbacks)
            const next = col + 1
            if (!forceStop && firstNearMiss > 0 && next >= firstNearMiss && next < REEL_COLUMNS) {
              if (nearMissCol < 0) callbacks.anticipation(true)
              nearMissCol = next
              this.showNearMiss(next)
              callbacks.sound('nearMiss', next)
            }
          }
        }
      }
      if (!phases.every((phase) => phase === 2)) return requestAnimationFrame(animate)
      const hadNearMiss = nearMissCol >= 0
      if (hadNearMiss) callbacks.anticipation(false)
      callbacks.settle()
      // After a near miss the darkness lifts over ~0.3 s before the board is evaluated.
      void this.hideNearMiss(hadNearMiss ? 300 : 0).then(() => this.runTumbles(callbacks))
    }
    requestAnimationFrame(animate)
  }

  private makeOutcome(forceBonus: boolean): CellState[][] {
    const { grid: result, above, below } = this.strips.stop(REEL_ROWS)
    this.pendingPeeks = { above, below }
    if (forceBonus) [0, 2, 4].forEach((col, index) => { result[[0, 3, 1][index]][col] = { symbol: 'scatter', gold: false } })
    return result
  }

  private countScatters(grid?: CellState[][], columns = REEL_COLUMNS) {
    let count = 0
    for (let row = 0; row < REEL_ROWS; row++) for (let col = 0; col < columns; col++) {
      const state = grid ? grid[row][col] : this.rowState(row, col)
      if (state.symbol === 'scatter') count++
    }
    return count
  }

  /** A landed 胡 pops with an orange flare and its own sound cue. */
  private celebrateScatters(col: number, callbacks: ReelSpinCallbacks) {
    for (let row = 0; row < REEL_ROWS; row++) {
      if (this.rowState(row, col).symbol !== 'scatter') continue
      callbacks.sound('scatter', col)
      const slot = row + 1
      const x = this.baseX(col) + CELL_WIDTH / 2
      const y = this.rowY(row) + CELL_HEIGHT / 2
      const flare = new Sprite(skin().frames.hl[2])
      flare.anchor.set(.5)
      flare.tint = 0xff7a1a
      flare.blendMode = 'add'
      flare.position.set(x, y)
      this.fxLayer.addChild(flare)
      this.playBurst(x, y, 130, 0xffa640)
      this.tween(callbacks.turbo ? 260 : 520, (t) => {
        flare.setSize(120 + t * 60, 70 + t * 40)
        flare.alpha = 1 - t
        const pop = 1 + Math.sin(t * Math.PI) * .22
        this.place(col, slot, this.slotY(slot), pop)
      }).then(() => flare.destroy())
    }
  }

  /** Near-miss reel overlay from the reference sheet: thin gold frame, light column, edge glows, gold dust. */
  private buildNearMiss() {
    const [frame, column, edge] = skin().frames.nearmiss
    const light = new Sprite(column)
    light.anchor.set(.5)
    light.blendMode = 'add'
    light.alpha = .28
    light.setSize(CELL_WIDTH * 1.2, BOARD_HEIGHT)
    light.position.set(CELL_WIDTH / 2, BOARD_HEIGHT / 2)
    const border = new Sprite(frame)
    border.anchor.set(.5)
    border.blendMode = 'add'
    border.setSize(CELL_WIDTH + 12, BOARD_HEIGHT + 30)
    border.position.set(CELL_WIDTH / 2, BOARD_HEIGHT / 2)
    const edges = [-4, CELL_WIDTH + 4].map((x) => {
      const glow = new Sprite(edge)
      glow.anchor.set(.5)
      glow.blendMode = 'add'
      glow.setSize(22, BOARD_HEIGHT + 20)
      glow.position.set(x, BOARD_HEIGHT / 2)
      return glow
    })
    this.nearMissLayer.addChild(light, border, ...edges)
    const dust: Sprite[] = []
    for (let index = 0; index < 14; index++) {
      const mote = new Sprite(skin().star)
      mote.anchor.set(.5)
      mote.blendMode = 'add'
      mote.tint = 0xffc437
      mote.position.set(Math.random() * CELL_WIDTH, Math.random() * BOARD_HEIGHT)
      dust.push(mote)
      this.nearMissLayer.addChild(mote)
    }
    const tick = (now: number) => {
      if (this.nearMissLayer.visible) {
        const pulse = .8 + Math.sin(now / 140) * .2
        border.alpha = pulse
        edges.forEach((glow) => { glow.alpha = pulse })
        light.alpha = .22 + Math.sin(now / 260) * .08
        dust.forEach((mote, index) => {
          mote.y += .55 + (index % 3) * .25
          if (mote.y > BOARD_HEIGHT) { mote.y = -10; mote.x = Math.random() * CELL_WIDTH }
          mote.scale.set(.06 + .05 * Math.abs(Math.sin(now / 200 + index)))
        })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /** Stopped reels go dark (胡 stay lit); the near-miss reel is framed and spins slowly. */
  private showNearMiss(activeColumn: number) {
    this.nearMissLayer.x = this.baseX(activeColumn)
    this.nearMissLayer.visible = true
    this.blurs[activeColumn].strengthY = 3
    for (let col = 0; col < activeColumn; col++) for (let slot = 0; slot < SLOTS; slot++) {
      this.views[col][slot].tint = this.states[col][slot].symbol === 'scatter' ? 0xffffff : DIM_TINT
    }
  }

  private async hideNearMiss(fadeMs: number) {
    this.nearMissLayer.visible = false
    const dimmed = this.views.flat().filter((view) => view.tint !== 0xffffff)
    if (fadeMs > 0 && dimmed.length) {
      const from = DIM_TINT & 0xff
      await this.tween(fadeMs, (t) => {
        const level = Math.round(from + (255 - from) * t)
        const tint = (level << 16) | (level << 8) | level
        dimmed.forEach((view) => { view.tint = tint })
      })
    }
    for (const column of this.views) for (const view of column) view.tint = 0xffffff
  }

  // ---------------------------------------------------------------- evaluation

  private evaluateWays(): WinResult {
    let payout = 0
    const wins = new Set<string>()
    for (const target of PAYING_SYMBOLS) {
      const columns: number[][] = []
      for (let col = 0; col < REEL_COLUMNS; col++) {
        const rows: number[] = []
        for (let row = 0; row < REEL_ROWS; row++) if ([target, 'wild'].includes(this.rowState(row, col).symbol)) rows.push(row)
        if (!rows.length) break
        columns.push(rows)
      }
      if (columns.length >= 3) {
        const reelCount = Math.min(5, columns.length) as 3 | 4 | 5
        const ways = columns.reduce((total, rows) => total * rows.length, 1)
        payout += ways * SYMBOL_PAYS[target][reelCount] / 20
        columns.forEach((rows, col) => rows.forEach((row) => wins.add(`${row}:${col}`)))
      }
    }
    return { payout, wins }
  }

  // ---------------------------------------------------------------- cascade

  /**
   * Reference sequence per round: board darkens and winners light up column by
   * column with a gold frame → darkness lifts → winners flip away spraying gold
   * coins while winning gold tiles become WILD ingots → the rail advances →
   * survivors fall and new tiles drop in from above.
   */
  private async runTumbles(callbacks: ReelSpinCallbacks) {
    let total = 0
    let tumble = 0
    const turbo = callbacks.turbo
    while (true) {
      const result = this.evaluateWays()
      if (!result.wins.size) break
      const multiplier = multiplierForTumble(tumble, callbacks.freeMode)
      total += result.payout * multiplier
      callbacks.tumble(tumble + 1, multiplier, result.payout * multiplier)

      await this.highlightWinners(result.wins, callbacks)
      const converted = await this.clearWinners(result.wins, callbacks)
      await this.pause(turbo ? 100 : 820)
      callbacks.advance(multiplierForTumble(tumble + 1, callbacks.freeMode))
      await this.pause(turbo ? 40 : 150)
      await this.refill(result.wins, converted, callbacks)
      await this.pause(turbo ? 40 : 160)

      tumble++
      if (tumble >= 100) {
        console.warn('Cascade safety guard reached; stopping a likely malformed outcome.')
        break
      }
    }
    this.running = false
    callbacks.complete(total, this.countScatters())
  }

  private highlightWinners(wins: Set<string>, callbacks: ReelSpinCallbacks) {
    const stagger = callbacks.turbo ? 45 : 110
    const hold = callbacks.turbo ? 380 : 900
    const lastCol = Math.max(...[...wins].map((key) => Number(key.split(':')[1])))
    const duration = lastCol * stagger + hold
    const lit = new Set<number>()
    this.dim.visible = true
    return this.tween(duration, (_t, elapsed) => {
      this.dim.alpha = Math.max(.01, .55 * Math.min(1, elapsed / 120) * Math.min(1, (duration - elapsed) / 140))
      for (const key of wins) {
        const [row, col] = key.split(':').map(Number)
        const since = elapsed - col * stagger
        if (since < 0) continue
        if (!lit.has(col)) {
          lit.add(col)
          callbacks.sound('highlight', col)
        }
        const view = this.views[col][row + 1]
        // The highlight stays in place: only the gold outline and face glow pulse.
        const fadeIn = Math.min(1, since / 80)
        view.frame.visible = true
        view.frame.alpha = (.8 + Math.sin(since / 90) * .2) * fadeIn
        view.glow.visible = view.tile.visible
        view.glow.alpha = (.35 + Math.sin(since / 90) * .12) * fadeIn
        // Lift highlighted tiles above the dim overlay.
        if (view.parent !== this.reelLayer) this.reelLayer.addChild(view)
      }
    }).then(() => {
      this.dim.visible = false
      for (const column of this.views) for (const view of column) {
        view.tint = 0xffffff
        view.frame.visible = false
        view.glow.visible = false
      }
      this.restoreLayering()
    })
  }

  private restoreLayering() {
    this.views.forEach((column, col) => column.forEach((view) => {
      if (view.parent !== this.columns[col]) this.columns[col].addChild(view)
    }))
  }

  /** Returns the keys of winning gold tiles that turned into WILD (they stay on the board). */
  private async clearWinners(wins: Set<string>, callbacks: ReelSpinCallbacks) {
    const duration = callbacks.turbo ? 260 : 540
    const winners = [...wins].map((key) => key.split(':').map(Number) as [number, number])
    const converted = new Set(winners.filter(([row, col]) => this.rowState(row, col).gold).map(([row, col]) => `${row}:${col}`))
    callbacks.sound('flip')
    if (converted.size) callbacks.sound('wild')
    const turnFrames = skin().frames.turn
    let lastFrame = -1
    let burstFired = false
    await this.tween(duration, (t) => {
      // Turn animation from the reference sheet: face-on → teal side, one frame per step.
      const frame = Math.min(turnFrames.length - 1, Math.floor(t / .6 * turnFrames.length))
      const frameChanged = frame !== lastFrame
      lastFrame = frame
      const fireBurst = !burstFired && t >= .5
      if (fireBurst) burstFired = true
      for (const [row, col] of winners) {
        const slot = row + 1
        const view = this.views[col][slot]
        const cx = this.baseX(col) + CELL_WIDTH / 2
        const cy = this.rowY(row) + CELL_HEIGHT / 2
        if (converted.has(`${row}:${col}`)) {
          // Gold tiles flip once and land face-up as a WILD ingot.
          if (fireBurst) {
            this.states[col][slot] = { symbol: 'wild', gold: false }
            this.paint(col, slot)
            this.playBurst(cx, cy, 150)
          }
          this.place(col, slot, this.rowY(row), Math.max(.02, Math.abs(Math.cos(t * Math.PI))))
          continue
        }
        if (frameChanged && t < .6) {
          const texture = turnFrames[frame]
          view.tile.texture = texture
          view.tile.scale.set(ART_SCALE)
          // Keep the face glyph on the shrinking front face for the first frames, then hide it.
          view.glyph.visible = frame < 3
          view.glyph.scale.x = view.glyph.scale.y * (1 - frame * .14)
          view.glyph.x = CELL_WIDTH / 2 + frame * 3
        }
        // Ordinary tiles only spray spinning gold coins (the starburst is reserved for gold → WILD).
        if (fireBurst) this.coinBurst(cx, cy, callbacks.turbo ? 3 : 5)
        view.alpha = t < .6 ? 1 : Math.max(0, 1 - (t - .6) / .25)
      }
    })
    for (const [row, col] of winners) {
      const view = this.views[col][row + 1]
      if (converted.has(`${row}:${col}`)) {
        this.place(col, row + 1, this.rowY(row))
        continue
      }
      view.visible = false
    }
    return converted
  }

  private async refill(wins: Set<string>, converted: Set<string>, callbacks: ReelSpinCallbacks) {
    const starts: number[][] = []
    for (let col = 0; col < REEL_COLUMNS; col++) {
      // Winners are removed unless they just became WILD (former gold tiles stay).
      const survivorSlots: number[] = [0]
      for (let row = 0; row < REEL_ROWS; row++) {
        const key = `${row}:${col}`
        if (!wins.has(key) || converted.has(key)) survivorSlots.push(row + 1)
      }
      const removed = REEL_ROWS + 1 - survivorSlots.length
      // The strip tile nearest the board is drawn first and lands lowest.
      const incoming = Array.from({ length: removed }, () => this.strips.next(col)).reverse()
      // Slots 0..4 refill as [new…, survivors (incl. the old top peek)…]; slot 5 stays.
      const next = [...incoming, ...survivorSlots.map((slot) => this.states[col][slot])]
      starts[col] = []
      for (let slot = 0; slot <= REEL_ROWS; slot++) {
        this.states[col][slot] = next[slot]
        this.paint(col, slot)
        this.views[col][slot].visible = true
        const from = slot < removed ? this.slotY(slot) - removed * PITCH_Y : this.slotY(survivorSlots[slot - removed])
        starts[col][slot] = from
        this.place(col, slot, from)
      }
      starts[col][SLOTS - 1] = this.slotY(SLOTS - 1)
    }
    // Reference timing: columns with gaps fall one after another from right to left,
    // ~120 ms apart; each falls with gravity in ~220 ms and settles with a small bounce.
    const falling = starts.map((column, col) => column.some((from, slot) => from !== this.slotY(slot)) ? col : -1)
      .filter((col) => col >= 0)
      .reverse()
    const order = new Map(falling.map((col, index) => [col, index]))
    if (falling.length) callbacks.sound('dropStart')
    const fall = callbacks.turbo ? 120 : 220
    const bounce = callbacks.turbo ? 40 : 80
    const stagger = callbacks.turbo ? 30 : 120
    const landed = new Set<number>()
    await this.tween(fall + bounce + stagger * Math.max(0, falling.length - 1), (_t, elapsed) => {
      for (let col = 0; col < REEL_COLUMNS; col++) {
        const index = order.get(col)
        if (index === undefined) continue
        const local = elapsed - index * stagger
        if (local <= 0) continue
        let offset: number
        if (local < fall) {
          offset = 1 - Math.pow(local / fall, 2)
        } else {
          if (!landed.has(col)) {
            landed.add(col)
            callbacks.sound('drop', col)
          }
          offset = -Math.sin(Math.min(1, (local - fall) / bounce) * Math.PI) * .035
        }
        for (let slot = 0; slot < SLOTS; slot++) {
          const target = this.slotY(slot)
          this.place(col, slot, target + (starts[col][slot] - target) * Math.max(0, offset) + (offset < 0 ? offset * PITCH_Y : 0))
        }
      }
    })
    for (let col = 0; col < REEL_COLUMNS; col++) for (let slot = 0; slot < SLOTS; slot++) this.place(col, slot, this.slotY(slot))
  }

  // ---------------------------------------------------------------- effects

  /** Keeps every visible 胡 aura alive: rays turn slowly, the flame flickers. */
  private animateAuras() {
    const tick = (now: number) => {
      for (const column of this.views) for (const view of column) {
        if (!view.aura.visible) continue
        view.rays.rotation = now / 2600
        view.rays.alpha = .55 + Math.sin(now / 420) * .2
        view.flame.alpha = .75 + Math.sin(now / 160) * .12 + Math.sin(now / 67) * .08
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }


  /** Spinning gold coins (reference coin-spin frames) thrown out of a cleared tile. */
  private coinBurst(x: number, y: number, count: number) {
    const frames = skin().frames.coinspin
    for (let index = 0; index < count; index++) {
      const coin = new AnimatedSprite(frames)
      coin.anchor.set(.5)
      coin.scale.set((20 + Math.random() * 8) / frames[0].width)
      coin.animationSpeed = .35 + Math.random() * .2
      coin.gotoAndPlay(Math.floor(Math.random() * frames.length))
      coin.position.set(x, y)
      const vx = (Math.random() - .5) * 5
      let vy = -4 - Math.random() * 4
      this.fxLayer.addChild(coin)
      void this.tween(900, (t) => {
        vy += .38
        coin.x += vx
        coin.y += vy
        coin.alpha = t < .7 ? 1 : 1 - (t - .7) / .3
      }).then(() => coin.destroy())
    }
  }

  /** One-shot gold starburst from the reference effect sheet. */
  private playBurst(x: number, y: number, size: number, tint = 0xffffff) {
    const frames = skin().frames.burst
    const burst = new AnimatedSprite(frames)
    burst.anchor.set(.5)
    burst.scale.set(size / frames[1].width)
    burst.tint = tint
    burst.position.set(x, y)
    burst.loop = false
    burst.animationSpeed = .45
    burst.onComplete = () => burst.destroy()
    this.fxLayer.addChild(burst)
    burst.play()
  }

  private tween(duration: number, update: (t: number, elapsed: number) => void) {
    const start = performance.now()
    return new Promise<void>((resolve) => {
      const frame = () => {
        const elapsed = Math.min(duration, performance.now() - start)
        update(duration > 0 ? elapsed / duration : 1, elapsed)
        if (elapsed < duration) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  }

  private pause(duration: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, duration))
  }
}
