import { Assets, Container, Sprite, Texture } from 'pixi.js'
import type { SymbolId } from './config'

// Sprites sliced from the reference atlases by scripts/extract-skin.py.
// Core textures block the first frame; everything else streams in after the board is visible.
const CORE_NAMES = [
  'tile_white', 'tile_gold', 'ingot', 'glyph_fa', 'glyph_zhong', 'glyph_bai', 'glyph_wan8', 'glyph_tong5',
  'glyph_suo5', 'glyph_tong2', 'glyph_suo2', 'glyph_hu', 'text_wild',
  'spin_idle', 'spin_round', 'spin_arrows', 'plaque_win', 'plaque_green',
  'header_red', 'panel_wood', 'bar_ways', 'bar_mult', 'felt',
  'mult_x1', 'mult_x2', 'mult_x3', 'mult_x4', 'mult_x5', 'mult_x6', 'mult_x10',
  'msg_scatter', 'msg_ways', 'msg_free_x10', 'msg_gold', 'msg_x5', 'title_ways', 'label_win', 'label_total_win',
  'coin', 'coin_side', 'star',
  'icon_turbo_off', 'icon_turbo_on', 'icon_plus', 'icon_play',
] as const
/** Only used by the Free Spins / Total Win / Big Win screens (the largest images). */
const DEFERRED_NAMES = [
  'title_total_win', 'btn_collect', 'label_remaining', 'label_last_free', 'title_free_won', 'label_start',
  'label_doubled', 'title_big_win', 'title_mega_win', 'title_super_mega_win', 'coin_mound', 'flying_tiles',
] as const
const SKIN_NAMES = [...CORE_NAMES, ...DEFERRED_NAMES] as const

const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', 'dot'] as const

/** Effect frame sequences from the reference atlases, in playback order. */
const SEQUENCE_LENGTHS = { turn: 6, burst: 9, coinspin: 8, tilefx: 8, hl: 3, hufx: 4, nearmiss: 5, nmflare: 1, goldturn: 7 } as const
/** Feature-screen (Big Win / Free Spins / Total Win) art from the reference sheets; streamed after start-up. */
const DEFERRED_SEQUENCE_LENGTHS = {
  bwpile: 3, bwlight: 3, rays: 1, fsui: 2, flycoin: 10, fsbg: 1, fsglow: 1, fsgold: 2,
} as const

export type SkinName = (typeof SKIN_NAMES)[number]
export type DigitKey = (typeof DIGIT_KEYS)[number]
export type SequenceName = keyof typeof SEQUENCE_LENGTHS | keyof typeof DEFERRED_SEQUENCE_LENGTHS

type Skin = Record<SkinName, Texture> & {
  digits: Record<'gold' | 'silver', Record<DigitKey, Texture>>
  frames: Record<SequenceName, Texture[]>
}

let loaded: Skin | undefined

export const skinUrl = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`
/**
 * UI language for the text sprites. Simplified Chinese (asset pack zh/ art, sliced into
 * skin/zh/) is the default; `?lang=en` shows the original English art.
 */
export const LANG: 'zh' | 'en' = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh'
const ZH_NAMES = new Set([
  'title_ways', 'msg_x5', 'msg_ways', 'msg_scatter', 'msg_gold', 'msg_free_x10', 'label_total_win', 'label_win',
  'label_remaining', 'label_last_free', 'title_total_win', 'btn_collect', 'title_big_win', 'title_mega_win',
  'title_super_mega_win', 'title_free_won', 'label_doubled', 'label_start', 'text_wild',
])
/** Game textures ship as WebP (~72% smaller than the PNG sources in the same folder). */
const skinFile = (file: string) => skinUrl(`skin/${LANG === 'zh' && ZH_NAMES.has(file) ? 'zh/' : ''}${file}.webp`)

/**
 * Loads one texture, retrying transient network failures (slow CDN routes drop requests)
 * instead of failing the whole start-up. Retries use a distinct URL so a failed attempt
 * is not served back from Pixi's asset cache.
 */
async function loadTexture(file: string, attempts = 3): Promise<Texture> {
  for (let attempt = 0; ; attempt++) {
    try {
      const url = skinFile(file)
      return await Assets.load<Texture>(attempt === 0 ? url : { src: url, alias: `${url}#retry${attempt}` })
    } catch (error) {
      if (attempt + 1 >= attempts) throw error
      await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)))
    }
  }
}

/** Every media URL the game needs, for seeding the client cache (see public/sw.js). */
export function skinUrls() {
  const sequences = Object.entries({ ...SEQUENCE_LENGTHS, ...DEFERRED_SEQUENCE_LENGTHS }) as [SequenceName, number][]
  return [
    ...SKIN_NAMES.map((name) => skinFile(name)),
    ...(['gold', 'silver'] as const).flatMap((tint) => DIGIT_KEYS.map((key) => skinFile(`digit_${tint}_${key}`))),
    ...sequences.flatMap(([name, length]) => Array.from({ length }, (_, index) => skinFile(`${name}_${index}`))),
  ]
}

