import asyncio
import os
import threading
import time
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
import serial
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@db:5432/humidity_tracker",
)
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
SERIAL_BAUD = int(os.getenv("SERIAL_BAUD", "9600"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _fmt(dt: datetime) -> str:
    """Return a clean UTC ISO-8601 string with Z suffix.

    psycopg3 returns timezone-aware datetimes from TIMESTAMPTZ columns.
    Calling .isoformat() on those produces '…+00:00'; appending 'Z' on top
    gives the invalid '…+00:00Z' that makes JavaScript's Date() return NaN.
    This helper normalises both naive and aware datetimes to the same format.
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Humidity Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared state
_latest_reading: dict | None = None
_sse_queues: list[asyncio.Queue] = []
_main_loop: asyncio.AbstractEventLoop | None = None


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def _db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def _insert_reading(ts: datetime, temperature: float, humidity: float) -> None:
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO readings (time, temperature, humidity) VALUES (%s, %s, %s)",
                    (ts, temperature, humidity),
                )
    except Exception as exc:
        print(f"[db] insert error: {exc}")


# ---------------------------------------------------------------------------
# Serial reader (runs in a background thread)
# ---------------------------------------------------------------------------
def _parse_log_line(line: str) -> tuple[float, float] | None:
    """Parse 'LOG:<temp>:<humi>' lines emitted by the Arduino sketch."""
    line = line.strip()
    if not line.startswith("LOG:"):
        return None
    try:
        _, temp_s, humi_s = line.split(":")
        return float(temp_s), float(humi_s)
    except (ValueError, TypeError):
        return None


def _broadcast(payload: str) -> None:
    """Push a JSON string to all active SSE queues (thread-safe)."""
    if _main_loop is None:
        return
    for q in list(_sse_queues):
        _main_loop.call_soon_threadsafe(q.put_nowait, payload)


def _serial_reader() -> None:
    global _latest_reading
    while True:
        try:
            with serial.serial_for_url(
                SERIAL_PORT, baudrate=SERIAL_BAUD, timeout=5
            ) as ser:
                print(f"[serial] connected to {SERIAL_PORT}")
                while True:
                    raw = ser.readline().decode("utf-8", errors="ignore")
                    result = _parse_log_line(raw)
                    if result is None:
                        continue

                    temperature, humidity = result
                    ts = datetime.utcnow()

                    _insert_reading(ts, temperature, humidity)

                    _latest_reading = {
                        "time": _fmt(ts),
                        "temperature": temperature,
                        "humidity": humidity,
                    }
                    _broadcast(json.dumps(_latest_reading))

        except serial.SerialException as exc:
            print(f"[serial] {exc} — retrying in 5 s")
            time.sleep(5)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def _startup() -> None:
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    threading.Thread(target=_serial_reader, daemon=True).start()
    print(f"[api] serial reader started on {SERIAL_PORT}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/readings/latest")
async def get_latest():
    """Return the most recent reading (in-memory, then DB fallback)."""
    if _latest_reading:
        return _latest_reading

    try:
        with _db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT time, temperature, humidity FROM readings ORDER BY time DESC LIMIT 1"
                )
                row = cur.fetchone()
        if row:
            return {
                "time": _fmt(row["time"]),
                "temperature": row["temperature"],
                "humidity": row["humidity"],
            }
    except Exception as exc:
        print(f"[db] latest error: {exc}")

    return {}


def _bucket_interval(hours: int) -> str:
    if hours <= 1:
        return "1 minute"
    if hours <= 6:
        return "5 minutes"
    if hours <= 24:
        return "15 minutes"
    return "1 hour"


@app.get("/api/readings")
async def get_readings(
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=500, ge=1, le=5000),
):
    """Return aggregated readings for the requested time window."""
    bucket = _bucket_interval(hours)
    try:
        with _db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT
                        time_bucket('{bucket}', time)  AS time,
                        ROUND(AVG(temperature)::numeric, 1) AS temperature,
                        ROUND(AVG(humidity)::numeric,    1) AS humidity
                    FROM readings
                    WHERE time > NOW() - INTERVAL '{hours} hours'
                    GROUP BY 1
                    ORDER BY 1 ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
        return [
            {
                "time": _fmt(r["time"]),
                "temperature": float(r["temperature"]),
                "humidity": float(r["humidity"]),
            }
            for r in rows
        ]
    except Exception as exc:
        print(f"[db] readings error: {exc}")
        return []


@app.get("/api/stream")
async def sse_stream():
    """Server-Sent Events endpoint — pushes new readings in real time."""
    q: asyncio.Queue = asyncio.Queue()
    _sse_queues.append(q)

    async def _generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # prevent proxy timeouts
        finally:
            _sse_queues.remove(q)

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )
