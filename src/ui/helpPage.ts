import './help-page.css'

/**
 * 玩法說明 (Chinese help page) following research/MJW_Math.pdf sections 2 (Game Features),
 * 3 (Paytable / 1024 Ways) and 4.1 (Menu Controls), illustrated with the game's own art.
 */
const art = (name: string) => `${import.meta.env.BASE_URL}assets/skin/${name}.webp`

/** PDF 3.1 symbol payout (values for 5 / 4 / 3 matching reels). */
const PAYTABLE: [string, string, [number, number, number]][] = [
  ['glyph_fa', '發財', [100, 60, 15]],
  ['glyph_zhong', '紅中', [80, 40, 10]],
  ['glyph_bai', '白板', [60, 20, 8]],
  ['glyph_wan8', '八萬', [40, 15, 6]],
  ['glyph_tong5', '五筒', [20, 10, 4]],
  ['glyph_suo5', '五條', [20, 10, 4]],
  ['glyph_tong2', '二筒', [10, 5, 2]],
  ['glyph_suo2', '二條', [10, 5, 2]],
]

const tile = (glyph: string, gold = false) =>
  `<span class="hp-tile${gold ? ' gold' : ''}"><img src="${art(gold ? 'tile_gold' : 'tile_white')}" alt=""><img class="g" src="${art(glyph)}" alt=""></span>`
const wild = `<span class="hp-wild"><img class="ingot" src="${art('ingot')}" alt=""><img class="word" src="${art('text_wild')}" alt="WILD"></span>`
const hu = `<img class="hp-hu" src="${art('glyph_hu')}" alt="胡">`
const mult = (values: number[]) => `<div class="hp-mults">${values.map((v) => `<img src="${art(`mult_x${v}`)}" alt="x${v}">`).join('')}</div>`

/** 5×4 dot grid illustrating ways: `rows[col]` lists the winning rows (0–3) on each reel. */
const waysGrid = (rows: number[][], ok: boolean) => `<div class="hp-ways ${ok ? 'ok' : 'no'}">${
  Array.from({ length: 4 }, (_, row) => Array.from({ length: 5 }, (_, col) =>
    `<i class="${rows[col]?.includes(row) ? 'on' : ''}"></i>`).join('')).join('')
}</div><b class="hp-mark">${ok ? '✔' : '✘'}</b>`

const paytablePage = `
  <section>
    <h3>符號賠付</h3>
    <div class="hp-specials">
      <div>${wild}<p><b>百搭 WILD</b>可替代除了 SCATTER（胡）以外的所有符號。</p></div>
      <div>${hu}<p><b>SCATTER（胡）</b>任意位置出現 3 個即觸發免費遊戲。</p></div>
    </div>
    <div class="hp-pays">${PAYTABLE.map(([glyph, name, [p5, p4, p3]]) => `
      <div class="hp-pay">${tile(glyph)}<dl><dt>${name}</dt><dd><span>5</span>${p5}</dd><dd><span>4</span>${p4}</dd><dd><span>3</span>${p3}</dd></dl></div>`).join('')}
    </div>
    <ul class="hp-notes">
      <li>百搭符號可替代除 SCATTER 以外的所有符號。</li>
      <li>金色符號只會出現在第 2、3、4 軸。</li>
    </ul>
  </section>
  <section>
    <h3>1024 種中獎方式</h3>
    <ul class="hp-notes">
      <li>相同符號必須從最左邊的轉軸開始，在相鄰轉軸連續出現才算中獎。</li>
    </ul>
    <div class="hp-ways-row">${waysGrid([[0], [0, 1, 2], [1, 2]], true)}${waysGrid([[0], [], [1, 2]], false)}</div>
    <ul class="hp-notes">
      <li>每個符號的中獎路數 = 從最左軸起，各相鄰轉軸上該符號（含百搭）數量相乘。</li>
    </ul>
    <p class="hp-example">上圖例子：1 × 3 × 2 = <b>6</b> 路</p>
    <ul class="hp-notes">
      <li>中獎符號的賠付會再乘上中獎路數。</li>
    </ul>
    <p class="hp-example">若該符號 3 軸賠付為 10：總贏分 = 10 × 6 = <b>60</b></p>
    <ul class="hp-notes">
      <li>每一輪派彩後，所有中獎符號會爆開消除，上方符號落下補位，開始新的一輪。</li>
      <li>只要還有新的中獎組合就會繼續計算，直到沒有新的中獎為止。</li>
      <li>所有贏分以投注金額計算（表中數值以基本投注 20 為單位）。</li>
    </ul>
  </section>`

const featuresPage = `
  <section>
    <h3>百搭與 SCATTER</h3>
    <div class="hp-specials">
      <div>${wild}<p>百搭可替代除了 SCATTER 以外的所有符號。</p></div>
      <div>${tile('glyph_fa', true)}<p>金色符號只會出現在第 2、3、4 軸。</p></div>
    </div>
  </section>
  <section>
    <h3>金色符號</h3>
    <div class="hp-flow">${tile('glyph_zhong', true)}<span>→</span>${wild}</div>
    <p>任何一局中，第 2、3 或 4 軸上的部分符號（百搭與 SCATTER 除外）可能以金色出現。</p>
    <p>參與中獎的金色符號與一般符號相同計算，消除後會原地變成百搭符號，再隨轉軸落下；百搭只有在參與中獎時才會被消除。</p>
  </section>
  <section>
    <h3>倍數</h3>
    ${mult([1, 2, 3, 5])}
    <p>每一局的所有贏分都會乘上轉軸上方顯示的倍數，第一輪從 x1 開始。</p>
    <ul class="hp-notes">
      <li>第一輪有中獎，第二輪倍數提升為 x2。</li>
      <li>第二輪有中獎，第三輪倍數提升為 x3。</li>
      <li>第三輪有中獎，第四輪（及之後）倍數提升為 x5。</li>
    </ul>
  </section>
  <section>
    <h3>免費遊戲</h3>
    <div class="hp-flow">${hu}${hu}${hu}<span>=</span><b class="hp-big">12</b><small>次免費遊戲</small></div>
    <p>任意位置出現 3 個 SCATTER 即觸發 12 次免費遊戲，每多 1 個 SCATTER 再多 2 次。</p>
    <p>免費遊戲中，轉軸上方的倍數會提升為 x2、x4、x6、x10：</p>
    ${mult([2, 4, 6, 10])}
    <p>免費遊戲中可以再次觸發免費遊戲。</p>
  </section>`

