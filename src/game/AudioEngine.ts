import { soundSprites, voiceSprites, type SoundName, type VoiceName } from './audioSprites'
import type { PayingSymbolId } from './config'

/** VOX_0930 sheet: which call to make for a winning line of each tile. */
const CARD_CALLS: Record<PayingSymbolId, VoiceName> = {
  suo2: 'bamboo_two', tong2: 'dots_two', suo5: 'bamboo_five', tong5: 'dots_five',
  wan8: 'eight', bai: 'white', fa: 'green_dragon', zhong: 'red_dragon',
}

/** VOX_0930 sheet: idle lines, played this many seconds after the last spin stopped. */
export const IDLE_LINES: readonly [number, VoiceName][] = [
  [8, 'look_cards'], [16, 'hurry'], [24, 'request_eat'], [32, 'taunt'], [40, 'ready_hand'],
  [48, 'hurry_dialect'], [56, 'self_draw'], [64, 'comment_dialect'], [70, 'joke_dialect'],
  [78, 'long_taunt'], [86, 'final_taunt'],
]

type Bank = 'general_audio' | 'vox'

const audioUrl = (file: string) => `${import.meta.env.BASE_URL}assets/pgsoft-reference/audio/audio/mp3/${file}`

/** Minimum gap between repeats of one cue; the reference plays one landing cue per settle. */
const THROTTLE_MS: Partial<Record<SoundName, number>> = { reelStop: 70, turboStop: 250, tileClear: 400 }

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
  private wildFemale = true

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

  // --- game events (research/VOX_0930.xlsx) ---------------------------------------------
  spin() { this.sound('spinButton'); this.sound('reelSpin', .5) }
  button() { this.sound('button') }
  uiClick() { this.sound('uiClick') }
  reelStop(_col: number) { this.sound('reelStop') }
  turboStop() { this.sound('turboStop') }
  scatter(_col: number) { this.sound('scatterLand') }
  nearMiss() { this.sound('nearMiss', .8) }
  /** Winners light up (column 0 first): turn-into-coins cue, the WILD variant when a WILD wins. */
  highlight(col: number, wild: boolean) { if (col === 0) this.sound(wild ? 'wildWinTurn' : 'winTurn') }
  tileClear() { this.sound('tileClear') }
  /** Rail step cue by level (#19/#20/#21) plus the spoken multiplier. */
  multiplier(value: number, level: 1 | 2 | 3) {
    this.sound(level === 1 ? 'multiplier1' : level === 2 ? 'multiplier2' : 'multiplier3')
    const key = `multiplier_${value}` as VoiceName
    if (key in voiceSprites) this.voice(key)
  }
  /** Rail step cue only (free-game opening relabel, no spoken multiplier). */
  railStep(level: 1 | 2 | 3) { this.sound(level === 1 ? 'multiplier1' : level === 2 ? 'multiplier2' : 'multiplier3') }
  /** Winning line call (VOX #8–15): the best-paying symbol of the cascade is announced. */
  cardCall(symbol: PayingSymbolId) { this.voice(CARD_CALLS[symbol]) }
  /** WILD took part in a win (VOX #16/#17): female and male "全中" take turns. */
  wildCall() {
    this.voice(this.wildFemale ? 'all_match_female' : 'all_match_male')
    this.wildFemale = !this.wildFemale
  }
  freeSpinsWon() { this.voice('hu') }
  freeCount(last: boolean) { this.sound(last ? 'freeCountLast' : 'freeCount') }
  totalWin() { this.sound('countRoll') }
  totalWinEnd() { this.sound('countEnd') }
  collect() { this.sound('collect') }
  bigWin() { this.sound('bigWinAppear', .8); this.held('bigWinMain', .8) }
  bigWinEnd() { this.stop('bigWinMain'); this.sound('bigWinEnd', .8) }
  bigWinReturn() { this.sound('bigWinReturn') }

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
