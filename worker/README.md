# yoxi 抵達後帶路 Worker MVP

此 Worker 為「抵達後 15–120 分鐘空檔」提供真實 POI、逐段步行路線、時間驗算與預留緩衝。它不讀取行事曆或下一站，也不聲稱具有即時人潮、排隊、安靜程度或未提供的 yoxi 資料。緩衝不是準時或安全保證。

## Cloudflare 設定

| 名稱 | 類型 | 用途 |
| --- | --- | --- |
| `GOOGLE_MAPS_SERVER_KEY` | Secret | Google Places API (New) 與 Routes API；只留在 Worker。 |
| `GOOGLE_MAPS_BROWSER_KEY` | Secret | 來源受限的 Google Maps JavaScript API 公開 browser key。 |
| `GEOAPIFY_SERVER_API_KEY` | Secret | Google 雙 key 未齊備時的 Geoapify 備援。 |
| `GEOAPIFY_BROWSER_KEY` | Secret | 前端載入 Geoapify 地圖圖磚時使用；Worker 的受限 `/api/config` 只會回傳這把來源受限的公開 maps key。 |
| `OPENROUTER_API_KEY` | Secret | 只用於從真實候選 ID 中排序與選點；失敗時自動退回確定性規則。 |
| `ALLOWED_ORIGINS` | 一般 Variable | Pages 網址，逗號分隔。本機 localhost / 127.0.0.1 已允許。 |

server key 不得放入網頁、Git 或對話；browser key 應以網站來源限制。Google 雙 key 齊備才整組切換；Google 執行錯誤不暗中改供應商。完整設定與費用注意事項見 [GOOGLE_SETUP.md](GOOGLE_SETUP.md)。

## API 契約

- `GET /health`：回傳供應商及各 key 是否已設定，不代表已驗證上游服務。
- `GET /api/places?q=咖啡&lat=25.033&lng=121.565&radius=1500`：依意圖類別與位置取得附近 POI。回傳名稱、地址、座標、類別與距離；不保證營業狀態。
- `POST /api/route`：body 為 `{"origin":{"lat":25.033,"lng":121.565},"destination":{"lat":25.047,"lng":121.517},"travelMode":"WALK"}`。可用 `WALK`、`DRIVE`、`BICYCLE`，回傳 GeoJSON 路線。
- `POST /api/plan`：接收一次定位、三層偏好與 15–120 分鐘時間預算。AI 只能選擇當前供應商候選 ID；Worker 驗算每一段步行路線，並確認「步行＋停留＋緩衝＋彈性剩餘」等於時間預算。支援 `returnToOrigin`、`excludePlaceIds` 與 `plannerMode: "rules"`；返程納入總步行與路線。

沒有可用供應商時資料端點回傳 `503`；未設定 `OPENROUTER_API_KEY` 時仍以真實距離與時間排序。整體規劃上游等待預算為 30 秒，單次地圖 9 秒、AI 8 秒；逾時不回傳未驗算方案。CORS 僅允許本機來源與 `ALLOWED_ORIGINS`，並非身分驗證。正式公開前，請在 Cloudflare 對 `/api/*` 加上 Rate Limiting Rule，避免公開端點被濫用成付費 API proxy。
