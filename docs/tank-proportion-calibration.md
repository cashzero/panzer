# 戰車三視圖比例校正流程

這份文件記錄 Tiger I、Sherman、Panzer II 與 Panzer IV 使用的流程：下載對應型號的參考圖，以正式遊戲 renderer 產生正交視圖，在固定相機與比例尺下反覆疊圖、修改模型，最後核對碰撞面與遊戲數值。

成果是符合參考資料精度的遊戲模型。掃描圖、模型塗裝圖與簡化幾何都有誤差，不能把疊圖吻合視為製造尺寸認證。

## 1. 確認型號與修改範圍

先閱讀根目錄 `CLAUDE.md`、[`src/tanks/CLAUDE.md`](../src/tanks/CLAUDE.md)，以及目標車型的 README、`model.json`、`tank.json`。

記錄具體型號與辨識特徵，例如 Ausf. H、75 mm／76 mm、焊接／鑄造車體、懸吊形式、裙板與指揮塔。遊戲顯示名稱不足以決定應使用哪張圖。

| 檔案 | 本流程處理內容 |
|---|---|
| `src/tanks/<id>/model.json` | 車體、砲塔、砲管、輪組、履帶與配件的幾何 |
| `src/tanks/<id>/tank.json` | `mounts`、砲口距離、裝甲碰撞面的尺寸與位置 |
| `docs/references/<id>/` | 來源、疊圖工具、每輪截圖、量測與限制 |

預設保留武器、機動、血量、砲塔轉速、俯仰限制與原有裝甲厚度。若新增幾何碰撞面，依對應部位沿用厚度，並記錄新增項目。移動碰撞面本身會改變命中範圍，即使厚度不變。

開始前執行 `git status --short`，保留其他工作。另存原始兩份 JSON，記錄 baseline commit；如果目標車型已有未提交修改，原始快照應包含這些修改，不能直接把 HEAD 當作實際起點。

## 2. 下載並檢視參考資料

優先尋找同一型號、同一生產時期的側、俯、前視圖；有後視圖時一併使用。優先採用有標註尺寸、比例尺與作者的圖，再以其他資料交叉核對。

每個來源記錄：

- 網頁與原始圖片／PDF 連結、作者及下載日期。
- 本地檔名、原始解析度；PDF 記錄頁碼與轉圖倍率。
- 型號、可用視圖、尺寸依據及不適用的特徵。

先實際開圖確認內容，不能只憑搜尋標題判斷。保留原圖；裁切、拼版或放大後的比對圖另存，記錄轉換方式。參考圖是研究資料，不直接加入遊戲材質。

混用不同型號時必須限制範圍。例如 Panzer II 的 F 型側／前／後圖用於 F 型外形；C 型俯視圖只輔助共用佈局，不能拿 C 型艙蓋、車首或車高去改 F 型。

## 3. 建立正式 renderer 的正交比對頁

可從既有車型複製下列開發工具，再逐項改成新車型：

```text
docs/references/<id>/
  compare.html
  compare.tsx
  capture.mjs
  calibrate.mjs
  verify.ts
  README.md
```

`compare.tsx` 必須使用 `createParametricRenderer` 與實際 JSON，組合 hull、左右 tracks、turret、gun，並套用 `tank.mounts.turretOffset` 和 `gunPivotOffset`。不能用另外重建的示意模型代替。

正交視圖先設為砲塔朝前、砲管水平，使用透明背景、穩定燈光與固定 viewport。參考圖約 60% 不透明度，能同時看出原圖線條與模型外輪廓。

座標約定：公尺、`+Y` 向上、`+Z` 車首；在目前模型約定中，車輛左側為 `+X`。slot 名稱或零件 ID 不一定等同實車左右，應以座標、相機方向和參考圖共同確認。

| 視圖 | 相機位置方向 | up |
|---|---|---|
| 側視，車首朝畫面左 | `[20, 0, 0]` | `[0, 1, 0]` |
| 俯視，車首朝畫面左 | `[0, 20, 0]` | `[-1, 0, 0]` |
| 前視 | `[0, 0, 20]` | `[0, 1, 0]` |
| 後視 | `[0, 0, -20]` | `[0, 1, 0]` |

複製工具後檢查 import、圖片名稱、HTML 尺寸、各 panel 範圍、browser global、環境變數名稱、等待條件、零件 ID、俯仰角與 baseline commit。既有的「超過 150 個節點」等待條件只適用於那些模型，不能當成通用載入標準。

## 4. 固定比例尺與基準點

