import { AnimatedSprite, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { BOARD_HEIGHT, ReelGrid } from './components/ReelGrid'
import { SpinControls } from './components/SpinControls'
import { StatusPanel } from './components/StatusPanel'
import { AudioEngine, IDLE_LINES } from './AudioEngine'
import { freeSpinsForScatters, GAME_HEIGHT, GAME_WIDTH } from './config'
import { skin, skinSprite, softGlowTexture, SpriteNumber, whenDeferredReady, type SkinName } from './skin'

const BOARD_Y = 112
const PLAQUE_Y = 535
const BASE_STEPS = [1, 2, 3, 5] as const
const FREE_STEPS = [2, 4, 6, 10] as const
const INACTIVE_TINT = 0x7a3a22
const IDLE_MESSAGES: SkinName[] = ['msg_ways', 'msg_x5', 'msg_gold', 'msg_scatter', 'msg_free_x10']
const FREE_MESSAGES: SkinName[] = ['msg_free_x10', 'msg_scatter', 'msg_gold']

/** The WIN plaque below the reels: scrolling tips when idle, sprite-digit amounts on wins. */
class WinPlaque extends Container {
  private readonly content = new Container()
  private readonly note = new Text({ text: '', style: { fontFamily: 'Arial Black', fontSize: 16, fill: '#ffe36e' } })
  private marquee: Sprite | undefined
  private marqueeIndex = 0
  private messages: SkinName[] = IDLE_MESSAGES
  private countToken = 0
  private readonly fxLayer = new Container()

  private readonly frame = skinSprite('plaque_win', 410)
  private readonly maxFrame = skinSprite('plaque_green', 432)
  private maxed = false

  constructor() {
    super()
    this.maxFrame.visible = false
    this.addChild(this.frame, this.maxFrame)
    const mask = new Graphics().rect(-162, -20, 324, 40).fill('#fff')
    this.content.mask = mask
    this.note.anchor.set(.5)
    this.addChild(this.content, mask, this.fxLayer)
    const tick = () => {
      if (this.marquee) {
        this.marquee.x -= 1.1
        if (this.marquee.x < -162 - this.marquee.width) this.nextMessage()
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /**
   * PDF 2.4: once the multiplier reaches its cap (x5, or x10 in Free Spins) the WIN plaque
   * switches to the jade-capped frame with a pop and a light sweep; reset on the next spin.
   */
  setMaxed(on: boolean) {
    if (on === this.maxed) return
    this.maxed = on
    this.frame.visible = !on
    this.maxFrame.visible = on
    if (!on) return
    const base = this.maxFrame.scale.x
    const sweep = new Sprite(softGlowTexture())
    sweep.anchor.set(.5)
    sweep.blendMode = 'add'
    sweep.tint = 0xfff0a0
    sweep.setSize(90, 60)
    const glow = new Sprite(softGlowTexture())
    glow.anchor.set(.5)
    glow.blendMode = 'add'
    glow.tint = 0x5dffa8
    this.fxLayer.addChild(glow, sweep)
    const start = performance.now()
    const tick = () => {
      if (sweep.destroyed) return
      const t = Math.min(1, (performance.now() - start) / 900)
      this.maxFrame.scale.set(base * (1 + .12 * Math.sin(Math.min(1, t / .35) * Math.PI)))
      sweep.x = -200 + 400 * Math.min(1, t / .8)
      sweep.alpha = t < .8 ? .9 : (1 - t) / .2
      // Jade caps flare green at both ends.
      glow.setSize(470, 70)
      glow.alpha = .55 * (1 - t)
      if (t < 1) { requestAnimationFrame(tick); return }
      this.maxFrame.scale.set(base)
      sweep.destroy()
      glow.destroy()
    }
    requestAnimationFrame(tick)
  }

  private clear() {
    this.countToken++
    this.marquee = undefined
    this.content.removeChildren()
  }

  showMessages(messages: SkinName[] = IDLE_MESSAGES) {
    if (this.marquee && this.messages === messages) return
    this.messages = messages
    this.marqueeIndex = 0
    this.nextMessage()
    // Start the first tip in view instead of scrolling in from an empty plaque.
    if (this.marquee) this.marquee.x = Math.max(-162, -this.marquee.width / 2)
  }

  private nextMessage() {
    this.clear()
    const name = this.messages[this.marqueeIndex++ % this.messages.length]
    const sprite = new Sprite(skin()[name])
    sprite.anchor.set(0, .5)
    sprite.scale.set(22 / sprite.texture.height)
    sprite.x = 162
    this.marquee = sprite
    this.content.addChild(sprite)
  }

  /** Shows WIN / TOTAL WIN; `from` counts the digits up from a previous amount. */
  showAmount(amount: number, total = false, from = amount) {
    this.clear()
    const label = skinSprite(total ? 'label_total_win' : 'label_win', undefined, total ? 34 : 26)
    const value = new SpriteNumber(30)
    const layout = () => {
      const gap = 10
      const width = label.width + gap + value.width
      label.x = -width / 2 + label.width / 2
      value.x = -width / 2 + label.width + gap + value.width / 2
    }
    value.text = from.toFixed(2)
    layout()
    this.content.addChild(label, value)
    if (from === amount) return
    const token = ++this.countToken
    const start = performance.now()
    const count = () => {
      if (token !== this.countToken) return
      const t = Math.min(1, (performance.now() - start) / 600)
      value.text = (from + (amount - from) * (1 - Math.pow(1 - t, 3))).toFixed(2)
      layout()
      if (t < 1) requestAnimationFrame(count)
    }
    requestAnimationFrame(count)
  }

  /**
   * Payout flash (reference, frame-by-frame): the plaque body glows orange-red, a gold starburst
   * flares at the centre, then small gold coins spray out and fall over ~0.7 s.
   */
  flash() {
    const glow = new Sprite(skin().frames.hl[2])
    glow.anchor.set(.5)
    glow.tint = 0xff5a1a
    glow.blendMode = 'add'
    glow.setSize(360, 44)
    const star = new AnimatedSprite(skin().frames.burst)
    star.anchor.set(.5)
    star.blendMode = 'add'
    star.tint = 0xffd060
    star.scale.set(120 / skin().frames.burst[1].width)
    star.position.set(20, -8)
    star.loop = false
    star.animationSpeed = .45
    star.onComplete = () => star.destroy()
    this.fxLayer.addChild(glow, star)
    star.play()
    const coins: { sprite: AnimatedSprite; vx: number; vy: number }[] = []
    for (let index = 0; index < 18; index++) {
      const sprite = new AnimatedSprite(skin().frames.coinspin)
      sprite.anchor.set(.5)
      sprite.scale.set((12 + Math.random() * 8) / skin().frames.coinspin[0].width)
      sprite.animationSpeed = .4 + Math.random() * .2
      sprite.gotoAndPlay(Math.floor(Math.random() * 8))
      sprite.position.set(20 + (Math.random() - .5) * 30, -6)
      this.fxLayer.addChild(sprite)
      coins.push({ sprite, vx: (Math.random() - .5) * 9, vy: -3 - Math.random() * 4 })
    }
    const start = performance.now()
    const tick = () => {
      if (glow.destroyed) return
      const t = Math.min(1, (performance.now() - start) / 800)
      glow.alpha = t < .15 ? t / .15 : 1 - (t - .15) / .85
      for (const coin of coins) {
        coin.vy += .28
        coin.sprite.x += coin.vx
        coin.sprite.y += coin.vy
        coin.sprite.alpha = t < .6 ? 1 : 1 - (t - .6) / .4
      }
      if (t < 1) { requestAnimationFrame(tick); return }
      glow.destroy()
      coins.forEach((coin) => coin.sprite.destroy())
    }
    requestAnimationFrame(tick)
  }

  showFreeRemaining(remaining: number) {
    this.clear()
    const last = remaining <= 1
    const label = skinSprite(last ? 'label_last_free' : 'label_remaining', undefined, last ? 22 : 34)
    if (last) { this.content.addChild(label); return }
    const value = new SpriteNumber(30)
    value.text = String(remaining)
    label.x = -30
    value.x = label.x + label.width / 2 + 12 + value.width / 2
    this.content.addChild(label, value)
  }

  showNote(text: string) {
    this.clear()
    this.note.text = text
    this.content.addChild(this.note)
  }
}

export class GameScene extends Container {
  private balance = 1000
  private bet = 10
  private win = 0
  private spinning = false
  private turbo = false
  private auto = false
  private autoTimer: number | undefined
  /** Auto Spin rounds still to play (reference Auto Spin panel: 10 / 30 / 50 / 80 / 1000). */
  private autoRemaining = 0
  private autoPanel: Container | undefined
  private viewBottom = GAME_HEIGHT
  private idleTimers: number[] = []
  private freeSpinsRemaining = 0
  private freeGameWin = 0
  private readonly reels = new ReelGrid()
  private readonly status = new StatusPanel()
  private readonly controls: SpinControls
  private readonly plaque = new WinPlaque()
  private readonly multiplierSprites: Sprite[] = []
  private readonly fxLayer = new Container()
  private readonly audio = new AudioEngine()
  private readonly modalLayer = new Container()
  /** Opens the 玩法說明 page (set by main.ts). */
  onHelp?: () => void
  /** Replaces the balance row and buttons during Free Spins (reference: large REMAINING panel). */
  private readonly freePanel = new Container()
  private readonly panel: Sprite
  /** Extra height above/below the 430×760 design used by full-screen feature screens. */
  private modalPad = 0

  constructor() {
    super()
    const textures = skin()
    const header = new Sprite(textures.header_red)
    header.scale.set(GAME_WIDTH / header.texture.width)
    header.y = -150
    const panel = new Sprite(textures.panel_wood)
    panel.scale.set(GAME_WIDTH / panel.texture.width)
    panel.y = BOARD_Y + BOARD_HEIGHT - 8
    this.panel = panel
    this.addChild(header, panel)

    const waysBar = new Sprite(textures.bar_ways)
    waysBar.setSize(GAME_WIDTH, 50)
    waysBar.y = 2
    const ways = skinSprite('title_ways', 128)
    ways.position.set(GAME_WIDTH / 2, 27)
    const multBar = new Sprite(textures.bar_mult)
    multBar.setSize(GAME_WIDTH, 64)
    multBar.y = 50
    this.addChild(waysBar, ways, multBar)
    // 玩法說明 entry (PDF 4.1 PAYTABLE / RULES), top-left of the 1024 WAYS bar.
    const help = new Container()
    help.position.set(26, 27)
    help.addChild(new Graphics().circle(0, 0, 15).fill({ color: '#3a0d09', alpha: .85 }).stroke({ color: '#e2b04f', width: 2 }))
    const helpMark = new Text({ text: '?', style: { fontFamily: 'Arial Black', fontSize: 18, fill: '#ffe08a' } })
    helpMark.anchor.set(.5)
    help.addChild(helpMark)
    help.eventMode = 'static'
    help.cursor = 'pointer'
    help.on('pointertap', () => { this.audio.uiClick(); this.onHelp?.() })
    this.addChild(help)
    BASE_STEPS.forEach((_, index) => {
      const sprite = skinSprite('mult_x1', undefined, 42)
      sprite.position.set(70 + index * 97, 82)
      this.multiplierSprites.push(sprite)
      this.addChild(sprite)
    })
    this.setMultiplier(1, false)

    this.reels.position.set(0, BOARD_Y)
    this.reels.eventMode = 'static'
    this.reels.cursor = 'pointer'
    this.reels.on('pointertap', () => { if (this.spinning) this.reels.quickStop() })
    this.addChild(this.reels)
    // Thin gold rails frame the felt like the reference board edge.
    this.addChild(new Graphics()
      .rect(0, BOARD_Y - 2, GAME_WIDTH, 3).fill('#f6c95a')
      .rect(0, BOARD_Y + BOARD_HEIGHT - 1, GAME_WIDTH, 3).fill('#f6c95a'))
    this.fxLayer.position.set(0, BOARD_Y)
    this.addChild(this.fxLayer)

    this.plaque.position.set(GAME_WIDTH / 2, PLAQUE_Y)
    this.addChild(this.plaque)
    this.plaque.showMessages()
    this.status.position.set(0, 562)
    this.addChild(this.status)

    this.controls = new SpinControls({
      spin: () => this.pressSpin(),
      decreaseBet: () => { this.audio.button(); this.changeBet(-5) },
      increaseBet: () => { this.audio.button(); this.changeBet(5) },
      toggleTurbo: () => { this.audio.button(); this.turbo = !this.turbo; this.controls.setTurbo(this.turbo) },
      toggleAuto: () => { this.audio.button(); this.toggleAuto() },
    })
    this.controls.position.set(0, 620)
    this.addChild(this.controls)
    // Plaque above the balance row and buttons so its payout coins fall over them (reference).
    this.addChild(this.plaque)
    this.freePanel.visible = false
    this.addChild(this.freePanel, this.modalLayer)
    this.updateStatus()
  }

  /**
   * Tall phones: the logical canvas stays 430 wide and grows taller instead of being stretched.
   * Reels, plaque and the SPIN row keep their size; the extra height goes to the red header
   * (top), the space above the SPIN row and the wood panel below it.
   */
  setViewHeight(height: number) {
    const extra = Math.max(0, height - GAME_HEIGHT)
    const top = Math.min(140, Math.round(extra * .35))
    const lower = Math.round((extra - top) * .45)
    this.y = top
    this.controls.y = 620 + lower
    this.freePanel.y = lower
    this.panel.height = GAME_HEIGHT + extra - top - this.panel.y + 4
    this.modalPad = Math.round(extra / 2)
    this.viewBottom = GAME_HEIGHT + extra - top
    this.modalLayer.y = this.modalPad - top
  }

  private changeBet(amount: number) {
    if (this.spinning || this.freeSpinsRemaining > 0) return
    this.bet = Math.min(100, Math.max(5, this.bet + amount))
    this.updateStatus()
  }

  /** Idle banter (VOX_0930): lines at 8/16/…/86 s after the last spin stopped; any spin resets it. */
  private scheduleIdleVoices() {
    this.cancelIdleVoices()
    if (this.auto || this.freeSpinsRemaining > 0) return
    this.idleTimers = IDLE_LINES.map(([seconds, line]) => window.setTimeout(() => {
      if (!document.hidden && !this.spinning && this.modalLayer.children.length === 0) this.audio.voice(line)
    }, seconds * 1000))
  }

  private cancelIdleVoices() {
    this.idleTimers.forEach((timer) => clearTimeout(timer))
    this.idleTimers = []
  }

  private spin() {
    if (this.modalLayer.children.length > 0) return
    const freeMode = this.freeSpinsRemaining > 0
    if (this.spinning) {
      this.reels.quickStop()
      return
    }
    if (!freeMode && this.balance < this.bet) {
      this.plaque.showNote('INSUFFICIENT CREDIT')
      return
    }
    this.spinning = true
    this.cancelIdleVoices()
    if (this.auto && !freeMode) {
      // Reference: the counter on the SPIN button ticks down shortly after each spin starts.
      this.autoRemaining--
      const left = this.autoRemaining
      window.setTimeout(() => { if (this.auto && this.freeSpinsRemaining === 0) this.controls.setCounter(left) }, 500)
    }
    this.audio.playMusic(freeMode)
    this.audio.spin()
    if (!freeMode) this.balance -= this.bet
    this.win = 0
    if (freeMode) this.updateFreePanel()
    this.plaque.setMaxed(false)
    this.plaque.showMessages(freeMode ? FREE_MESSAGES : IDLE_MESSAGES)
    this.controls.setSpinning(true)
    this.updateStatus()
    this.setMultiplier(freeMode ? 2 : 1, freeMode)
    let railValue = freeMode ? 2 : 1
    let winHasWild = false
    const turbo = this.turbo
    this.reels.spin({
      freeMode,
      turbo: this.turbo,
      settle: () => undefined,
      anticipation: (active) => {
        if (active) this.plaque.showMessages(['msg_scatter'])
      },
      tumble: (_chain, multiplier, win, symbols, wild) => {
        // Voice: a WILD in the win cheers "全中", otherwise the best winning tile is called.
        winHasWild = wild
        if (wild) this.audio.wildCall()
        else if (symbols[0]) this.audio.cardCall(symbols[0])
        this.setMultiplier(multiplier, freeMode)
        const previous = this.win
        this.win += win * this.bet
        this.plaque.showAmount(this.win, false, previous)
        this.plaque.flash()
        const cap = (freeMode ? FREE_STEPS : BASE_STEPS).at(-1)
        if (multiplier >= (cap ?? Infinity)) this.plaque.setMaxed(true)
      },
      advance: (next) => {
        this.setMultiplier(next, freeMode)
        // Rail cue + spoken multiplier only when the value actually steps up (x5 / x10 cap repeats silently).
        if (next !== railValue) {
          const steps: readonly number[] = freeMode ? FREE_STEPS : BASE_STEPS
          this.audio.multiplier(next, Math.max(1, Math.min(3, steps.indexOf(next))) as 1 | 2 | 3)
          this.flashRail(next, freeMode)
        }
        railValue = next
      },
      sound: (event, index = 0) => {
        // research/VOX_0930.xlsx: TURBO stops all reels at once with its own cue (#26).
        if (event === 'reelStop') { if (turbo) this.audio.turboStop(); else this.audio.reelStop(index) }
        else if (event === 'scatter') this.audio.scatter(index)
        else if (event === 'nearMiss') this.audio.nearMiss()
        else if (event === 'highlight') this.audio.highlight(index, winHasWild)
        else if (event === 'flip') this.audio.tileClear()
      },
      complete: (totalWin, scatters) => {
        this.win = totalWin * this.bet
        this.balance += this.win
        if (freeMode) this.freeGameWin += this.win
        if (this.win > 0) {
          this.plaque.showAmount(this.win, true)
        } else if (!freeMode) {
          this.plaque.showMessages()
        }
        this.controls.setSpinning(false)
        this.spinning = false
        this.updateStatus()

        const afterWin = () => {
          if (!freeMode && scatters >= 3) {
            // Reference: the settled win stays on screen ~0.6 s before the award screen fades in.
            window.setTimeout(() => this.startFreeGame(scatters), 600)
            return
          }
          if (freeMode) {
            this.freeSpinsRemaining--
            const retriggered = freeSpinsForScatters(scatters)
            if (retriggered > 0) {
              this.freeSpinsRemaining += retriggered
              this.plaque.showNote(`+${retriggered} FREE SPINS`)
            }
            if (this.freeSpinsRemaining > 0) {
              this.audio.freeCount(this.freeSpinsRemaining === 1)
              this.updateFreePanel()
              window.setTimeout(() => this.spin(), this.turbo ? 260 : 950)
            } else {
              window.setTimeout(() => this.finishFreeGame(), 850)
            }
          } else {
            this.scheduleAuto()
            this.scheduleIdleVoices()
          }
        }
        // Big wins (20x bet and above) get the celebration overlay before play continues.
        if (totalWin >= 20) {
          this.showBigWin(this.win, totalWin, () => {
            this.plaque.showAmount(this.win, true)
            this.plaque.flash()
            this.audio.bigWinReturn()
            afterWin()
          })
        }
        else afterWin()
      },
    })
  }

  /** SPIN press: stops Auto Spin while it runs (PDF 4.1 STOP), otherwise spins / quick-stops. */
  private pressSpin() {
    if (this.auto) { this.stopAuto(); return }
    this.spin()
  }

  private toggleAuto() {
    if (this.auto) { this.stopAuto(); return }
    if (this.spinning || this.freeSpinsRemaining > 0 || this.modalLayer.children.length) return
    this.openAutoPanel()
  }

  private startAuto(rounds: number) {
    this.closeAutoPanel()
    this.auto = true
    this.autoRemaining = rounds
    this.controls.setAuto(true)
    this.controls.setCounter(rounds)
    this.spin()
  }

  private stopAuto() {
    this.auto = false
    this.autoRemaining = 0
    if (this.autoTimer !== undefined) {
      clearTimeout(this.autoTimer)
      this.autoTimer = undefined
    }
    this.controls.setAuto(false)
    if (this.freeSpinsRemaining === 0) this.controls.setCounter(null)
  }

  private scheduleAuto() {
    if (!this.auto || this.freeSpinsRemaining > 0) return
    if (this.autoRemaining <= 0) { this.stopAuto(); return }
    if (this.autoTimer !== undefined) clearTimeout(this.autoTimer)
    this.autoTimer = window.setTimeout(() => {
      this.autoTimer = undefined
      if (this.auto) this.spin()
    }, this.turbo ? 280 : 700)
  }

  /** Reference Auto Spin sheet: dark purple panel over the lower screen, round-count pills and Start. */
  private openAutoPanel() {
    this.closeAutoPanel()
    const panel = new Container()
    const top = BOARD_Y + BOARD_HEIGHT - 70
    const blocker = new Graphics().rect(0, -this.y, GAME_WIDTH, this.viewBottom + this.y).fill({ color: '#000', alpha: .35 })
    blocker.eventMode = 'static'
    blocker.on('pointertap', () => this.closeAutoPanel())
    const sheet = new Graphics()
      .roundRect(0, top, GAME_WIDTH, this.viewBottom - top + 20, 16).fill({ color: '#2b2741', alpha: .97 })
      .rect(0, top + 52, GAME_WIDTH, 1).fill({ color: '#ffffff', alpha: .08 })
    sheet.eventMode = 'static'
    const text = (value: string, size: number, color: string, weight: '400' | '700' = '400') => {
      const label = new Text({ text: value, style: { fontFamily: 'Arial', fontSize: size, fontWeight: weight, fill: color } })
      label.anchor.set(.5)
      return label
    }
    const title = text('Auto Spin', 17, '#ffffff', '700')
    title.position.set(GAME_WIDTH / 2, top + 27)
    const close = text('✕', 20, '#d8d4ea')
    close.position.set(GAME_WIDTH - 34, top + 27)
    close.eventMode = 'static'
    close.cursor = 'pointer'
    close.on('pointertap', () => { this.audio.uiClick(); this.closeAutoPanel() })
    const caption = text('Number of Auto Spins', 13, '#a9a3c4')
    caption.anchor.set(0, .5)
    caption.position.set(26, top + 80)
    panel.addChild(blocker, sheet, title, close, caption)
    const options = [10, 30, 50, 80, 1000]
    let chosen = 10
    const pills = options.map((value, index) => {
      const pill = new Container()
      pill.position.set(57 + index * 79, top + 122)
      const bg = new Graphics()
      const label = text(String(value), 14, '#d8d4ea', '700')
      pill.addChild(bg, label)
      pill.eventMode = 'static'
      pill.cursor = 'pointer'
      pill.on('pointertap', () => { this.audio.uiClick(); chosen = value; paint() })
      panel.addChild(pill)
      return { pill, bg, value }
    })
    const paint = () => pills.forEach(({ bg, value }) => {
      bg.clear().roundRect(-33, -17, 66, 34, 17).fill(value === chosen ? '#e8836a' : '#3e3959')
    })
    paint()
    const start = new Container()
    start.position.set(GAME_WIDTH / 2, top + 190)
    start.addChild(new Graphics().roundRect(-92, -20, 184, 40, 20).fill('#f08a6a'), text('Start', 16, '#ffffff', '700'))
    start.eventMode = 'static'
    start.cursor = 'pointer'
    start.on('pointertap', () => { this.audio.button(); this.startAuto(chosen) })
    panel.addChild(start)
    this.autoPanel = panel
    this.addChildAt(panel, this.getChildIndex(this.modalLayer))
  }

  private closeAutoPanel() {
    this.autoPanel?.destroy({ children: true })
    this.autoPanel = undefined
  }

  private updateStatus() {
    this.status.setValues(this.balance, this.bet, this.win)
  }

  private setMultiplier(value: number, freeMode = false) {
    const steps = freeMode ? FREE_STEPS : BASE_STEPS
    const match = steps.findIndex(step => step >= value)
    const active = match === -1 ? steps.length - 1 : match
    this.multiplierSprites.forEach((sprite, index) => {
      sprite.texture = skin()[`mult_x${steps[index]}` as SkinName]
      const isActive = index === active
      sprite.tint = isActive ? 0xffffff : INACTIVE_TINT
      sprite.scale.set((isActive ? 46 : 38) / sprite.texture.height)
    })
  }

  /** Rail step-up (reference): the newly lit label pops with a short gold glow burst behind it. */
  private flashRail(value: number, freeMode: boolean) {
    const steps: readonly number[] = freeMode ? FREE_STEPS : BASE_STEPS
    const index = steps.indexOf(value)
    const label = this.multiplierSprites[index]
    if (!label) return
    const glow = new Sprite(skin().frames.hl[2])
    glow.anchor.set(.5)
    glow.tint = 0xffc030
    glow.blendMode = 'add'
    glow.position.copyFrom(label.position)
    this.addChildAt(glow, this.getChildIndex(label))
    const base = label.scale.x
    const start = performance.now()
    const frame = () => {
      const t = Math.min(1, (performance.now() - start) / 450)
      glow.setSize(80 + t * 70, 44 + t * 30)
      glow.alpha = 1 - t
      label.scale.set(base * (1 + .3 * Math.max(0, 1 - t / .6)))
      if (t < 1) requestAnimationFrame(frame)
      else { glow.destroy(); label.scale.set(base) }
    }
    requestAnimationFrame(frame)
  }

  private startFreeGame(scatterCount: number) {
    if (this.autoTimer !== undefined) {
      clearTimeout(this.autoTimer)
      this.autoTimer = undefined
    }
    this.auto = false
    this.controls.setAuto(false)
    this.freeSpinsRemaining = freeSpinsForScatters(scatterCount)
    this.freeGameWin = 0
    this.audio.playMusic(true)
    // Feature-screen art streams in after start-up; wait for it if it is still on its way.
    whenDeferredReady(() => this.showFreeSpinsWon())
  }

  /**
   * FREE SPINS WON (reference timing): crossfade in, a loading ring for ~3 s, then START.
   * START fades back to the board, the rail flips to x2/x4/x6/x10 one label at a time and
   * the first free spin starts by itself.
   */
  private showFreeSpinsWon() {
    this.audio.freeSpinsWon()
    const screen = this.openScreen('red')
    const heading = skinSprite('title_free_won', 330)
    heading.position.set(GAME_WIDTH / 2, 150)
    const count = new SpriteNumber(130)
    count.text = String(this.freeSpinsRemaining)
    count.position.set(GAME_WIDTH / 2, 290)
    const detail = skinSprite('label_doubled', 300)
    detail.position.set(GAME_WIDTH / 2, 405)
    screen.addChild(heading, count, detail)
    this.popIn(heading)
    this.popIn(count)
    // Loading ring from the reference sheet (orange→gold ring), turning until START appears.
    const ring = new Sprite(skin().frames.fsui[1])
    ring.anchor.set(.5)
    ring.setSize(56, 56)
    ring.position.set(GAME_WIDTH / 2, 540)
    screen.addChild(ring)
    const spinRing = () => {
      if (ring.destroyed || !ring.visible) return
      ring.rotation += .1
      requestAnimationFrame(spinRing)
    }
    requestAnimationFrame(spinRing)
    window.setTimeout(() => {
      if (ring.destroyed) return
      ring.visible = false
      const start = this.screenButton('label_start', 540, () => {
        this.audio.button()
        this.closeScreen().then(() => this.enterFreeMode())
      })
      screen.addChild(start)
    }, this.turbo ? 1200 : 3000)
  }

  private enterFreeMode() {
    this.status.visible = false
    this.controls.visible = false
    this.freePanel.visible = true
    this.updateFreePanel()
    // The rail relabels left to right: x1→x2, x2→x4, x3→x6, x5→x10.
    FREE_STEPS.forEach((_, index) => window.setTimeout(() => this.flipRailLabel(index, true), index * 250))
    window.setTimeout(() => this.spin(), FREE_STEPS.length * 250 + 500)
  }

  private flipRailLabel(index: number, freeMode: boolean) {
    const sprite = this.multiplierSprites[index]
    const steps = freeMode ? FREE_STEPS : BASE_STEPS
    const base = sprite.scale.x
    const start = performance.now()
    let swapped = false
    const frame = () => {
      const t = Math.min(1, (performance.now() - start) / 220)
      if (t >= .5 && !swapped) {
        swapped = true
        sprite.texture = skin()[`mult_x${steps[index]}` as SkinName]
        const active = index === 0
        sprite.tint = active ? 0xffffff : INACTIVE_TINT
      }
      sprite.scale.set(base * Math.max(.05, Math.abs(Math.cos(t * Math.PI))), base)
      if (t < 1) requestAnimationFrame(frame)
      else sprite.scale.set((index === 0 ? 46 : 38) / sprite.texture.height)
    }
    requestAnimationFrame(frame)
  }

  private updateFreePanel() {
    const last = this.freeSpinsRemaining <= 1
    this.freePanel.removeChildren().forEach((child) => child.destroy({ children: true }))
    if (last) {
      const label = skinSprite('label_last_free', 330)
      label.position.set(GAME_WIDTH / 2, 660)
      this.freePanel.addChild(label)
      return
    }
    // Built on demand: the label art is part of the deferred (feature-screen) textures.
    const label = skinSprite('label_remaining', undefined, 56)
    label.position.set(150, 660)
    const count = new SpriteNumber(78)
    count.text = String(this.freeSpinsRemaining)
    count.position.set(300, 662)
    this.freePanel.addChild(label, count)
  }

  /** TOTAL WIN (reference): gold screen, amount counts up ~1.8 s over a 胡, then COLLECT appears. */
  private finishFreeGame() {
    const total = this.freeGameWin
    this.audio.playMusic(false)
    whenDeferredReady(() => {
      const screen = this.openScreen('gold')
      // Reference layout: title at the top, large amount, the mound's 胡 right under it.
      const mound = skinSprite('coin_mound', GAME_WIDTH * 1.06)
      mound.anchor.set(.5, 1)
      mound.position.set(GAME_WIDTH / 2, GAME_HEIGHT + 70)
      const heading = skinSprite('title_total_win', 290)
      heading.position.set(GAME_WIDTH / 2, 62)
      const amount = new SpriteNumber(88)
      amount.text = '0.00'
      amount.position.set(GAME_WIDTH / 2, 150)
      screen.addChild(mound, heading, amount)
      this.popIn(heading)
      this.audio.totalWin()
      const duration = this.turbo ? 700 : 1800
      const start = performance.now()
      const count = () => {
        if (amount.destroyed) return
        const t = Math.min(1, (performance.now() - start) / duration)
        amount.text = (total * t).toFixed(2)
        if (t < 1) { requestAnimationFrame(count); return }
        this.audio.totalWinEnd()
        screen.addChild(this.screenButton('btn_collect', 678, () => {
          this.audio.collect()
          this.closeScreen().then(() => this.exitFreeMode(total))
        }))
      }
      requestAnimationFrame(count)
    })
  }

  private exitFreeMode(total: number) {
    this.freePanel.visible = false
    this.status.visible = true
    this.controls.visible = true
    this.controls.setCounter(null)
    this.setMultiplier(1, false)
    this.win = total
    this.plaque.showAmount(total, true)
    this.updateStatus()
  }

  /** Full-screen feature screen that crossfades in over the board. */
  private openScreen(tone: 'red' | 'gold') {
    this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
    const screen = new Container()
    this.celebrationBackdrop(screen, tone)
    this.modalLayer.addChild(screen)
    this.fade(screen, 0, 1, 300)
    return screen
  }

  private closeScreen() {
    const screen = this.modalLayer.children[0]
    if (!screen) return Promise.resolve()
    screen.eventMode = 'none'
    return this.fade(screen, 1, 0, 300).then(() => {
      this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
    })
  }

  private screenButton(label: SkinName, y: number, onPress: () => void) {
    const button = new Container()
    button.position.set(GAME_WIDTH / 2, y)
    const frame = new Sprite(skin().frames.fsui[0])
    frame.anchor.set(.5)
    frame.setSize(190, 72)
    button.addChild(frame, skinSprite(label, 128))
    button.eventMode = 'static'
    button.cursor = 'pointer'
    let pressed = false
    button.on('pointertap', () => {
      if (pressed) return
      pressed = true
      onPress()
    })
    this.fade(button, 0, 1, 300)
    return button
  }

  private fade(target: Container, from: number, to: number, duration: number) {
    target.alpha = Math.max(.01, from)
    const start = performance.now()
    return new Promise<void>((resolve) => {
      const frame = () => {
        if (target.destroyed) { resolve(); return }
        const t = Math.min(1, (performance.now() - start) / duration)
        target.alpha = Math.max(.01, from + (to - from) * t)
        if (t < 1) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  }

  /**
   * Feature-screen backdrop built from the reference sheets: the red light-ray plate, the
   * sparkle overlay and (TOTAL WIN) the gold glow column with rotating ray fans.
   */
  private celebrationBackdrop(parent: Container, tone: 'red' | 'gold' = 'red') {
    const plate = new Sprite(skin().frames.fsbg[0])
    const fullHeight = GAME_HEIGHT + this.modalPad * 2
    plate.scale.set(Math.max(GAME_WIDTH / plate.texture.width, fullHeight / plate.texture.height))
    plate.position.set((GAME_WIDTH - plate.width) / 2, -this.modalPad)
    const sparkle = new Sprite(skin().frames.fsglow[0])
    sparkle.blendMode = 'add'
    sparkle.alpha = .7
    sparkle.setSize(GAME_WIDTH, fullHeight)
    sparkle.y = -this.modalPad
    parent.addChild(plate, sparkle)
    if (tone === 'gold') {
      const glow = new Sprite(skin().frames.fsgold[0])
      glow.blendMode = 'add'
      glow.setSize(GAME_WIDTH * 1.3, GAME_HEIGHT)
      glow.position.set(-GAME_WIDTH * .15, -40)
      parent.addChild(glow, this.rayFans(GAME_WIDTH / 2, 160, 620, .55))
      const star = new Sprite(skin().frames.fsgold[1])
      star.anchor.set(.5)
      star.blendMode = 'add'
      star.setSize(420, 420)
      star.position.set(GAME_WIDTH / 2, 150)
      parent.addChild(star)
    } else {
      // Wider than the screen so the art's cut edges stay off-screen.
      const tiles = skinSprite('flying_tiles', GAME_WIDTH * 1.12)
      tiles.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40)
      parent.addChild(tiles)
    }
  }

  /** Full radial light rays from three copies of the reference ray fan, slowly turning. */
  private rayFans(x: number, y: number, radius: number, alpha: number) {
    const rays = new Container()
    rays.position.set(x, y)
    for (let index = 0; index < 3; index++) {
      const fan = new Sprite(skin().frames.rays[0])
      fan.anchor.set(.5, 1)
      fan.blendMode = 'add'
      fan.alpha = alpha
      fan.setSize(radius * 1.16, radius)
      fan.rotation = index * Math.PI * 2 / 3
      rays.addChild(fan)
    }
    const turn = () => {
      if (rays.destroyed) return
      rays.rotation += .0025
      requestAnimationFrame(turn)
    }
    requestAnimationFrame(turn)
    return rays
  }

  private showBigWin(amount: number, betMultiple: number, done: () => void) {
    whenDeferredReady(() => this.presentBigWin(amount, betMultiple, done))
  }

  /**
   * Big Win (reference screenshots): the board stays visible under a dark veil; radial ray fans,
   * the gold 壽 ring and the mirrored tile pile sit behind the title and a large gold amount while
   * coins rain down. The title upgrades BIG → MEGA → SUPER MEGA as the count passes 35× / 50× bet;
   * MEGA adds the coin pots, SUPER MEGA the ingot stacks. First tap jumps to the final amount,
   * the next tap (or 1.6 s) closes it.
   */
  private presentBigWin(amount: number, betMultiple: number, done: () => void) {
    this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
    const screen = new Container()
    this.modalLayer.addChild(screen)
    this.fade(screen, 0, 1, 250)
    const cx = GAME_WIDTH / 2
    screen.addChild(new Graphics().rect(0, -this.modalPad, GAME_WIDTH, GAME_HEIGHT + this.modalPad * 2).fill({ color: '#000', alpha: .6 }))
    screen.addChild(this.rayFans(cx, 330, 560, .22))
    const [ringTexture, burstTexture] = skin().frames.bwlight
    const ring = new Sprite(ringTexture)
    ring.anchor.set(.5)
    ring.blendMode = 'add'
    ring.setSize(300, 300)
    ring.position.set(cx, 340)
    const burst = new Sprite(burstTexture)
    burst.anchor.set(.5)
    burst.blendMode = 'add'
    burst.setSize(430, 410)
    burst.position.set(cx, 470)
    screen.addChild(ring, burst)
    // Side decorations appear with the tier: coin pots (MEGA), ingot stacks (SUPER MEGA).
    const [pileTexture, potTexture, ingotTexture] = skin().frames.bwpile
    const sides: Container[] = []
    const addPair = (texture: Texture, offset: number, width: number, y: number) => {
      const pair = new Container()
      for (const side of [-1, 1]) {
        const part = new Sprite(texture)
        part.anchor.set(.5)
        const scale = width / texture.width
        part.scale.set(scale * -side, scale)
        part.position.set(cx + side * offset, y)
        pair.addChild(part)
      }
      pair.visible = false
      sides.push(pair)
      screen.addChild(pair)
    }
    addPair(potTexture, 118, 124, 350)
    addPair(ingotTexture, 172, 70, 380)
    const pile = new Sprite(pileTexture)
    pile.anchor.set(.5)
    pile.scale.set(300 / pileTexture.width)
    pile.position.set(cx, 322)
    screen.addChild(pile)
    const titles: SkinName[] = ['title_big_win', 'title_mega_win', 'title_super_mega_win']
    // PDF 1.2: Big Win x20–35, Mega Win x35–50, Super Mega Win x50 and above.
    const tierAt = (value: number) => value >= this.bet * 50 ? 2 : value >= this.bet * 35 ? 1 : 0
    const finalTier = betMultiple >= 50 ? 2 : betMultiple >= 35 ? 1 : 0
    const heading = skinSprite(titles[0], 230)
    heading.position.set(cx, 396)
    const value = new SpriteNumber(90)
    value.text = '0.00'
    value.position.set(cx, 480)
    screen.addChild(heading, value)
    this.popIn(heading)
    this.audio.bigWin()
    let tier = 0
    const setTier = (next: number) => {
      if (next <= tier) return
      tier = next
      heading.texture = skin()[titles[tier]]
      heading.scale.set(230 / heading.texture.width)
      this.popIn(heading)
      sides.forEach((pair, index) => { pair.visible = index < tier })
    }
    // Coins and ingots (motion-blurred reference sprites) rain over the whole screen.
    const rain = new Container()
    screen.addChild(rain)
    const flyers = skin().frames.flycoin
    const drops: { sprite: Sprite; vy: number; vr: number }[] = []
    const duration = (this.turbo ? 1500 : 3500) + finalTier * (this.turbo ? 800 : 2000)
    const start = performance.now()
    let counting = true
    let finished = false
    let closeTimer: number | undefined
    const finish = () => {
      if (finished) return
      finished = true
      if (closeTimer !== undefined) clearTimeout(closeTimer)
      this.audio.bigWinEnd()
      this.fade(screen, 1, 0, 250).then(() => {
        this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
        done()
      })
    }
    const endCount = () => {
      counting = false
      value.text = amount.toFixed(2)
      setTier(finalTier)
      closeTimer = window.setTimeout(finish, 1600)
    }
    const blocker = new Graphics().rect(0, -this.modalPad, GAME_WIDTH, GAME_HEIGHT + this.modalPad * 2).fill({ color: '#000', alpha: .001 })
    blocker.eventMode = 'static'
    blocker.cursor = 'pointer'
    blocker.on('pointertap', () => { if (counting) endCount(); else finish() })
    screen.addChild(blocker)
    const tick = (now: number) => {
      if (screen.destroyed) return
      if (counting) {
        const progress = Math.min(1, (now - start) / duration)
        const shown = amount * (1 - Math.pow(1 - progress, 1.6))
        value.text = shown.toFixed(2)
        setTier(tierAt(shown))
        if (progress >= 1) endCount()
      }
      burst.alpha = .75 + Math.sin(now / 160) * .2
      ring.rotation = now / 9000
      if (!finished && Math.random() < .12) {
        const sprite = new Sprite(flyers[Math.floor(Math.random() * flyers.length)])
        sprite.anchor.set(.5)
        sprite.scale.set((24 + Math.random() * 22) / 150)
        sprite.position.set(Math.random() * GAME_WIDTH, -this.modalPad - 40)
        sprite.rotation = Math.random() * Math.PI * 2
        rain.addChild(sprite)
        drops.push({ sprite, vy: 4 + Math.random() * 5, vr: (Math.random() - .5) * .12 })
      }
      for (let index = drops.length - 1; index >= 0; index--) {
        const drop = drops[index]
        drop.sprite.y += drop.vy
        drop.sprite.rotation += drop.vr
        if (drop.sprite.y > GAME_HEIGHT + this.modalPad + 60) { drop.sprite.destroy(); drops.splice(index, 1) }
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  private popIn(target: Container) {
    const base = target.scale.x
    const start = performance.now()
    const frame = () => {
      if (target.destroyed) return
      const progress = Math.min(1, (performance.now() - start) / 420)
      const c1 = 1.7
      const eased = 1 + (c1 + 1) * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2)
      target.scale.set(base * Math.max(.01, eased))
      if (progress < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
}
