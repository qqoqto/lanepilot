"""
Phase 0: 原始 GPS 軌跡蒐集
================================

純粹存原始軌跡點,不做 map matching、不算車道速度。等使用者規模到 (~8 萬日活)
+ 車道級 GIS 圖資建好後,再用累積資料做眾包車道車速推算。

雙後端:
- 設了 DATABASE_URL (e.g. Railway PostgreSQL 自動注入) → PG
- 沒設 → SQLite 本機檔案 <project_root>/data/lanepilot.db

90 天 retention 由 server.py lifespan 的 daily background task 負責。
"""
import os
import sqlite3
import threading
import time

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith("postgres")

if USE_POSTGRES:
    import psycopg

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "lanepilot.db",
)

# 台灣 bounding box (含本島 + 離島)
LAT_MIN, LAT_MAX = 21.5, 25.5
LON_MIN, LON_MAX = 119.0, 122.5

# psycopg 用 %s, sqlite 用 ?
PH = "%s" if USE_POSTGRES else "?"

# SQLite 寫入並發保護 (PG 由連線本身的 transaction 隔離處理)
_lock = threading.Lock()
_initialized = False


def _connect():
    if USE_POSTGRES:
        return psycopg.connect(DATABASE_URL)
    return sqlite3.connect(DB_PATH, timeout=10)


def _execute_many(conn, sql, paramlists):
    if USE_POSTGRES:
        with conn.cursor() as cur:
            cur.executemany(sql, paramlists)
    else:
        conn.executemany(sql, paramlists)


def _execute_one(conn, sql, params=()):
    """執行一個 statement, 回傳 (rows | None, rowcount)。"""
    if USE_POSTGRES:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
            return rows, cur.rowcount
    cur = conn.execute(sql, params)
    rows = cur.fetchall() if cur.description else None
    return rows, cur.rowcount


def init_db():
    global _initialized
    if _initialized:
        return
    if USE_POSTGRES:
        with _connect() as conn:
            _execute_one(conn, """
                CREATE TABLE IF NOT EXISTS trajectories (
                    id BIGSERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    captured_at BIGINT NOT NULL,
                    lat DOUBLE PRECISION NOT NULL,
                    lon DOUBLE PRECISION NOT NULL,
                    speed DOUBLE PRECISION,
                    heading DOUBLE PRECISION,
                    accuracy DOUBLE PRECISION,
                    ingested_at BIGINT NOT NULL
                )
            """)
            _execute_one(conn, "CREATE INDEX IF NOT EXISTS idx_traj_session ON trajectories(session_id, captured_at)")
            _execute_one(conn, "CREATE INDEX IF NOT EXISTS idx_traj_time ON trajectories(captured_at)")
    else:
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
    sql = f"""INSERT INTO trajectories
              (session_id, captured_at, lat, lon, speed, heading, accuracy, ingested_at)
              VALUES ({PH}, {PH}, {PH}, {PH}, {PH}, {PH}, {PH}, {PH})"""
    rows = [(session_id, v["captured_at"], v["lat"], v["lon"],
             v["speed"], v["heading"], v["accuracy"], now_ms)
            for v in valid]
    if USE_POSTGRES:
        with _connect() as conn:
            _execute_many(conn, sql, rows)
    else:
        with _lock, _connect() as conn:
            _execute_many(conn, sql, rows)
    return len(valid), rejected


def stats():
    init_db()
    cutoff = int(time.time() * 1000) - 86_400_000
    with _connect() as conn:
        rows, _ = _execute_one(conn,
            "SELECT COUNT(*), COUNT(DISTINCT session_id), MIN(captured_at), MAX(captured_at) FROM trajectories"
        )
        total, sessions, oldest, newest = rows[0]
        rows, _ = _execute_one(conn,
            f"SELECT COUNT(*) FROM trajectories WHERE ingested_at > {PH}",
            (cutoff,)
        )
        last_24h = rows[0][0]
    return {
        "total_points": total or 0,
        "sessions": sessions or 0,
        "points_last_24h": last_24h or 0,
        "oldest_point": oldest,
        "newest_point": newest,
        "backend": "postgres" if USE_POSTGRES else "sqlite",
    }


def purge_older_than(days):
    """刪除 N 天前的資料,回傳刪掉的 row 數。retention 用。"""
    init_db()
    cutoff = int(time.time() * 1000) - int(days) * 86_400_000
    sql = f"DELETE FROM trajectories WHERE captured_at < {PH}"
    if USE_POSTGRES:
        with _connect() as conn:
            _, deleted = _execute_one(conn, sql, (cutoff,))
    else:
        with _lock, _connect() as conn:
            _, deleted = _execute_one(conn, sql, (cutoff,))
    return deleted
