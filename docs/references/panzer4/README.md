# Panzer IV Ausf. H 比例校正紀錄

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

通用做法見 [戰車三視圖比例校正流程](../../tank-proportion-calibration.md)。本次保留原有 Ausf. H 型號，使用正式 `ParametricTankRenderer` 做三輪疊圖修正。

## 來源與登錄

- [George R. Bradford，Panzer IV Ausf. H 中期型四視圖](https://onwar.com/wwii/tanks/germany/ge047pz4hp2.html)，[原始 JPG](https://onwar.com/wwii/tanks/germany/ge047pz4hp2.jpg)。2026-09-20 下載為 `bradford-ausf-h.jpg`，1500 × 1800；圖片著作權仍屬原作者。
- [OnWar Ausf. H 資料](https://onwar.com/wwii/tanks/germany/ge047pz4h.html) 提供高度、寬度及離地高度等尺寸交叉檢查。圖稿與尺寸表的外緣定義並非完全一致，不能宣稱製造尺寸精度。
- 原始模型 commit：`baf3f68e2853e2addab1e4c53e16577e743dbcc3`。

四視圖均採 155 px/m；相機、原圖與 viewport 在 baseline 後固定。各 panel 的原點為：側視 `(815, 592)`、俯視 `(815, 274)`、前視 `(478, 485)`、後視 `(271, 485)`，panel 的位置與大小見 `compare.tsx`。圖片覆蓋透明度為 0.6。

## 修改輪次

1. 砲塔後移、調整車體屋頂與指揮塔，保持砲軸高度；路輪直徑改為 0.47 m、間距 0.495 m；側裙改為六片，修正非對稱配件方向。
2. 收短車體外殼並調整車首階梯、砲塔裙板寬度、後導輪與履帶接地輪廓，同步重建批次履帶鞋。
3. 修正裙板支架、前後擋泥板、後拖鉤、觀察窗與機槍位置，將砲塔裙板前端改成斜切輪廓。更新砲塔斜面、上下車體及裙板的碰撞覆蓋。

最終砲塔 mount 為 `[0, 1.72, -0.22]`，gun pivot 為 `[0, 0.33, 0.97]`，muzzle distance 為 3.22 m。砲塔屋頂 2.40 m、指揮塔把手頂端 2.68 m，離地高度 0.40 m。武器、機動、血量、俯仰／旋轉限制與原有裝甲厚度保持不變。

## 成果與驗證狀態

- [最終疊圖](after.png)、[純模型](after-model.png)、[前斜視](front-quarter.png)、[後斜視](rear-quarter.png)。
- `before.png`、`iteration-1.png`、`iteration-2.png` 與對應 bounds 保留各輪比較。
- [量測紀錄](measurements.md)：32 點平均誤差由 31.86 降至 1.49 原圖像素，最大 9.05 px，容差為 12 px。這是圖稿吻合度，不是實車公差。
- `verify.ts` 已通過 schema、量測、輪組接觸、砲口對齊、砲塔／車首斜面 OBB、六片裙板及遊戲數值保留檢查。
- 已檢視中立、+20°、-10°、90° 旋轉與前後斜視截圖；這些是抽樣姿態，並非全姿態碰撞證明。
- lint 與 build 在最後一次下車體側面 OBB 分段之前通過，build 有既有的大型 chunk 警告。最後的 OBB 修改已通過 `verify.ts`；使用者隨後要求停止，因此未再重跑完整 lint／build。本次文件整理沒有繼續修模。

裝甲 OBB、裙板裁角及小配件仍是遊戲用近似。README 中的數值描述本次保存版本，後續修改應重新截圖與量測。

## 重現

啟動 Vite，讓外部安裝的 Playwright 可透過 `NODE_PATH` 載入，再執行：

```powershell
node docs/references/panzer4/capture.mjs after
npx tsx docs/references/panzer4/verify.ts
```

`capture.mjs` 預設使用 Edge，可用 `PANZER4_QA_BROWSER`／`PANZER4_QA_URL` 覆寫。`calibrate.mjs` 接受原始 model、原始 tank、輸出目錄及輪次 `1`／`2`／`3`；預設為第三輪。不可把已修正的 JSON 當成原始輸入。詳細操作與停止條件見通用流程。
