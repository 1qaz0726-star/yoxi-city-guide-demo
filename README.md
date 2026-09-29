# yoxi 抵達後帶路

和泰黑客松概念原型：以手選轉盤或一句話表達當下需求，再設定時間預算，取得一段經步行路線與時間驗算的城市微路線。

## 組成

- `index.html`、`styles.css`、`app.js`：手機優先的互動 Demo。
- `worker/`：Cloudflare Worker；負責地點候選、路線、時間驗算與 AI 排序。
- `build.mjs`：將公開前端資產複製到 `dist/` 供 Cloudflare Pages 部署。

## 本機執行

```powershell
node preview.mjs
```

開啟 `http://127.0.0.1:4173`。

預覽伺服器只提供公開前端資產，不提供 Worker、設定或備份檔。需測試本機 Worker 時，先啟動 8787 埠，再開啟 `http://127.0.0.1:4173/?api=http://127.0.0.1:8787`；此覆寫僅允許本機來源。

部署前執行 `node build.mjs`，只上傳 `dist/`。地圖瀏覽器金鑰需允許實際使用的網域；正式網域可用不代表 localhost 也可用。

## 新流程與驗證

- 手選轉盤與選填的一句話可擇一使用；文字最多 120 字，解析後先顯示結構化條件。轉盤不是隨機抽籤。
- 吃東西區分正餐／小點；室內區分避曬／需要座位，缺乏座位證據時不假裝已滿足。
- 時間頁可設定返回原地、步行上限與站數；無法完成時顯示具體原因。
- 完成後可沿用結構化偏好及排除條件，不儲存使用者輸入的原文。
- 回歸測試：`node --test worker/tests/plan.test.mjs worker/tests/intent.test.mjs`。

## 金鑰

金鑰只放在 Cloudflare Worker secrets，絕不放入 repository。Google Maps 正式接入需要：

- `GOOGLE_MAPS_BROWSER_KEY`：Maps JavaScript API，設定網站來源限制。
- `GOOGLE_MAPS_SERVER_KEY`：Places API (New) 與 Routes API，只留在 Worker。

詳細設定請見 `worker/GOOGLE_SETUP.md`。

## 已知產品邊界

- 未串接 yoxi 真實乘車紀錄、叫車後端或官方聚合訊號。
- 「安靜」、「有座位」與抵達時營業狀態不是保證；介面會區分偏好與可驗證資料。
- 使用者的完成／跳過／回饋為手動確認，未做背景 GPS 追蹤。
