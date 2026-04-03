"""
LanePilot - VD API 資料擷取與車道建議引擎 Prototype v1.1
========================================================
使用方式:
  1. pip install httpx lxml
  2. python lanepilot_prototype.py          # 抓即時資料 + 分析
  3. python lanepilot_prototype.py --demo   # 用模擬資料示範引擎
  4. python lanepilot_prototype.py --json   # JSON 格式輸出

v1.1 更新: 新增路肩開放判定與車道建議整合
  - 路肩排程表 (固定時段 + 連假機動開放)
  - 路肩未開放時自動排除 VD 路肩資料
  - 路肩開放時獨立顯示, 不會被選為「最佳車道」
  - 路肩建議以補充說明呈現, 標注限速和使用限制

資料來源: 交通部高速公路局「交通資料庫」
注意: 輪詢間距必須大於 40 秒
"""

import sys
import json
from datetime import datetime, time as dtime, timedelta
from dataclasses import dataclass
from typing import Optional


# ============================================================
# 1. 資料模型
# ============================================================

@dataclass
class LaneData:
    lane_id: int
    lane_name: str
    speed: float
    volume: int
    occupancy: float
    is_shoulder: bool = False

@dataclass
class VDStation:
    vd_id: str
    road_id: str
    direction: str
    mileage: float
    location_desc: str
    lanes: list
    data_time: str
    status: int

@dataclass
class LaneScore:
    lane_name: str
    speed: float
    score: float
    level: str
    color: str
    is_shoulder: bool = False
    shoulder_speed_limit: int = 0
    shoulder_exit_only: bool = False

@dataclass
class LaneAdvice:
    best_lane: str
    best_speed: float
    worst_lane: str
    worst_speed: float
    speed_diff: float
    confidence: str
    action: str
    message: str
    scores: list
    shoulder_note: str = ""


# ============================================================
# 2. 路肩開放排程系統
# ============================================================

@dataclass
class ShoulderSchedule:
    road: str
    direction: str
    km_start: float
    km_end: float
    time_start: str
    time_end: str
    weekdays: list       # [0=Mon..6=Sun], 空=每天
    speed_limit: int
    shoulder_type: int   # 1=銜接出口, 2=接一般車道
    exit_name: str = ""
    note: str = ""

# 新竹周邊固定開放路肩排程 (根據高公局公告, 實際部署從 DB 讀)
SHOULDER_SCHEDULES = [
    ShoulderSchedule(
        road="1", direction="N", km_start=90.0, km_end=83.0,
        time_start="07:00", time_end="09:00",
        weekdays=[0,1,2,3,4], speed_limit=60, shoulder_type=1,
        exit_name="湖口交流道", note="平日上午尖峰開放路肩"
    ),
    ShoulderSchedule(
        road="1", direction="S", km_start=83.0, km_end=90.0,
        time_start="17:00", time_end="19:00",
        weekdays=[0,1,2,3,4], speed_limit=60, shoulder_type=1,
        exit_name="湖口交流道", note="平日下午尖峰開放路肩"
    ),
    ShoulderSchedule(
        road="1", direction="N", km_start=80.0, km_end=69.0,
        time_start="07:00", time_end="09:00",
        weekdays=[0,1,2,3,4], speed_limit=60, shoulder_type=2,
        note="平日上午尖峰開放路肩"
    ),
]

# 連假加開 (機動開放, 可由 CMS 即時資料動態更新)
HOLIDAY_SHOULDER_OVERRIDES = []


def parse_time(t_str):
    h, m = map(int, t_str.split(":"))
    return dtime(h, m)


def is_shoulder_open(road, direction, mileage, check_time=None):
    """判定路肩是否開放, 回傳 ShoulderSchedule 或 None"""
    if check_time is None:
        check_time = datetime.now()
    ct = check_time.time()
    cw = check_time.weekday()

    for sched in SHOULDER_SCHEDULES + HOLIDAY_SHOULDER_OVERRIDES:
        if sched.road != road or sched.direction != direction:
            continue
        km_lo = min(sched.km_start, sched.km_end)
        km_hi = max(sched.km_start, sched.km_end)
        if not (km_lo <= mileage <= km_hi):
            continue
        if sched.weekdays and cw not in sched.weekdays:
            continue
        if parse_time(sched.time_start) <= ct <= parse_time(sched.time_end):
            return sched
    return None


# ============================================================
# 3. VD 資料擷取
# ============================================================

