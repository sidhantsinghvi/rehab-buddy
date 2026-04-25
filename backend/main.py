"""
RehabBuddy backend — FastAPI + WebSocket

Data flow:
  phyphox HTTP poll (20 Hz)
    → PhyphoxClient.fetch_latest()
    → SignalProcessor.process()
    → WebSocket broadcast to all connected frontend clients

One SignalProcessor instance per session. Reset via {action: "reset_session"}.
"""

import asyncio
import json
import logging
import os
from dataclasses import asdict
from typing import Set

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from processing.signal_processor import SignalProcessor
from sensor.phyphox_client import PhyphoxClient

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="RehabBuddy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── global mutable state (single-user hackathon prototype) ───────────────────
active_ws: Set[WebSocket] = set()
processor = SignalProcessor(mode="acceleration")
phyphox_host = os.getenv("PHYPHOX_HOST", "172.20.10.1")
sensor_connected = False


# ── WebSocket endpoint ───────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_ws.add(websocket)
    logger.info(f"WS client connected ({len(active_ws)} total)")

    # Send current config immediately so UI can display it
    await websocket.send_text(json.dumps({
        "type": "config",
        "phyphox_host": phyphox_host,
        "mode": processor.mode,
    }))

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                await _handle_message(json.loads(raw))
            except asyncio.TimeoutError:
                pass
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        active_ws.discard(websocket)
        logger.info(f"WS client disconnected ({len(active_ws)} total)")


async def _handle_message(msg: dict):
    global processor, phyphox_host

    action = msg.get("action")

    if action == "reset_session":
        mode = processor.mode
        processor = SignalProcessor(mode=mode)
        logger.info("Session reset")

    elif action == "calibrate":
        processor.set_calibration(
            min_angle=float(msg.get("min_angle", processor.DEFAULT_MIN)),
            max_angle=float(msg.get("max_angle", processor.DEFAULT_MAX)),
        )

    elif action == "set_host":
        phyphox_host = msg.get("host", phyphox_host)
        logger.info(f"phyphox host → {phyphox_host}")
        await _broadcast({"type": "config", "phyphox_host": phyphox_host})

    elif action == "set_thresholds":
        # Future: agent layer sends updated thresholds here
        if "top" in msg:
            processor.TOP = float(msg["top"])


async def _broadcast(data: dict):
    global active_ws
    if not active_ws:
        return
    payload = json.dumps(data)
    dead = set()
    for ws in active_ws:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    active_ws -= dead


# ── background polling loop ──────────────────────────────────────────────────

async def _polling_loop():
    global sensor_connected

    while True:
        # Snapshot the host at connection time. If it changes mid-session,
        # the inner loop detects it and breaks out to reconnect with the new host.
        active_host = phyphox_host
        logger.info(f"Connecting to phyphox at {active_host}:8080 ...")

        client = PhyphoxClient(
            host=active_host,
            mode=processor.mode,
            poll_interval=0.05,
        )

        async with client:
            while True:
                # Host changed — break inner loop so outer loop reconnects
                if phyphox_host != active_host:
                    logger.info(f"Host changed to {phyphox_host}, reconnecting...")
                    sensor_connected = False
                    break

                t0 = asyncio.get_event_loop().time()
                reading = await client.fetch_latest()

                if reading is not None:
                    sensor_connected = True
                    frame = processor.process(reading)
                    if frame is not None:
                        await _broadcast({"type": "curl_data", **asdict(frame)})
                else:
                    if sensor_connected:
                        sensor_connected = False
                        await _broadcast({"type": "sensor_status", "connected": False})

                elapsed = asyncio.get_event_loop().time() - t0
                await asyncio.sleep(max(0.0, 0.05 - elapsed))


@app.on_event("startup")
async def startup():
    asyncio.create_task(_polling_loop())
    logger.info(f"RehabBuddy started. Watching phyphox at {phyphox_host}:8080")


# ── REST helpers (optional — useful for debugging) ───────────────────────────

@app.get("/debug/phyphox")
async def debug_phyphox():
    """Hit this in your browser to test phyphox connectivity and see raw channel data."""
    import httpx
    url = f"http://{phyphox_host}/get?accX=full&accY=full&accZ=full&acc_time=full"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            return {"url": url, "status": resp.status_code, "body": resp.json()}
    except Exception as e:
        return {"url": url, "error": str(e), "hint": "Check IP, phyphox Remote Access enabled, and experiment is running (play button pressed)"}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "sensor_connected": sensor_connected,
        "phyphox_host": phyphox_host,
        "reps": processor.rep_count,
        "score": processor.score,
    }


@app.get("/session")
async def session():
    return {
        "rep_count": processor.rep_count,
        "good_reps": processor.good_reps,
        "score": processor.score,
        "peak_angle": processor.peak_angle,
        "calibration": {
            "min_angle": processor.min_angle,
            "max_angle": processor.max_angle,
        },
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
