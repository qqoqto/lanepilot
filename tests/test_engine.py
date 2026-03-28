"""
LanePilot 引擎單元測試
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime
from engine.lane_advisor import (
    LaneData, LaneScore, classify_speed, score_lanes,
    generate_advice, clean_lane_data, detect_bottlenecks,
    is_shoulder_open, ShoulderSchedule, VDStation,
    generate_demo_data
)


def test_classify_speed():
    assert classify_speed(95)[0] == "順暢"
    assert classify_speed(80)[0] == "車多"   # 80 不算 >80
    assert classify_speed(81)[0] == "順暢"
    assert classify_speed(50)[0] == "車多"
    assert classify_speed(40)[0] == "車多"
    assert classify_speed(39)[0] == "壅塞"
    assert classify_speed(0.1)[0] == "壅塞"
    print("  [PASS] classify_speed")


def test_clean_lane_data():
    lanes = [
        LaneData(0, "内側", 92, 12, 0.15),
        LaneData(1, "中線", 0, 0, 0),      # speed=0,vol=0,occ=0 -> 無資料, 丟棄
        LaneData(2, "外線", 250, 8, 0.10),  # speed>200 -> 丟棄
        LaneData(3, "外側", 78, 20, 1.5),   # occupancy>1 -> 修正為1
        LaneData(4, "路肩", 0, 5, 0.30),    # speed=0 但 occ>0 -> 壅塞, 保留 (speed->1)
    ]
    cleaned = clean_lane_data(lanes)
    assert len(cleaned) == 3
    assert cleaned[0].speed == 92
    assert cleaned[1].speed == 78
    assert cleaned[1].occupancy == 1.0
    assert cleaned[2].speed == 1   # 壅塞: speed 修正為 1
    print("  [PASS] clean_lane_data")


def test_clean_lane_data_shoulder_blocked():
    """路肩未開放時應被丟棄"""
    lanes = [
        LaneData(0, "内側", 92, 12, 0.15),
        LaneData(4, "路肩", 55, 8, 0.20, is_shoulder=True),
    ]
    # 用一個不在排程內的時間 (週日 12:00)
    t = datetime(2026, 3, 29, 12, 0)  # 週日
    cleaned = clean_lane_data(lanes, "1", "N", 89.0, t)
    assert len(cleaned) == 1
    assert cleaned[0].lane_name == "内側"
    print("  [PASS] clean_lane_data_shoulder_blocked")


def test_clean_lane_data_shoulder_open():
    """路肩開放時應保留"""
    lanes = [
        LaneData(0, "内側", 92, 12, 0.15),
        LaneData(4, "路肩", 55, 8, 0.20, is_shoulder=True),
    ]
    # 週一 07:30 -> 路肩開放
    t = datetime(2026, 3, 23, 7, 30)
    cleaned = clean_lane_data(lanes, "1", "N", 89.0, t)
    assert len(cleaned) == 2
    assert cleaned[1].lane_name == "路肩"
    print("  [PASS] clean_lane_data_shoulder_open")


def test_score_lanes_basic():
    lanes = [
        LaneData(0, "内側", 100, 10, 0.10),
        LaneData(1, "外側", 40, 30, 0.60),
    ]
    scores = score_lanes(lanes)
    assert len(scores) == 2
    assert scores[0].score > scores[1].score
    assert scores[0].level == "順暢"
    assert scores[1].level == "車多"
    print("  [PASS] score_lanes_basic")


def test_score_lanes_shoulder_cap():
    """路肩分數上限 65"""
    lanes = [
        LaneData(0, "内側", 60, 10, 0.10),
        LaneData(4, "路肩", 58, 8, 0.05, is_shoulder=True),
    ]
    sched = ShoulderSchedule("1", "N", 90, 83, "07:00", "09:00", [], 60, 1, "湖口")
    scores = score_lanes(lanes, sched)
    shoulder_score = [s for s in scores if s.is_shoulder][0]
    assert shoulder_score.score <= 65
    assert shoulder_score.shoulder_speed_limit == 60
    assert shoulder_score.shoulder_exit_only == True
    print("  [PASS] score_lanes_shoulder_cap")


def test_advice_no_switch():
    """速差小於門檻時建議維持"""
    scores = [
        LaneScore("内側", 85, 78, "順暢", "#1D9E75"),
        LaneScore("外側", 80, 73, "車多", "#BA7517"),
    ]
    advice = generate_advice(scores, threshold=15)
    assert "維持" in advice.action
    assert advice.confidence == "低"
    print("  [PASS] advice_no_switch")


def test_advice_strong_switch():
    """速差 >30 時建議立即切換"""
    scores = [
        LaneScore("内側", 92, 85, "順暢", "#1D9E75"),
        LaneScore("外側", 28, 30, "壅塞", "#E24B4A"),
    ]
    advice = generate_advice(scores, threshold=15)
    assert "立即" in advice.action
    assert advice.confidence == "高"
    assert advice.best_lane == "内側"
    print("  [PASS] advice_strong_switch")


def test_advice_shoulder_not_best():
    """路肩不應被選為建議切換目標"""
    scores = [
        LaneScore("内側", 60, 55, "車多", "#BA7517"),
        LaneScore("外側", 30, 30, "壅塞", "#E24B4A"),
        LaneScore("路肩", 58, 65, "車多", "#BA7517", True, 60, True),
    ]
    sched = ShoulderSchedule("1", "N", 90, 83, "07:00", "09:00", [], 60, 1, "湖口")
    advice = generate_advice(scores, threshold=15, shoulder_sched=sched)
    assert advice.best_lane == "内側"  # 不是路肩
    assert "路肩開放中" in advice.shoulder_note
    print("  [PASS] advice_shoulder_not_best")


def test_shoulder_schedule():
    """路肩排程判定"""
    # 週一 07:30 國1北向 89K -> 應開放
    t = datetime(2026, 3, 23, 7, 30)
    result = is_shoulder_open("1", "N", 89.0, t)
    assert result is not None
    assert result.speed_limit == 60

    # 週一 10:00 -> 不在時段內
    t2 = datetime(2026, 3, 23, 10, 0)
    assert is_shoulder_open("1", "N", 89.0, t2) is None

    # 週日 07:30 -> 不在星期內
    t3 = datetime(2026, 3, 29, 7, 30)
    assert is_shoulder_open("1", "N", 89.0, t3) is None

    # 國3 -> 不在排程內
    assert is_shoulder_open("3", "N", 89.0, t) is None

    print("  [PASS] shoulder_schedule")


def test_bottleneck_excludes_shoulder():
    """瓶頸偵測不含路肩"""
    stations = [
        VDStation("v1", "1", "N", 95.0, "A", [
            LaneData(0, "内側", 90, 10, 0.1),
            LaneData(4, "路肩", 80, 5, 0.1, True),
        ], "", 0),
        VDStation("v2", "1", "N", 89.0, "B", [
            LaneData(0, "内側", 65, 15, 0.3),
            LaneData(4, "路肩", 30, 8, 0.5, True),  # 路肩速降50 但不應算
        ], "", 0),
    ]
    bns = detect_bottlenecks(stations)
    assert len(bns) == 1
    assert bns[0].worst_lane == "内側"  # 不是路肩
    print("  [PASS] bottleneck_excludes_shoulder")


def test_demo_data_runs():
    """Demo 資料完整跑一遍不報錯"""
    stations = generate_demo_data()
    assert len(stations) == 7
    t = datetime(2026, 3, 23, 7, 30)
    for s in stations:
        cleaned = clean_lane_data(s.lanes, s.road_id, s.direction, s.mileage, t)
        s.lanes = cleaned
        sched = is_shoulder_open(s.road_id, s.direction, s.mileage, t)
        scores = score_lanes(cleaned, sched)
        advice = generate_advice(scores, shoulder_sched=sched)
        assert advice is not None
    print("  [PASS] demo_data_runs")


if __name__ == "__main__":
    print("\nLanePilot Engine Tests")
    print("=" * 40)
    test_classify_speed()
    test_clean_lane_data()
    test_clean_lane_data_shoulder_blocked()
    test_clean_lane_data_shoulder_open()
    test_score_lanes_basic()
    test_score_lanes_shoulder_cap()
    test_advice_no_switch()
    test_advice_strong_switch()
    test_advice_shoulder_not_best()
    test_shoulder_schedule()
    test_bottleneck_excludes_shoulder()
    test_demo_data_runs()
    print("=" * 40)
    print("All 12 tests passed!")