VD_LIVE_URL = "https://tisvcloud.freeway.gov.tw/history/motc20/VDLive.xml"

def fetch_vd_live(max_retries=3):
    try:
        import httpx
    except ImportError:
        print("[WARN] httpx 未安裝")
        return None

    # connect 60秒, read 300秒 (5MB XML 從海外抓比較慢)
    timeout = httpx.Timeout(connect=60, read=300, write=30, pool=60)
    headers = {
        "User-Agent": "LanePilot/1.2 (https://github.com/qqoqto/lanepilot)",
        "Accept": "application/xml, text/xml, */*",
        "Accept-Encoding": "gzip, deflate",
    }

    for attempt in range(1, max_retries + 1):
        try:
            print(f"[INFO] 抓取 VDLive.xml ... (第 {attempt} 次)")
            with httpx.Client(timeout=timeout, verify=False, headers=headers, follow_redirects=True) as client:
                resp = client.get(VD_LIVE_URL)
                resp.raise_for_status()
                size = len(resp.content)
                print(f"[INFO] 下載完成: {size:,} bytes")
                return resp.text
        except Exception as e:
            print(f"[WARN] 第 {attempt} 次失敗: {e}")
            if attempt < max_retries:
                import time
                time.sleep(15)
    print(f"[WARN] 已重試 {max_retries} 次, 全部失敗")
    return None



# ============================================================
# 3b. TDX API 資料擷取 (JSON, 適用雲端部署)
# ============================================================

TDX_AUTH_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
TDX_VD_URL = "https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/VD/Freeway"

_tdx_token_cache = {"token": None, "expires": 0}

def _get_tdx_token(client_id, client_secret):
    """取得 TDX Access Token (快取 1 小時)"""
    import time as _time
    if _tdx_token_cache["token"] and _time.time() < _tdx_token_cache["expires"]:
        return _tdx_token_cache["token"]

    import httpx
    resp = httpx.post(TDX_AUTH_URL, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }, verify=False)
    resp.raise_for_status()
    token = resp.json()["access_token"]
    _tdx_token_cache["token"] = token
    _tdx_token_cache["expires"] = _time.time() + 3500  # 快取約 1 小時
    print(f"[INFO] TDX token 取得成功")
    return token


def fetch_vd_tdx(client_id=None, client_secret=None):
    """從 TDX API 抓取國道 VD 即時資料 (JSON 格式)"""
    import os
    cid = client_id or os.environ.get("TDX_CLIENT_ID", "")
    csec = client_secret or os.environ.get("TDX_CLIENT_SECRET", "")
    if not cid or not csec:
        print("[WARN] TDX_CLIENT_ID 或 TDX_CLIENT_SECRET 未設定")
        return None

    try:
        import httpx
        token = _get_tdx_token(cid, csec)
        headers = {"Authorization": f"Bearer {token}"}
        timeout = httpx.Timeout(connect=30, read=60, write=30, pool=30)

        print("[INFO] 從 TDX API 抓取國道 VD 即時資料...")
        with httpx.Client(timeout=timeout, verify=False) as client:
            resp = client.get(
                f"{TDX_VD_URL}?$format=JSON",
                headers=headers
            )
            resp.raise_for_status()
            data = resp.json()
            vd_lives = data.get("VDLives", [])
            print(f"[INFO] TDX 下載完成: {len(vd_lives)} 筆 VD 資料")
            return data
    except Exception as e:
        print(f"[WARN] TDX API 失敗: {e}")
        return None


