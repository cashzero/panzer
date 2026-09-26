# StuG III Ausf. G（7.5 cm Sturmgeschütz 40 Ausf. G）建模與比例校正紀錄

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

通用做法見 [戰車三視圖比例校正流程](../../tank-proportion-calibration.md)。StuG III Ausf. G 是新增車型，沿用 M10 與 Panther 的生成器流程：量測值寫成可重現的 `generate.mjs`，pass 0 初稿即為 `before`，之後每輪疊圖修正以新的 pass 記錄在生成器中。

型號：1943 年底以後的後期 Ausf. G。辨識特徵：Pz.Kpfw. III 底盤（六對膠緣路輪、三個托帶輪、前主動輪、後導輪）、車首 50 + 30 mm 附加裝甲、加寬的戰鬥室兩側斜頂置物箱（pannier）、鑄造 Saukopf 砲盾、7.5 cm StuK 40 L/48 雙室制退器、車長指揮塔、裝填手 MG 34 與護盾、側裙板、後甲板備用路輪與置物架。不是早期 G（箱形砲盾）或 Ausf. F/8。

## 無砲塔車輛

StuG 沒有砲塔：戰鬥室屬於 hull，turret slot 只放一個藏在戰鬥室內的砲架，`mounts.turretOffset` 是砲架的旋轉軸（砲耳正下方），砲管、Saukopf 放在 gun slot 隨砲旋轉與俯仰。`tank.json` 的 `traverse.limitDeg: 10` 讓玩家瞄準與兩種 AI 都把砲限制在左右各 10° 內（`src/traverseLimit.ts`）；超出射界時 AI 以整車轉向目標。沒有任何裝甲板以 turret 為 parent。

## 來源

2026-09-26 下載並實際開圖確認：

