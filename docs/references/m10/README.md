# M10 GMC（3-inch Gun Motor Carriage M10）建模與比例校正紀錄

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

通用做法見 [戰車三視圖比例校正流程](../../tank-proportion-calibration.md)。M10 是新增車型，沒有既有模型可當 baseline：本案由量測值寫成可重現的生成器 `generate.mjs`，pass 0 初稿即為 `before`，之後每輪疊圖修正都以新的 pass 記錄在生成器中。

型號：M4A2 柴油底盤、VVSS、斜側板焊接上車體、開頂五角砲塔、後期 duckbill 配重（1943 年 6 月後），3-inch Gun M7 / Mount M5，砲塔後方 .50 cal M2 朝後收納。不是 M10A1（M4A3 底盤、Ford GAA）或早期楔形配重型。

## 來源

2026-09-23 下載並實際開圖確認：

- [OnWar，3 inch GMC M10 比例圖頁](https://www.onwar.com/wwii/tanks/usa/us021m10p.html)，[原始 JPG](https://www.onwar.com/wwii/tanks/usa/us021m10.jpg)，存為 `m10-onwar.jpg`（1200 × 1800，灰階）。側、俯、前、後四視圖，後期 duckbill 配重、開頂砲塔。**主要比例來源**。頁面未標註作者，圖片著作權屬原作者。
- [the-blueprints.com，M10 Wolverine (late)，Dr Dan Saranga](https://www.the-blueprints.com/blueprints/tanks/tanks-m/78032/view/m10_3-inch_gun_motor_carriage_wolverine_late/)，[原始 PNG](https://www.the-blueprints.com/blueprints-depot/tanks/tanks-m/m10-3-inch-gun-motor-carriage-wolverine-late-2-2.png)，存為 `m10-late-saranga.png`（927 × 1500，有浮水印）。此圖砲塔加裝了野戰頂蓋，且各視圖比例不一致（前視約 124 px/m、側視約 134 px/m），只作外形輔助核對，不參與量測。
- Wikimedia Commons 實車照片（`photo-*.jpg`，1280 px 寬縮圖），用於判讀立體形狀，不參與量測：[湖口營區正面](https://commons.wikimedia.org/wiki/File:M10_Tank_Destroyer_Display_in_Hukou_Camp_20111105.jpg)、[湖口營區右前](https://commons.wikimedia.org/wiki/File:M10_Tank_Destroyer_Right_View_in_Hukou_Camp_20111105.jpg)、[Bovington 左側](https://commons.wikimedia.org/wiki/File:Bovington_Tank_Museum,_M10_Tank_Destroyer_-_geograph.org.uk_-_6655837.jpg)、[Fort Hood (2)](https://commons.wikimedia.org/wiki/File:M10_Wolverine_Tank_Destroyer,_3rd_Cavalry_Museum,Fort_Hood,_Texas_(2).jpg)（此車為 M10A1，只看砲塔與配重）。
- 尺寸與數據交叉核對：[OnWar M10 資料](https://www.onwar.com/wwii/tanks/usa/us021m10.html)（車體 5.97 m、全長 6.83 m、寬 3.05 m、含機槍 2.90 m、仰俯 −10°/+30°、裝甲厚度與角度）、[Wikipedia M10](https://en.wikipedia.org/wiki/M10_tank_destroyer)（手搖砲塔約 80 秒一圈、duckbill 配重）、[TM 9-752 OCR 文字](https://archive.org/details/TM9-752)（履帶中心距 83 in、履帶寬 16 9/16 in；高度數字 OCR 遺失）、[Wikipedia 3-inch gun M5](https://en.wikipedia.org/wiki/3-inch_gun_M5)（M7 與 76 mm M1 同彈道；M79/M62 792 m/s、M42A1 853 m/s）。

參考圖與照片是研究資料，不作為遊戲材質，也不代表製造尺寸。

## 比例尺與登錄

比對頁 `compare.tsx` 使用正式 `ParametricTankRenderer` 與實際 JSON，砲塔朝前、砲管水平，原圖不做任何縮放或變形，以 60% 不透明度疊在 1200 × 1800 畫布上。相機自 pass 0 起固定不變：

| 視圖 | panel（left, top, w × h） | ppm | 原點（panel 內） | 依據 |
|---|---|---:|---|---|
| 側視 | 0, 0, 1200 × 670 | 164 | (686, 629) | 路輪外徑 82–84 px = 508 mm；車體 978 px = 5.97 m、全長 1121 px = 6.83 m；地面線 y=629 |
| 俯視 | 0, 670, 1200 × 560 | 160 | (671, 290) | 與側視共同的縱向點（砲口、擋泥板、車頂前後緣、車尾）最小平方擬合 |
| 前視 | 0, 1230, 630 × 570 | 164 | (353, 530) | 履帶外寬 413 px = 83 in + 16 9/16 in（2.529 m） |
| 後視 | 630, 1230, 570 × 570 | 164 | (284, 530) | 同前視；後視中心 x=914 |

俯視圖縱向比側視短約 2.5%，因此分別校準；俯視 V 形配重兩邊的直線擬合交點在 Z=−1.29 m，與側視配重尖端（−1.287 m）一致，佐證俯視登錄。

**已知跨視圖矛盾**：前視與後視的砲塔頂比側視低約 0.10 m（17–25 px），前視擋泥板下緣也低約 0.1 m；車頂線、砲軸與砲盾底座高度則三視圖一致。側視內部一致（路輪在水平與垂直方向都是 508 mm 的圓，同一個 164 px/m 同時符合 5.97 m 車體與 6.83 m 全長），因此砲塔高度採側視（頂 2.57 m）；前/後視砲塔頂列入量測報告但不列為驗收點。這是判斷而非定論：公開高度只有含防空機槍的 2.90 m（模型 M2 頂 2.945 m），TM 9-752 的車高數字在 OCR 中遺失，廣角照片透視太大無法仲裁；若前視才正確，砲塔會低約 0.1 m。其他俯視/側視/前視間的小矛盾（砲盾前緣、車頂後緣、砲塔頂寬、砲盾寬）取折衷值，讓兩邊都在容差內，而不是只貼合單一視圖。

## 生成器與修改輪次

`generate.mjs` 把所有尺寸集中在參數區，由量測值建出：以前斜板面、後板面裁切的斜側板上車體 polyhedron、M4A2 下車體與尖頭差速器罩、依滑輪切線計算的履帶外/內輪廓與批次履帶板（含上段下垂可見的導齒）、開頂砲塔殼（底／轉折／頂三層環放樣，配重為實心）、M5 砲盾截頭角錐，以及所有裝甲 OBB。

1. **pass 0 → `before.png`**：初稿。53 個量測點已在 12 px 內（平均 1.78 px）。目視發現：車尾下車體、排氣導流罩與拖鉤在側視凸出履帶後緣；配重尖端高度取成 V 形交點而非尖端；加油蓋與行軍固定架位置錯誤。
2. **pass 1 → `iteration-1.png`**：下車體後板與車尾配件縮回履帶包絡；配重尖端改為 Y 2.20 m（y=267）；砲塔頂寬、砲盾寬、車頂後緣取跨視圖折衷；頭燈護架延伸到 Z 2.33；加油蓋改為每側 3 個（外側為側視可見的圓頂）；行軍固定架移到 Z −2.56 的直立托架（即側視車尾立柱）；加拖纜後端夾座。
3. **pass 2 → `iteration-2.png`**：依湖口正面照與側視大弧線，M5 砲盾改為高截頭角錐：底座 1.17 × 0.62 m（Y 1.82–2.44），平面只有 0.33 m 高；砲塔前緣頂高改 2.37 m。
4. **pass 3 → `after.png`**：驗證修正。拖鉤再縮 7 mm；裝甲 OBB 改為厚度放在 local X（碰撞程序依 X→Y→Z 判定受擊面，其他軸在板邊 10 mm 內會被當成側面而漏接）；差速器罩改為每段輪廓一塊弦板；砲塔歪斜四邊形改用兩對邊平均矩形並細分，配重稜線加窄板；履帶改為沿輪廓分段的 40 mm 外側板；板名唯一（選車畫面以 name 當 React key）。

每輪都是「修改 → `capture.mjs <label>` → 看疊圖與純模型 → `verify.ts --landmarks` → 決定下一輪」。

## 成果

- 量測：53/53 點在 12 px（側視 73 mm）內，平均 1.78 → 1.57 px，最大 8.60 px（俯視砲盾前緣，側/俯視折衷）。見 [`measurements.md`](measurements.md)。
- 主要尺寸：車體含擋泥板 5.963 m、含砲全長 6.829 m、寬 3.05 m（車頂 2.25 m）、履帶外寬 2.529 m、履帶 421 mm、路輪 508 mm、bogie 間距 1.461 m、同 bogie 輪距 0.848 m、車頂 1.793 m、砲塔底 1.878 m、配重尖端 2.20 m、砲塔頂 2.57 m、砲軸 2.192 m、砲口 Z 3.89 m、M2 頂 2.945 m（不含天線）。
- Mounts：`turretOffset [0, 1.80, 0.196]`（俯視砲塔內圓弧擬合圓心，殘差 ≤3.4 px）、`gunPivotOffset [0, 0.392, 1.184]`、`muzzleDistance 2.51`。
- `verify.ts`：schema、量測點、508 mm 圓形路輪、路輪壓在履帶內緣、車體接合、砲塔掃掠範圍內的車頂配件低於砲塔底緣、車尾配件不凸出履帶包絡、砲口與射彈生成點一致、遊戲數值與本文件一致。
- `src/tanks/m10/armor.test.ts`：92 塊裝甲板；以正式碰撞程序射線，比對命中距離與由 `model.json` 重建的渲染表面（一般 ≤40 mm，差速器 ≤80 mm）。涵蓋前斜板 38、砲盾 57、差速器 51、側板 19、後板 19、砲塔與配重 25、履帶內外部探針（不留空角也無幽靈裝甲，容差 0.15 m）、90° 旋轉，以及開頂：從正上方打進戰鬥室的射彈會命中 13 mm 車頂。
- 已檢視前/後斜視、開頂俯視、+30°、−10°、90° 與 180° 旋轉（砲管在行軍固定架上方約 0.11 m）。這些是抽樣姿態，不是全姿態干涉證明。
- 實際遊戲流程（Playwright + Edge）：選車畫面顯示 M10 與裝甲懸停、編制畫面可選為玩家及 AI 單位、部署後第三人稱與砲手視角、開火後裝填。主控台只有既有訊息（R3F `THREE.Clock`、`PCFSoftShadowMap` 棄用、D3D shader 編譯警告、favicon 404）。

限制：OBB、差速器鑄件、配重曲面、履帶端部與小配件都是遊戲用近似；appliqué 螺栓座只做 hull 兩排、前斜板與砲塔各數個；車內只做砲尾與地板。遊戲數值中 M79/M62 的傷害與 30° 穿深點沿用同彈道的 M4A2(76)；手搖砲塔 0.078 rad/s 對應文獻約 80 s 一圈；血量 240、裝填 5 s、最高速度 11 m/s 是與既有車型並列的遊戲平衡值。

## 重現

啟動 Vite（`npm run dev -- --host 127.0.0.1`），讓外部安裝的 Playwright 可由 `NODE_PATH` 載入（預設使用 Edge，可用 `M10_QA_BROWSER`、`M10_QA_URL` 覆寫）：

```powershell
node docs/references/m10/generate.mjs                    # 寫入 src/tanks/m10（最新 pass）
node docs/references/m10/capture.mjs after
npx tsx docs/references/m10/verify.ts
node --import tsx --test --test-isolation=none src/tanks/m10/armor.test.ts
npm run lint
```

重建歷史截圖時，先把指定 pass 輸出到獨立目錄再暫時覆蓋正式 JSON，例如 `node docs/references/m10/generate.mjs <dir> 0` 後擷取 `before`；`verify.ts` 需要 `before-bounds.json` 與 `after-bounds.json`，缺少時不代表驗證通過。`--landmarks` 只列出帶正負號的殘差，供迭代時使用。比對頁與腳本是開發用 fixture，不是正式 Vite entry。
