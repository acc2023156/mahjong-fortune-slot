import { Container, Graphics, Text } from 'pixi.js'

function money(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export class StatusPanel extends Container {
  private readonly creditValue: Text
  private readonly betValue: Text
  private readonly winValue: Text

  constructor() {
    super()
    this.addChild(new Graphics().roundRect(0, 0, 398, 58, 12).fill({ color: '#5b241d', alpha: 0.96 }).stroke({ color: '#d6793f', width: 2 }))
    this.creditValue = this.createMetric('CREDIT', 66)
    this.betValue = this.createMetric('BET', 199)
    this.winValue = this.createMetric('WIN', 332)
    this.setValues(1000, 10, 0)
  }

  private createMetric(name: string, centerX: number) {
    const heading = new Text({ text: name, style: { fontFamily: 'Arial', fontSize: 10, fontWeight: '700', fill: '#f6c98f', letterSpacing: 1 } })
    heading.anchor.set(0.5)
    heading.position.set(centerX, 14)
    this.addChild(heading)
    const value = new Text({ text: '', style: { fontFamily: 'Arial', fontSize: 17, fontWeight: '800', fill: '#ffffff' } })
    value.anchor.set(0.5)
    value.position.set(centerX, 37)
    this.addChild(value)
    return value
  }

  setValues(credit: number, bet: number, win: number) {
    this.creditValue.text = money(credit)
    this.betValue.text = money(bet)
    this.winValue.text = money(win)
  }
}
