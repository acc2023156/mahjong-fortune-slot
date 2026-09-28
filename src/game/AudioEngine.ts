export class AudioEngine {
  private context?: AudioContext
  private music?: HTMLAudioElement

  private getContext() {
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  private tone(frequency: number, duration: number, type: OscillatorType = 'sine', gain = 0.045, delay = 0) {
    const context = this.getContext()
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    const start = context.currentTime + delay
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    volume.gain.setValueAtTime(gain, start)
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(volume).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration)
  }

  spin() {
    ;[180, 210, 245, 280].forEach((frequency, index) => this.tone(frequency, 0.08, 'triangle', 0.025, index * 0.055))
  }

  tumble(chain: number) {
    const root = 480 + chain * 70
    this.tone(root, 0.16, 'sine', 0.05)
    this.tone(root * 1.5, 0.2, 'triangle', 0.035, 0.06)
  }

  settle() { this.tone(150, 0.09, 'triangle', 0.025) }

  reelStop(col: number) { this.tone(120 + col * 6, 0.07, 'triangle', 0.03) }

  /** 胡 landing: low gong plus a bright shimmer, pitched up for each later reel. */
  scatter(col: number) {
    const lift = 1 + col * .06
    this.tone(98 * lift, .9, 'sine', .08)
    this.tone(196 * lift, .7, 'triangle', .035, .01)
    ;[784, 988, 1175].forEach((frequency, index) => this.tone(frequency * lift, .25, 'sine', .03, .05 + index * .05))
  }

  /** Column-by-column win highlight: a rising chime per lit reel. */
  highlight(col: number) {
    const scale = [659, 784, 880, 1047, 1175]
    this.tone(scale[col] ?? 1175, .22, 'sine', .045)
    this.tone((scale[col] ?? 1175) * 2, .12, 'triangle', .012, .02)
  }

  /** Tiles flip away into coins: a burst of metallic clinks. */
  coins() {
    for (let index = 0; index < 7; index++) {
      this.tone(2200 + Math.random() * 1600, .07, 'square', .012, index * .035)
      this.tone(3200 + Math.random() * 900, .05, 'sine', .018, index * .035 + .01)
    }
  }

  wild() {
    ;[523, 784, 1047, 1568].forEach((frequency, index) => this.tone(frequency, .3, 'sine', .04, index * .06))
  }

  drop() {
    this.tone(90, .12, 'sine', .07)
    this.tone(180, .06, 'triangle', .02, .01)
  }

  win(multiplier: number) {
    const notes = multiplier >= 10 ? [523, 659, 784, 1047] : [523, 659, 784]
    notes.forEach((frequency, index) => this.tone(frequency, 0.3, 'sine', 0.055, index * 0.11))
  }

  playMusic(freeMode = false) {
    const file = freeMode ? 'bgm_bonus_loop.mp3' : 'bgm_mg.mp3'
    const url = `${import.meta.env.BASE_URL}assets/pgsoft-reference/audio/audio/mp3/${file}`
    if (this.music?.src.endsWith(file)) {
      void this.music.play().catch(() => undefined)
      return
    }
    this.music?.pause()
    this.music = new Audio(url)
    this.music.loop = true
    this.music.volume = .22
    void this.music.play().catch(() => undefined)
  }

  anticipation(active: boolean) {
    if (!active) return
    ;[260, 330, 420, 540].forEach((frequency, index) => this.tone(frequency, .42, 'sine', .035, index * .45))
  }
}
