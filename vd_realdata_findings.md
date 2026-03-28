# LanePilot - VD 即時資料實測發現與修正清單

## 實測時間: 2026-03-28 15:28 (週六下午)

## 實測結果摘要
- URL: `https://tisvcloud.freeway.gov.tw/history/motc20/VDLive.xml` (非 gzip, 約 5MB)
- 全台 VD 站數: 3,315
- 國1北向 60K~100K: 79 站
- XML namespace: `http://traffic.transportdata.tw/standard/traffic/schema/`
- 更新間隔: 60 秒

## 需修正項目

### 1. [高] URL 修正
- 舊: `https://tisvcloud.freeway.gov.tw/history/motc20/VD.xml.gz`
- 新: `https://tisvcloud.freeway.gov.tw/history/motc20/VDLive.xml`
- 非 gzip 壓縮, 直接是 XML

### 2. [高] VDID 格式解析
舊假設: `nfbVD-N1-N-89.000-M-LOOP`
實際格式: `VD-N{road}-{dir}-{mileage}-{type}-{subtype}[-{name}]`

類型代碼:
- `M` = 主線 (M-LOOP, M-RS) -> **這才是我們要的**
- `N` = 主線 (N-LOOP) -> 也要
- `I` = 入口匝道 (I-EN, I-WN) -> 過濾掉
- `O` = 出口匝道 (O-SE, O-SW) -> 過濾掉
- `C` = 連絡道 -> 過濾掉
- `R` = 服務區便道 -> 過濾掉

### 3. [高] 過濾匝道 VD
匝道 VD 只有 1~2 車道, 速度反映匝道而非主線, 會嚴重干擾分析.
只保留 type 為 M 或 N 的 VD 站.

### 4. [中] 車道命名動態化
實測車道數: 3~5 道不等
- 3 道: L0=内側, L1=中, L2=外側
- 4 道: L0=内側, L1=中內, L2=中外, L3=外側
- 5 道: L0=内側, L1=中內, L2=中線, L3=中外, L4=外側

需要根據實際車道數量動態命名, 不能硬編碼.

### 5. [中] XML 結構差異
舊假設:
```xml
<Lane>
  <LaneID>0</LaneID>
  <Speed>92</Speed>
  <Volume>15</Volume>
  <Occupancy>12</Occupancy>
</Lane>
```

實際結構:
```xml
<Lane>
  <LaneID>0</LaneID>
  <LaneType>1</LaneType>
  <Speed>86</Speed>         <!-- 整體平均速度 -->
  <Occupancy>30</Occupancy> <!-- 整數百分比, 不是 0~1 -->
  <Vehicles>
    <Vehicle>
      <VehicleType>S</VehicleType>  <!-- S=小車 -->
      <Volume>34</Volume>
      <Speed>85</Speed>
    </Vehicle>
    <Vehicle>
      <VehicleType>L</VehicleType>  <!-- L=大車 -->
      <Volume>0</Volume>
      <Speed>0</Speed>
    </Vehicle>
    <Vehicle>
      <VehicleType>T</VehicleType>  <!-- T=聯結車 -->
      <Volume>0</Volume>
      <Speed>0</Speed>
    </Vehicle>
  </Vehicles>
</Lane>
```

修正:
- Occupancy 是整數百分比 (30 = 30%), parser 中除以 100 轉為 0~1
- Volume 需從 Vehicles 加總
- 有 XML namespace, 需用 ns prefix 查詢

### 6. [低] speed=0 不一定是異常
實測發現部分 speed=0, volume=0, occupancy=0 的車道
可能是: (a) 該車道無車通過 (b) 設備異常 (c) 車道關閉
建議: speed=0 且 volume=0 且 occupancy=0 -> 視為無資料, 不顯示
      speed=0 但 occupancy>0 -> 視為嚴重壅塞 (車停住了)

## 實測觀察到的真實路況 (2026-03-28 15:28)

### 瓶頸路段
1. **94K (新竹系統-竹北段)**: 全線壅塞, 内側 37, 中內 37, 中線 41
2. **88K (湖口上游)**: 内側 48 vs 中外 84, 速差 36 km/h
3. **83.59K (湖口附近)**: 全線車多, 69/61/60

### 順暢路段
- 85K~79K: 全線 80~100 km/h
- 70K~62K: 大部分順暢, 部分中線較慢

## 後續行動
- [ ] 修正 lane_advisor.py 的 URL 和 parser
- [ ] 加入 VDID 類型過濾 (只留主線)
- [ ] 動態車道命名
- [ ] 更新 test_engine.py 測試案例
- [ ] commit 推上 GitHub
