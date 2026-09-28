export const GAME_WIDTH = 430
export const GAME_HEIGHT = 932
export const REEL_COLUMNS = 5
export const REEL_ROWS = 5

export const SYMBOLS = ['中', '發', '萬', '筒', '索', '東'] as const
export type SymbolId = (typeof SYMBOLS)[number]

export const SYMBOL_COLORS: Record<SymbolId, string> = {
  中: '#d92f2f',
  發: '#16864c',
  萬: '#343aaa',
  筒: '#7d46a8',
  索: '#238b55',
  東: '#c67618',
}

export const SYMBOL_PAYS: Record<SymbolId, number> = {
  中: 20,
  發: 15,
  萬: 10,
  筒: 8,
  索: 6,
  東: 4,
}

export function randomSymbol(): SymbolId {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
}
