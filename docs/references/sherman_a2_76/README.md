# M4A2(76)W 三視圖比例校正紀錄

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

通用做法見 [戰車三視圖比例校正流程](../../tank-proportion-calibration.md)。型號：M4A2(76)W，焊接車體、47° 大艙蓋前斜板、GM 6046 柴油、VVSS 窄履帶、T23 砲塔、76 mm M1 砲（M62 砲盾）。不是 75 mm Sherman，也不是 HVSS 的 Easy Eight。

## 來源

2026-09-24 下載並實際開圖確認：

- [D. P. Dyer M4A2(76)W 比例圖頁（OnWar）](https://www.onwar.com/wwii/tanks/usa/us018m4a276wp.html)，[原始 JPG](https://www.onwar.com/wwii/tanks/usa/us018m4a276w.jpg)，存為 `m4a2-76-dyer.jpg`（1200 × 1800，灰階）。側、俯、前、後四視圖，圖上沒有比例尺與尺寸標註。**唯一量測來源**。
- [OnWar M4A2(76)W 資料](https://www.onwar.com/wwii/tanks/usa/us018m4a276w.html)：全長／車體 7.57／5.92 m、寬 2.67 m、高 2.97 m、履帶寬 42.1 cm、仰俯 −10°/+25°、砲塔 15 秒一圈。只作尺度核對，不用來單獨拉伸圖片。
- 懸吊沿用 [M4 校正](../sherman/README.md)（另一張 Dyer 圖）的 VVSS、主動輪、導輪與履帶構造。

參考圖是研究資料，不作為遊戲材質，也不代表製造尺寸。

## 比例尺與登錄

比對頁 `compare.tsx` 使用正式 `ParametricTankRenderer` 與實際 JSON，砲塔朝前、砲管水平，原圖不縮放不變形，以 60% 不透明度疊在 1200 × 1800 畫布上。相機設定集中在 `views.ts`，自 baseline 起不變：

| 視圖 | panel（left, top, w × h） | ppm | 原點（panel 內） | 依據 |
|---|---|---:|---|---|
| 側視 | 0, 0, 1200 × 650 | 150 | (668, 577) | 主動輪–導輪中心距 762.5 px = 5.08 m，與已校正 M4 的 5.09 m 一致；路輪約 75 px ≈ 508 mm；地面線 y 577 |
| 俯視 | 0, 650, 1200 × 520 | 150 | (659, 230) | 砲口、前斜板頂、砲塔、車尾等縱向點比側視平均偏左 9 px；中心線 y 880 |
| 前視 | 0, 1170, 620 × 630 | 150 | (316, 549) | 履帶外寬 395 px = 2.63 m；中心 x 316、地面 y 1719 |
| 後視 | 620, 1170, 580 × 630 | 150 | (279, 550) | 中心 x 899、地面 y 1720 |

Z 原點選在讓主動輪落在 M4 已校正的 Z 2.64，因此兩車共用的懸吊可以原樣沿用。

**已知跨圖矛盾**：這張圖的履帶畫得約 0.12 m 厚（M4 模型與實車鞋板約 0.1 m），所以路輪中心、主動輪與履帶上段整體比 M4 構造高 0.05–0.09 m（7–13 px）。車體與砲塔的高度（車頂、砲軸、砲塔頂）三個視圖彼此一致，地面線也對得上，所以保留 M4 的懸吊，不為了這張圖加厚履帶。履帶上段（13 px）列入量測報告，但不列為驗收點；其餘懸吊點都在容差內。

## 修改輪次

`calibrate.mjs` 從 baseline 快照（commit `650af41` 的 `src/tanks/sherman_a2_76/*.json`）與 `src/tanks/sherman/model.json` 產生每一輪結果，pass 會累加：

```powershell
node docs/references/sherman_a2_76/calibrate.mjs <original-model.json> <original-tank.json> src/tanks/sherman/model.json <output-dir> [pass]
```

1. **`before.png`**：原模型。平均誤差 23.8 px，21 點超出容差。主要問題：
   - 路輪直徑 570 mm，bogie 偏後 0.24 m，主動輪偏後 0.27 m。
   - 上車體只有 2.52 m 寬，擋泥板與側板下緣壓在履帶上。
   - 砲塔低 0.1 m，砲管短 0.16 m。
   - 指揮塔、裝填手艙蓋、砲手潛望鏡、天線、車首機槍與同軸機槍／瞄準鏡孔全部左右放反。
2. **pass 1 → `iteration-1.png`**：
   - 換成 M4 已校正的履帶與懸吊，以及 M4 的差速器、終傳動、法蘭。
   - 上車體改為 2.72 m 寬、側板下緣 Y 1.33、前斜板 46°（車頂交線 Z 1.745）、車頂到 Z −0.9 後才接柴油機甲板斜面；前斜板與甲板上的配件跟著新斜面移動。
   - 頭燈移到 X ±0.96，擋泥板改在側板下方、離開履帶。
   - 砲塔升到 Y 2.12，指揮塔、砲手潛望鏡、天線移到右側（−X），裝填手艙蓋與手槍孔在左側。
   - 砲軸 Y 2.433，砲口 Z 4.247，砲管前後加粗並加 0.16 m 螺紋保護套。M62 砲盾退到 Z 1.227、加大到 1.37 × 0.58 m，同軸機槍在右、瞄準鏡在左。
   - 裝甲板跟著新表面：前斜板、差速器分 5 段弦板、側板在車頂下一塊、前斜板下 3 塊、甲板下 5 塊，另有後板上下兩塊，以及砲塔側面前後漸縮段。
3. **pass 2 → `iteration-2.png`**：
   - 砲塔下緣在 Z −0.51 後升到 Y 2.37 的尾艙底，原本低而深的後裙移除。
   - 砲塔座圈縮到 0.88 m 半徑，尾艙後板、尾艙底斜板與尾段側板的裝甲隨之調整。
4. **pass 3 → `iteration-3.png`**：
   - 砲塔頂前段從 Z 0.55 起下斜到前緣 Y 2.68。
   - 駕駛／副駕駛艙蓋改為凸出車頂，潛望鏡移到 Z 1.41。
   - 天線縮短到 Y 3.62，並加上尾艙置物箱。
   - 車尾：排氣百葉提高到 Y 0.76–1.09，加兩個後板空氣濾清器，移除圖上沒有的車尾鏟子。
   - 前斜板加上折疊的 Y 形行軍固定架。
5. **pass 4 → `after.png`**：
   - 頭燈護架前伸到 Z 2.53，改為側桿加前環的框架；行軍固定架底柱接上 Y 形臂；砲手潛望鏡護罩加高到 Y 3.10；天線座改為尾艙頂的方盒。
   - 空氣濾清器改為方形散熱片盒（Z −2.81…−3.05、Y 1.35…1.75）。
   - 車尾下半的排氣罩、拖鉤、拖環縮回履帶後緣內，拖環提高 0.15 m。
   - 置物箱貼齊尾艙。

每輪都是「修改 → `capture.mjs <label>` → 看疊圖與純模型 → `verify.ts --landmarks <label>` → 決定下一輪」；pass 0、pass 3 與 pass 4 後各做了一次獨立的疊圖／斜視審查。

## 成果

- 量測：56/56 點在 12 px（80 mm）內，平均 23.83 → 2.53 px，最大 9.75 px。見 [`measurements.md`](measurements.md)。
- 主要尺寸：
  - 上車體寬 2.72 m，履帶外寬 2.621 m，履帶 421 mm，路輪 508 mm。
  - 車頂 Y 2.075，砲塔下緣 2.16、頂 2.886，指揮塔頂 3.10，砲軸 2.433。
  - 砲口 Z 4.247，含砲全長 7.31 m（圖上 7.49 m 含車尾配件）。
  - 以上不含天線。
- Mounts：`turretOffset [0, 2.12, 0.08]`、`gunPivotOffset [0, 0.313, 1.02]`、`muzzleDistance 3.147`。
- `verify.ts`：schema、量測點、508 mm 圓形路輪壓在履帶內緣、車體接合、砲塔座在車頂上、右側乘員配件在 −X、砲口與射彈生成點一致，遊戲數值與 baseline 相同（血量、機動、砲塔轉速、仰俯、裝填、穿深與原有裝甲厚度）。
- `src/tanks/sherman_a2_76/armor.test.ts`：48 塊裝甲板。以正式碰撞程序射線，比對命中距離與由 `model.json` 重建的渲染表面：
  - 平面板 ≤40 mm，差速器與鑄造砲塔 ≤0.1–0.12 m。
  - 涵蓋前斜板 120、砲盾 89、差速器 80、側板與後板 38、車頂與甲板 19、砲塔側與尾艙 63，以及 90° 旋轉。
- `docs/perf/merge-qa.html?tank=sherman_a2_76`：battlefield 合併網格與零件樹的像素差 0.02%（遠距 0%、損毀 0.04%），沒有主控台錯誤。
- 已檢視前／後斜視、+25°、−10°、90° 旋轉與損毀材質截圖。這些是抽樣姿態，不是全姿態干涉證明。

限制：
- 懸吊比這張圖低 0.05–0.09 m（見上方跨圖矛盾）。
- M4 共用構造：主動輪是 8 輻圓盤而非齒輪、路輪是實心盤；上段履帶與托輪之間約有 4 cm 間隙，渦捲彈簧略凸出履帶外緣 3 cm。這些要改應在 M4 與 M4A2 一起處理。
- 柴油機甲板的格柵與艙門只做簡化的板件。
- 砲塔鑄件、差速器、尾艙底曲線都是多邊形近似；裝甲 OBB 對圓弧也有近似誤差。
- 前視圖右側疑似警報器、角落示寬燈沒有建模；圖上沒有畫 .50 機槍本體，模型保留為選配裝備。

## 重現

啟動 Vite（`npm run dev -- --host 127.0.0.1`），讓外部安裝的 Playwright 可由 `NODE_PATH` 載入（預設使用 Edge，可用 `M4A2_QA_BROWSER`、`M4A2_QA_URL` 覆寫）：

```powershell
node docs/references/sherman_a2_76/capture.mjs after
npx tsx docs/references/sherman_a2_76/verify.ts
node --import tsx --test --test-isolation=none src/tanks/sherman_a2_76/armor.test.ts
npm run lint
npm run build
```

`verify.ts` 需要 `before-bounds.json` 與 `after-bounds.json`，缺少時不代表驗證通過。重建 `before` 時先用 baseline 快照暫時覆蓋正式 JSON 再擷取。`--landmarks <label>` 只列出帶正負號的殘差，供迭代時使用。比對頁與腳本是開發用 fixture，不是正式 Vite entry。
