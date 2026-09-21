const featureTitles: Record<string, string> = {
  lucky: 'LUCKY WHEEL', buy: 'BUY FEATURE', campaign: 'REWARD STORE',
  coupon: 'COUPON', ranking: 'LEADERBOARD', vip: 'VIP PRIVILEGE',
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing feature-center element: ${selector}`)
  return element
}

export function createFeatureCenter(gameMount: HTMLElement) {
  const entry = document.createElement('button')
  entry.className = 'feature-entry'
  entry.type = 'button'
  entry.setAttribute('aria-label', 'Open feature center')
  entry.title = 'Feature Center'
  entry.textContent = '☰'
  gameMount.appendChild(entry)

  const modal = document.createElement('section')
  modal.className = 'feature-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-labelledby', 'featureTitle')
  modal.innerHTML = `
    <div class="feature-dialog">
      <button class="feature-close" type="button" aria-label="Close feature center">×</button>
      <h2 class="feature-title" id="featureTitle">LUCKY WHEEL</h2>
      <nav class="feature-nav" aria-label="Feature center sections">
        <button class="feature-tab active" data-feature="lucky" title="Lucky Wheel"><span>◉</span></button>
        <button class="feature-tab" data-feature="buy" title="Buy Feature"><span>🛒</span></button>
        <button class="feature-tab" data-feature="campaign" title="Reward Store"><span>🎁</span></button>
        <button class="feature-tab" data-feature="coupon" title="Coupon"><span>🎟</span></button>
        <button class="feature-tab" data-feature="ranking" title="Leaderboard"><span>♟</span></button>
        <button class="feature-tab" data-feature="vip" title="VIP"><span>♛</span></button>
      </nav>
      <div class="feature-pages">
        <article class="feature-page active integrated-wheel" data-feature-page="lucky">
          <div class="integrated-ticket"><b>🎟 LUCKY WHEEL TICKET</b><span>0　▤</span></div>
          <div class="wheel-stage"><div class="wheel-pointer">▼</div><div class="lucky-wheel">
            <span class="wheel-label l1">Rp 80K</span><span class="wheel-label l2">Rp 40K</span><span class="wheel-label l3">RESPIN</span><span class="wheel-label l4">Rp 120K</span>
            <span class="wheel-label l5">Rp 20K</span><span class="wheel-label l6">Rp 200K</span><span class="wheel-label l7">Rp 30K</span><span class="wheel-label l8">Rp 50K</span>
            <button class="wheel-spin" type="button">SPIN</button></div><p class="wheel-result">Press SPIN to try your luck</p></div>
        </article>
        <article class="feature-page" data-feature-page="buy">
          <div class="bet-stepper"><button class="feature-bet-minus" type="button">−</button><strong class="feature-bet-value">Rp 3.000</strong><button class="feature-bet-plus" type="button">＋</button></div>
          <div class="buy-cards">
            <div class="buy-card"><span class="buy-art">🚀</span><h3>Double Win Chance</h3><strong>Rp 3.600 <small>/SPIN</small></strong><em>Boost Your Chance!</em><button class="buy-action" type="button">OFF　⚪</button></div>
            <div class="buy-card"><span class="buy-art">💥</span><h3>Free Games</h3><strong>Rp 300.000</strong><button class="buy-action" type="button">BUY</button></div>
            <div class="buy-card"><span class="buy-art">⚡</span><h3>Super Free Games</h3><strong>Rp 900.000</strong><button class="buy-action" type="button">BUY</button></div>
          </div>
        </article>
        <article class="feature-page reward-page" data-feature-page="campaign">
          <div class="reward-head"><b>Ⓡ　REWARD POINT</b><strong>0.000　▤</strong></div>
          <div class="reward-grid">${rewardCards()}</div>
        </article>
        <article class="feature-page" data-feature-page="coupon">
          <div class="coupon-box"><div class="coupon-icon">🎟️</div><input class="coupon-input" placeholder="Enter promo code"><button class="redeem" type="button">REDEEM</button><div class="coupon-foot">Join now to unlock more bonuses!</div></div>
        </article>
        <article class="feature-page" data-feature-page="ranking">
          <div class="rank-filters"><button class="active" type="button">CURRENT GAME</button><button type="button">ALL GAMES</button></div>
          <table class="rank-table"><thead><tr><th>#</th><th>GAME</th><th>MULT.</th><th>PRIZE</th><th>SPIN</th></tr></thead><tbody>
            <tr><td class="rank-num">🥇</td><td>Mahjong Fortune 3</td><td>29,106x</td><td>Rp11,642.400</td><td>2</td></tr>
            <tr><td class="rank-num">🥈</td><td>Mahjong Fortune 3</td><td>28,304x</td><td>Rp9,657.600</td><td>394</td></tr>
            <tr><td class="rank-num">🥉</td><td>Mahjong Fortune 3</td><td>27,312x</td><td>Rp8,387.776</td><td>354</td></tr>
            <tr><td>4</td><td>Mahjong Fortune 3</td><td>27,262x</td><td>Rp10,905.184</td><td>454</td></tr>
            <tr><td>5</td><td>Mahjong Fortune 3</td><td>27,025x</td><td>Rp10,810.000</td><td>29</td></tr>
          </tbody></table>
        </article>
        <article class="feature-page" data-feature-page="vip">
          <div class="vip-wrap"><div class="vip-head"><span class="active">PRIVILEGE</span><span>GUIDELINE</span></div><div class="vip-card"><span class="vip-badge">♛</span><b>YOUR LEVEL<br>CASUAL</b><p>EXP　0 / 2,000,000</p><small>VIP Duration: Permanent</small></div><h3>VIP Privilege</h3><ul class="vip-list"><li>VIP Duration: Permanent</li><li>Daily Slot Rebate: –</li><li>Store: Partially Available</li><li>Lucky Wheel Spin: –</li></ul><div class="vip-months">2026 VipYear<br>JAN. FEB. MAR. APR. MAY. JUN.</div></div>
        </article>
      </div>
    </div>`
  document.body.appendChild(modal)

  const closeButton = required<HTMLButtonElement>(modal, '.feature-close')
  const title = required<HTMLElement>(modal, '.feature-title')
  const open = () => { modal.classList.add('open'); closeButton.focus() }
  const close = () => { modal.classList.remove('open'); entry.focus() }
  entry.addEventListener('click', open)
  closeButton.addEventListener('click', close)
  modal.addEventListener('click', event => { if (event.target === modal) close() })
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('open')) close() })

  modal.querySelectorAll<HTMLButtonElement>('.feature-tab').forEach(tab => tab.addEventListener('click', () => {
    const feature = tab.dataset.feature ?? 'lucky'
    modal.querySelectorAll('.feature-tab').forEach(item => item.classList.toggle('active', item === tab))
    modal.querySelectorAll<HTMLElement>('.feature-page').forEach(page => page.classList.toggle('active', page.dataset.featurePage === feature))
    title.textContent = featureTitles[feature]
  }))

  let bet = 3000
  const betValue = required<HTMLElement>(modal, '.feature-bet-value')
  const showBet = () => { betValue.textContent = `Rp ${bet.toLocaleString('id-ID')}` }
  required(modal, '.feature-bet-minus').addEventListener('click', () => { bet = Math.max(1000, bet - 1000); showBet() })
  required(modal, '.feature-bet-plus').addEventListener('click', () => { bet = Math.min(10000, bet + 1000); showBet() })

  const couponInput = required<HTMLInputElement>(modal, '.coupon-input')
  const couponFoot = required<HTMLElement>(modal, '.coupon-foot')
  required(modal, '.redeem').addEventListener('click', () => { couponFoot.textContent = couponInput.value.trim() ? 'Promo code is being checked.' : 'Please enter a promo code first.' })
  modal.querySelectorAll<HTMLButtonElement>('.rank-filters button').forEach(button => button.addEventListener('click', () => modal.querySelectorAll('.rank-filters button').forEach(item => item.classList.toggle('active', item === button))))

  const wheel = required<HTMLElement>(modal, '.lucky-wheel')
  const wheelResult = required<HTMLElement>(modal, '.wheel-result')
  let wheelBusy = false
  let wheelRotation = 0
  required(modal, '.wheel-spin').addEventListener('click', () => {
    if (wheelBusy) return
    wheelBusy = true
    wheelResult.textContent = 'Spinning...'
    wheelRotation += 1440 + Math.floor(Math.random() * 360)
    wheel.style.transform = `rotate(${wheelRotation}deg)`
    window.setTimeout(() => {
      const rewards = ['Rp 20,000', 'Rp 30,000', 'Rp 40,000', 'Rp 80,000', 'Rp 120,000', 'RESPIN']
      wheelResult.textContent = `Result: ${rewards[Math.floor(Math.random() * rewards.length)]}`
      wheelBusy = false
    }, 3600)
  })
}

function rewardCards() {
  const levels = ['AVAILABLE', 'BRONZE', 'BRONZE', 'BRONZE', 'SILVER', 'SILVER', 'SILVER', 'GOLD', 'GOLD']
  const points = ['200.000', '400.000', '800.000', '1,200.000', '1,800.000', '2,500.000', '3,200.000', '4,000.000', '5,000.000']
  return levels.map((level, index) => `<button class="reward-ticket ${index ? 'locked' : 'available'}" type="button" ${index ? 'disabled' : ''}>${index ? '<span>▣</span>' : ''}<span class="ticket-art">FREE<br>GAME</span><strong>${index ? `Reach VIP level ${level} to unlock` : 'Rp 0.200 Free Game'}</strong><em>Ⓡ ${points[index]}</em></button>`).join('')
}
