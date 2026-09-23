import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { ReelGrid } from './components/ReelGrid'
import { SpinControls } from './components/SpinControls'
import { StatusPanel } from './components/StatusPanel'
import { AudioEngine } from './AudioEngine'

export class GameScene extends Container {
  private balance = 1000
  private bet = 10
  private win = 0
  private spinning = false
  private turbo = false
  private auto = false
  private autoTimer: number | undefined
  private readonly reels = new ReelGrid()
  private readonly status = new StatusPanel()
  private readonly controls: SpinControls
  private readonly winBanner: Text
  private readonly multiplierLabels: Text[] = []
  private readonly fxLayer = new Container()
  private readonly audio = new AudioEngine()

  constructor(logoTexture: Texture, showWinTexture: Texture) {
    super()
    this.addChild(new Graphics().rect(0, 0, 430, 760).fill({ color: '#6d181b', alpha: 0.94 }))
    const logo = new Sprite(logoTexture)
    logo.anchor.set(0.5)
    logo.width = 270
    logo.height = 90
    logo.position.set(215, 48)
    this.addChild(logo)
    const ways = new Text({ text: '◆  2000 WAYS  ◆', style: { fontFamily: 'Arial', fontSize: 14, fontWeight: '900', fill: '#f0ad48', letterSpacing: 2 } })
    ways.anchor.set(0.5)
    ways.position.set(215, 86)
    this.addChild(ways)
    this.addChild(new Graphics().roundRect(16, 106, 398, 48, 16).fill('#106f63').stroke({ color: '#42b29b', width: 2 }))
    ;['X1', 'X2', 'X3', 'X5'].forEach((value, i) => {
      const multiplier = new Text({ text: value, style: { fontFamily: 'Arial Black', fontSize: 25, fill: i === 0 ? '#ffe45f' : '#123d37' } })
      multiplier.anchor.set(0.5)
      multiplier.position.set(70 + i * 96, 130)
      this.addChild(multiplier)
      this.multiplierLabels.push(multiplier)
    })

    this.reels.position.set(16, 158)
    this.addChild(this.reels)
    this.fxLayer.position.set(16, 158)
    this.addChild(this.fxLayer)

    const showWin = new Sprite(showWinTexture)
    showWin.position.set(0, 522)
    showWin.width = 430
    showWin.height = 96
    this.addChild(showWin)
    this.winBanner = new Text({ text: 'GOOD LUCK', style: { fontFamily: 'Arial Black', fontSize: 24, fontWeight: '900', fontStyle: 'italic', fill: '#ffe36e' } })
    this.winBanner.anchor.set(0.5)
    this.winBanner.position.set(215, 578)
    this.addChild(this.winBanner)
    this.status.position.set(16, 610)
    this.addChild(this.status)

    this.controls = new SpinControls({
      spin: () => this.spin(),
      decreaseBet: () => this.changeBet(-5),
      increaseBet: () => this.changeBet(5),
      toggleTurbo: () => { this.turbo = !this.turbo; this.controls.setTurbo(this.turbo) },
      toggleAuto: () => this.toggleAuto(),
    })
    this.controls.position.set(0, 654)
    this.addChild(this.controls)
  }

  private changeBet(amount: number) {
    if (this.spinning) return
    this.bet = Math.min(100, Math.max(5, this.bet + amount))
    this.updateStatus()
  }

  private spin() {
    if (this.spinning || this.balance < this.bet) {
      if (this.balance < this.bet) this.winBanner.text = 'INSUFFICIENT CREDIT'
      return
    }
    this.spinning = true
    this.audio.spin()
    this.balance -= this.bet
    this.win = 0
    this.winBanner.text = 'GOOD LUCK'
    this.controls.setSpinning(true)
    this.updateStatus()
    this.setMultiplier(1)
    this.reels.spin({
      settle: () => this.audio.settle(),
      tumble: (chain, multiplier, win) => {
        this.setMultiplier(multiplier)
        this.winBanner.text = `${chain} 連消  ×${multiplier}   +${(win * this.bet).toFixed(2)}`
        this.audio.tumble(chain)
        this.emitCoins()
      },
      complete: (multiplier) => {
      this.win = multiplier * this.bet
      this.balance += this.win
      this.winBanner.text = this.win > 0 ? `WIN  ${this.win.toFixed(2)}` : 'TRY AGAIN'
      if (this.win > 0) this.audio.win(multiplier)
      this.controls.setSpinning(false)
      this.spinning = false
      this.updateStatus()
      },
    })
  }

  private toggleAuto() {
    this.auto = !this.auto
    this.controls.setAuto(this.auto)
    if (this.auto) {
      this.spin()
      this.autoTimer = window.setInterval(() => this.spin(), this.turbo ? 1500 : 1900)
    } else if (this.autoTimer !== undefined) {
      clearInterval(this.autoTimer)
      this.autoTimer = undefined
    }
  }

  private updateStatus() {
    this.status.setValues(this.balance, this.bet, this.win)
  }

  private setMultiplier(value: number) {
    const steps = [1, 2, 3, 5]
    const match = steps.findIndex(step => step >= value)
    const active = match === -1 ? steps.length - 1 : match
    this.multiplierLabels.forEach((label, index) => {
      label.style.fill = index === active ? '#fff07a' : '#123d37'
      label.scale.set(index === active ? 1.14 : 1)
    })
  }

  private emitCoins() {
    for (let index = 0; index < 14; index++) {
      const coin = new Graphics().circle(0, 0, 3 + Math.random() * 4).fill(index % 3 ? '#ffd45b' : '#fff0a2')
      coin.position.set(40 + Math.random() * 320, 80 + Math.random() * 210)
      this.fxLayer.addChild(coin)
      const originY = coin.y
      const drift = (Math.random() - 0.5) * 80
      const start = performance.now()
      const animate = () => {
        const progress = Math.min(1, (performance.now() - start) / 620)
        coin.x += drift * 0.018
        coin.y = originY - Math.sin(progress * Math.PI) * (40 + Math.random() * 20) + progress * 55
        coin.alpha = 1 - progress
        coin.rotation += 0.18
        if (progress < 1) requestAnimationFrame(animate)
        else coin.destroy()
      }
      requestAnimationFrame(animate)
    }
  }
}
