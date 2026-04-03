"""
LanePilot FastAPI 後端
======================
啟動方式:
  uvicorn api.server:app --reload --port 8000

API 端點:
  GET /                          健康檢查
  GET /api/v1/lanes/realtime     指定位置各車道即時速度 + 建議
  GET /api/v1/sections           路段總覽 (多站 + 瓶頸)
  GET /api/v1/bottlenecks        當前瓶頸列表
  GET /api/v1/status             系統狀態 (資料更新時間, 站數)
"""

import asyncio
import time
import logging
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.lane_advisor import (
    fetch_vd_live, parse_vd_xml, process_station, detect_bottlenecks,
    to_api_response, is_shoulder_open, VDStation,
    fetch_vd_tdx, parse_vd_json,
    fetch_vd_static_tdx, VDLocationIndex
)

logger = logging.getLogger("lanepilot")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")


# ============================================================
# 記憶體快取 (替代 Redis, MVP 階段夠用)
# ============================================================

class VDCache:
    """VD 即時資料快取, 背景排程每 60 秒更新"""
    def __init__(self):
        self.stations: dict = {}       # key: (road, dir) -> List[VDStation]
        self.raw_xml: str = ""
        self.last_update: datetime = None
        self.update_count: int = 0
        self.last_error: str = ""
        self.data_source: str = ""
        self._lock = asyncio.Lock()
        self.location_index = VDLocationIndex()

    async def refresh(self):
        """抓取最新 VD 資料並更新快取 (優先 tisvcloud XML 免費無限制, fallback TDX JSON)"""
        async with self._lock:
            try:
                loop = asyncio.get_event_loop()
                tdx_data = None
                xml_str = None

                # 優先使用 tisvcloud XML (免費、無額度限制)
                xml_str = await loop.run_in_executor(None, fetch_vd_live)

                # tisvcloud 失敗則 fallback 到 TDX API
                if xml_str is None:
                    logger.info("tisvcloud 不可用, fallback 到 TDX API")
                    tdx_data = await loop.run_in_executor(None, fetch_vd_tdx)

                if tdx_data is None and xml_str is None:
                    self.last_error = "tisvcloud 和 TDX 都無法連線"
                    logger.warning("VD 資料抓取失敗")
                    return False

                self.last_update = datetime.now()
                self.update_count += 1
                self.last_error = ""
                self.data_source = "tisvcloud" if xml_str else "TDX"

                # 預解析常用路段 (國1 全線)
                for road in ["1", "1H", "3"]:
                    for direction in ["N", "S"]:
                        key = (road, direction)
                        if tdx_data:
                            stations = parse_vd_json(
                                tdx_data, road_filter=road, dir_filter=direction,
                                km_min=0, km_max=999
                            )
                        else:
                            stations = parse_vd_xml(
                                xml_str, road_filter=road, dir_filter=direction,
                                km_min=0, km_max=999
                            )
                        # 處理每站的評分
                        now = datetime.now()
                        for s in stations:
                            process_station(s, now)
                        self.stations[key] = stations

                total = sum(len(v) for v in self.stations.values())
                logger.info(f"VD 快取更新完成: {total} 站, 第 {self.update_count} 次")

                # 首次建立座標索引 (GPS 定位用)
                if not self.location_index.stations:
                    vd_static = await loop.run_in_executor(None, fetch_vd_static_tdx)
                    if vd_static:
                        self.location_index.build(vd_static)
                return True

            except Exception as e:
                self.last_error = str(e)
                logger.error(f"VD 快取更新失敗: {e}")
                return False

    def get_stations(self, road: str, direction: str,
                     km_min: float = 0, km_max: float = 999) -> list:
        """從快取取得指定路段的 VD 站"""
        key = (road, direction)
        stations = self.stations.get(key, [])
        return [s for s in stations if km_min <= s.mileage <= km_max]

    def find_nearest(self, road: str, direction: str, km: float) -> VDStation:
        """找最近的 VD 站"""
        key = (road, direction)
        stations = self.stations.get(key, [])
        if not stations:
            return None
        return min(stations, key=lambda s: abs(s.mileage - km))


cache = VDCache()


# ============================================================
# 背景排程
# ============================================================

