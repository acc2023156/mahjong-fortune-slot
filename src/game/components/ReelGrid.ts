import { AnimatedSprite, BlurFilter, Container, Graphics, Sprite } from 'pixi.js'
import {
  PAYING_SYMBOLS, REEL_COLUMNS, REEL_ROWS,
  ReelStrips, SYMBOL_PAYS, multiplierForTumble, type CellState, type PayingSymbolId,
} from '../config'
import { dustDotTexture, GLYPHS, skin, softGlowTexture } from '../skin'

export type ReelEvent = 'reelStop' | 'scatter' | 'nearMiss' | 'highlight' | 'flip' | 'wild' | 'dropStart' | 'drop'

export type ReelSpinCallbacks = {
  freeMode: boolean
  turbo: boolean
  settle: () => void
  anticipation: (active: boolean) => void
  /** A winning set is being highlighted, paid at `multiplier`. */
  /** `symbols`: paying symbols in this win, best pay first; `wild`: a WILD took part. */
  tumble: (chain: number, multiplier: number, win: number, symbols: PayingSymbolId[], wild: boolean) => void
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

type TileView = Container & {
  tile: Sprite; aura: Container; halo: Sprite; rays: Sprite; flame: Sprite; glyph: Sprite; ingot: Sprite
  glow: Sprite; frame: Sprite; twinkles: Container
  nearMissBoost?: boolean
}

type WinResult = { payout: number; wins: Set<string>; symbols: PayingSymbolId[]; wild: boolean }

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
  private spinScatterCount = 0

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
    // Bright orange-white halo behind the 胡 (the reference 胡 glows much brighter than its tile row).
    view.halo = new Sprite(softGlowTexture())
    view.halo.anchor.set(.5)
    view.halo.blendMode = 'add'
    view.halo.tint = 0xffb347
    view.halo.setSize(CELL_WIDTH * 1.5, CELL_HEIGHT * 1.4)
    view.aura.addChild(view.halo, view.rays, view.flame)
    view.aura.visible = false
    // WILD: faint white star points twinkling around the lettering and the ingot.
    view.twinkles = new Container()
    const spots = [[10, 14], [70, 18], [16, 56], [66, 60], [40, 84], [58, 36]]
    for (const [x, y] of spots) {
      const star = new Sprite(skin().star)
      star.anchor.set(.5)
      star.blendMode = 'add'
      star.position.set(x, y)
      star.scale.set(0)
      view.twinkles.addChild(star)
    }
    view.twinkles.visible = false
    view.addChild(view.tile, view.aura, view.ingot, view.glyph, view.twinkles, view.glow, view.frame)
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
    view.twinkles.visible = state.symbol === 'wild'
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
    this.strips.setFreeMode(callbacks.freeMode)
    const outcome = this.makeOutcome(false)
    this.spinScatterCount = this.countScatters(outcome)
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
      // Round orange bloom (the rectangular hl glow showed hard square edges here).
      const flare = new Sprite(softGlowTexture())
      flare.anchor.set(.5)
      flare.tint = 0xff8a2a
      flare.blendMode = 'add'
      flare.position.set(x, y)
      this.fxLayer.addChild(flare)
      this.playBurst(x, y, 130, 0xffa640)
      this.tween(callbacks.turbo ? 260 : 520, (t) => {
        flare.setSize(130 + t * 90, 130 + t * 90)
        flare.alpha = 1 - t
        const pop = 1 + Math.sin(t * Math.PI) * .22
        this.place(col, slot, this.slotY(slot), pop)
      }).then(() => flare.destroy())
    }
  }

  /**
   * Near-miss reel (reference near miss01.mp4), all from the original effect sheets:
   * the active reel is washed bright, tall orange light columns with star cores stand on both
   * edges, yellow speed streaks race down the reel, and gold sparks spray left and right
   * from the edges.
   */
  private buildNearMiss() {
    const [frame, streak, edge, starColumn, radial] = skin().frames.nearmiss
    const wash = new Graphics().rect(0, 0, CELL_WIDTH, BOARD_HEIGHT).fill('#fff4c8')
    wash.blendMode = 'add'
    wash.alpha = .08
    // Speed streaks: two stacked copies scroll downward continuously.
    const streaks = [0, 1].map(() => {
      const sprite = new Sprite(streak)
      sprite.anchor.set(.5, 0)
      sprite.blendMode = 'add'
      sprite.setSize(CELL_WIDTH * 1.1, BOARD_HEIGHT)
      sprite.x = CELL_WIDTH / 2
      return sprite
    })
    const radialLines = new Sprite(radial)
    radialLines.anchor.set(.5)
    radialLines.blendMode = 'add'
    radialLines.setSize(CELL_WIDTH, BOARD_HEIGHT)
    radialLines.position.set(CELL_WIDTH / 2, BOARD_HEIGHT / 2)
    const border = new Sprite(frame)
    border.anchor.set(.5)
    border.blendMode = 'add'
    border.setSize(CELL_WIDTH + 12, BOARD_HEIGHT + 30)
    border.position.set(CELL_WIDTH / 2, BOARD_HEIGHT / 2)
    // Edge light columns: the orange flare with a star core plus the thin edge glow.
    const flares = [-2, CELL_WIDTH + 2].map((x) => {
      const column = new Container()
      column.position.set(x, BOARD_HEIGHT / 2)
      const flare = new Sprite(skin().frames.nmflare[0])
      flare.anchor.set(.5)
      flare.blendMode = 'add'
      flare.setSize(40, BOARD_HEIGHT * 1.05)
      const core = new Sprite(starColumn)
      core.anchor.set(.5)
      core.blendMode = 'add'
      core.setSize(30, BOARD_HEIGHT * .9)
      const glow = new Sprite(edge)
      glow.anchor.set(.5)
      glow.blendMode = 'add'
      glow.setSize(22, BOARD_HEIGHT + 20)
      column.addChild(flare, core, glow)
      return column
    })
    this.nearMissLayer.addChild(wash, ...streaks, radialLines, border, ...flares)
    // Gold sparks shoot sideways out of both edge columns.
    const sparks: { sprite: Sprite; vx: number; vy: number; life: number; age: number }[] = []
    const sparkLayer = new Container()
    this.nearMissLayer.addChild(sparkLayer)
    let offset = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      if (this.nearMissLayer.visible) {
        offset = (offset + dt * .9) % BOARD_HEIGHT
        streaks[0].y = offset - BOARD_HEIGHT
        streaks[1].y = offset
        streaks.forEach((sprite) => { sprite.alpha = .22 + Math.sin(now / 90) * .06 })
        radialLines.alpha = .18 + Math.sin(now / 120) * .07
        const pulse = .85 + Math.sin(now / 110) * .15
        border.alpha = pulse
        flares.forEach((column, index) => {
          column.alpha = pulse * .8
          column.scale.x = 1 + Math.sin(now / 75 + index) * .12
        })
        wash.alpha = .07 + Math.sin(now / 200) * .02
        for (let index = 0; index < 2; index++) {
          const fromLeft = Math.random() < .5
          const sprite = new Sprite(skin().star)
          sprite.anchor.set(.5)
          sprite.blendMode = 'add'
          sprite.tint = Math.random() < .5 ? 0xffd34a : 0xff9a2a
          sprite.position.set(fromLeft ? -2 : CELL_WIDTH + 2, Math.random() * BOARD_HEIGHT)
          sparkLayer.addChild(sprite)
          sparks.push({ sprite, vx: (fromLeft ? -1 : 1) * (1.2 + Math.random() * 2.4), vy: (Math.random() - .5) * 1.4, life: 500 + Math.random() * 500, age: 0 })
        }
      }
      for (let index = sparks.length - 1; index >= 0; index--) {
        const spark = sparks[index]
        spark.age += dt
        spark.sprite.x += spark.vx
        spark.sprite.y += spark.vy
        const t = spark.age / spark.life
        spark.sprite.scale.set(.09 * (1 - t) + .02)
        spark.sprite.alpha = 1 - t
        if (t >= 1 || !this.nearMissLayer.visible) {
          spark.sprite.destroy()
          sparks.splice(index, 1)
        }
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /**
   * Stopped reels go dark while every landed 胡 stays lit and glows much larger (reference);
   * the near-miss reel is framed and spins slowly.
   */
  private showNearMiss(activeColumn: number) {
    this.nearMissLayer.x = this.baseX(activeColumn)
    this.nearMissLayer.visible = true
    this.blurs[activeColumn].strengthY = 3
    for (let col = 0; col < activeColumn; col++) for (let slot = 0; slot < SLOTS; slot++) {
      const scatter = this.states[col][slot].symbol === 'scatter'
      this.views[col][slot].tint = scatter ? 0xffffff : DIM_TINT
      if (scatter) {
        // Only the round halo and rays grow; the flame art has a square JPG edge when enlarged.
        const view = this.views[col][slot]
        view.halo.scale.set(view.halo.scale.x * 1.6, view.halo.scale.y * 1.6)
        view.rays.scale.set(view.rays.scale.x * 1.4, view.rays.scale.y * 1.4)
        view.nearMissBoost = true
        this.reelLayer.addChild(this.views[col][slot])
      }
    }
  }

  private async hideNearMiss(fadeMs: number) {
    this.nearMissLayer.visible = false
    for (const column of this.views) for (const view of column) {
      if (!view.nearMissBoost) continue
      view.nearMissBoost = false
      view.halo.scale.set(view.halo.scale.x / 1.6, view.halo.scale.y / 1.6)
      view.rays.scale.set(view.rays.scale.x / 1.4, view.rays.scale.y / 1.4)
    }
    this.restoreLayering()
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
    const symbols: PayingSymbolId[] = []
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
        payout += ways * SYMBOL_PAYS[target][reelCount]
        symbols.push(target)
        columns.forEach((rows, col) => rows.forEach((row) => wins.add(`${row}:${col}`)))
      }
    }
    // PAYING_SYMBOLS is ordered by pay, so symbols[0] is the most valuable winning symbol.
    const wild = [...wins].some((key) => {
      const [row, col] = key.split(':').map(Number)
      return this.rowState(row, col).symbol === 'wild'
    })
    return { payout, wins, symbols, wild }
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
      callbacks.tumble(tumble + 1, multiplier, result.payout * multiplier, result.symbols, result.wild)

      await this.highlightWinners(result.wins, callbacks)
      const kept = await this.clearWinners(result.wins, callbacks)
      // Remember the kept gold tiles by identity: the refill moves them down their column.
      const goldStates = new Set([...kept].map((key) => {
        const [row, col] = key.split(':').map(Number)
        return this.rowState(row, col)
      }))
      await this.pause(turbo ? 100 : 820)
      // Coins settle on the dark board, then the dim lifts and the rail advances before the drop.
      this.dim.visible = false
      this.restoreLayering()
      callbacks.advance(multiplierForTumble(tumble + 1, callbacks.freeMode))
      await this.pause(turbo ? 40 : 150)
      await this.refill(result.wins, kept, callbacks)
      await this.convertGold(goldStates, callbacks)
      await this.pause(turbo ? 40 : 160)

      tumble++
      if (tumble >= 100) {
        console.warn('Cascade safety guard reached; stopping a likely malformed outcome.')
        break
      }
    }
    this.running = false
    callbacks.complete(total, this.spinScatterCount)
  }

  private highlightWinners(wins: Set<string>, callbacks: ReelSpinCallbacks) {
    const stagger = callbacks.turbo ? 45 : 110
    const hold = callbacks.turbo ? 380 : 900
    const lastCol = Math.max(...[...wins].map((key) => Number(key.split(':')[1])))
    const duration = lastCol * stagger + hold
    const lit = new Set<number>()
    this.dim.visible = true
    return this.tween(duration, (_t, elapsed) => {
      this.dim.alpha = Math.max(.01, .55 * Math.min(1, elapsed / 120))
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
      for (const column of this.views) for (const view of column) {
        view.tint = 0xffffff
        view.frame.visible = false
        view.glow.visible = false
      }
    })
  }

  private restoreLayering() {
    this.views.forEach((column, col) => column.forEach((view) => {
      if (view.parent !== this.columns[col]) this.columns[col].addChild(view)
    }))
  }

  /**
   * Winning tiles turn edge-on and burst into gold coins and dust where they stand while the
   * rest of the board stays dimmed (PDF 2.3, image 3). Winning gold tiles are kept: they turn
   * into WILD only after the new tiles have cascaded down (see convertGold).
   * Returns the keys of the kept gold winners.
   */
  private async clearWinners(wins: Set<string>, callbacks: ReelSpinCallbacks) {
    const duration = callbacks.turbo ? 260 : 540
    const winners = [...wins].map((key) => key.split(':').map(Number) as [number, number])
    const kept = new Set(winners.filter(([row, col]) => this.rowState(row, col).gold).map(([row, col]) => `${row}:${col}`))
    callbacks.sound('flip')
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
        if (kept.has(`${row}:${col}`)) continue
        const view = this.views[col][row + 1]
        if (frameChanged && t < .6) {
          view.tile.texture = turnFrames[frame]
          view.tile.scale.set(ART_SCALE)
          // Keep the face glyph on the shrinking front face for the first frames, then hide it.
          view.glyph.visible = frame < 3
          view.glyph.scale.x = view.glyph.scale.y * (1 - frame * .14)
          view.glyph.x = CELL_WIDTH / 2 + frame * 3
        }
        if (fireBurst) this.goldDust(this.baseX(col) + CELL_WIDTH / 2, this.rowY(row) + CELL_HEIGHT / 2, callbacks.turbo)
        view.alpha = t < .6 ? 1 : Math.max(0, 1 - (t - .6) / .25)
      }
    })
    for (const [row, col] of winners) {
      if (!kept.has(`${row}:${col}`)) this.views[col][row + 1].visible = false
    }
    return kept
  }

  /**
   * PDF 2.3: after the new symbols have cascaded down, every gold tile that was part of the
   * previous round's win turns into a WILD ingot (flip + gold burst).
   */
  private async convertGold(goldStates: Set<CellState>, callbacks: ReelSpinCallbacks) {
    const targets: [number, number][] = []
    for (let col = 0; col < REEL_COLUMNS; col++) for (let slot = 1; slot <= REEL_ROWS; slot++) {
      if (goldStates.has(this.states[col][slot])) targets.push([col, slot])
    }
    if (!targets.length) return
    callbacks.sound('wild')
    let swapped = false
    await this.tween(callbacks.turbo ? 220 : 420, (t) => {
      const crossing = !swapped && t >= .5
      if (crossing) swapped = true
      for (const [col, slot] of targets) {
        if (crossing) {
          this.states[col][slot] = { symbol: 'wild', gold: false }
          this.paint(col, slot)
          this.playBurst(this.baseX(col) + CELL_WIDTH / 2, this.slotY(slot) + CELL_HEIGHT / 2, 150)
        }
        this.place(col, slot, this.slotY(slot), Math.max(.02, Math.abs(Math.cos(t * Math.PI))))
      }
    })
    for (const [col, slot] of targets) this.place(col, slot, this.slotY(slot))
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
        if (view.twinkles.visible) {
          view.twinkles.children.forEach((star, index) => {
            // Each point fades in and out on its own phase, small and subtle.
            const phase = Math.sin(now / 380 + index * 1.7)
            star.scale.set(Math.max(0, phase) * .18)
            star.rotation = now / 900 + index
          })
        }
        if (!view.aura.visible) continue
        view.rays.rotation = now / 2600
        view.rays.alpha = .75 + Math.sin(now / 420) * .2
        view.flame.alpha = .95 + Math.sin(now / 160) * .05
        view.halo.alpha = .8 + Math.sin(now / 300) * .2
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }


  /**
   * Cleared tile → a quick glow, then fine gold dust scattered over the emptied felt that
   * twinkles and fades while the board waits for the refill (reference frame, 2026-09-30).
   */
  private goldDust(x: number, y: number, turbo: boolean) {
    const flash = new Sprite(softGlowTexture())
    flash.anchor.set(.5)
    flash.blendMode = 'add'
    flash.tint = 0xffe070
    flash.position.set(x, y)
    this.fxLayer.addChild(flash)
    void this.tween(turbo ? 160 : 300, (t) => {
      flash.setSize(CELL_WIDTH * (1.1 + t * .5), CELL_HEIGHT * (1.1 + t * .4))
      flash.alpha = .9 * (1 - t)
    }).then(() => flash.destroy())
    // PDF 2.3 image 3: a few spinning gold coins pop out of the tile and hover in place.
    const coinFrames = skin().frames.coinspin
    for (let index = 0; index < (turbo ? 2 : 4); index++) {
      const coin = new AnimatedSprite(coinFrames)
      coin.anchor.set(.5)
      coin.scale.set((11 + Math.random() * 7) / coinFrames[0].width)
      coin.animationSpeed = .3 + Math.random() * .15
      coin.gotoAndPlay(Math.floor(Math.random() * coinFrames.length))
      const tx = x + (Math.random() - .5) * CELL_WIDTH * .8
      const ty = y + (Math.random() - .5) * CELL_HEIGHT * .8
      coin.position.set(x, y)
      this.fxLayer.addChild(coin)
      void this.tween((turbo ? 450 : 1000) + Math.random() * 250, (t) => {
        const ease = 1 - Math.pow(1 - Math.min(1, t / .3), 3)
        coin.position.set(x + (tx - x) * ease, y + (ty - y) * ease - t * 6)
        coin.alpha = t < .7 ? 1 : 1 - (t - .7) / .3
      }).then(() => coin.destroy())
    }
    const count = turbo ? 18 : 40
    for (let index = 0; index < count; index++) {
      // Saturated gold dots drawn normally (additive washes out to pale green on the felt).
      const dot = new Sprite(dustDotTexture())
      dot.anchor.set(.5)
      dot.tint = [0xffd21f, 0xffb81a, 0xffe45c][index % 3]
      const size = 3 + Math.random() * 6
      dot.setSize(size, size)
      dot.position.set(x + (Math.random() - .5) * CELL_WIDTH * 1.1, y + (Math.random() - .5) * CELL_HEIGHT * 1.1)
      const vx = (Math.random() - .5) * .35
      const vy = -.1 - Math.random() * .25
      const phase = Math.random() * Math.PI * 2
      const life = (turbo ? 500 : 1100) + Math.random() * 400
      this.fxLayer.addChild(dot)
      void this.tween(life, (t, elapsed) => {
        dot.x += vx
        dot.y += vy
        const twinkle = .65 + .35 * Math.sin(elapsed / 90 + phase)
        dot.alpha = twinkle * (t < .15 ? t / .15 : 1 - (t - .15) / .85)
      }).then(() => dot.destroy())
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
