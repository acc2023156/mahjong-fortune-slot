/** Small deterministic PRNG for reproducible simulations. Not suitable for production wagering. */
export function createRng(seed = 0x6d2b79f5) {
  let state = Number(seed) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
