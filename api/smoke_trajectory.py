"""Phase 0 trajectory_store smoke test.

灌一批正常 5 點 + 5 種壞資料,看 accepted/rejected 是否符合預期,
最後印 stats()。
"""
import time

from trajectory_store import insert_batch, stats

now_ms = int(time.time() * 1000)

# --- 正常 5 點 (台北附近,間隔 1 秒) ---
good_session = "smoke-good-" + str(now_ms)
good_points = [
    {
        "captured_at": now_ms - i * 1000,
        "lat": 25.033 + i * 0.0001,
        "lon": 121.565 + i * 0.0001,
        "speed": 50.0 + i,
        "heading": 90.0,
        "accuracy": 5.0,
    }
    for i in range(5)
]
acc, rej = insert_batch(good_session, good_points)
print(f"[good 5pt]      accepted={acc} rejected={rej}  (expect 5/0)")

# --- 5 種壞資料,各 1 點,放同一批 ---
bad_session = "smoke-bad-" + str(now_ms)
bad_points = [
    # 1) lat 超出台灣 bbox (北極)
    {"captured_at": now_ms, "lat": 89.0, "lon": 121.0},
    # 2) lon 超出 bbox (大西洋)
    {"captured_at": now_ms, "lat": 25.0, "lon": -10.0},
    # 3) 未來時間 > 1 分鐘
    {"captured_at": now_ms + 5 * 60_000, "lat": 25.0, "lon": 121.0},
    # 4) 太舊 > 24h
    {"captured_at": now_ms - 25 * 3600_000, "lat": 25.0, "lon": 121.0},
    # 5) lat 缺欄位
    {"captured_at": now_ms, "lon": 121.0},
]
acc, rej = insert_batch(bad_session, bad_points)
print(f"[bad 5pt]       accepted={acc} rejected={rej}  (expect 0/5)")

# --- 邊界:speed 超界應變 None,但點本身仍接受 ---
mixed_session = "smoke-mixed-" + str(now_ms)
mixed_points = [
    {
        "captured_at": now_ms,
        "lat": 25.0,
        "lon": 121.0,
        "speed": 9999,      # 超界 -> None
        "heading": 720,     # 超界 -> None
        "accuracy": -5,     # 超界 -> None
    }
]
acc, rej = insert_batch(mixed_session, mixed_points)
print(f"[mixed bounds]  accepted={acc} rejected={rej}  (expect 1/0, opt fields nulled)")

# --- 壞 session_id ---
acc, rej = insert_batch("", good_points)
print(f"[empty sid]     accepted={acc} rejected={rej}  (expect 0/5)")

acc, rej = insert_batch("x" * 65, good_points)
print(f"[long sid]      accepted={acc} rejected={rej}  (expect 0/5)")

print("\nstats():")
for k, v in stats().items():
    print(f"  {k}: {v}")