由比例尺或可辨識的已知尺寸計算 `ppm`（pixels per meter），再用地面線、車身中心線與輪軸中心定位原點。注意尺寸定義：砲管朝前總長、車體長、含擋泥板長、含裙板寬、是否含天線，不能混用。

每一視圖使用一致的水平與垂直比例，不可為了吻合模型而單獨拉伸圖片的寬或高。掃描中的各視圖可能比例略有不同，可以分別校準，但須記錄依據。

相機看向原點，panel 尺寸為 `width × height`、原點為 `(ox, oy)` 時：

```text
camera.left   = -ox / ppm
camera.right  = (width - ox) / ppm
camera.top    = oy / ppm
camera.bottom = -(height - oy) / ppm
```

在上述相機方向下，panel 內的投影關係為：

```text
側視：px = ox - Z × ppm；py = oy - Y × ppm
俯視：px = ox - Z × ppm；py = oy + X × ppm
前視：px = ox + X × ppm；py = oy - Y × ppm
後視：px = ox - X × ppm；py = oy - Y × ppm
```

讀整張圖的座標時，再加上 panel 的 `left`、`top`。

**建立 baseline 後，所有輪次都使用相同相機、原點、ppm、圖片轉換與解析度。** 如果發現登錄錯誤，應修正登錄並重新產生原始模型的 baseline，而非只移動最終模型的相機。

## 5. 先量測，再逐輪修改

從原圖獨立讀取量測點，覆蓋不同部位與視圖，例如：車首／車尾、車體與砲塔屋頂、砲軸／砲口、指揮塔位置、首末路輪、主動輪／導輪、履帶外寬與裙板邊界。

輪組、艙蓋等被遮住的尺寸要降低信心，不能用猜測值宣稱精確吻合。將無法核對的細節列為限制，避免只挑已經吻合的點。

建議依序處理：

1. **主要輪廓**：車體長寬高、離地高度、砲塔位置／寬高、砲軸與砲管伸出量。
2. **結構比例**：輪徑、輪距、懸吊位置、履帶包絡、艙蓋、指揮塔、裙板片數及輪廓。
3. **連接與細節**：擋泥板、支架、排氣管、觀察窗、砲盾、制退器，以及浮空或穿插的配件。

每輪執行「修改 → 正交截圖 → 查看疊圖及純模型 → 記錄殘差 → 決定下一輪」。保留 `before`、`iteration-1`、`iteration-2`、`after` 等明確標籤。

幾何處理注意事項：

- 改輪距時移動輪心，不要把整組輪子非等比縮放成橢圓；輪徑改動須保持圓形，並重查輪胎與履帶內表面的接觸。
- 改履帶輪廓後，重新沿封閉輪廓分布履帶鞋。原本採 batched polyhedron 的模型保持批次幾何，避免增加大量 draw calls。
- 砲塔與砲管使用各自 local 座標，透過 mounts 組合；移動砲塔後重算砲口世界座標。
- 鏡射非對稱配件時，同步處理位置、旋轉、repeat step 與子節點；不要盲目鏡射整個 extrude 或所有 slot。
- 不要對整份 `tank.json` 做數字四捨五入；只整理需要修改的幾何，避免改掉原有機動參數的小數精度。

`calibrate.mjs` 應從不可變的原始快照產生每一輪結果。這類 migration 通常不是冪等的，不能把已校正的 JSON 再當輸入，否則會重複縮放或位移。

## 6. 同步砲口與裝甲碰撞面

砲塔朝前、砲管水平時：

```text
muzzleWorldZ = turretOffset.z + gunPivotOffset.z + muzzleDistance
```

這個位置應對齊實際砲口出口；有制退器時核對最後出口，不只看砲管圓柱的端點。俯仰／旋轉後則需使用完整父子 transform 檢查。

裝甲 OBB 要使用所屬 parent 的 local 座標。車體、砲塔與 gunGroup 的座標不可混用。改斜板時也要改旋轉；對斜面可以把面頂點轉入 OBB local 空間，驗證頂點落在板面且位於半尺寸範圍內。

寬度不同的上車體與下車體應使用不同側面。裙板按實際分片配置，斜車首與引擎側面可用短段近似，避免一個大盒子在模型外形成大片不可見裝甲。OBB 對裁角、弧面仍有近似誤差，應在紀錄中說明。

## 7. 驗證與停止條件

自動量測使用正式場景的 `THREE.Box3().setFromObject()`，先呼叫 `scene.updateMatrixWorld(true)`。遞迴為節點設定穩定名稱，輸出 `*-bounds.json`。AABB 適合量測外緣、中心與寬度，不能直接代表斜面頂點或斜板厚度。

`verify.ts` 應依車型檢查：

