import { Container, Graphics, Text } from 'pixi.js'

function money(value: number) {
  return `¥${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Three dark pills (balance / win / bet) matching the reference info row.
export class StatusPanel extends Container {
  private readonly creditValue: Text
  private readonly betValue: Text
  private readonly winValue: Text

  constructor() {
    super()
    this.creditValue = this.createMetric('', 8, 128)
    this.winValue = this.createMetric('WIN', 151, 128)
    this.betValue = this.createMetric('', 294, 128)
    this.setValues(1000, 10, 0)
  }

  private createMetric(name: string, x: number, width: number) {
    this.addChild(new Graphics().roundRect(x, 0, width, 30, 15).fill({ color: '#1b0a06', alpha: .55 }))
    if (name) {
      const heading = new Text({ text: name, style: { fontFamily: 'Arial', fontSize: 8, fontWeight: '700', fill: '#c9a47a' } })
      heading.anchor.set(0.5)
      heading.position.set(x + width / 2, 6)
      this.addChild(heading)
    }
    const value = new Text({ text: '', style: { fontFamily: 'Arial', fontSize: 13, fontWeight: '700', fill: '#f4e3cf' } })
    value.anchor.set(0.5)
    value.position.set(x + width / 2, name ? 18 : 15)
    this.addChild(value)
    return value
  }

  setValues(credit: number, bet: number, win: number) {
    this.creditValue.text = money(credit)
    this.betValue.text = money(bet)
    this.winValue.text = money(win)
  }
}
