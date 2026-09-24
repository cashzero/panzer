# T-34/76 1943 型三視圖比例校正紀錄

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

通用做法見 [戰車三視圖比例校正流程](../../tank-proportion-calibration.md)。型號：T-34/76 1943 型，六角鑄造砲塔加指揮塔、F-34 76.2 mm 砲、Christie 懸吊五對大路輪、前導輪後主動輪、60° 前斜板、車側外掛油桶。

## 來源

2026-09-24 下載並實際開圖確認：

- [George Bradford T-34/76 model 1943 四視圖（OnWar）](https://www.onwar.com/wwii/tanks/ussr/su045t3476m43p.html)，[原始 JPG](https://onwar.com/wwii/tanks/ussr/su045t3476m43.jpg)，存為 `t34-76-m43-bradford.jpg`（1200 × 1600，灰階）。圖上沒有比例尺、尺寸或作者標註。**唯一量測來源**。
- [OnWar T-34/76 1943 資料](https://www.onwar.com/wwii/tanks/ussr/su045t3476m43.html)：全長 6.75 m、寬 3.00 m、高 2.60 m、履帶寬 55 cm、仰俯 −5°/+29°、砲塔 14 秒一圈。只作尺度核對。

參考圖是研究資料，不作為遊戲材質，也不代表製造尺寸。

## 比例尺與登錄

這張圖的方向和 Dyer 圖相反：側視車首朝右，畫的是**車輛右側**；俯視車首朝右，車輛左側在上。相機依此設定，並集中在 `views.ts`，自 baseline 起不變：

| 視圖 | panel（left, top, w × h） | 相機 | ppm | 原點（panel 內） | 依據 |
|---|---|---|---:|---|---|
| 側視 | 0, 0, 1200 × 555 | `[-20, 0, 0]` | 152 | (532, 511) | 路輪 126 px = 830 mm；全長 1030 px = 6.78 m（資料 6.75 m）；地面線 y 511；Z 原點取車體前後中點 |
| 俯視 | 0, 555, 1200 × 535 | `[0, 20, 0]`，up `[1, 0, 0]` | 152 | (538, 271) | 縱向點比側視偏右 6 px；中心線 y 826 |
| 前視 | 0, 1090, 572 × 510 | `[0, 0, 20]` | 152 | (294, 456.5) | 中心 x 294、地面 y 1546.5 |
| 後視 | 572, 1090, 628 × 510 | `[0, 0, -20]` | 152 | (279.5, 455) | 中心 x 851.5、地面 y 1545 |

投影：側視 `px = ox + Z·ppm`，俯視 `px = ox + Z·ppm、py = oy − X·ppm`，前後視同通用流程。

**已知跨圖矛盾**（只列入報告、不驗收）：
- 指揮塔：俯視在中心線左 0.30 m，前視在 0.23 m；模型取 0.28 m，兩邊都在 8 px 內。
- 車尾：俯視的車尾線（x 95）比側視後斜板兩點延伸到後視折線高度（Y 0.895）的位置後約 0.1 m。側視有兩個直接量到的點，因此採用側視。

## 修改輪次

`calibrate.mjs` 從 baseline 快照（commit `beef116` 的 `src/tanks/t34/*.json`）產生每一輪結果，pass 會累加：

```powershell
node docs/references/t34/calibrate.mjs <original-model.json> <original-tank.json> <output-dir> [pass]
```

1. **`before.png`**：原模型。平均誤差 31.6 px，60 點超出容差或無對應零件。主要問題：
   - 車頂高 0.18 m，上車體寬 0.3 m，砲塔頂高 0.14 m、偏後 0.1 m。
   - 導輪、主動輪與履帶上段高 0.2–0.3 m（上段沒有壓在路輪上）。
   - 駕駛艙蓋、車首機槍、指揮塔、裝填手艙蓋、潛望鏡、油桶左右全部放反；天線裝在砲塔上，實車是在車體右前。
2. **pass 1 → `iteration-1.png`**：
   - 車體依基準點重建：車頂 Y 1.56、側板下緣 1.125、41° 斜側板、30° 前斜板延伸到車鼻 Y 0.773、下斜板、後斜板與下後板。下車體縮到兩條履帶之間。
   - 懸吊：路輪 Z 2.02 / 1.079 / 0.033 / −0.882 / −1.803（保留實車第 2、3 輪間較大的間距），導輪與主動輪依圖定位並縮放。履帶輪廓由各輪外接包絡產生，上段沿路輪頂部；履帶板沿新輪廓重新排列。
   - 砲塔：原本的 `turret.faceted_bustle` helper 只能等比縮頂面，這裡改為頂、底面分別設定的 polyhedron。下緣 Y 1.72、頂 2.423，Z −0.55…1.645。
   - 左右修正：駕駛與指揮塔在左（+X），機槍、裝填手與兩個油桶在右；天線改到車體右前。
   - 砲：砲軸 Y 2.062、防盾前緣 Z 1.796、砲套到 2.164、砲口 3.862，砲管前後漸細。
   - 裝甲全部改為依表面四邊形產生，厚度放在 local X；防盾以弦板覆蓋，並新增砲套板。
3. **pass 2 → `after.png`**：
   - 移除多出的右側頭燈（那個位置在圖上是天線座與油桶端）。
   - 前擋泥板末端下彎到 Y 0.78，油桶托架改為束帶。
   - 排氣罩改為貼在後斜板上的罩殼，車首機槍管加長到 Z 2.70，車側扶手移到側板下方。
   - 砲塔後部加三層環改成圓弧，手槍孔下移，防盾輪廓改圓，裝甲板跟著每一層環分段。

pass 0 與 pass 1 後各做一次獨立的疊圖審查，pass 2 後做斜視、仰俯、旋轉與合併網格審查。

## 成果

- 量測：85/85 點在 12 px（79 mm）內，平均 31.58 → 1.61 px，最大 10.88 px。見 [`measurements.md`](measurements.md)。
- 主要尺寸：
  - 車頂 Y 1.56、側板下緣 1.125、上車體寬 2.58 m（車頂 1.81 m）、含擋泥板寬 3.05 m。
  - 履帶外寬 2.95 m、履帶 0.55 m、路輪 830 mm。
  - 砲塔下緣 1.72、頂 2.423，指揮塔頂 2.70，砲軸 2.062，砲口 Z 3.862。
- Mounts：`turretOffset [0, 1.66, 0.55]`、`gunPivotOffset [0, 0.402, 0.85]`、`muzzleDistance 2.462`。
- `verify.ts`：
  - schema、量測點、830 mm 圓形路輪壓在履帶內緣、上段履帶壓在路輪上。
  - 車體接合、下車體在兩條履帶之間、砲塔座圈在車頂上、乘員配件的左右、砲口與射彈生成點一致。
  - 遊戲數值與 baseline 相同。
- `src/tanks/t34/armor.test.ts`：69 塊裝甲板。以正式碰撞程序射線，比對命中距離與由 `model.json` 重建的渲染表面（平面板 ≤40 mm、防盾 ≤0.1 m），並檢查板名唯一、厚度軸在 X。涵蓋前斜板、車鼻與下斜板 45、防盾與砲套 65、側板 45、後板 40、甲板 20、砲塔側面 52 與後板 45，以及 90° 旋轉。
- `docs/perf/merge-qa.html?tank=t34`：合併網格與零件樹像素差 0.01%（遠距 0%、損毀 0.01%），沒有主控台錯誤。
- 已檢視前／後斜視、+30°、−5°、90° 旋轉與損毀材質截圖。這些是抽樣姿態；往右旋轉時砲管會掃過車體右前的天線，實車也是如此。

限制：
- 砲塔平面仍是直邊多邊形，圖上是圓角鑄件；側面下緣的鑄造垂邊沒有做。
- 防盾與砲套是簡化的方塊與弧面；車首機槍沒有裝甲罩殼。
- 主動輪與導輪沿用 8 輻造型（圖上是開孔圓盤），履帶沒有導齒，路輪為實心盤。
- 車頂扶手、喇叭、引擎艙蓋百葉未建模。

## 重現

啟動 Vite（`npm run dev -- --host 127.0.0.1`），讓外部安裝的 Playwright 可由 `NODE_PATH` 載入（預設使用 Edge，可用 `T34_QA_BROWSER`、`T34_QA_URL` 覆寫）：

```powershell
node docs/references/t34/capture.mjs after
npx tsx docs/references/t34/verify.ts
node --import tsx --test --test-isolation=none src/tanks/t34/armor.test.ts
npm run lint
npm run build
```

`verify.ts` 需要 `before-bounds.json` 與 `after-bounds.json`，缺少時不代表驗證通過。重建 `before` 時先用 baseline 快照暫時覆蓋正式 JSON 再擷取。`--landmarks <label>` 只列出帶正負號的殘差。比對頁與腳本是開發用 fixture，不是正式 Vite entry。
