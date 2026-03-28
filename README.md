# 路道通 LanePilot

台灣國道即時車道建議 App — 告訴你「現在該走哪一道」

## 這是什麼

現有的 1968 和 Google Maps 只告訴你「這段塞不塞」，LanePilot 做到的是車道層級的分析：「外側 52、内側 92，快切内側」。

透過高公局 VD（車輛偵測器）即時資料，分析各車道的速度差異，即時給出切換建議。

## 功能

- **即時車道速度** — 顯示前方 VD 站各車道即時速率，支援國1/國3/國1高架全台切換
- **車道建議引擎** — 綜合速度、佔有率、趨勢計算最佳車道，自動判斷是否值得切換
- **瓶頸偵測** — 自動標記連續速降路段，紅色警報提示
- **路段總覽** — 多車道色帶一目瞭然（紅/黃/綠），12 路段區間可切換
- **路肩開放判定** — 根據排程自動判斷路肩是否可行駛，未開放時不顯示
- **通勤路線** — 設定常用路線，出發前推播車道建議（UI 完成）

## 截圖

即時車道速度 + 建議條 + 前方路段色帶 + 瓶頸警報

## 快速開始

### 一鍵啟動（Windows）

雙擊 `lanepilot-start.bat`，自動啟動 API + App + 開瀏覽器。

### 手動啟動

```bash
# 安裝依賴
pip install httpx lxml fastapi uvicorn
cd mobile && npm install && cd ..

# Terminal 1: 啟動後端 API
uvicorn api.server:app --reload --port 8000

# Terminal 2: 啟動 Expo App
cd mobile && npx expo start --web
```

瀏覽器開 http://localhost:8081 即可使用。

### 引擎獨立測試

```bash
# Demo 模式（模擬資料，不需網路）
python engine/lane_advisor.py --demo

# 即時模式（連 tisvcloud 抓真實資料）
python engine/lane_advisor.py

# 執行測試（12 個測試）
python tests/test_engine.py
```

## 專案結構

```
lanepilot/
├── engine/
│   └── lane_advisor.py          # 車道建議引擎 v1.2
├── api/
│   └── server.py                # FastAPI 後端（4 端點 + 背景排程）
├── mobile/                      # Expo React Native App
│   ├── App.js                   # Tab 導航主入口
│   ├── constants.js             # 共用常數和 helpers
│   └── screens/
│       ├── RealtimeScreen.js    # 即時車道速度 + 建議
│       ├── SectionsScreen.js    # 路段總覽 + 色帶
│       ├── CommuteScreen.js     # 通勤路線
│       └── SettingsScreen.js    # 設定
├── config/
│   └── shoulder_schedule.json   # 路肩開放排程
├── tests/
│   └── test_engine.py           # 12 個單元測試
├── docs/
│   └── lanepilot-prd-v1.0.docx # 產品需求文件
├── test_vd_live.py              # VD 即時資料測試腳本
├── vd_realdata_findings.md      # 真實資料分析筆記
├── lanepilot-start.bat          # Windows 一鍵啟動
├── Dockerfile                   # Railway 部署用
├── requirements.txt
└── README.md
```

## API 端點

| 端點 | 說明 |
|------|------|
| `GET /` | 健康檢查 |
| `GET /api/v1/status` | 系統狀態（資料更新時間、站數） |
| `GET /api/v1/lanes/realtime?road=1&dir=N&km=88` | 指定位置各車道即時速度 + 建議 |
| `GET /api/v1/sections?road=1&dir=N&km_min=60&km_max=100` | 路段總覽 + 瓶頸 + 摘要 |
| `GET /api/v1/bottlenecks?road=1&dir=N` | 瓶頸列表 |

Swagger 文件：http://localhost:8000/docs

## 車道建議引擎

引擎每 60 秒從高公局抓取 VDLive.xml（約 5MB，3315 個 VD 站），篩選主線偵測器（過濾匝道），動態命名車道（3~5 道不等），計算評分並生成建議。

### 評分模型

```
score = speed_norm × 0.6 + (1 - occupancy) × 0.25 + trend × 0.15
```

### 建議邏輯

| 速差 | 建議 | 信心 |
|------|------|------|
| < 15 km/h | 維持目前車道 | 低 |
| 15~30 km/h | 可考慮切換 | 中 |
| > 30 km/h | 建議立即切換 | 高 |

### 路肩處理

路肩只有在特定時段開放通行，處理原則是「寧可不顯示，也不能建議違規行駛路肩」：

- 路肩未開放 → VD 資料丟棄，UI 不顯示
- 路肩開放中 → 獨立顯示，標注限速和使用限制
- 路肩不會被選為「最佳車道」→ 評分上限 65 分
- 類型 1（銜接出口）→「限往XX出口方向，不可切回主線」
- 類型 2（接一般車道）→「可匯入主線車道」

### speed=0 處理

- speed=0 + volume=0 + occupancy=0 → 無資料，丟棄
- speed=0 + occupancy>0 → 嚴重壅塞（車停住了），保留

## 資料來源

| 資料集 | URL | 格式 |
|--------|-----|------|
| VD 即時資料 | tisvcloud.freeway.gov.tw/history/motc20/VDLive.xml | XML, ~5MB, 每分鐘更新 |

資料來源聲明：交通部高速公路局「交通資料庫」

## 技術棧

- **App**: React Native (Expo)
- **後端**: FastAPI (Python)
- **快取**: 記憶體快取（MVP 階段）
- **部署**: Railway（新加坡機房，等 TDX API 解決資料源）
- **資料**: 高公局 tisvcloud VDLive.xml

## 開發階段

| 階段 | 範圍 | 狀態 |
|------|------|------|
| Phase 1 MVP | 全台國道即時車道 + 建議 + 路肩 + 路段總覽 | **進行中** |
| Phase 1.5 | TDX API 接入、Railway 上線、GPS 定位、語音播報 | 待 TDX 審核 |
| Phase 2 | 歷史分析、預測模型、通勤推播 CRUD | 規劃中 |
| Phase 3 | 社群回報、CarPlay/Android Auto | 規劃中 |

## License

MIT
