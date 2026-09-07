# yoxi 抵達後帶路

和泰黑客松概念原型：使用者抵達陌生街區或自行到達後，以三層直覺選擇與時間預算，取得一段可完成的城市微路線。

## 組成

- `index.html`、`styles.css`、`app.js`：手機優先的互動 Demo。
- `worker/`：Cloudflare Worker；負責地點候選、路線、時間驗算與 AI 排序。
- `build.mjs`：將公開前端資產複製到 `dist/` 供 Cloudflare Pages 部署。

## 本機執行

```powershell
node build.mjs
node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p==='/')p='/index.html';const f=path.resolve(root,'.'+p);fs.readFile(f,(e,b)=>{res.writeHead(e?404:200);res.end(e?'Not found':b);});}).listen(4173)"
```

開啟 `http://127.0.0.1:4173`。

## 金鑰

金鑰只放在 Cloudflare Worker secrets，絕不放入 repository。Google Maps 正式接入需要：

- `GOOGLE_MAPS_BROWSER_KEY`：Maps JavaScript API，設定網站來源限制。
- `GOOGLE_MAPS_SERVER_KEY`：Places API (New) 與 Routes API，只留在 Worker。

詳細設定請見 `worker/GOOGLE_SETUP.md`。

## 已知產品邊界

- 未串接 yoxi 真實乘車紀錄、叫車後端或官方聚合訊號。
- 「安靜」、「有座位」與抵達時營業狀態不是保證；介面會區分偏好與可驗證資料。
- 使用者的完成／跳過／回饋為手動確認，未做背景 GPS 追蹤。