def parse_vd_json(data, road_filter="1", dir_filter=None, km_min=0, km_max=999):
    """
    解析 TDX VD JSON 資料, 輸出跟 parse_vd_xml 相同的 VDStation 列表
    
    TDX JSON 結構:
    {
      "VDLives": [
        {
          "VDID": "VD-N1-N-85.010-M-01",
          "LinkFlows": [
            {
              "Lanes": [
                {"LaneID": 0, "Speed": 95.0, "Occupancy": 15.0, "Vehicles": [...]}
              ]
            }
          ]
        }
      ]
    }
    """
    vd_lives = data.get("VDLives", [])
    update_time = data.get("SrcUpdateTime", "")
    if update_time:
        print(f"[INFO] TDX 資料時間: {update_time}")

    stations = []
    for vd in vd_lives:
        vd_id = vd.get("VDID", "")
        parts = vd_id.split("-")
        if len(parts) < 5:
            continue

        road_code = parts[1].lstrip("N")  # "N1" -> "1", "N1H" -> "1H", "N3" -> "3"
        direction = parts[2]               # N or S
        try:
            mileage = float(parts[3])
        except ValueError:
            continue
        vd_type = parts[4]                 # M, N, I, O, C, R

        # 只保留主線 VD
        if vd_type not in ("M", "N"):
            continue

        if road_filter and road_code != road_filter:
            continue
        if dir_filter and direction != dir_filter:
            continue
        if not (km_min <= mileage <= km_max):
            continue

        # 解析車道資料 (從 LinkFlows 裡取)
        raw_lanes = []
        for link_flow in vd.get("LinkFlows", []):
            for lane in link_flow.get("Lanes", []):
                lid = lane.get("LaneID", 0)
                spd = lane.get("Speed", 0.0)
                occ_raw = lane.get("Occupancy", 0.0)
                occ = occ_raw / 100.0  # 整數百分比轉 0~1

                # Volume 從 Vehicles 加總
                total_vol = 0
                for v in lane.get("Vehicles", []):
                    total_vol += v.get("Volume", 0)

                raw_lanes.append((lid, spd, total_vol, occ))

        if not raw_lanes:
            continue

        # 動態車道命名
        n_lanes = len(raw_lanes)
        name_map = _lane_names_for_count(n_lanes)

        lanes = []
        for idx, (lid, spd, vol, occ) in enumerate(sorted(raw_lanes, key=lambda x: x[0])):
            name = name_map.get(idx, f"L{lid}")
            is_shoulder = (name == "路肩")
            lanes.append(LaneData(lid, name, spd, vol, occ, is_shoulder))

        # 位置描述
        loc_parts = vd_id.split("-")
        loc_name = loc_parts[-1] if len(loc_parts) > 5 and not loc_parts[-1].isupper() else ""
        desc = f"國{road_code} {mileage}K {'北' if direction=='N' else '南'}向"
        if loc_name:
            desc += f" ({loc_name})"

        stations.append(VDStation(
            vd_id, road_code, direction, mileage,
            desc, lanes, update_time, 0
        ))

    stations.sort(key=lambda s: s.mileage, reverse=(dir_filter == "N"))
    return stations


# ============================================================
# 3c. VD 靜態資料 (座標索引, GPS 定位用)
# ============================================================

def fetch_vd_static_tdx(client_id=None, client_secret=None):
    """從 TDX 抓取國道 VD 靜態資料 (含經緯度)"""
    import os
    cid = client_id or os.environ.get("TDX_CLIENT_ID", "")
    csec = client_secret or os.environ.get("TDX_CLIENT_SECRET", "")
    if not cid or not csec:
        print("[WARN] TDX 金鑰未設定, 無法抓 VD 靜態資料")
        return None
    try:
        import httpx
        token = _get_tdx_token(cid, csec)
        headers = {"Authorization": f"Bearer {token}"}
        timeout = httpx.Timeout(connect=30, read=60, write=30, pool=30)
        print("[INFO] 從 TDX 抓取 VD 靜態資料 (含座標)...")
        with httpx.Client(timeout=timeout, verify=False) as client:
            resp = client.get(
                "https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/VD/Freeway?$format=JSON",
                headers=headers
            )
            resp.raise_for_status()
            data = resp.json()
            vds = data.get("VDs", [])
            print(f"[INFO] VD 靜態資料: {len(vds)} 筆")
            return vds
    except Exception as e:
        print(f"[WARN] VD 靜態資料抓取失敗: {e}")
        return None


import math