- editor schema 無錯誤，幾何數值有限且尺寸合理。
- 固定量測點的逐點誤差、平均值與最大值；不只報平均值。
- 輪子保持圓形、接地關係、車體接合與砲口對齊。
- 裝甲面與更新後的主要幾何一致。
- 對 baseline 比較武器、機動、血量、轉速、俯仰限制與既有厚度。

容差在量測前依解析度與線條粗細設定。既有案例常用 12 顯示像素，但不能不加判斷地套用：Panzer IV 是原生像素；Panzer II 是兩倍顯示，因此 12 顯示像素只等於 6 原圖像素。不同圖的平均像素誤差不能直接比較。

另外查看純模型、前後斜視、最大仰角／俯角、砲塔旋轉，檢查浮空、穿插、缺面、輪組及配件連接。既有 fixture 的 `mode=perspective` 實際使用斜向正交相機，名稱不代表透視投影。單一 90° 截圖也不等於全旋轉範圍無干涉。

完成模型修改後執行 `npm run lint` 與 `npm run build`。若最後一次驗證後又修改模型或碰撞面，相關檢查應重跑，或清楚記錄最後哪些修改尚未驗證。

當主要量測點在容差內、各視圖沒有明顯比例矛盾、活動與連接檢查完成、相關驗證通過，即可停止。若使用者明確說「good enough／stop」，立即停止修模，保留目前成果並如實記錄狀態；不要為追求零像素誤差繼續工作。

## 8. 執行範例：Panzer IV

從 repository 根目錄執行。第一個終端啟動 Vite：

```powershell
npm run dev -- --host 127.0.0.1
```

第二個終端執行；`NODE_PATH` 請改成自己外部安裝 Playwright 的位置：

```powershell
$env:NODE_PATH = 'E:/work/panzer-qa-tools/node_modules'
node docs/references/panzer4/capture.mjs review
npx tsx docs/references/panzer4/verify.ts
npm run lint
npm run build
```

`review` 會新增 review 截圖與 bounds，不會覆蓋歷史 baseline。`verify.ts` 目前讀取保存的 `before-bounds.json` 與 `after-bounds.json`；如果要驗證新修改，先用 `capture.mjs after` 更新最終截圖與 bounds。只有 `after` 標籤會額外產生斜視、俯仰與旋轉截圖。

捕捉工具預設使用 Edge。可設定 `PANZER4_QA_BROWSER` 指向瀏覽器執行檔，或用 `PANZER4_QA_URL` 指定 Vite URL。其他車型的環境變數名稱依各自腳本為準。

重現修改的指令形狀如下，輸入必須是原始快照，輸出目錄必須先存在：

```powershell
node docs/references/panzer4/calibrate.mjs <original-model.json> <original-tank.json> <output-directory> 3
```

此命令會覆寫輸出目錄中的兩份 JSON。先輸出到獨立目錄核對，再更新正式檔案。不要用目前已校正的 `src/tanks/panzer4/*.json` 當原始輸入。

## 9. 保存成果與案例索引

每個車型的 README 應記錄型號、來源、比例尺與原點、baseline、每輪修改、容差、驗證結果及已知限制，並在車型 README 放上連結。

Git 只保存流程文件、來源連結、量測摘要與可重用腳本。下載的圖片／PDF、產生的截圖與 `*-bounds.json` 保留在本機 `docs/references/<id>/`，由 `.gitignore` 排除；需要長期保存時另行封存到 repository 之外。不要把每一輪大型中間產物提交進 repo。

新 clone 不會包含這些本機檔案，圖片連結也需要下載或重建後才可開啟。先依車型 README 下載原圖，重建衍生參考圖，再用 baseline 快照產生 `before`、用目前模型產生 `after`，最後執行 `verify.ts`。既有 `verify.ts` 依賴這些 bounds，缺少時不代表模型驗證通過。可用獨立 checkout／worktree 產生 baseline，避免覆寫目前的模型。

| 案例 | 可參考的工作 |
|---|---|
| [Tiger I](references/tiger/README.md) | 四視圖配合砲塔尺寸圖、跨視圖比例差異與左右配置 |
| [Sherman](references/sherman/README.md) | VVSS bogie／輪距、車體寬度、指揮艙蓋與砲管伸出量 |
| [Panzer II](references/panzer2/README.md) | F 型與 C 型資料的適用邊界、指揮塔及斜面 OBB |
| [Panzer IV](references/panzer4/README.md) | 砲塔後移、六片裙板、輪徑與間距、裙板斜切及支架 |

這些比對頁與腳本是開發用 fixture，不應額外加入正式 Vite build entry。