/** PDF 4.1; controls this demo does not have yet are marked rather than omitted. */
const TODO = '<em class="hp-todo">（Demo 尚未提供）</em>'
const controlsPage = `
  <section>
    <h3>選單按鈕</h3>
    <div class="hp-controls">
      <div><img class="hp-icon spin" src="${art('spin_round')}" alt=""><img class="hp-icon spin-arrows" src="${art('spin_arrows')}" alt=""><dl><dt>旋轉 SPIN</dt>
        <dd>以目前投注金額開始旋轉。</dd><dd>旋轉中再點按鈕或遊戲畫面，可讓轉軸立即停止。</dd>
        <dd>電腦版：按空白鍵開始旋轉；按住空白鍵會持續旋轉直到放開。${TODO}</dd></dl></div>
      <div><img class="hp-icon" src="${art('spin_idle')}" alt=""><dl><dt>停止 STOP</dt>
        <dd>點擊停止自動旋轉；按鈕上的數字為自動旋轉剩餘次數。</dd></dl></div>
      <div><span class="hp-icon sym">−</span><dl><dt>減少</dt><dd>降低投注金額。</dd></dl></div>
      <div><img class="hp-icon small" src="${art('icon_plus')}" alt=""><dl><dt>增加</dt><dd>提高投注金額。</dd></dl></div>
      <div><span class="hp-icon sym">¥</span><dl><dt>餘額</dt><dd>顯示目前可用餘額。</dd></dl></div>
      <div><span class="hp-icon sym">$</span><dl><dt>投注金額</dt><dd>點擊開啟投注選項：投注大小、投注等級、投注金額、最大投注。${TODO}</dd></dl></div>
      <div><span class="hp-icon sym">W</span><dl><dt>贏分</dt><dd>點擊顯示遊戲紀錄。${TODO}</dd></dl></div>
      <div><img class="hp-icon small" src="${art('icon_play')}" alt=""><dl><dt>自動旋轉 AUTO</dt>
        <dd>依選擇的次數自動進行遊戲。</dd>
        <dd>可設定：餘額減少超過指定值、餘額增加超過指定值、單次贏分超過指定值時自動停止。${TODO}</dd></dl></div>
      <div><img class="hp-icon" src="${art('icon_turbo_off')}" alt=""><dl><dt>快速旋轉 TURBO</dt><dd>開啟或關閉快速旋轉，縮短轉軸旋轉時間。</dd></dl></div>
      <div><span class="hp-icon sym">♪</span><dl><dt>音效</dt><dd>開啟或關閉聲音。${TODO}</dd></dl></div>
      <div><span class="hp-icon sym">?</span><dl><dt>賠付表／規則</dt><dd>顯示中獎組合、賠付表、遊戲規則與按鈕說明（本頁）。</dd></dl></div>
      <div><span class="hp-icon sym">≡</span><dl><dt>紀錄／更多設定</dt><dd>查看過去的遊戲紀錄、選擇日期；其他設定。${TODO}</dd></dl></div>
      <div><span class="hp-icon sym">×</span><dl><dt>關閉</dt><dd>回到主遊戲。</dd></dl></div>
    </div>
  </section>`

export function createHelpPage() {
  const modal = document.createElement('section')
  modal.className = 'help-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-label', '玩法說明')
  modal.innerHTML = `
    <div class="help-dialog">
      <header><h2>玩法說明</h2><button class="help-close" type="button" aria-label="關閉">×</button></header>
      <nav class="help-tabs">
        <button type="button" class="active" data-tab="pay">賠付表</button>
        <button type="button" data-tab="feature">遊戲特色</button>
        <button type="button" data-tab="control">按鈕說明</button>
      </nav>
      <div class="help-body">
        <article class="active" data-page="pay">${paytablePage}</article>
        <article data-page="feature">${featuresPage}</article>
        <article data-page="control">${controlsPage}</article>
      </div>
    </div>`
  document.body.appendChild(modal)
  const body = modal.querySelector<HTMLElement>('.help-body')!
  const close = () => modal.classList.remove('open')
  modal.querySelector('.help-close')!.addEventListener('click', close)
  modal.addEventListener('click', (event) => { if (event.target === modal) close() })
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close() })
  modal.querySelectorAll<HTMLButtonElement>('.help-tabs button').forEach((tab) => tab.addEventListener('click', () => {
    modal.querySelectorAll('.help-tabs button').forEach((item) => item.classList.toggle('active', item === tab))
    modal.querySelectorAll<HTMLElement>('.help-body article').forEach((page) => page.classList.toggle('active', page.dataset.page === tab.dataset.tab))
    body.scrollTop = 0
  }))
  return { open: () => modal.classList.add('open'), close }
}
