"""
LanePilot - VD 即時資料測試腳本
直接抓 tisvcloud 的 VDLive.xml, 解析並顯示新竹周邊各車道速度
"""
import httpx
from lxml import etree

URL = "https://tisvcloud.freeway.gov.tw/history/motc20/VDLive.xml"
NS = {"ns": "http://traffic.transportdata.tw/standard/traffic/schema/"}

# 篩選條件: 國1北向, 60K~100K (新竹-中壢)
ROAD_FILTER = "N1"
DIR_FILTER = "N"
KM_MIN = 60.0
KM_MAX = 100.0

LANE_NAMES = {0: "内側", 1: "中內", 2: "中線", 3: "中外", 4: "外線", 5: "外側", 6: "路肩", 7: "路肩"}

def classify(speed):
    if speed > 80: return "順暢", "\033[92m"  # green
    elif speed >= 40: return "車多", "\033[93m"  # yellow
    else: return "壅塞", "\033[91m"  # red

RESET = "\033[0m"

print(f"[INFO] 抓取 VDLive.xml ...")
resp = httpx.get(URL, timeout=30)
print(f"[INFO] status={resp.status_code}, size={len(resp.text):,} bytes")

root = etree.fromstring(resp.content)

update_time = root.find("ns:UpdateTime", NS)
print(f"[INFO] 資料更新時間: {update_time.text if update_time is not None else 'unknown'}")

vd_lives = root.findall(".//ns:VDLive", NS)
print(f"[INFO] 全部 VD 站數: {len(vd_lives)}")

# 篩選
matched = []
for vd in vd_lives:
    vdid = vd.find("ns:VDID", NS).text
    # VDID 格式: VD-N1-N-86.120-M-LOOP 或 VD-N3-S-42.000-O-SE-1-xxx
    parts = vdid.split("-")
    if len(parts) < 5:
        continue

    road = parts[1]       # N1, N3, N1H, ...
    direction = parts[2]  # N or S
    try:
        mileage = float(parts[3])
    except ValueError:
        continue

    if road != ROAD_FILTER or direction != DIR_FILTER:
        continue
    if not (KM_MIN <= mileage <= KM_MAX):
        continue

    status = vd.find("ns:Status", NS)
    status_val = int(status.text) if status is not None else -1
    time_el = vd.find("ns:DataCollectTime", NS)
    data_time = time_el.text if time_el is not None else ""

    # 解析車道
    lanes = []
    for lane in vd.findall(".//ns:Lane", NS):
        lid = int(lane.find("ns:LaneID", NS).text)
        lane_type = lane.find("ns:LaneType", NS)
        lt = int(lane_type.text) if lane_type is not None else 0
        speed = float(lane.find("ns:Speed", NS).text)
        occ = float(lane.find("ns:Occupancy", NS).text)

        # 加總各車種流量
        total_vol = 0
        for v in lane.findall("ns:Vehicles/ns:Vehicle", NS):
            vol = int(v.find("ns:Volume", NS).text)
            total_vol += vol

        name = LANE_NAMES.get(lid, f"L{lid}")
        lanes.append({
            "id": lid, "name": name, "type": lt,
            "speed": speed, "occupancy": occ, "volume": total_vol
        })

    matched.append({
        "vdid": vdid, "road": road, "dir": direction,
        "km": mileage, "status": status_val,
        "time": data_time, "lanes": lanes
    })

# 按里程排序 (北向: 大到小)
matched.sort(key=lambda x: x["km"], reverse=True)

print(f"\n[結果] 國1北向 {KM_MIN}K~{KM_MAX}K: 共 {len(matched)} 個 VD 站")
print(f"{'='*70}")

for vd in matched:
    print(f"\n  {vd['vdid']}")
    print(f"  里程: {vd['km']}K | 狀態: {'正常' if vd['status']==0 else '異常'} | 時間: {vd['time']}")
    print(f"  {'─'*60}")

    if not vd["lanes"]:
        print(f"  (無車道資料)")
        continue

    for lane in sorted(vd["lanes"], key=lambda l: l["id"]):
        sp = lane["speed"]
        level, color = classify(sp)
        bar_len = int(sp / 120 * 25)
        bar = "█" * bar_len + "░" * (25 - bar_len)
        print(f"  {color}L{lane['id']} {lane['name']:4s}│ {bar} {sp:5.0f} km/h │ occ:{lane['occupancy']:3.0f}% │ vol:{lane['volume']:3d} │ {level}{RESET}")

    # 速差分析
    speeds = [l["speed"] for l in vd["lanes"] if l["speed"] > 0]
    if len(speeds) >= 2:
        fastest = max(vd["lanes"], key=lambda l: l["speed"])
        slowest = min(vd["lanes"], key=lambda l: l["speed"] if l["speed"] > 0 else 999)
        diff = fastest["speed"] - slowest["speed"]
        print(f"  {'─'*60}")
        if diff >= 15:
            print(f"  >>> 最快: {fastest['name']} {fastest['speed']:.0f} km/h | 最慢: {slowest['name']} {slowest['speed']:.0f} km/h | 速差: {diff:.0f} km/h")
        else:
            print(f"  >>> 各車道速差 {diff:.0f} km/h, 差異不大")

print(f"\n{'='*70}")
print(f"[完成] 共分析 {len(matched)} 個 VD 站")
