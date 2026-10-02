import { AnimatedSprite, BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js'
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
const NEAR_MISS_SPEED = .3

type TileView = Container & {
  tile: Sprite; aura: Container; halo: Sprite; rays: Sprite; flame: Sprite; medal: Sprite; glyph: Sprite; ingot: Sprite
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
    const nearMissMask = new Graphics().rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill('#fff')
    const fxMask = new Graphics().rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill('#fff')
    this.nearMissLayer.mask = nearMissMask
    this.fxLayer.mask = fxMask
    this.addChild(this.nearMissLayer, this.fxLayer, nearMissMask, fxMask)
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
    const [flame, rays, , medal] = skin().frames.hufx
    view.aura = new Container()
    view.aura.position.set(CELL_WIDTH / 2, CELL_HEIGHT / 2 - 2)
    view.rays = new Sprite(rays)
    view.rays.anchor.set(.5)
    view.rays.blendMode = 'add'
    view.rays.setSize(CELL_WIDTH * 1.2, CELL_WIDTH * 1.2)
    view.flame = new Sprite(flame)
    view.flame.anchor.set(.5)
    view.flame.blendMode = 'add'
    view.flame.setSize(CELL_WIDTH * 1.12, CELL_HEIGHT * 1.08)
    // Bright orange-white halo behind the 胡 (the reference 胡 glows much brighter than its tile row).
    view.halo = new Sprite(softGlowTexture())
    view.halo.anchor.set(.5)
    view.halo.blendMode = 'add'
    view.halo.tint = 0xffc23a
    view.halo.setSize(CELL_WIDTH * 1.2, CELL_HEIGHT * 1.15)
    // Glowing round longevity medallion under the 胡 (original sheet; PDF 2.5 image 1).
    view.medal = new Sprite(medal)
    view.medal.anchor.set(.5)
    // Gold-yellow recoloured medallion (hufx_3); normal blend keeps the pattern readable.
    view.medal.setSize(CELL_WIDTH, CELL_HEIGHT)
    view.medal.y = 2
    // Additive copy on top makes the pattern glow gold instead of reading as a pale disc.
    const shine = new Sprite(medal)
    shine.anchor.set(.5)
    shine.blendMode = 'add'
    shine.alpha = .5
    view.medal.addChild(shine)
    // The rotating starburst read as a big flashing particle on a settled 胡: kept off.
    view.rays.visible = false
    view.aura.addChild(view.halo, view.rays, view.flame, view.medal)
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
    if (state.symbol === 'scatter') this.fitGlyph(view.glyph, 80, 90, CELL_HEIGHT / 2 - 1)
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
    const landingStarts = Array.from({ length: REEL_COLUMNS }, () => Array.from({ length: SLOTS }, () => 0))
    const lastY = this.views.map((column) => column.map((view) => view.y))
    const start = performance.now()
    let lastFrame = start

    this.blurs.forEach((blur) => { blur.enabled = true; blur.strengthY = 9 })
    const settleColumn = (col: number) => {
      if (phases[col] !== 0) return
      phases[col] = 1
      settleStarts[col] = performance.now()
      this.states[col][0] = this.pendingPeeks?.above[col] ?? this.strips.blur(col)
      this.states[col][SLOTS - 1] = this.pendingPeeks?.below[col] ?? this.strips.blur(col)
      for (let row = 0; row < REEL_ROWS; row++) this.states[col][row + 1] = outcome[row][col]
      for (let slot = 0; slot < SLOTS; slot++) {
        this.paint(col, slot)
        // Stage every official tile exactly one cell before its final position. It remains
        // motion-blurred while entering, so the result never appears as an in-place swap.
        landingStarts[col][slot] = this.slotY(slot) - PITCH_Y
        this.place(col, slot, landingStarts[col][slot])
      }
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
          const travel = easeOutBack(progress, 1.15)
          this.blurs[col].strengthY = 9 * Math.max(0, 1 - progress / .82)
          if (progress >= .82) this.blurs[col].enabled = false
          for (let slot = 0; slot < SLOTS; slot++) {
            const target = this.slotY(slot)
            this.place(col, slot, landingStarts[col][slot] + (target - landingStarts[col][slot]) * travel)
          }
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
      void this.huEntrance(col, row + 1, callbacks.turbo)
    }
  }

  /**
   * 胡 entrance (Normal games and win.mp4, 23.4–24.1 s): the board darkens, the 胡 dips small
   * then swells past full size inside a burst of flame light, a one-off spray of gold sparks
   * shoots up and out, then everything settles and the board brightens again.
   */
  private async huEntrance(col: number, slot: number, turbo: boolean) {
    const view = this.views[col][slot]
    const x = this.baseX(col) + CELL_WIDTH / 2
    const y = this.slotY(slot) + CELL_HEIGHT / 2
    const duration = turbo ? 320 : 680
    this.dim.visible = true
    this.reelLayer.addChild(view)
    const flame = new Sprite(skin().frames.hufx[0])
    flame.anchor.set(.5)
    flame.blendMode = 'add'
    flame.position.set(x, y)
    this.fxLayer.addChild(flame)
    this.sparkSpray(x, y, turbo ? 10 : 20)
    await this.tween(duration, (t) => {
      // Board darkness in and out.
      this.dim.alpha = Math.max(.01, .6 * Math.sin(Math.min(1, t) * Math.PI))
      // Scale: dip to .82, swell to 1.22, settle at 1.
      const scale = t < .18 ? 1 - .18 * (t / .18)
        : t < .45 ? .82 + .4 * ((t - .18) / .27)
          : 1.22 - .22 * ((t - .45) / .55)
      this.place(col, slot, this.slotY(slot), scale)
      // Flame light flares with the swell, then fades.
      const flare = t < .18 ? 0 : Math.max(0, 1 - (t - .18) / .82)
      flame.setSize(CELL_WIDTH * (1.1 + .3 * (1 - flare)), CELL_HEIGHT * (1.1 + .25 * (1 - flare)))
      flame.alpha = flare
    })
    flame.destroy()
    this.place(col, slot, this.slotY(slot))
    this.dim.visible = false
    // A near miss may have started meanwhile; it keeps landed 胡 lifted above the board.
    if (!this.nearMissLayer.visible) this.restoreLayering()
  }

  /**
   * One-off spray of gold sparks bursting toward the camera from a landing 胡: they fly out
   * radially a short way and grow as they come closer, then fade (no gravity).
   */
  private sparkSpray(x: number, y: number, count: number) {
    for (let index = 0; index < count; index++) {
      const spark = new Sprite(skin().star)
      spark.anchor.set(.5)
      spark.blendMode = 'add'
      spark.tint = index % 3 ? 0xffd34a : 0xffffff
      spark.rotation = Math.random() * Math.PI
      const angle = Math.random() * Math.PI * 2
      const reach = 16 + Math.random() * 30
      const size = .1 + Math.random() * .12
      const spin = (Math.random() - .5) * .08
      this.fxLayer.addChild(spark)
      void this.tween(420 + Math.random() * 260, (t) => {
        const r = reach * (1 - Math.pow(1 - t, 2))
        spark.position.set(x + Math.cos(angle) * r, y + Math.sin(angle) * r * .9)
        spark.scale.set(.015 + size * t)
        spark.rotation += spin
        spark.alpha = t < .25 ? 1 : 1 - (t - .25) / .75
      }).then(() => spark.destroy())
    }
  }

  /** Idle gold mote rising slowly beside a settled 胡 (different direction from the landing spray). */
  private idleMote(view: TileView) {
    if (!view.visible || !view.parent) return
    const origin = view.getGlobalPosition()
    const local = this.fxLayer.toLocal(origin)
    const mote = new Sprite(skin().star)
    mote.anchor.set(.5)
    mote.blendMode = 'add'
    mote.tint = 0xffd34a
    mote.position.set(local.x + 10 + Math.random() * (CELL_WIDTH - 20), local.y + CELL_HEIGHT * (.4 + Math.random() * .5))
    const drift = (Math.random() - .5) * .3
    const size = .05 + Math.random() * .06
    this.fxLayer.addChild(mote)
    void this.tween(900 + Math.random() * 500, (t) => {
      mote.x += drift
      mote.y -= .45
      mote.scale.set(size * Math.sin(t * Math.PI))
      mote.alpha = Math.sin(t * Math.PI)
    }).then(() => mote.destroy())
  }

  /**
   * Near-miss reel (reference near miss01.mp4): a broad yellow light column runs the full reel
   * height on the left boundary (warm orange spill over the neighbouring reel), a thinner one on
   * the right, gold glitter twinkles inside them, and faint white speed lines race down the reel.
   */
  private buildNearMiss() {
    const strip = (stops: [number, string][]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 4
      const context = canvas.getContext('2d')!
      const gradient = context.createLinearGradient(0, 0, 64, 0)
      for (const [at, color] of stops) gradient.addColorStop(at, color)
      context.fillStyle = gradient
      context.fillRect(0, 0, 64, 4)
      return Texture.from(canvas)
    }
    const glowTexture = strip([[0, 'rgba(255,170,40,0)'], [.25, 'rgba(255,200,60,.75)'], [.5, 'rgba(255,250,210,1)'], [.75, 'rgba(255,200,60,.75)'], [1, 'rgba(255,170,40,0)']])
    const spillTexture = strip([[0, 'rgba(255,90,20,0)'], [.75, 'rgba(255,130,30,.8)'], [1, 'rgba(255,160,40,.2)']])
    const gap = PITCH_X - CELL_WIDTH
    const makeColumn = (x: number, width: number, spill: boolean) => {
      const column = new Container()
      column.x = x
      if (spill) {
        const warm = new Sprite(spillTexture)
        warm.blendMode = 'add'
        warm.setSize(CELL_WIDTH * .45, BOARD_HEIGHT)
        warm.x = -CELL_WIDTH * .45 + 4
        column.addChild(warm)
      }
      const glow = new Sprite(glowTexture)
      glow.blendMode = 'add'
      glow.anchor.set(.5, 0)
      glow.setSize(width, BOARD_HEIGHT)
      const core = new Sprite(glowTexture)
      core.blendMode = 'add'
      core.anchor.set(.5, 0)
      core.setSize(width * .45, BOARD_HEIGHT)
      column.addChild(glow, core)
      this.nearMissLayer.addChild(column)
      return { column, width }
    }
    const columns = [makeColumn(-gap / 2, 36, true), makeColumn(CELL_WIDTH + gap / 2, 16, false)]
    // Faint white speed lines over the reel face, gold glitter inside the light columns.
    const moteLayer = new Container()
    this.nearMissLayer.addChild(moteLayer)
    type Mote = { sprite: Container; vy: number; life: number; age: number; line: boolean }
    const motes: Mote[] = []
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      if (this.nearMissLayer.visible) {
        columns.forEach(({ column }, index) => {
          column.alpha = .85 + Math.sin(now / 90 + index * 2) * .15
        })
        if (Math.random() < .5) {
          const length = 18 + Math.random() * 50
          const line = new Graphics().rect(0, 0, 1.2, length).fill('#ffffff')
          line.blendMode = 'add'
          line.position.set(4 + Math.random() * (CELL_WIDTH - 8), -length + Math.random() * BOARD_HEIGHT * .6)
          moteLayer.addChild(line)
          motes.push({ sprite: line, vy: 1.4 + Math.random() * .8, life: 260 + Math.random() * 200, age: 0, line: true })
        }
        if (Math.random() < .6) {
          const { column, width } = columns[Math.random() < .7 ? 0 : 1]
          const dot = new Sprite(skin().star)
          dot.anchor.set(.5)
          dot.blendMode = 'add'
          dot.tint = Math.random() < .5 ? 0xffe27a : 0xffffff
          dot.position.set(column.x + (Math.random() - .5) * width * .8, Math.random() * BOARD_HEIGHT)
          moteLayer.addChild(dot)
          motes.push({ sprite: dot, vy: .15 + Math.random() * .2, life: 300 + Math.random() * 300, age: 0, line: false })
        }
      }
      for (let index = motes.length - 1; index >= 0; index--) {
        const mote = motes[index]
        mote.age += dt
        mote.sprite.y += mote.vy * dt
        const t = mote.age / mote.life
        const wave = Math.sin(Math.min(1, t) * Math.PI)
        if (mote.line) mote.sprite.alpha = .35 * wave
        else {
          mote.sprite.alpha = wave
          mote.sprite.scale.set(.05 * wave + .005)
        }
        if (t >= 1 || !this.nearMissLayer.visible) {
          mote.sprite.destroy()
          motes.splice(index, 1)
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
    // Reference: the near-miss reel is not blurred, it just turns slowly enough to read.
    this.blurs[activeColumn].enabled = false
    for (let col = 0; col < activeColumn; col++) for (let slot = 0; slot < SLOTS; slot++) {
      const scatter = this.states[col][slot].symbol === 'scatter'
      this.views[col][slot].tint = scatter ? 0xffffff : DIM_TINT
      if (scatter) {
        // Only the round halo and rays grow; the flame art has a square JPG edge when enlarged.
        const view = this.views[col][slot]
        view.halo.scale.set(view.halo.scale.x * 1.15, view.halo.scale.y * 1.15)
        view.rays.scale.set(view.rays.scale.x * 1.15, view.rays.scale.y * 1.15)
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
      view.halo.scale.set(view.halo.scale.x / 1.15, view.halo.scale.y / 1.15)
      view.rays.scale.set(view.rays.scale.x / 1.15, view.rays.scale.y / 1.15)
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
      // Normal games and win.mp4 1–10 s: once the winners have cleared, the winning gold
      // tiles turn into WILD in place; the WILD then stays and falls with its column.
      await this.pause(turbo ? 60 : 420)
      await this.convertGold(goldStates, callbacks)
      await this.pause(turbo ? 60 : 380)
      // Coins settle on the dark board, then the dim lifts and the rail advances before the drop.
      this.dim.visible = false
      this.restoreLayering()
      callbacks.advance(multiplierForTumble(tumble + 1, callbacks.freeMode))
      await this.pause(turbo ? 40 : 150)
      await this.refill(result.wins, kept, callbacks)
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
    const stagger = callbacks.turbo ? 70 : 170
    const hold = callbacks.turbo ? 380 : 900
    const lastCol = Math.max(...[...wins].map((key) => Number(key.split(':')[1])))
    const duration = lastCol * stagger + hold
    const lit = new Set<number>()
    const cells = [...wins].map((key) => key.split(':').map(Number) as [number, number])
    this.dim.visible = true
    // Winners are lifted above the dim straight away (they stay white); the gold light follows.
    for (const [row, col] of cells) {
      const view = this.views[col][row + 1]
      if (view.parent !== this.reelLayer) this.reelLayer.addChild(view)
    }
    return this.tween(duration, (_t, elapsed) => {
      this.dim.alpha = Math.max(.01, .55 * Math.min(1, elapsed / 120))
      for (const [row, col] of cells) {
        const since = elapsed - col * stagger
        const view = this.views[col][row + 1]
        if (since < 0) {
          view.frame.visible = false
          view.glow.visible = false
          continue
        }
        if (!lit.has(col)) {
          lit.add(col)
          callbacks.sound('highlight', col)
        }
        const fadeIn = Math.min(1, since / 60)
        const flash = Math.max(0, 1 - since / 240)
        view.frame.visible = true
        view.frame.alpha = (.8 + Math.sin(since / 90) * .2) * fadeIn
        view.glow.visible = view.tile.visible
        view.glow.alpha = (.32 + Math.sin(since / 90) * .12 + .5 * flash) * fadeIn
        this.place(col, row + 1, this.rowY(row), 1 + .06 * flash)
      }
    }).then(() => {
      for (const [row, col] of cells) this.place(col, row + 1, this.rowY(row))
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
   * into WILD right after the clear, before the drop (see convertGold).
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
    for (const [row, col] of winners) this.views[col][row + 1].visible = false
    return kept
  }

  /**
   * Every gold tile that was part of the win turns into a WILD ingot (flip + gold burst) on the
   * cleared board, before the survivors and new tiles drop.
   */
  private async convertGold(goldStates: Set<CellState>, callbacks: ReelSpinCallbacks) {
    const targets: [number, number][] = []
    for (let col = 0; col < REEL_COLUMNS; col++) for (let slot = 1; slot <= REEL_ROWS; slot++) {
      if (goldStates.has(this.states[col][slot])) targets.push([col, slot])
    }
    if (!targets.length) return
    callbacks.sound('wild')
    // Normal games and win.mp4 4.0–4.3 s: the WILD fades in where the gold tile was cleared,
    // inside a gold glow — no flip or squash.
    const glows = targets.map(([col, slot]) => {
      this.states[col][slot] = { symbol: 'wild', gold: false }
      this.paint(col, slot)
      const view = this.views[col][slot]
      view.visible = true
      view.alpha = .01
      this.place(col, slot, this.slotY(slot))
      const glow = new Sprite(softGlowTexture())
      glow.anchor.set(.5)
      glow.blendMode = 'add'
      glow.tint = 0xffd34a
      glow.position.set(this.baseX(col) + CELL_WIDTH / 2, this.slotY(slot) + CELL_HEIGHT / 2)
      glow.setSize(CELL_WIDTH * 1.4, CELL_HEIGHT * 1.3)
      this.fxLayer.addChild(glow)
      this.playBurst(glow.x, glow.y, 120)
      return glow
    })
    await this.tween(callbacks.turbo ? 200 : 380, (t) => {
      for (const [col, slot] of targets) this.views[col][slot].alpha = Math.max(.01, t)
      glows.forEach((glow) => { glow.alpha = Math.max(.01, Math.sin(t * Math.PI)) })
    })
    glows.forEach((glow) => glow.destroy())
    for (const [col, slot] of targets) this.views[col][slot].alpha = 1
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
      const survivorScatterCount = survivorSlots
        .map((slot) => this.states[col][slot])
        .filter((cell) => cell.symbol === 'scatter').length
      let scatterSlotsLeft = Math.max(0, 1 - survivorScatterCount)
      const incoming = Array.from({ length: removed }, () => {
        const cell = this.strips.next(col, scatterSlotsLeft > 0)
        if (cell.symbol === 'scatter') scatterSlotsLeft--
        return cell
      }).reverse()
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
        view.rays.alpha = .25 + Math.sin(now / 420) * .08
        view.flame.alpha = .75 + Math.sin(now / 160) * .05
        view.halo.alpha = .5 + Math.sin(now / 300) * .08
        view.medal.alpha = .95 + Math.sin(now / 380) * .05
        // Idle: a few gold motes drift up around every visible 胡 (reference, after landing).
        if (Math.random() < .05) this.idleMote(view)
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
