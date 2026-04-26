"""
Phase 0: 原始 GPS 軌跡蒐集
================================

純粹存原始軌跡點,不做 map matching、不算車道速度。等使用者規模到 (~8 萬日活)
+ 車道級 GIS 圖資建好後,再用累積資料做眾包車道車速推算。

儲存:SQLite 在 <project_root>/data/lanepilot.db
注意:Railway/Heroku 等 ephemeral filesystem 不會保留資料,正式上線前要遷到
PostgreSQL (TimescaleDB hypertable 適合)。
"""
import os
import sqlite3
import threading
import time

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "lanepilot.db",
)

# 台灣 bounding box (含本島 + 離島)
LAT_MIN, LAT_MAX = 21.5, 25.5
LON_MIN, LON_MAX = 119.0, 122.5

_lock = threading.Lock()
_initialized = False


def _connect():
    return sqlite3.connect(DB_PATH, timeout=10)


def init_db():
    global _initialized
    if _initialized:
        return
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _connect() as conn:
        conn.executescript("""
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            CREATE TABLE IF NOT EXISTS trajectories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                captured_at INTEGER NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                speed REAL,
                heading REAL,
                accuracy REAL,
                ingested_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_traj_session
                ON trajectories(session_id, captured_at);
            CREATE INDEX IF NOT EXISTS idx_traj_time
                ON trajectories(captured_at);
        """)
    _initialized = True


def _opt_float(v, lo, hi):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not (lo <= f <= hi):
        return None
    return f


def _validate_point(p):
    try:
        lat = float(p["lat"])
        lon = float(p["lon"])
        captured_at = int(p["captured_at"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (LAT_MIN <= lat <= LAT_MAX) or not (LON_MIN <= lon <= LON_MAX):
        return None
    now_ms = int(time.time() * 1000)
    # 拒絕未來時間 (>1 分鐘) 或太舊 (>24h),避免 client clock 飄走或重放攻擊
    if captured_at > now_ms + 60_000 or captured_at < now_ms - 86_400_000:
        return None
    return {
        "captured_at": captured_at,
        "lat": lat,
        "lon": lon,
        "speed": _opt_float(p.get("speed"), 0, 300),
        "heading": _opt_float(p.get("heading"), 0, 360),
        "accuracy": _opt_float(p.get("accuracy"), 0, 1000),
    }


def insert_batch(session_id, points):
    """寫入一批點。回傳 (accepted, rejected)。"""
    if not session_id or not isinstance(session_id, str) or len(session_id) > 64:
        return 0, len(points)
    init_db()
    valid = []
    rejected = 0
    for p in points:
        v = _validate_point(p)
        if v:
            valid.append(v)
        else:
            rejected += 1
    if not valid:
        return 0, rejected
    now_ms = int(time.time() * 1000)
    with _lock, _connect() as conn:
        conn.executemany(
            """INSERT INTO trajectories
               (session_id, captured_at, lat, lon, speed, heading, accuracy, ingested_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            [(session_id, v["captured_at"], v["lat"], v["lon"],
              v["speed"], v["heading"], v["accuracy"], now_ms)
             for v in valid]
        )
    return len(valid), rejected


def stats():
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*), COUNT(DISTINCT session_id), MIN(captured_at), MAX(captured_at) FROM trajectories"
        ).fetchone()
        total, sessions, oldest, newest = row
        last_24h = conn.execute(
            "SELECT COUNT(*) FROM trajectories WHERE ingested_at > ?",
            (int(time.time() * 1000) - 86_400_000,)
        ).fetchone()[0]
    return {
        "total_points": total or 0,
        "sessions": sessions or 0,
        "points_last_24h": last_24h or 0,
        "oldest_point": oldest,
        "newest_point": newest,
        "db_path": DB_PATH,
    }
