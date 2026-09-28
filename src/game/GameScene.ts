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

  /** Payout flash from the reference sheet: the plaque glows orange and bursts coins. */
  flash() {
    const glow = new Sprite(skin().frames.hl[2])
    glow.anchor.set(.5)
    glow.tint = 0xff5a1a
    glow.blendMode = 'add'
    glow.setSize(360, 44)
    const burst = new AnimatedSprite(skin().frames.plaquefx)
    burst.anchor.set(.5)
    burst.blendMode = 'add'
    burst.loop = false
    burst.animationSpeed = .3
    burst.setSize(470, 150)
    burst.onFrameChange = () => burst.setSize(470, 150)
    burst.onComplete = () => burst.destroy()
    this.fxLayer.addChild(glow, burst)
    burst.play()
    const start = performance.now()
    const fade = () => {
      if (glow.destroyed) return
      const t = Math.min(1, (performance.now() - start) / 900)
      glow.alpha = t < .2 ? t / .2 : 1 - (t - .2) / .8
      if (t < 1) requestAnimationFrame(fade)
      else glow.destroy()
    }
    requestAnimationFrame(fade)
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
    this.addChild(this.modalLayer)
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
    if (freeMode) {
      this.plaque.showFreeRemaining(this.freeSpinsRemaining)
      this.controls.setCounter(this.freeSpinsRemaining)
    } else {
      this.plaque.showMessages()
    }
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
        this.audio.plaque()
      },
      advance: (next) => {
        this.setMultiplier(next, freeMode)
        // Rail cue + spoken multiplier only when the value actually steps up (x5 / x10 cap repeats silently).
        if (next !== railValue) this.audio.multiplier(next)
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
            this.startFreeGame(scatters)
            return
          }
          if (freeMode) {
            this.freeSpinsRemaining--
            const retriggered = freeSpinsForScatters(scatters)
            if (retriggered > 0) {
              this.freeSpinsRemaining += retriggered
              this.plaque.showNote(`+${retriggered} FREE SPINS`)
            }
            this.controls.setCounter(this.freeSpinsRemaining > 0 ? this.freeSpinsRemaining : null)
            if (this.freeSpinsRemaining > 0) window.setTimeout(() => this.spin(), this.turbo ? 260 : 950)
            else window.setTimeout(() => this.finishFreeGame(), 850)
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
    this.audio.freeGame()
    // Feature-screen art streams in after start-up; wait for it if it is still on its way.
    whenDeferredReady(() => {
      const count = new SpriteNumber(120)
      count.text = String(this.freeSpinsRemaining)
      this.showModal('title_free_won', count, 'label_doubled', 'label_start', () => {
        this.setMultiplier(2, true)
        this.controls.setCounter(this.freeSpinsRemaining)
        this.spin()
      })
    })
  }

  private finishFreeGame() {
    const total = this.freeGameWin
    this.audio.playMusic(false)
    this.controls.setCounter(null)
    this.audio.totalWin()
    whenDeferredReady(() => {
      const amount = new SpriteNumber(72)
      amount.text = total.toFixed(2)
      this.showModal('title_total_win', amount, undefined, 'btn_collect', () => {
        this.setMultiplier(1, false)
        this.win = total
        this.plaque.showAmount(total, true)
        this.updateStatus()
      })
    })
  }

  private celebrationBackdrop(parent: Container) {
    parent.addChild(new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: '#5e0608', alpha: .94 }))
    const rays = new Graphics()
    for (let index = 0; index < 18; index++) {
      const angle = index / 18 * Math.PI * 2
      rays.moveTo(0, 0).arc(0, 0, 520, angle, angle + .09).lineTo(0, 0).fill({ color: '#ffc53a', alpha: .1 })
    }
    rays.position.set(GAME_WIDTH / 2, 300)
    const glow = new Graphics().circle(0, 0, 150).fill({ color: '#ffb21f', alpha: .22 }).circle(0, 0, 90).fill({ color: '#ffe57a', alpha: .2 })
    glow.position.set(GAME_WIDTH / 2, 300)
    const tiles = skinSprite('flying_tiles', undefined, 700)
    tiles.position.set(GAME_WIDTH / 2, 330)
    tiles.alpha = .55
    parent.addChild(rays, glow, tiles)
    const spin = () => {
      if (rays.destroyed) return
      rays.rotation += .004
      requestAnimationFrame(spin)
    }
    requestAnimationFrame(spin)
  }

  private showModal(title: SkinName, value: Container, subtitle: SkinName | undefined, action: SkinName, onClose: () => void) {
    this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
    this.celebrationBackdrop(this.modalLayer)
    if (title === 'title_total_win') {
      const mound = skinSprite('coin_mound', GAME_WIDTH)
      mound.anchor.set(.5, 1)
      mound.position.set(GAME_WIDTH / 2, GAME_HEIGHT + 190)
      this.modalLayer.addChild(mound)
    }
    const heading = skinSprite(title, 340)
    heading.position.set(GAME_WIDTH / 2, 150)
    value.position.set(GAME_WIDTH / 2, title === 'title_total_win' ? 250 : 300)
    this.modalLayer.addChild(heading, value)
    if (subtitle) {
      const detail = skinSprite(subtitle, 300)
      detail.position.set(GAME_WIDTH / 2, 410)
      this.modalLayer.addChild(detail)
    }
    const button = new Container()
    button.position.set(GAME_WIDTH / 2, title === 'title_total_win' ? 690 : 520)
    button.addChild(new Graphics().roundRect(-88, -28, 176, 56, 12).fill('#b4221c').stroke({ color: '#ffd366', width: 4 }))
    button.addChild(skinSprite(action, 130))
    button.eventMode = 'static'
    button.cursor = 'pointer'
    button.on('pointertap', () => {
      this.audio.button()
      this.modalLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
      onClose()
    })
    this.modalLayer.addChild(button)
    this.popIn(heading)
    this.popIn(value)
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
