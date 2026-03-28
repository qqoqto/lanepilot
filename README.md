# 路道通 LanePilot

台灣國道即時車道建議 App — 告訴你「現在該走哪一道」

## 這是什麼

現有的 1968 和 Google Maps 只告訴你「這段塞不塞」，LanePilot 做到的是車道層級的分析：「外側 52、内側 92，快切内側」。

透過高公局 VD（車輛偵測器）即時資料，分析各車道的速度差異，即時給出切換建議。

## 功能

- **即時車道速度** — 顯示前方 VD 站各車道的即時速率
- **車道建議引擎** — 綜合速度、佔有率、趨勢計算最佳車道
- **瓶頸偵測** — 自動標記連續速降路段
- **路肩開放判定** — 根據排程自動判斷路肩是否可行駛，未開放時不會顯示
- **通勤推播** — 設定常用路線，出發前自動推播車道建議

## 快速開始

```bash
# 安裝依賴
pip install httpx lxml

# Demo 模式 (模擬資料，不需網路)
python engine/lane_advisor.py --demo

# 即時模式 (連 tisvcloud 抓真實資料)
python engine/lane_advisor.py

# JSON 輸出 (給前端用)
python engine/lane_advisor.py --json > demo_data.json
```

## 專案結構

```
lanepilot/
├── engine/
│   └── lane_advisor.py     # 車道建議引擎 (資料擷取+清洗+評分+建議)
├── api/                     # FastAPI 後端 (TODO)
├── config/
│   └── shoulder_schedule.json  # 路肩開放排程
├── tests/
│   └── test_engine.py       # 引擎單元測試
├── docs/
│   └── lanepilot-prd-v1.0.docx  # 產品需求文件
├── requirements.txt
├── .gitignore
└── README.md
```

## 車道建議引擎

引擎每 60 秒循環執行（配合高公局 >40 秒輪詢限制），分為六個階段：

| 階段 | 名稱 | 說明 |
|------|------|------|
| 1 | 資料擷取與清洗 | 解析 VD XML，濾除異常值 (speed=0 或 >200) |
| 2 | 速度平滑與分級 | EMA 平滑 (α=0.3) + 三級分類 (順暢/車多/壅塞) |
| 3 | 車道評分模型 | `score = speed×0.6 + (1-occ)×0.25 + trend×0.15` |
| 4 | 瓶頸偵測 | 連續 2 站速降 >20 km/h 判定為瓶頸 |
| 5 | 建議生成 + 防抖 | 90 秒冷卻期 + 信心門檻 |
| 6 | 輸出 | 建議文字 + 色塊狀態 + 語音文字 |

### 路肩處理

路肩只有在特定時段開放通行，引擎的處理原則是「寧可不顯示，也不能建議使用者違規行駛路肩」：

- **路肩未開放** → VD 路肩資料直接丟棄，UI 不顯示
- **路肩開放中** → 獨立顯示，標注限速和使用限制（限出口/可匯入）
- **路肩不會被選為「最佳車道」** → 評分上限 65 分，建議只在主線車道之間比較
- **路肩類型 1（銜接出口）** → 建議文字：「路肩開放中，限往XX出口方向，不可切回主線」
- **路肩類型 2（接一般車道）** → 建議文字：「路肩開放中，可匯入主線車道」

## 資料來源

| 資料集 | 來源 | 更新頻率 |
|--------|------|----------|
| VD 動態資料 | tisvcloud.freeway.gov.tw | 每分鐘 |
| TDCS M05A | tisvcloud.freeway.gov.tw | 每 5 分鐘 |
| VD 靜態資料 | tisvcloud.freeway.gov.tw | 每日 |
| CCTV 即時影像 | tisvcloud.freeway.gov.tw | 即時 |

資料來源聲明：交通部高速公路局「交通資料庫」

## 技術棧

- **App**: React Native
- **後端**: FastAPI (Python)
- **快取**: Redis
- **資料庫**: PostgreSQL
- **部署**: Railway

## 開發階段

| 階段 | 範圍 | 狀態 |
|------|------|------|
| Phase 1 MVP | 新竹周邊，即時車道+建議+路肩+推播 | 進行中 |
| Phase 2 | 歷史分析、預測模型、我的路線 | 規劃中 |
| Phase 3 | 全台國道、社群回報、CarPlay/AA | 規劃中 |

## License

MIT
