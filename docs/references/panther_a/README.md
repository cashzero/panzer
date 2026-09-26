# Panther Ausf. A（Pz.Kpfw. V Panther Ausf. A）建模與比例校正紀錄

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

通用做法見 [戰車三視圖比例校正流程](../../tank-proportion-calibration.md)。Panther Ausf. A 是新增車型，沿用 M10 的做法：量測值寫成可重現的生成器 `generate.mjs`，pass 0 初稿即為 `before`，之後每輪疊圖修正以新的 pass 記錄在生成器中。

型號：1943 年 8 月至 1944 年中生產的 Ausf. A。辨識特徵：55° 上下前裝甲、前裝甲右側 MG 34 球型機槍座、駕駛觀察窗、鑄造指揮塔與防空機槍環、砲塔兩側各三具煙幕彈發射器、圓弧鑄造砲盾、7.5 cm KwK 42 L/70 雙室制退器、交錯式 860 mm 路輪、側裙板（Schurzen）、後板左側排氣管加兩支冷卻管。不是 Ausf. D（無指揮塔、有手槍射擊孔）或 Ausf. G（直邊車體、無駕駛觀察窗）。

## 來源

2026-09-26 下載並實際開圖確認：

- [OnWar，Panther Ausf. A 資料頁](https://www.onwar.com/wwii/tanks/germany/ge023panthera.html)，[原始 JPG](https://www.onwar.com/wwii/tanks/germany/ge023panthera.jpg)，存為 `panther_a-onwar.jpg`（1800 × 2100，灰階，300 dpi 標記）。頁面標示為 H.L. Doyle 所繪 Panzerkampfwagen V Ausf. A。側、俯、前、後四視圖。**唯一比例來源**。圖片著作權屬原作者。
- 尺寸與數據交叉核對：OnWar 資料頁（車長 8.66/6.60 m、寬 3.27/3.42 m、高 3.00 m、44.8 t、700 hp、俯仰 −8°/+18°、履帶寬 66 cm、裝甲厚度與角度）、[Wikipedia Panther tank](https://en.wikipedia.org/wiki/Panther_tank)（車體 6.87 m、寬 3.27 m、高 2.99 m、前裝甲 80 mm/55°）、[Tank Encyclopedia Panther D/A/G](https://tanks-encyclopedia.com/ww2/germany/panzer-v_panther.php) 與 [Axis History Forum 引述 Jentz 的轉速表](https://forum.axishistory.com/viewtopic.php?t=70861)（Ausf. A/G 液壓旋轉依引擎轉速：高速檔 1000/2000/2500/3000 rpm 為 46/23/18/15 s 一圈）。KwK 42 穿深（30° 板，Pzgr. 39/42：138/124/111/99/89 mm @100/500/1000/1500/2000 m；Pzgr. 40/42：194/174/149/127 mm @100–1500 m）與砲口初速（925/1120/700 m/s）採 Jentz 常引數值。

參考圖是研究資料，不作為遊戲材質，也不代表製造尺寸。

## 比例尺與登錄

比對頁 `compare.tsx` 使用正式 `ParametricTankRenderer` 與實際 JSON，砲塔朝前、砲管水平，原圖不做任何縮放或變形，以 60% 不透明度疊在 1800 × 2100 畫布上。相機自 pass 0 起固定不變：

| 視圖 | panel（left, top, w × h） | ppm | 原點（panel 內） | 依據 |
|---|---|---:|---|---|
| 側視 | 0, 0, 1800 × 730 | 155 | (1046, 695.5) | 路輪外徑 133 px = 860 mm；地面線 y=695.5；Z=0 取車首（俯視 527 + 9）與後板頂（俯視 1536/1548 + 9）的中點 |
| 俯視 | 0, 730, 1800 × 620 | 155 | (1037, 304.5) | 砲口、裙板前緣與側視相差 9 px；車體中心線 y=1034.5；裙板外寬 535 px ≈ 3.42 m |
| 前視 | 0, 1350, 950 × 750 | 155 | (545, 591) | 履帶外寬 510 px = 3.27 m、履帶 100 px = 0.66 m；地面線 y=1941 |
| 後視 | 950, 1350, 850 × 750 | 155 | (411.5, 592) | 同前視；後視中心 x=1361.5、地面線 y=1942 |

四個視圖都是 155 px/m，與 860 mm 路輪、3.27 m 車寬、8.66 m 砲口至後板長度三者一致。俯視圖相對畫面約順時針轉 0.5°（上下緣線在 600 px 內偏 4–5 px），依流程不旋轉原圖；造成的誤差在俯視兩端約 ±3 px，已包含在殘差中。

**已知跨視圖矛盾**：前視的裙板上緣與側板轉折比側視高約 0.07 m（10 px），前視車頂線則與側視相差不到 3 px；側視內部一致（路輪、地面、砲軸、車頂高度彼此吻合），因此高度採側視。後視的砲塔頂比側視與前視高約 6 px。砲塔前緣底部與後緣底部在側視與俯視間各有約 7 px 差異，採俯視（平面上的輪廓線較清楚）。頭燈在側視 x=632、俯視 x≈645，取中間值。這些是判斷而非定論，列在 `measurements.md` 的報告欄位中。

## 生成器與修改輪次

`generate.mjs` 把所有尺寸集中在參數區，建出：以上下前裝甲平面與內傾後板裁切的單一車體 polyhedron（含側裙上方的斜側板與下車體）、四分之一橢圓前擋泥板、六片側裙與掛軌、交錯路輪（外側站兩片夾住導齒、內側站兩片在內）、17 齒主動輪與輻條導輪、沿下緣、主動輪、路輪頂與導輪的履帶輪廓與批次履帶板、底環與頂環放樣的砲塔殼、鑄造指揮塔、D 形砲盾與 KwK 42，以及所有裝甲 OBB。

1. **pass 0 → `before.png`**：初稿。64 個量測點已在 12 px 內（平均 4.10 px）。目視發現：頭燈位置錯（放在車頂前緣）；MG 34 槍管太短；引擎甲板加油蓋位置為猜測值；排氣管與消音器的橫向位置與高度不對；煙幕彈發射器偏後；車首有兩個前視圖中不存在的拖鉤。
2. **pass 1 → `iteration-1.png`**：頭燈改到前裝甲前角的立柱上；MG 34 伸出量加長；加油蓋改為俯視圖讀出的兩對；排氣管改為後視 x=1287/1308/1327 與 1416、消音器提高；煙幕彈發射器前移 0.16 m；拖鉤改為下車體側板向前延伸的拖曳支架。另外嘗試把路輪改成車體塗色：純模型圖顯示履帶 slot 在 renderer 中沒有塗裝色（`hullPrimary` 在 tracks slot 為固定灰），效果與 `steel` 相同，因此撤回，行走機構維持 `steel`。
3. **pass 2 → `after.png`**：依 `verify.ts --landmarks` 殘差：頭燈取側/俯視折衷；MG 34 高度取側/前視折衷；指揮塔防空環提高 0.03 m；側裙外移 0.02 m。

裝甲板配置不受 pass 影響（截圖只取決於 `model.json`）：pass 2 驗證時把指揮塔由四塊改為八塊板，讓圓形鑄件的命中距離與渲染表面差在 40 mm 內。

每輪都是「修改 → `capture.mjs <label>` → 看疊圖與純模型 → `verify.ts --landmarks` → 決定下一輪」。

## 成果

- 量測：64/64 點在 12 px（77 mm）內，平均 4.10 → 1.14 px，最大 6.96 px（側視砲塔前緣底部，側/俯視矛盾）。見 [`measurements.md`](measurements.md)。
- 主要尺寸：擋泥板前端到後板頂 6.72 m、砲口 Z 5.335 m、履帶外寬 3.30 m、裙板外寬 3.45 m、履帶 660 mm、中心距 2.64 m、路輪 860 mm（八站交錯）、車頂 1.906 m、砲塔頂 2.668 m、砲軸 2.31 m、指揮塔環頂 2.96 m、腹板 0.54 m。
- Mounts：`turretOffset [0, 1.906, -0.345]`（砲塔底環前後緣中點）、`gunPivotOffset [0, 0.404, 1.255]`（砲盾圓弧中心）、`muzzleDistance 4.425`。
- `verify.ts`：schema、量測點、860 mm 圓形路輪、路輪壓在履帶內緣、交錯路輪互不干涉且避開導齒、砲塔坐在車頂上、砲塔掃掠範圍內的車頂配件低於砲塔、引擎甲板配件低於砲管、砲口與射彈生成點一致、遊戲數值與本文件一致。
- `src/tanks/panther_a/armor.test.ts`：89 塊裝甲板；以正式碰撞程序射線，比對命中距離與由 `model.json` 重建的渲染表面（一般 ≤40 mm，斜砲塔壁與指揮塔 ≤60 mm）。涵蓋上前裝甲 80、下前裝甲 60、砲盾 100、砲塔前 100、斜側板 40、側裙 5、砲塔側/後 45、指揮塔 80、內傾後板 40、車頂與引擎甲板 16、砲塔頂 16、裙板下方履帶內外部探針（無空角也無幽靈裝甲），以及 90° 旋轉。
- 已檢視前/後斜視、俯斜視、+18°、−8°、90° 與 180° 旋轉（砲管在後甲板與排氣管上方）。這些是抽樣姿態，不是全姿態干涉證明。`docs/perf/merge-qa.html?tank=panther_a` 近距與遠距 LOD 的合併批次與零件樹無差異。
- 實際遊戲流程（Playwright + Chromium，軟體 WebGL）：選車畫面顯示 Panther Ausf. A、Zimmerit、數據牌與四種塗裝；編制畫面可選為玩家及敵方單位；部署後第三人稱視角、開火後裝填倒數、砲手視角顯示 AP 925 m/s。主控台只有既有的 favicon 404；軟體 WebGL 的 ReadPixels 效能警告在 `capture.mjs` 中忽略。

限制：OBB、圓弧砲盾、指揮塔與履帶端部都是遊戲用近似；路輪只做輪胎、輪盤與輪轂，沒有螺栓與扭力臂（被裙板遮住）；履帶上段直接壓在路輪頂，沒有下垂；排氣管不做頂端的彎管；車內沒有建模。側裙依 Panzer IV Ausf. H 的做法設為 5 mm 裝甲板，側面命中裙板時不會再打到後方車體。遊戲數值中血量 310、裝填 6 s、最高速度 12 m/s 與傷害值是與既有車型並列的遊戲平衡值；砲塔 0.27 rad/s 是 2000 rpm 高速檔。

## 重現

啟動 Vite（`npm run dev -- --host 127.0.0.1`），讓外部安裝的 Playwright 可由 `NODE_PATH` 載入（預設使用 Edge，可用 `PANTHER_QA_BROWSER`、`PANTHER_QA_URL` 覆寫；雲端環境可指向 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`）：

```powershell
node docs/references/panther_a/generate.mjs                    # 寫入 src/tanks/panther_a（最新 pass）
node docs/references/panther_a/capture.mjs after
npx tsx docs/references/panther_a/verify.ts
node --import tsx --test src/tanks/panther_a/armor.test.ts
npm run lint
```

重建歷史截圖時，先把指定 pass 輸出到正式目錄再擷取，例如 `node docs/references/panther_a/generate.mjs src/tanks/panther_a 0` 後擷取 `before`，最後再以最新 pass 重新產生。`verify.ts` 需要 `before-bounds.json` 與 `after-bounds.json`，缺少時不代表驗證通過。`--landmarks` 只列出帶正負號的殘差，供迭代時使用。比對頁與腳本是開發用 fixture，不是正式 Vite entry。