def _haversine(lat1, lon1, lat2, lon2):
    """計算兩點經緯度距離 (公里)"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


class VDLocationIndex:
    """VD 站座標索引, 用 GPS 找最近的 VD 站"""

    def __init__(self):
        self.stations = []

    def build(self, vd_static_list):
        self.stations = []
        for vd in vd_static_list:
            vdid = vd.get("VDID", "")
            lat = vd.get("PositionLat", 0)
            lon = vd.get("PositionLon", 0)
            if not lat or not lon:
                continue
            parts = vdid.split("-")
            if len(parts) < 5:
                continue
            road_code = parts[1].lstrip("N")
            direction = parts[2]
            try:
                mileage = float(parts[3])
            except ValueError:
                continue
            vd_type = parts[4]
            if vd_type not in ("M", "N"):
                continue
            road_name = vd.get("RoadName", f"國{road_code}")
            self.stations.append((vdid, road_code, direction, mileage, lat, lon, road_name))
        print(f"[INFO] VD 座標索引建立完成: {len(self.stations)} 站")

    def find_nearby_road(self, lat, lon):
        if not self.stations:
            return None
        best = None
        best_dist = float("inf")
        for vdid, road, direction, mileage, vlat, vlon, road_name in self.stations:
            dist = _haversine(lat, lon, vlat, vlon)
            if dist < best_dist:
                best_dist = dist
                best = {
                    "road": road, "direction": direction, "mileage": mileage,
                    "road_name": road_name, "distance_km": round(dist, 2),
                    "lat": vlat, "lon": vlon
                }
        return best

    def find_nearby_roads(self, lat, lon, max_roads=6):
        """找最近的多條不同國道+方向, 每條國道南北向都列"""
        if not self.stations:
            return []
        # 計算每個 VD 站的距離
        candidates = []
        for vdid, road, direction, mileage, vlat, vlon, road_name in self.stations:
            dist = _haversine(lat, lon, vlat, vlon)
            candidates.append({
                "road": road, "direction": direction, "mileage": mileage,
                "road_name": road_name, "distance_km": round(dist, 2),
                "lat": vlat, "lon": vlon
            })
        candidates.sort(key=lambda x: x["distance_km"])
        # 每條國道+方向只取最近的一個, 最多 max_roads 條
        seen = set()
        results = []
        for c in candidates:
            key = (c["road"], c["direction"])
            if key in seen:
                continue
            seen.add(key)
            results.append(c)
            if len(results) >= max_roads:
                break
        return results


def _lane_names_for_count(n):
    """根據車道數量動態命名"""
    if n <= 2: return {0: "内側", 1: "外側"}
    if n == 3: return {0: "内側", 1: "中線", 2: "外側"}
    if n == 4: return {0: "内側", 1: "中內", 2: "中外", 3: "外側"}
    if n == 5: return {0: "内側", 1: "中內", 2: "中線", 3: "中外", 4: "外側"}
    # 6+: 前面正常命名, 多的叫路肩
    names = {0: "内側", 1: "中內", 2: "中線", 3: "中外", 4: "外側"}
    for i in range(5, n):
        names[i] = "路肩"
    return names


def parse_vd_xml(xml_str, road_filter="1", dir_filter=None, km_min=60, km_max=100):
    """
    解析 VDLive.xml (即時路況資料標準 2.0)
    
    VDID 格式: VD-N{road}-{dir}-{mileage}-{type}-{subtype}[-{name}]
    type: M/N = 主線 (我們要的), I = 入口匝道, O = 出口匝道, C = 連絡道, R = 服務區
    
    只保留主線 VD (type=M 或 type=N), 過濾掉匝道和服務區
    """
    from lxml import etree
    NS = {"ns": "http://traffic.transportdata.tw/standard/traffic/schema/"}

    root = etree.fromstring(xml_str.encode("utf-8"))

    update_el = root.find("ns:UpdateTime", NS)
    if update_el is not None:
        print(f"[INFO] 資料時間: {update_el.text}")

    stations = []
    for vd in root.findall(".//ns:VDLive", NS):
        vd_id = vd.find("ns:VDID", NS).text
        parts = vd_id.split("-")
        if len(parts) < 5:
            continue

        # 解析 VDID: VD-N1-N-86.120-M-LOOP
        road_code = parts[1].lstrip("N")  # "N1" -> "1", "N1H" -> "1H", "N3" -> "3"
        direction = parts[2]               # N or S
        try:
            mileage = float(parts[3])
        except ValueError:
            continue
        vd_type = parts[4]                 # M, N, I, O, C, R

        # 只保留主線 VD (M=主線偵測器, N=主線迴圈偵測器)
        if vd_type not in ("M", "N"):
            continue

        # 篩選條件
        if road_filter and road_code != road_filter:
            continue
        if dir_filter and direction != dir_filter:
            continue
        if not (km_min <= mileage <= km_max):
            continue

        status_el = vd.find("ns:Status", NS)
        status = int(status_el.text) if status_el is not None else -1
        time_el = vd.find("ns:DataCollectTime", NS)
        data_time = time_el.text if time_el is not None else ""

        # 解析車道
        raw_lanes = []
        for lane_el in vd.findall(".//ns:Lane", NS):
            lid = int(lane_el.find("ns:LaneID", NS).text)
            spd = float(lane_el.find("ns:Speed", NS).text)
            occ_raw = float(lane_el.find("ns:Occupancy", NS).text)
            occ = occ_raw / 100.0  # 整數百分比轉 0~1

            # Volume 從 Vehicles 加總
            total_vol = 0
            for v in lane_el.findall("ns:Vehicles/ns:Vehicle", NS):
                vol_el = v.find("ns:Volume", NS)
                if vol_el is not None:
                    total_vol += int(vol_el.text)

            raw_lanes.append((lid, spd, total_vol, occ))

        if not raw_lanes:
            continue

        # 動態車道命名
        n_lanes = len(raw_lanes)
        name_map = _lane_names_for_count(n_lanes)

        lanes = []
        for idx, (lid, spd, vol, occ) in enumerate(sorted(raw_lanes, key=lambda x: x[0])):
            name = name_map.get(idx, f"L{lid}")
            is_shoulder = (name == "路肩")
            lanes.append(LaneData(lid, name, spd, vol, occ, is_shoulder))

        # 位置描述: 從 VDID 尾部取交流道名稱
        loc_parts = vd_id.split("-")
        loc_name = loc_parts[-1] if len(loc_parts) > 5 and not loc_parts[-1].isupper() else ""
        desc = f"國{road_code} {mileage}K {'北' if direction=='N' else '南'}向"
        if loc_name:
            desc += f" ({loc_name})"

        stations.append(VDStation(
            vd_id, road_code, direction, mileage,
            desc, lanes, data_time, status
        ))

    stations.sort(key=lambda s: s.mileage, reverse=(dir_filter == "N"))
    return stations


# ============================================================
# 4. 模擬資料 (含路肩)
# ============================================================

def generate_demo_data():
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+08:00")
    raw = [
        ("nfbVD-N1-N-99.200-M-LOOP", 99.2, "新竹系統交流道", [
            (95,12,0.15), (90,18,0.22), (85,20,0.28), (78,22,0.35)]),
        ("nfbVD-N1-N-95.100-M-LOOP", 95.1, "竹北交流道", [
            (92,14,0.18), (88,20,0.25), (82,22,0.30), (72,25,0.40)]),
        ("nfbVD-N1-N-89.300-M-LOOP", 89.3, "湖口交流道(上游)", [
            (88,16,0.20), (80,22,0.30), (65,28,0.45), (48,30,0.58),
            (55,8,0.20,"shoulder")]),
        ("nfbVD-N1-N-85.000-M-LOOP", 85.0, "湖口交流道", [
            (82,18,0.25), (68,25,0.38), (45,30,0.55), (28,32,0.72),
            (52,10,0.25,"shoulder")]),
        ("nfbVD-N1-N-78.500-M-LOOP", 78.5, "楊梅交流道(上游)", [
            (78,20,0.28), (55,26,0.42), (35,28,0.62), (22,30,0.78),
            (48,6,0.18,"shoulder")]),
        ("nfbVD-N1-N-69.200-M-LOOP", 69.2, "楊梅交流道", [
            (90,14,0.18), (85,18,0.22), (80,20,0.26), (75,22,0.30)]),
        ("nfbVD-N1-N-63.000-M-LOOP", 63.0, "中壢交流道", [
            (95,12,0.14), (92,15,0.18), (88,18,0.22), (82,20,0.28)]),
    ]
    lane_names = ["内側", "中線", "外線", "外側"]
    stations = []
    for vd_id, km, desc, lane_data in raw:
        lanes = []
        main_idx = 0
        for ld in lane_data:
            if len(ld) == 4 and ld[3] == "shoulder":
                lanes.append(LaneData(4, "路肩", ld[0], ld[1], ld[2], True))
            else:
                lanes.append(LaneData(main_idx, lane_names[main_idx], ld[0], ld[1], ld[2], False))
                main_idx += 1
        stations.append(VDStation(vd_id, "1", "N", km, desc, lanes, now, 0))
    return stations


# ============================================================
# 5. 資料清洗 (含路肩過濾)
# ============================================================

def clean_lane_data(lanes, road="1", direction="N", mileage=0, check_time=None):
    cleaned = []
    sched = is_shoulder_open(road, direction, mileage, check_time)

    for lane in lanes:
        # speed=0, volume=0, occupancy=0 -> 無資料 (設備異常或車道關閉), 丟棄
        if lane.speed == 0 and lane.volume == 0 and lane.occupancy == 0:
            continue
        # speed > 200 -> 設備異常
        if lane.speed > 200:
            continue
        # speed=0 但 occupancy>0 -> 嚴重壅塞 (車停住了), 保留但設速度為 1
        speed = lane.speed if lane.speed > 0 else 1
        occ = max(0, min(1, lane.occupancy))

        if lane.is_shoulder:
            if sched is None:
                continue  # 路肩未開放 -> 丟棄
            cleaned.append(LaneData(lane.lane_id, lane.lane_name, speed, lane.volume, occ, True))
        else:
            cleaned.append(LaneData(lane.lane_id, lane.lane_name, speed, lane.volume, occ, False))
    return cleaned


# ============================================================
# 6. EMA 平滑
# ============================================================

class EMASmoothing:
    def __init__(self, alpha=0.3):
        self.alpha = alpha
        self._prev = {}
    def smooth(self, vd_id, lane):
        key = (vd_id, lane.lane_id)
        if key not in self._prev:
            self._prev[key] = lane.speed
            return lane.speed
        s = self.alpha * lane.speed + (1 - self.alpha) * self._prev[key]
        self._prev[key] = s
        return s


# ============================================================
# 7. 車道評分引擎
# ============================================================

def classify_speed(speed):
    if speed > 80: return "順暢", "#1D9E75"
    elif speed >= 40: return "車多", "#BA7517"
    else: return "壅塞", "#E24B4A"


def score_lanes(lanes, shoulder_sched=None):
    scores = []
    for lane in lanes:
        if lane.is_shoulder and shoulder_sched:
            # 路肩: 以限速為基準, 分數上限 65 (不讓路肩成為最佳建議)
            sn = min(lane.speed / shoulder_sched.speed_limit, 1.0)
            score = min(round((sn*0.6 + (1-lane.occupancy)*0.25 + 0.5*0.15)*100), 65)
            level, color = classify_speed(lane.speed)
            scores.append(LaneScore(
                lane.lane_name, lane.speed, score, level, color,
                True, shoulder_sched.speed_limit, shoulder_sched.shoulder_type == 1
            ))
        else:
            sn = min(lane.speed / 110, 1.0)
            score = round((sn*0.6 + (1-lane.occupancy)*0.25 + 0.5*0.15)*100)
            level, color = classify_speed(lane.speed)
            scores.append(LaneScore(lane.lane_name, lane.speed, score, level, color))
    return scores


def generate_advice(scores, threshold=15, shoulder_sched=None):
    if not scores:
        return None

    # 主線 vs 路肩 分開
    main = [s for s in scores if not s.is_shoulder]
    shoulders = [s for s in scores if s.is_shoulder]
    if not main:
        return None

    best = max(main, key=lambda s: s.score)
    worst = min(main, key=lambda s: s.score)
    diff = best.speed - worst.speed

    if diff >= 30: confidence = "高"
    elif diff >= threshold: confidence = "中"
    else: confidence = "低"

    if diff < threshold:
        action = "維持目前車道"
        message = f"各車道速差僅 {diff:.0f} km/h，低於門檻 {threshold:.0f} km/h。切換車道效益不大，維持原車道即可。"
    elif diff >= 30:
        action = f"建議立即切換至{best.lane_name}車道"
        message = f"{best.lane_name}車道速度 {best.speed:.0f} km/h，比{worst.lane_name}快 {diff:.0f} km/h。速差顯著，建議立即切換。"
    else:
        action = f"可考慮切至{best.lane_name}車道"
        message = f"{best.lane_name}車道速度 {best.speed:.0f} km/h，比{worst.lane_name}快 {diff:.0f} km/h。有一定效益，可視路況切換。"

    # 路肩補充說明
    shoulder_note = ""
    if shoulders and shoulder_sched:
        sh = shoulders[0]
        lim = shoulder_sched.speed_limit
        if shoulder_sched.shoulder_type == 1:
            shoulder_note = (
                f"路肩開放中 (限速{lim}, 目前{sh.speed:.0f}km/h)。"
                f"限往{shoulder_sched.exit_name}出口方向，不可切回主線。"
                f" ({shoulder_sched.note})"
            )
        else:
            shoulder_note = (
                f"路肩開放中 (限速{lim}, 目前{sh.speed:.0f}km/h)。"
                f"可匯入主線車道。 ({shoulder_sched.note})"
            )

    return LaneAdvice(
        best.lane_name, best.speed, worst.lane_name, worst.speed,
        diff, confidence, action, message, scores, shoulder_note
    )


# ============================================================
# 8. 瓶頸偵測 (只比主線)
# ============================================================

@dataclass
class Bottleneck:
    start_station: str
    end_station: str
    start_km: float
    end_km: float
    speed_drop: float
    worst_lane: str
    worst_speed: float

def detect_bottlenecks(stations, drop_threshold=20):
    bottlenecks = []
    if len(stations) < 2:
        return bottlenecks
    for i in range(len(stations) - 1):
        curr_lanes = {l.lane_name: l for l in stations[i].lanes if not l.is_shoulder}
        next_lanes = {l.lane_name: l for l in stations[i+1].lanes if not l.is_shoulder}
        for name in curr_lanes:
            if name not in next_lanes:
                continue
            drop = curr_lanes[name].speed - next_lanes[name].speed
            if drop >= drop_threshold:
                bottlenecks.append(Bottleneck(
                    stations[i].location_desc, stations[i+1].location_desc,
                    stations[i].mileage, stations[i+1].mileage,
                    drop, name, next_lanes[name].speed
                ))
    unique = {}
    for bn in bottlenecks:
        key = (bn.start_km, bn.end_km)
        if key not in unique or bn.speed_drop > unique[key].speed_drop:
            unique[key] = bn
    return list(unique.values())


# ============================================================
# 9. 主程式
# ============================================================

def print_sep(title=""):
    print(f"\n{'='*64}")
    if title:
        print(f"  {title}")
        print(f"{'='*64}")

def print_station(station, advice):
    print(f"\n  VD 站: {station.location_desc} ({station.mileage}K)")
    print(f"  資料時間: {station.data_time}")
    has_shoulder = any(s.is_shoulder for s in advice.scores)
    lane_count = len([s for s in advice.scores if not s.is_shoulder])
    sh_tag = f" + 路肩" if has_shoulder else ""
    print(f"  車道數: {lane_count}{sh_tag}")
    print(f"  {'─'*56}")

    for s in advice.scores:
        bar_len = int(s.speed / 120 * 30)
        bar = "█" * bar_len + "░" * (30 - bar_len)
        if s.is_shoulder:
            tags = f" [限速{s.shoulder_speed_limit}]"
            if s.shoulder_exit_only:
                tags += " [限出口]"
            print(f"  {s.lane_name:4s} ┊ {bar} {s.speed:5.0f} km/h │ {s.level} │ {s.score}分{tags}")
        else:
            print(f"  {s.lane_name:4s} │ {bar} {s.speed:5.0f} km/h │ {s.level} │ {s.score}分")

    print(f"  {'─'*56}")
    print(f"  >>> {advice.action}")
    print(f"      {advice.message}")
    print(f"      速差: {advice.speed_diff:.0f} km/h | 信心: {advice.confidence}")
    if advice.shoulder_note:
        print(f"      [路肩] {advice.shoulder_note}")


def get_demo_time():
    """取得模擬時間: 強制週一 07:30 (觸發路肩開放)"""
    t = datetime.now().replace(hour=7, minute=30)
    while t.weekday() != 0:
        t -= timedelta(days=1)
    return t


def process_station(station, check_time):
    """清洗 + 路肩判定 + 評分 + 建議, 回傳 advice"""
    cleaned = clean_lane_data(
        station.lanes, station.road_id, station.direction, station.mileage, check_time
    )
    station.lanes = cleaned
    sched = is_shoulder_open(station.road_id, station.direction, station.mileage, check_time)
    scores = score_lanes(cleaned, sched)
    return generate_advice(scores, shoulder_sched=sched)


def run_demo():
    print_sep("LanePilot 車道建議引擎 v1.1 - Demo 模式")
    print("  路線: 國1 北向 新竹系統(99K) -> 中壢(63K)")
    demo_time = get_demo_time()
    print(f"  模擬時間: {demo_time.strftime('%Y-%m-%d %H:%M')} (週一)")
    print(f"  情境: 上班尖峰, 湖口-楊梅壅塞, 路肩開放判定啟用")

    stations = generate_demo_data()
    print(f"\n  [1/5] 取得 {len(stations)} 個 VD 站資料")

    # 路肩掃描
    sh_open = sum(1 for s in stations
                  if is_shoulder_open(s.road_id, s.direction, s.mileage, demo_time)
                  and any(l.is_shoulder for l in s.lanes))
    sh_blocked = sum(1 for s in stations
                     if not is_shoulder_open(s.road_id, s.direction, s.mileage, demo_time)
                     and any(l.is_shoulder for l in s.lanes))
    print(f"  [2/5] 路肩判定: {sh_open} 站開放, {sh_blocked} 站未開放(資料已排除)")

    all_advices = []
    for station in stations:
        advice = process_station(station, demo_time)
        all_advices.append((station, advice))
    print(f"  [3/5] 車道評分完成")

    bottlenecks = detect_bottlenecks(stations)
    print(f"  [4/5] 偵測到 {len(bottlenecks)} 處瓶頸")
    print(f"  [5/5] 建議生成完成")

    print_sep("各站車道分析")
    for station, advice in all_advices:
        print_station(station, advice)

    if bottlenecks:
        print_sep("瓶頸偵測結果")
        for i, bn in enumerate(bottlenecks, 1):
            print(f"\n  瓶頸 #{i}")
            print(f"  位置: {bn.start_station} -> {bn.end_station}")
            print(f"  里程: {bn.start_km}K -> {bn.end_km}K")
            print(f"  最慢車道: {bn.worst_lane} ({bn.worst_speed:.0f} km/h)")
            print(f"  速降幅度: {bn.speed_drop:.0f} km/h")

    print_sep("路段摘要")
    main_speeds = [l.speed for s in stations for l in s.lanes if not l.is_shoulder]
    avg = sum(main_speeds) / len(main_speeds) if main_speeds else 0
    dist = stations[0].mileage - stations[-1].mileage
    t = (dist / avg * 60) if avg > 0 else 0
    print(f"  路段距離: {dist:.1f} km")
    print(f"  主線均速: {avg:.0f} km/h")
    print(f"  預估耗時: {t:.0f} 分鐘")
    print(f"  瓶頸數量: {len(bottlenecks)} 處")

    sh_notes = [(s, a) for s, a in all_advices if a.shoulder_note]
    if sh_notes:
        print(f"\n  路肩狀態:")
        for s, a in sh_notes:
            print(f"    {s.location_desc}: {a.shoulder_note}")
    print()


def run_live():
    print_sep("LanePilot 車道建議引擎 v1.1 - 即時模式")
    xml_str = fetch_vd_live()
    if xml_str is None:
        print("\n  [FALLBACK] 無法連線, 改跑 Demo 模式")
        run_demo()
        return

    stations = parse_vd_xml(xml_str, road_filter="1", dir_filter="N", km_min=60, km_max=100)
    print(f"  [INFO] 篩選出 {len(stations)} 個 VD 站")
    if not stations:
        run_demo()
        return

    now = datetime.now()
    for station in stations:
        advice = process_station(station, now)
        print_station(station, advice)

    bottlenecks = detect_bottlenecks(stations)
    if bottlenecks:
        print_sep("瓶頸偵測結果")
        for i, bn in enumerate(bottlenecks, 1):
            print(f"  瓶頸 #{i}: {bn.start_station} -> {bn.end_station} | {bn.worst_lane} {bn.speed_drop:.0f}km/h降")


# ============================================================
# 10. API 輸出
# ============================================================

def to_api_response(station, advice):
    if advice is None:
        return {
            "vd_id": station.vd_id,
            "road": f"國{station.road_id}",
            "direction": "北向" if station.direction == "N" else "南向",
            "mileage": station.mileage,
            "location": station.location_desc,
            "data_time": station.data_time,
            "lanes": [],
            "advice": None,
        }
    return {
        "vd_id": station.vd_id,
        "road": f"國{station.road_id}",
        "direction": "北向" if station.direction == "N" else "南向",
        "mileage": station.mileage,
        "location": station.location_desc,
        "data_time": station.data_time,
        "lanes": [{
            "name": s.lane_name, "speed": s.speed, "score": s.score,
            "level": s.level, "color": s.color,
            "is_shoulder": s.is_shoulder,
            "shoulder_speed_limit": s.shoulder_speed_limit if s.is_shoulder else None,
            "shoulder_exit_only": s.shoulder_exit_only if s.is_shoulder else None
        } for s in advice.scores],
        "advice": {
            "best_lane": advice.best_lane, "best_speed": advice.best_speed,
            "speed_diff": advice.speed_diff, "confidence": advice.confidence,
            "action": advice.action, "message": advice.message,
            "shoulder_note": advice.shoulder_note or None
        }
    }


if __name__ == "__main__":
    if "--demo" in sys.argv:
        run_demo()
    elif "--json" in sys.argv:
        demo_time = get_demo_time()
        stations = generate_demo_data()
        results = []
        for station in stations:
            advice = process_station(station, demo_time)
            results.append(to_api_response(station, advice))
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        run_live()