- [OnWar，StuG III Ausf. G 資料頁](https://www.onwar.com/wwii/tanks/germany/ge064stug3g.html)，[原始 JPG](https://www.onwar.com/wwii/tanks/germany/ge064stug3g.jpg)，存為 `stug3g-onwar.jpg`（1200 × 2100，灰階，300 dpi 標記）。頁面標示為 H.L. Doyle 所繪 StuG. III Ausf. G (Sd.Kfz. 142/1)。兩個側視（上方無裙板、下方有裙板）、俯視、前視、後視。**唯一比例來源**。圖片著作權屬原作者。
- 尺寸與數據交叉核對：OnWar 資料頁（全長 6.85 m、寬 2.95 m、高 2.16 m、23.9 t、300 hp、手動旋轉左右各 10°、俯仰 −6°/+20°、履帶寬 40 cm、裝甲：車首 50 + 30 mm、戰鬥室正面 50 + 30 mm、側面 30 mm、車尾 50 mm、頂 11–17 mm、Saukopf 80 mm）。

參考圖是研究資料，不作為遊戲材質，也不代表製造尺寸。

## 比例尺與登錄

比對頁 `compare.tsx` 使用正式 `ParametricTankRenderer` 與實際 JSON，砲朝前、砲管水平，原圖不做任何縮放或變形，以 60% 不透明度疊在 1200 × 2100 畫布上。上方側視圖沒有裙板，該 panel 以去掉 `schurzen` 節點的模型渲染。相機自 pass 0 起固定不變：

| 視圖 | panel（left, top, w × h） | ppm | 原點（panel 內） | 依據 |
|---|---|---:|---|---|
| 側視（無裙板） | 0, 0, 1200 × 560 | 152 | (700, 536) | 路輪外徑 78 px = 520 mm（514 mm）；砲口到車尾 1038 px = 6.83 m（6.85 m）；地面線 y=536；Z=0 取第 3、4 路輪中點 |
| 側視（有裙板） | 0, 560, 1200 × 440 | 152 | (714.5, 411) | 路輪間距與上方側視相同（87.8 px）；以路輪對齊，Z 原點右移 14.5 px；地面線 y=971 |
| 俯視 | 0, 1000, 1200 × 630 | 156.4 | (703.7, 307.5) | 砲口到車尾 1068 px，比側視長 2.9%，以砲口與車尾兩點登錄；裙板外緣 1045/1570 的中點為中心線 |
| 前視 | 0, 1630, 640 × 470 | 155 | (356, 385.5) | 履帶外寬 457.5 px = 2.95 m；地面線 y=2015.5 |
| 後視 | 640, 1630, 560 × 470 | 155 | (269.5, 386) | 同前視；後視中心 x=909.5、地面線 y=2016 |

俯視圖的比例比側視大約 3%，依流程分別校準。砲偏向車輛右側 0.113 m（俯視 1288 相對中心線 1307.5；前視砲口 x=338.5 相對 356），兩視圖一致。

## 生成器與修改輪次

`generate.mjs` 把所有尺寸集中在參數區，建出：以車首剖面拉伸的下車體、以兩片正面板與後板裁切的戰鬥室（含斜頂 pannier）、引擎室、沿引擎室延伸的側箱、擋泥板、六對路輪與托帶輪、主動輪與導輪、沿路輪、主動輪、托帶輪頂與導輪的履帶輪廓與批次履帶板、Saukopf（五個剖面放樣）、StuK 40 與制退器、車頂配件、後甲板備用路輪與置物架，以及所有裝甲 OBB。

1. **pass 0 → `before.png`**：初稿。47 個量測點已全部在 12 px 內（平均 1.27 px）；俯視裙板外寬差 36 px。純模型與疊圖顯示：前視裙板上緣外張（頂 x=105/617、底 127/590），模型卻是垂直板；後排氣消音器應是後板下方的橫向扁箱（後視 765..1062 × 1822..1872、側視 x 1095..1110），不是上後板的圓筒。
2. **pass 1 → `iteration-1.png`**：裙板改為上緣 1.66 m、下緣 1.49 m 的外傾板（前視與俯視寬度都在 5 px 內），首片保持梯形；消音器改為扁箱，尾管跟著下移。
3. **pass 2 → `after.png`**：斜視圖顯示水平的裙板吊架浮在 pannier 斜頂上方，改為由 pannier 側牆斜向吊到裙板掛軌的支架。

裝甲板配置不受 pass 影響（截圖只取決於 `model.json`）。驗證時加入的修正：引擎室側面（側箱之後）原本沒有裝甲板；首片梯形裙板用平均邊矩形會讓後緣歪斜、在接縫留下空隙，改為一塊下方矩形加四塊沿斜緣階梯的直立矩形；Saukopf 正面板涵蓋整個正面（含圓頂）。

每輪都是「修改 → `capture.mjs <label>` → 看疊圖與純模型 → `verify.ts --landmarks` → 決定下一輪」。

## 成果

- 量測：48/48 點在 12 px（側視 79 mm）內，平均 1.81 → 0.67 px，最大 4.50 px（俯視裙板外寬）。見 [`measurements.md`](measurements.md)。
- 主要尺寸：砲口 Z 4.039 m、車尾 Z −2.63 m（6.67 m；OnWar 全長 6.85 m 含後方配件）、履帶外寬 2.94 m、履帶 400 mm、裙板上緣外寬 3.33 m、路輪 514 mm、車頂（擋泥板線）1.355 m、戰鬥室頂 2.04 m、砲軸 1.592 m、指揮塔頂 2.23 m、腹板 0.38 m。
- Mounts：`turretOffset [-0.113, 1.36, 1.40]`（砲架旋轉軸）、`gunPivotOffset [0, 0.232, 0]`、`muzzleDistance 2.639`、`traverse.limitDeg 10`。
- `verify.ts`：schema、量測點、514 mm 圓形路輪、路輪壓在履帶內緣、履帶上段壓在三個托帶輪上、履帶低於擋泥板、砲口與射彈生成點一致、砲架留在戰鬥室內、遊戲數值與本文件一致。
- `src/tanks/stug3g/armor.test.ts`：91 塊裝甲板；以正式碰撞程序射線，比對命中距離與由 `model.json` 重建的渲染表面（一般 ≤40 mm，Saukopf 與指揮塔 ≤60 mm）。涵蓋 Saukopf 80、戰鬥室正面 80、上正面 50、車首 80/50、pannier 正面 30、側裙 5、引擎室側 30、指揮塔 30、下後板 50、上後板與戰鬥室後板 30、戰鬥室頂 17、引擎甲板 16、裙板外的履帶內外部探針，以及砲在左右 10° 限位時 Saukopf 跟著轉；另測 `clampTraverse` 與 AI 的 `casemateHullHeading`。
- 已檢視前/後斜視、俯斜視、+20°、−6° 與左右 10° 旋轉。這些是抽樣姿態。`docs/perf/merge-qa.html?tank=stug3g` 近距與遠距 LOD 的合併批次與零件樹無差異。

限制：Saukopf 是五個剖面的放樣，不是鑄件曲面；pannier 與戰鬥室共用正面板斜率；置物架只做管框；路輪沒有扭力臂以外的懸吊細節；沒有同軸機槍與近接防禦武器；車內只有砲架。側裙依 Panzer IV Ausf. H 與 Panther 的做法設為 5 mm 裝甲板。遊戲數值中 StuK 40 的彈藥沿用 Panzer IV Ausf. H 的 KwK 40（同一門砲）；血量 230、裝填 5 s、最高速度 10 m/s 是與既有車型並列的遊戲平衡值；手動旋轉 0.05 rad/s（20° 射界約 7 s）是遊戲值。

## 重現

啟動 Vite（`npm run dev -- --host 127.0.0.1`），讓外部安裝的 Playwright 可由 `NODE_PATH` 載入（預設使用 Edge，可用 `STUG_QA_BROWSER`、`STUG_QA_URL` 覆寫；雲端環境可指向 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`）：

```powershell
node docs/references/stug3g/generate.mjs                    # 寫入 src/tanks/stug3g（最新 pass）
node docs/references/stug3g/capture.mjs after
npx tsx docs/references/stug3g/verify.ts
node --import tsx --test src/tanks/stug3g/armor.test.ts
npm run lint
```

重建歷史截圖時，先把指定 pass 輸出到正式目錄再擷取，例如 `node docs/references/stug3g/generate.mjs src/tanks/stug3g 0` 後擷取 `before`，最後再以最新 pass 重新產生。`verify.ts` 需要 `before-bounds.json` 與 `after-bounds.json`，缺少時不代表驗證通過。`--landmarks` 只列出帶正負號的殘差，供迭代時使用。比對頁與腳本是開發用 fixture，不是正式 Vite entry。
