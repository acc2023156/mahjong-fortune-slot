import { soundSprites, voiceSprites, type SoundName, type VoiceName } from './audioSprites'

type Bank = 'general_audio' | 'vox'

const audioUrl = (file: string) => `${import.meta.env.BASE_URL}assets/pgsoft-reference/audio/audio/mp3/${file}`

/** Minimum gap between repeats of one cue; the reference plays one landing cue per settle. */
const THROTTLE_MS: Partial<Record<SoundName, number>> = { tilesLand: 700, reelStop: 70 }

/**
 * Plays the original audio sprites (general_audio.mp3 / vox.mp3) via Web Audio and the
 * original music loops via <audio>. See audioSprites.ts for the verified event mapping.
 */
export class AudioEngine {
  private context?: AudioContext
  private music?: HTMLAudioElement
  private readonly buffers = new Map<Bank, Promise<AudioBuffer>>()
  private activeVoice?: AudioBufferSourceNode
  private readonly looping = new Map<SoundName, AudioBufferSourceNode>()
  private readonly lastPlayed = new Map<SoundName, number>()

  private getContext() {
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  private load(bank: Bank) {
    const context = this.getContext()
    let pending = this.buffers.get(bank)
    if (!pending) {
      pending = fetch(audioUrl(`${bank}.mp3`))
        .then((response) => {
          if (!response.ok) throw new Error(`Audio ${bank}: HTTP ${response.status}`)
          return response.arrayBuffer()
        })
        .then((bytes) => context.decodeAudioData(bytes))
      this.buffers.set(bank, pending)
      pending.catch((error) => { this.buffers.delete(bank); console.error(error) })
    }
    return pending
  }

  private async play(bank: Bank, [offset, duration]: readonly [number, number], options: { volume?: number; voice?: boolean; key?: SoundName } = {}) {
    const requested = performance.now()
    try {
      const buffer = await this.load(bank)
      // Never play a stale cue after a slow first download.
      if (performance.now() - requested > 600) return
      const context = this.getContext()
      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = buffer
      gain.gain.value = options.volume ?? .7
      source.connect(gain).connect(context.destination)
      if (options.voice) { this.activeVoice?.stop(); this.activeVoice = source }
      if (options.key) { this.looping.get(options.key)?.stop(); this.looping.set(options.key, source) }
      source.onended = () => {
        source.disconnect(); gain.disconnect()
        if (this.activeVoice === source) this.activeVoice = undefined
        if (options.key && this.looping.get(options.key) === source) this.looping.delete(options.key)
      }
      source.start(0, offset / 1000, duration / 1000)
    } catch (error) {
      console.error('Audio sprite playback failed', error)
    }
  }

  sound(name: SoundName, volume?: number) {
    // Cues fired by several reels in the same moment (stops, landings) play once, not stacked.
    const now = performance.now()
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < (THROTTLE_MS[name] ?? 60)) return
    this.lastPlayed.set(name, now)
    void this.play('general_audio', soundSprites[name], { volume })
  }
  /** A cue that can be cut short later with stop(name), e.g. the Big Win bed. */
  held(name: SoundName, volume?: number) { void this.play('general_audio', soundSprites[name], { volume, key: name }) }
  stop(name: SoundName) { this.looping.get(name)?.stop() }
  voice(name: VoiceName) { void this.play('vox', voiceSprites[name], { volume: .85, voice: true }) }

  /** Decode both banks early (after the first user gesture) so the first cues are not dropped. */
  warmUp() { void this.load('general_audio'); void this.load('vox') }

  // --- game events -------------------------------------------------------------------------
  spin() { this.sound('spinButton'); this.sound('reelSpin', .5) }
  button() { this.sound('button') }
  reelStop(_col: number) { this.sound('reelStop') }
  settle() { this.sound('tilesLand') }
  scatter(_col: number) { this.sound('scatterLand') }
  /** Rising glissando at the start of every near-miss reel (4.04 s apart in the reference). */
  nearMiss() { this.sound('sparkleRise', .8) }
  /** Winners light up column by column; the original cue starts with the first column. */
  highlight(col: number) { if (col === 0) this.sound('winHighlight') }
  wild() { this.sound('wildTransform') }
  dropStart() { this.sound('dropStart', .6) }
  drop() { this.sound('tilesLand', .6) }
  multiplier(value: number) {
    this.sound('multiplierUp')
    const key = `multiplier_${value}` as VoiceName
    if (key in voiceSprites) this.voice(key)
  }
  /** FREE SPINS WON appears (#3, matched at the screen change) with the 胡 call. */
  freeSpinsWon() { this.sound('clickLong'); this.voice('hu') }
  /** START / COLLECT on the feature screens (#36, matched at both presses). */
  confirm() { this.sound('huang') }
  /** Rail relabels to the free-game multipliers (#34, matched at the flip). */
  railFlip() { this.sound('railFlip') }
  /** TOTAL WIN count-up (#4) and its end (#5), both matched against the reference. */
  totalWin() { this.sound('coinRoll') }
  totalWinEnd() { this.sound('coinRollEnd') }
  bigWin() { this.held('bigWinMain', .8) }
  bigWinEnd() { this.stop('bigWinMain'); this.sound('bigWinEnd', .8) }

  playMusic(freeMode = false) {
    this.warmUp()
    const file = freeMode ? 'bgm_bonus_loop.mp3' : 'bgm_mg.mp3'
    if (this.music?.src.endsWith(file)) {
      void this.music.play().catch(() => undefined)
      return
    }
    this.music?.pause()
    this.music = new Audio(audioUrl(file))
    this.music.loop = true
    this.music.volume = .22
    void this.music.play().catch(() => undefined)
  }
}