let deferred: Promise<void> | undefined

/** Loads the core skin (everything the base game shows); `onProgress` receives 0..1. */
export async function loadSkin(onProgress?: (progress: number) => void) {
  const sequences = Object.entries(SEQUENCE_LENGTHS) as [SequenceName, number][]
  const total = CORE_NAMES.length + DIGIT_KEYS.length * 2 + sequences.reduce((sum, [, length]) => sum + length, 0)
  let done = 0
  const load = async (file: string) => {
    const texture = await loadTexture(file)
    onProgress?.(++done / total)
    return texture
  }
  const digits = { gold: {}, silver: {} } as Skin['digits']
  const frames = {} as Skin['frames']
  const [entries] = await Promise.all([
    Promise.all(CORE_NAMES.map(async (name) => [name, await load(name)] as const)),
    ...(['gold', 'silver'] as const).flatMap((tint) => DIGIT_KEYS.map(async (key) => {
      digits[tint][key] = await load(`digit_${tint}_${key}`)
    })),
    ...sequences.map(async ([name, length]) => {
      frames[name] = await Promise.all(Array.from({ length }, (_, index) => load(`${name}_${index}`)))
    }),
  ])
  loaded = { ...Object.fromEntries(entries), digits, frames } as Skin
  return loaded
}

/** Streams the feature-screen textures in the background; safe to call repeatedly. */
export function loadDeferredSkin() {
  deferred ??= Promise.all([
    ...DEFERRED_NAMES.map(async (name) => {
      skin()[name] = await loadTexture(name)
    }),
    ...(Object.entries(DEFERRED_SEQUENCE_LENGTHS) as [SequenceName, number][]).map(async ([name, length]) => {
      skin().frames[name] = await Promise.all(Array.from({ length }, (_, index) => loadTexture(`${name}_${index}`)))
    }),
  ]).then(() => undefined)
  deferred.catch(() => { deferred = undefined })
  return deferred
}

/** Runs `show` once the feature-screen textures are present (usually immediately). */
export function whenDeferredReady(show: () => void) {
  void loadDeferredSkin().then(show, (error) => { console.error('Deferred skin failed', error); show() })
}

export function skin(): Skin {
  if (!loaded) throw new Error('Skin textures used before loadSkin() resolved')
  return loaded
}

let softGlow: Texture | undefined
/** Round soft white glow (radial gradient), generated once; tint it for coloured halos. */
export function softGlowTexture() {
  if (!softGlow) {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(.35, 'rgba(255,255,255,.55)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    softGlow = Texture.from(canvas)
  }
  return softGlow
}

let dotTexture: Texture | undefined
/** Solid round dot with a soft rim (gold dust particles); tint for colour. */
export function dustDotTexture() {
  if (!dotTexture) {
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(.6, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    dotTexture = Texture.from(canvas)
  }
  return dotTexture
}

/** Sprite scaled to fit width (and optionally height), anchored at centre. */
export function skinSprite(name: SkinName, width?: number, height?: number) {
  const sprite = new Sprite(skin()[name])
  sprite.anchor.set(.5)
  if (width !== undefined && height !== undefined) sprite.setSize(width, height)
  else if (width !== undefined) sprite.scale.set(width / sprite.texture.width)
  else if (height !== undefined) sprite.scale.set(height / sprite.texture.height)
  return sprite
}

export const GLYPHS: Record<Exclude<SymbolId, 'wild'>, SkinName> = {
  scatter: 'glyph_hu', fa: 'glyph_fa', zhong: 'glyph_zhong', bai: 'glyph_bai', wan8: 'glyph_wan8',
  tong5: 'glyph_tong5', suo5: 'glyph_suo5', tong2: 'glyph_tong2', suo2: 'glyph_suo2',
}

/** Sprite-font number (gold or silver digits from the reference atlas), centred on its origin. */
export class SpriteNumber extends Container {
  private current = ''
  private readonly glyphHeight: number
  private readonly digitTint: 'gold' | 'silver'

  constructor(glyphHeight: number, digitTint: 'gold' | 'silver' = 'gold') {
    super()
    this.glyphHeight = glyphHeight
    this.digitTint = digitTint
  }

  set text(value: string) {
    if (value === this.current) return
    this.current = value
    this.removeChildren().forEach((child) => child.destroy())
    const digits = skin().digits[this.digitTint]
    const scale = this.glyphHeight / 62
    let x = 0
    for (const char of value) {
      if (char === ',') continue
      const key = (char === '.' ? 'dot' : char.toLowerCase()) as DigitKey
      const texture = digits[key]
      if (!texture) { x += 16 * scale; continue }
      const sprite = new Sprite(texture)
      sprite.scale.set(scale)
      sprite.position.set(x, -this.glyphHeight / 2)
      this.addChild(sprite)
      x += texture.width * scale * (key === 'dot' ? 1 : .86)
    }
    for (const child of this.children) child.x -= x / 2
  }

  get text() { return this.current }
}
