# 客戶端緩存規劃（大廳＋各遊戲）

所有 Demo 都在同一個網域 `acc2023156.github.io` 底下，只是路徑不同
（`/Boss88VIP/`、`/MJW/`、`/Crash/`、`/HomeRun/`、`/MINES/`、`/Dice/`、`/PaiGowTiles/`…）。
同網域代表 **Cache Storage 是共用的**，Service Worker 則依路徑各管各的範圍（scope）。

## 1. 共同規則

| 項目 | 規則 |
|---|---|
| 快取命名 | `<遊戲代號>-<種類>-<版本>`，例如 `mjw-media-2026-09-28`、`lobby-shell-v3` |
| 清除舊版 | 每個 Service Worker 只刪自己前綴的快取，**絕不刪別的遊戲的** |
| 版本號 | 每款遊戲一個 `ASSET_VERSION`；圖片、音效重產或覆蓋時才加版號 |
| HTML | 走網路（network-first），部署後立即生效 |
| 打包後的 JS/CSS | 檔名已含 hash，交給瀏覽器 HTTP 快取即可 |
| 圖片、音效 | cache-first；版號變了才重抓 |
| 音樂串流（Range 請求） | 不攔截，交給瀏覽器 |
| 分段載入 | 第一段：進遊戲畫面必要的素材；第二段：畫面出現後背景載入的大獎／特殊畫面素材 |

## 2. 麻將胡了（MJW）— 已完成

- `public/sw.js`：`assets/skin/`、`assets/pgsoft-reference/` 採 cache-first，快取名稱 `mjw-media-<ASSET_VERSION>`。
- `src/game/assetVersion.ts`：素材版號。重跑 `scripts/extract-skin.py` 或換音檔後要加版號。
- 第一段載入：盤面、介面、特效序列（約 100 張）。第二段：Free Spins／TOTAL WIN／Big Win 畫面素材（12 張，含最大的 `coin_mound`、`flying_tiles`），在遊戲畫面出現後背景下載；萬一還沒下載完就觸發大獎，會等素材到齊才顯示。
- 第一次進入時 Service Worker 還沒接管頁面，所以頁面載完後會主動把已下載的素材寫進同一個快取，第二次進入就全部命中快取。
- 實測：命中快取的圖片 2ms。

### 之後可做（依效益排序）
1. **圖片格式**：`felt.png`（755KB）、`coin_mound`（752KB）、`panel_wood`、`header_red` 本來是照片質感，改成 JPG／WebP 可縮小 80–90%。
2. **合併 atlas**（已說好之後再做）：約 115 個小檔合成少數幾張 atlas，減少請求數。
3. **音效**：`general_audio.mp3`（1.1MB）第一次點擊時才下載，可以改在第二段先抓。

## 3. 大廳（Boss88VIP）

- 自己一個 Service Worker，scope 為 `/Boss88VIP/`，快取前綴 `lobby-`。
- `lobby-shell-<版號>`：大廳 HTML 用 network-first（離線時回退到快取）；CSS／JS／字型用 cache-first。
- `lobby-thumbs-<版號>`：遊戲縮圖（例如 `mahjong_fortune_TCH.png`）採 stale-while-revalidate：先顯示快取，背景再更新。
- **預熱遊戲**（共用網域的好處）：各遊戲提供一份清單，例如 `/MJW/asset-manifest.json`，內容為 `{ version, core: [...] }`。玩家按下遊戲縮圖（或縮圖出現在畫面上時），大廳就把該遊戲的第一段素材預先寫進 `mjw-media-<version>`，點進遊戲時幾乎立即載入。只預熱第一段，避免浪費流量。

## 4. 其他遊戲（Crash、HomeRun、MINES、Dice、PaiGowTiles、plinko、seth-slot…）

每款套用同一個模板：
1. 複製 `sw.js`，把前綴改成遊戲代號（`crash-`、`homerun-`…）、媒體路徑改成該遊戲的素材資料夾。
2. 加 `assetVersion.ts`＋註冊程式（只在 production 註冊）。
3. 把素材分成第一段／第二段；有大獎或特殊畫面的遊戲，把那部分放第二段。
4. 輸出 `asset-manifest.json` 給大廳預熱用。

## 5. 驗收方式

- DevTools → Application → Cache Storage：看到 `<遊戲>-media-<版號>`，第二次進入 Network 面板顯示 `(ServiceWorker)`。
- 加版號後重新整理：舊快取消失、新快取建立。
- 不同遊戲的快取互不影響（清掉一款不會影響另一款）。
