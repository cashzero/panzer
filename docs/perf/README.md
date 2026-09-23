# 戰場效能量測

效能回歸基準與戰車合併 QA。輸出的 PNG、JSON、`.cpuprofile` 都是本機產物，不進 Git。

## 前置

- 先啟動 dev server：`npm run dev`（預設 `http://127.0.0.1:3000`，可用 `PERF_URL` 覆寫）。
- Playwright 裝在 repo 外，執行時以 `NODE_PATH` 指向該安裝的 `node_modules`，與 `docs/references/*/capture.mjs` 相同。
- 使用本機 Edge（`channel: 'msedge'`）並開啟實體 GPU（ANGLE D3D11）。輸出會記錄 renderer 字串；不同機器、瀏覽器、解析度的數字不可直接比較。

## `bench.mjs`

```bash
node docs/perf/bench.mjs <label> [--profile]
PERF_WIDTH=1920 PERF_HEIGHT=1080 node docs/perf/bench.mjs <label>
```

部署預設 OOB，玩家設為不死，依序量測四個情境：

| 情境 | 內容 |
|---|---|
| `third-person` | 預設第三人稱，靜止 |
| `facing-enemies` | 車體轉向最近的敵車 |
| `gunner` | 砲手視角 |
| `driving` | 按住 W 前進（草叢網格會持續重建） |

每個情境輸出 FPS、p50／p95 幀時間、每幀 draw call 與三角形數，並擷取畫面。`--profile` 會在第三人稱情境額外錄 5 秒 CPU profile，可用 Chrome DevTools 的 Performance 面板開啟。

幀時間會對齊 vsync（16.7／33.3 ms），60 FPS 是上限而非實際餘裕；判斷餘裕時請看 CPU profile 的 idle 比例。

## `merge-qa.html`

`/docs/perf/merge-qa.html?tank=<tankid>[&far][&destroyed]`

左邊是完整零件樹，右邊是戰場使用的合併版本，兩邊相機與光源相同。`far` 把相機拉到 170 m，讓右邊切換到遠距 LOD；`destroyed` 檢查擊毀配色。`window.mergeQA.diff()` 回傳兩張畫面的平均差與變化像素比例。

近距離的小幅差異來自裝甲噪點改為取樣 slot 座標，屬預期；若出現缺件、黑面（法線或繞序錯誤）或顏色錯位，就是合併有問題。

## 2026-09-23 Phase 0 基準（GTX 1050 Ti，1600×900，dev build）

| 情境 | 改前 FPS | 改後 FPS | 改前 draw calls | 改後 draw calls |
|---|---:|---:|---:|---:|
| third-person | 20.7 | 58.7 | 3,216 | 253 |
| facing-enemies | 21.0 | 59.3 | 3,219 | 253 |
| gunner | 31.3 | 60.1 | 1,211 | 147 |
| driving | 13.7 | 59.9 | 2,968 | 237 |

同一台機器 1920×1080：第三人稱 59.1、面向敵車 55.5、砲手 59.3、行駛 51.1 FPS，p95 偶有 33 ms。此時主要成本已轉到 GPU 後處理（N8AO、bloom、陰影）。