async def vd_refresh_loop():
    """每 60 秒抓一次 VD 資料"""
    while True:
        await cache.refresh()
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用啟動/關閉生命週期"""
    logger.info("LanePilot API 啟動中...")
    # 不等第一次抓取完成, 直接啟動, 背景排程會處理
    task = asyncio.create_task(vd_refresh_loop())
    logger.info("背景 VD 資料排程已啟動 (每 60 秒)")
    yield
    task.cancel()
    logger.info("LanePilot API 關閉")


# ============================================================
# FastAPI App
# ============================================================

app = FastAPI(
    title="LanePilot API",
    description="台灣國道即時車道建議 API",
    version="1.2",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# API 端點
# ============================================================

@app.get("/")
def health():
    return {
        "service": "LanePilot API",
        "version": "1.2",
        "status": "ok",
        "data_source": "交通部高速公路局「交通資料庫」"
    }


@app.get("/api/v1/status")
def system_status():
    """系統狀態"""
    total = sum(len(v) for v in cache.stations.values())
    return {
        "last_update": cache.last_update.isoformat() if cache.last_update else None,
        "update_count": cache.update_count,
        "total_stations": total,
        "cached_routes": [
            {"road": k[0], "direction": k[1], "stations": len(v)}
            for k, v in cache.stations.items() if v
        ],
        "last_error": cache.last_error or None,
        "data_source": cache.data_source or "unknown"
    }


@app.get("/api/v1/lanes/realtime")
def lanes_realtime(
    road: str = Query("1", description="國道編號: 1, 1H, 3, 5"),
    dir: str = Query("N", description="方向: N=北向, S=南向"),
    km: float = Query(None, description="里程 (找最近的 VD 站)"),
    km_min: float = Query(None, description="起始里程"),
    km_max: float = Query(None, description="結束里程")
):
    """
    查詢指定位置各車道即時速度 + 車道建議
    
    用法1: 指定里程, 回傳最近的 VD 站
      GET /api/v1/lanes/realtime?road=1&dir=N&km=89
    
    用法2: 指定範圍, 回傳範圍內所有站
      GET /api/v1/lanes/realtime?road=1&dir=N&km_min=85&km_max=99
    """
    if cache.last_update is None:
        raise HTTPException(503, "資料尚未載入, 請稍候")

    now = datetime.now()

    if km is not None:
        # 找最近的站
        station = cache.find_nearest(road, dir, km)
        if station is None:
            raise HTTPException(404, f"找不到國{road} {dir}向 {km}K 附近的 VD 站")
        advice = process_station(station, now)
        return to_api_response(station, advice)

    # 範圍查詢
    if km_min is None: km_min = 0
    if km_max is None: km_max = 999
    stations = cache.get_stations(road, dir, km_min, km_max)

    if not stations:
        raise HTTPException(404, f"找不到國{road} {dir}向 {km_min}K~{km_max}K 的 VD 站")

    results = []
    for s in stations:
        advice = process_station(s, now)
        results.append(to_api_response(s, advice))

    return {
        "road": f"國{road}",
        "direction": "北向" if dir == "N" else "南向",
        "range": f"{km_min}K ~ {km_max}K",
        "count": len(results),
        "data_time": cache.last_update.isoformat() if cache.last_update else None,
        "stations": results
    }


@app.get("/api/v1/sections")
def sections(
    road: str = Query("1", description="國道編號"),
    dir: str = Query("N", description="方向"),
    km_min: float = Query(60, description="起始里程"),
    km_max: float = Query(100, description="結束里程")
):
    """
    路段總覽: 所有站 + 瓶頸 + 摘要
    
    GET /api/v1/sections?road=1&dir=N&km_min=60&km_max=100
    """
    if cache.last_update is None:
        raise HTTPException(503, "資料尚未載入")

    stations = cache.get_stations(road, dir, km_min, km_max)
    if not stations:
        raise HTTPException(404, "找不到符合條件的 VD 站")

    now = datetime.now()
    results = []
    for s in stations:
        advice = process_station(s, now)
        results.append(to_api_response(s, advice))

    bottlenecks = detect_bottlenecks(stations)
    bn_list = [{
        "start": bn.start_station,
        "end": bn.end_station,
        "start_km": bn.start_km,
        "end_km": bn.end_km,
        "speed_drop": bn.speed_drop,
        "worst_lane": bn.worst_lane,
        "worst_speed": bn.worst_speed
    } for bn in bottlenecks]

    # 摘要
    main_speeds = [l.speed for s in stations for l in s.lanes if not l.is_shoulder and l.speed > 0]
    avg_speed = sum(main_speeds) / len(main_speeds) if main_speeds else 0
    dist = abs(stations[0].mileage - stations[-1].mileage) if len(stations) > 1 else 0
    est_time = (dist / avg_speed * 60) if avg_speed > 0 else 0

    return {
        "road": f"國{road}",
        "direction": "北向" if dir == "N" else "南向",
        "range": f"{km_min}K ~ {km_max}K",
        "summary": {
            "station_count": len(results),
            "distance_km": round(dist, 1),
            "avg_speed": round(avg_speed),
            "est_minutes": round(est_time),
            "bottleneck_count": len(bn_list)
        },
        "bottlenecks": bn_list,
        "stations": results,
        "data_time": cache.last_update.isoformat()
    }


@app.get("/api/v1/bottlenecks")
def bottlenecks(
    road: str = Query("1", description="國道編號"),
    dir: str = Query("N", description="方向"),
    km_min: float = Query(0),
    km_max: float = Query(999)
):
    """當前瓶頸列表"""
    if cache.last_update is None:
        raise HTTPException(503, "資料尚未載入")

    stations = cache.get_stations(road, dir, km_min, km_max)
    bns = detect_bottlenecks(stations)

    return {
        "road": f"國{road}",
        "direction": "北向" if dir == "N" else "南向",
        "count": len(bns),
        "bottlenecks": [{
            "start": bn.start_station,
            "end": bn.end_station,
            "start_km": bn.start_km,
            "end_km": bn.end_km,
            "speed_drop": bn.speed_drop,
            "worst_lane": bn.worst_lane,
            "worst_speed": bn.worst_speed
        } for bn in bns],
        "data_time": cache.last_update.isoformat()
    }


@app.get("/api/v1/nearby")
def nearby(
    lat: float = Query(..., description="緯度"),
    lon: float = Query(..., description="經度"),
    range_km: float = Query(20, description="前後公里數")
):
    """
    GPS 定位: 根據經緯度找最近的國道路段, 回傳前後路況

    GET /api/v1/nearby?lat=24.83&lon=120.94
    """
    if cache.last_update is None:
        raise HTTPException(503, "資料尚未載入")

    if not cache.location_index.stations:
        raise HTTPException(503, "座標索引尚未建立, 請稍候")

    nearest = cache.location_index.find_nearby_road(lat, lon)
    if not nearest:
        raise HTTPException(404, "找不到附近的國道 VD 站")

    road = nearest["road"]
    direction = nearest["direction"]
    mileage = nearest["mileage"]

    km_min = max(0, mileage - range_km)
    km_max = mileage + range_km
    stations = cache.get_stations(road, direction, km_min, km_max)

    now = datetime.now()
    results = []
    for s_ in stations:
        advice = process_station(s_, now)
        results.append(to_api_response(s_, advice))

    bottlenecks = detect_bottlenecks(stations)
    bn_list = [{
        "start": bn.start_station, "end": bn.end_station,
        "start_km": bn.start_km, "end_km": bn.end_km,
        "speed_drop": bn.speed_drop, "worst_lane": bn.worst_lane,
        "worst_speed": bn.worst_speed
    } for bn in bottlenecks]

    main_speeds = [l.speed for s_ in stations for l in s_.lanes if not l.is_shoulder and l.speed > 0]
    avg_speed = sum(main_speeds) / len(main_speeds) if main_speeds else 0
    dist = abs(stations[0].mileage - stations[-1].mileage) if len(stations) > 1 else 0
    est_time = (dist / avg_speed * 60) if avg_speed > 0 else 0

    return {
        "nearest": nearest,
        "road": nearest["road_name"],
        "direction": "北向" if direction == "N" else "南向",
        "your_km": round(mileage, 1),
        "range": f"{round(km_min, 1)}K ~ {round(km_max, 1)}K",
        "summary": {
            "station_count": len(results),
            "distance_km": round(dist, 1),
            "avg_speed": round(avg_speed),
            "est_minutes": round(est_time),
            "bottleneck_count": len(bn_list)
        },
        "bottlenecks": bn_list,
        "stations": results,
        "data_time": cache.last_update.isoformat()
    }
