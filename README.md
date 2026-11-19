# Renaiss Badge Studio

可替換圖案的 3D 金屬徽章工作室，以 Three.js、WebGL 2 與 Vite 建置。

## 本機啟動

需要 Node.js 22.12 或更新版本。

```sh
npm ci
npm run dev
```

開啟 <http://127.0.0.1:5173/badges/>。根目錄會導向相同的工作室入口。

```sh
npm run build
npm run preview
```

正式建置輸出位於 `dist/`，可部署至支援靜態網站的服務。

## Vercel 部署

將此 GitHub repository 匯入 Vercel，使用 repository 根目錄，Node.js 選擇 24.x。`vercel.json` 已指定 Vite、`npm ci`、`npm run build` 與 `dist` 輸出目錄。

正式部署分支使用 `main`。根網址會導向 `/badges/`；HTML 每次重新驗證，帶內容雜湊的 JS、CSS 與圖片使用一年 immutable 快取。部署後需核對實際功能、壓縮與回應標頭。

## 操作

- 單指或滑鼠拖曳：整面徽章牆可上下左右移動，放手後依速度慣性滑行。
- 雙指拖曳或觸控板捲動：按位移比例旋轉徽章，放手保留當前角度。
- 「轉動」、「翻面」、「重播進場」：控制整面徽章牆。
- 統一金色、統一銀色或逐一自訂金屬顏色，可切換保留圖片原色。
- 「弧面造型」：切換微弧面與平直表面，預設開啟；與淺浮雕可分別開關，並記住本機設定。
- 「淺浮雕圖案」：根據明暗及色塊產生微凸的表面幾何，可調整高度；此功能是簡單影像分析，不是語意辨識或精密 3D 重建。
- 支援 PNG、JPG、WebP 與 SVG，單張替換或整組匯入，每組最多 24 張。
- 「進入展示」：隱藏編輯介面；滑鼠移至左上角、觸控左上角或使用鍵盤 Tab 顯示返回入口，也可按 Escape 返回編輯。

圖片及設定使用 IndexedDB 儲存於目前瀏覽器，不會自動同步至其他瀏覽器或裝置。首次使用會載入 repo 內的七張預設 Renaiss 圖案。

## 結構

```text
app/badges/index.html        工作室頁面
app/src/badges/
  main.js                   載入、操作與儲存協調
  scene.js                  場景與渲染生命週期
  models.js / outline.js    徽章組裝與輪廓
  body.js                   平直／弧面本體與平順切換
  relief.js                 圖像分析與淺浮雕幾何
  lighting.js / surfaces.js 金屬與反射環境
  motion.js                 整面牆的配置及慣性
  rotation-input.js         指標、觸控與觸控板輸入
  studio-ui.js              設定介面
  presentation.js           展示模式
  images.js / storage.js    圖片匯入與 IndexedDB
  settings.js               設定驗證與配色
  artwork/                  七張預設圖案
```

此 repo 僅收錄徽章工具的必要來源與預設圖案。使用者另行匯入並存在瀏覽器的圖片，不會隨 repo 上傳。

## 驗證範圍

已驗證實際介面的圖片替換、批次匯入、還原、配色、浮雕高度、儲存後重新讀取、展示模式，以及以原生瀏覽器觸控事件驗證比例旋轉與慣性減速。手機版已完成視窗尺寸與觸控模擬，仍需實體裝置驗收。
