export class AudioEngine {
  private context?: AudioContext

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

  win(multiplier: number) {
    const notes = multiplier >= 10 ? [523, 659, 784, 1047] : [523, 659, 784]
    notes.forEach((frequency, index) => this.tone(frequency, 0.3, 'sine', 0.055, index * 0.11))
  }
}
