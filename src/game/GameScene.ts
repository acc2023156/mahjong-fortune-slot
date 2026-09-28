import { AnimatedSprite, Container, Graphics, Sprite, Text } from 'pixi.js'
import { BOARD_HEIGHT, ReelGrid } from './components/ReelGrid'
import { SpinControls } from './components/SpinControls'
import { StatusPanel } from './components/StatusPanel'
import { AudioEngine } from './AudioEngine'
import { freeSpinsForScatters, GAME_HEIGHT, GAME_WIDTH } from './config'
import { skin, skinSprite, SpriteNumber, whenDeferredReady, type SkinName } from './skin'

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

  constructor() {
    super()
    this.addChild(skinSprite('plaque_win', 410))
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
  /** Replaces the balance row and buttons during Free Spins (reference: large REMAINING panel). */
  private readonly freePanel = new Container()

  constructor() {
    super()
    const textures = skin()
    const header = new Sprite(textures.header_red)
    header.scale.set(GAME_WIDTH / header.texture.width)
    header.y = -150
    const panel = new Sprite(textures.panel_wood)
    panel.scale.set(GAME_WIDTH / panel.texture.width)
    panel.y = BOARD_Y + BOARD_HEIGHT - 8
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
      spin: () => this.spin(),
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

  private changeBet(amount: number) {
    if (this.spinning || this.freeSpinsRemaining > 0) return
    this.bet = Math.min(100, Math.max(5, this.bet + amount))
    this.updateStatus()
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
    this.audio.playMusic(freeMode)
    this.audio.spin()
    if (!freeMode) this.balance -= this.bet
    this.win = 0
    if (freeMode) this.updateFreePanel()
    this.plaque.showMessages(freeMode ? FREE_MESSAGES : IDLE_MESSAGES)
    this.controls.setSpinning(true)
    this.updateStatus()
    this.setMultiplier(freeMode ? 2 : 1, freeMode)
    let railValue = freeMode ? 2 : 1
    this.reels.spin({
      freeMode,
      turbo: this.turbo,
      settle: () => this.audio.settle(),
      anticipation: (active) => {
        if (active) this.plaque.showMessages(['msg_scatter'])
      },
      tumble: (_chain, multiplier, win) => {
        this.setMultiplier(multiplier, freeMode)
        const previous = this.win
        this.win += win * this.bet
        this.plaque.showAmount(this.win, false, previous)
        this.plaque.flash()
      },
      advance: (next) => {
        this.setMultiplier(next, freeMode)
        // Rail cue + spoken multiplier only when the value actually steps up (x5 / x10 cap repeats silently).
        if (next !== railValue) {
          this.audio.multiplier(next)
          this.flashRail(next, freeMode)
        }
        railValue = next
      },
      sound: (event, index = 0) => {
        if (event === 'reelStop') this.audio.reelStop(index)
        else if (event === 'scatter') this.audio.scatter(index)
        else if (event === 'nearMiss') this.audio.nearMiss()
        else if (event === 'highlight') this.audio.highlight(index)
        else if (event === 'wild') this.audio.wild()
        else if (event === 'dropStart') this.audio.dropStart()
        else if (event === 'drop') this.audio.drop()
        // 'flip' is covered by the win-highlight cue, which runs through the tile turn.
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
              this.updateFreePanel()
              window.setTimeout(() => this.spin(), this.turbo ? 260 : 950)
            } else {
              window.setTimeout(() => this.finishFreeGame(), 850)
            }
          } else {
            this.scheduleAuto()
          }
        }
        // Big wins (20x bet and above) get the celebration overlay before play continues.
        if (totalWin >= 20) this.showBigWin(this.win, totalWin, afterWin)
        else afterWin()
      },
    })
  }

  private toggleAuto() {
    this.auto = !this.auto
    this.controls.setAuto(this.auto)
    if (this.auto) {
      if (!this.spinning) this.spin()
    } else if (this.autoTimer !== undefined) {
      clearTimeout(this.autoTimer)
      this.autoTimer = undefined
    }
  }

  private scheduleAuto() {
    if (!this.auto || this.freeSpinsRemaining > 0) return
    if (this.autoTimer !== undefined) clearTimeout(this.autoTimer)
    this.autoTimer = window.setTimeout(() => {
      this.autoTimer = undefined
      this.spin()
    }, this.turbo ? 280 : 700)
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
    const ring = new Graphics()
    ring.position.set(GAME_WIDTH / 2, 540)
    screen.addChild(ring)
    const spinRing = () => {
      if (ring.destroyed || !ring.visible) return
      ring.clear().arc(0, 0, 22, 0, Math.PI * 1.5).stroke({ color: '#ffd84a', width: 5, cap: 'round' })
      ring.rotation += .12
      requestAnimationFrame(spinRing)
    }
    requestAnimationFrame(spinRing)
    window.setTimeout(() => {
      if (ring.destroyed) return
      ring.visible = false
      const start = this.screenButton('label_start', 540, () => {
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
    this.audio.railFlip()
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
      const mound = skinSprite('coin_mound', GAME_WIDTH)
      mound.anchor.set(.5, 1)
      // The mound art carries the 胡 on top; lift it so the 胡 sits under the amount.
      mound.position.set(GAME_WIDTH / 2, GAME_HEIGHT + 150)
      const heading = skinSprite('title_total_win', 320)
      heading.position.set(GAME_WIDTH / 2, 120)
      const amount = new SpriteNumber(76)
      amount.text = '0.00'
      amount.position.set(GAME_WIDTH / 2, 220)
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
        screen.addChild(this.screenButton('btn_collect', 690, () => {
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
    button.addChild(new Graphics().roundRect(-88, -28, 176, 56, 12).fill('#b4221c').stroke({ color: '#ffd366', width: 4 }))
    button.addChild(skinSprite(label, 130))
    button.eventMode = 'static'
    button.cursor = 'pointer'
    let pressed = false
    button.on('pointertap', () => {
      if (pressed) return
      pressed = true
      this.audio.confirm()
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

  private celebrationBackdrop(parent: Container, tone: 'red' | 'gold' = 'red') {
    const gold = tone === 'gold'
    parent.addChild(new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: gold ? '#e8860f' : '#5e0608', alpha: .96 }))
    const rays = new Graphics()
    for (let index = 0; index < 18; index++) {
      const angle = index / 18 * Math.PI * 2
      rays.moveTo(0, 0).arc(0, 0, 520, angle, angle + .09).lineTo(0, 0).fill({ color: gold ? '#fff2a0' : '#ffc53a', alpha: gold ? .22 : .1 })
    }
    rays.position.set(GAME_WIDTH / 2, gold ? 220 : 300)
    const glow = new Graphics().circle(0, 0, 170).fill({ color: gold ? '#fff0a0' : '#ffb21f', alpha: gold ? .35 : .22 }).circle(0, 0, 90).fill({ color: '#ffe57a', alpha: .25 })
    glow.position.set(GAME_WIDTH / 2, gold ? 220 : 300)
    parent.addChild(rays, glow)
    if (!gold) {
      const tiles = skinSprite('flying_tiles', undefined, 700)
      tiles.position.set(GAME_WIDTH / 2, 330)
      tiles.alpha = .55
      parent.addChild(tiles)
    }
    const spin = () => {
      if (rays.destroyed) return
      rays.rotation += .004
      requestAnimationFrame(spin)
    }
    requestAnimationFrame(spin)
  }

  private showBigWin(amount: number, betMultiple: number, done: () => void) {
    whenDeferredReady(() => this.presentBigWin(amount, betMultiple, done))
  }

  private presentBigWin(amount: number, betMultiple: number, done: () => void) {
    this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
    this.celebrationBackdrop(this.modalLayer)
    const title: SkinName = betMultiple >= 60 ? 'title_super_mega_win' : betMultiple >= 35 ? 'title_mega_win' : 'title_big_win'
    const heading = skinSprite(title, 330)
    heading.position.set(GAME_WIDTH / 2, 230)
    const value = new SpriteNumber(64)
    value.position.set(GAME_WIDTH / 2, 380)
    this.modalLayer.addChild(heading, value)
    this.popIn(heading)
    this.audio.bigWin()
    const duration = this.turbo ? 1200 : 3000
    const start = performance.now()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      this.audio.bigWinEnd()
      this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
      done()
    }
    const blocker = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: '#000', alpha: .001 })
    blocker.eventMode = 'static'
    blocker.on('pointertap', finish)
    this.modalLayer.addChild(blocker)
    const count = () => {
      if (finished) return
      const progress = Math.min(1, (performance.now() - start) / duration)
      value.text = (amount * (1 - Math.pow(1 - progress, 2))).toFixed(2)
      if (Math.random() < .35) this.emitCoins(this.modalLayer, 2)
      if (progress < 1) requestAnimationFrame(count)
      else window.setTimeout(finish, 900)
    }
    requestAnimationFrame(count)
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

  private emitCoins(layer: Container = this.fxLayer, amount = 12) {
    for (let index = 0; index < amount; index++) {
      const coin = skinSprite(index % 3 ? 'coin' : 'coin_side', 14 + Math.random() * 12)
      coin.position.set(40 + Math.random() * 350, layer === this.fxLayer ? 80 + Math.random() * 210 : 250 + Math.random() * 120)
      layer.addChild(coin)
      const originY = coin.y
      const drift = (Math.random() - 0.5) * 80
      const lift = 60 + Math.random() * 60
      const start = performance.now()
      const animate = () => {
        if (coin.destroyed) return
        const progress = Math.min(1, (performance.now() - start) / 800)
        coin.x += drift * 0.018
        coin.y = originY - Math.sin(progress * Math.PI) * lift + progress * 70
        coin.alpha = 1 - progress * progress
        coin.rotation += 0.12
        if (progress < 1) requestAnimationFrame(animate)
        else coin.destroy()
      }
      requestAnimationFrame(animate)
    }
  }
}
