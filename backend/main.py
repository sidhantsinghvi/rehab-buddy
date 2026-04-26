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

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


# ── AI coach (server-side, keeps Anthropic key out of the browser) ──────────

_AI_SYSTEM_PROMPT = """You are a rehab exercise advisor for RehabBuddy, a physiotherapy game app.
Based on the user's description of their injury or exercise goal, choose exactly one exercise type.

Available exercises:
- "bicep"   → bicep curls (elbow flexion, forearm/bicep injuries, upper arm curling)
- "tricep"  → tricep extensions (elbow extension, back-of-arm injuries, pushing movements)
- "lateral" → lateral raises (shoulder injuries, deltoid strengthening, rotator cuff rehab, side raises)

Return ONLY valid JSON, no extra text:
{"exercise": "bicep"|"tricep"|"lateral", "reason": "one concise sentence explaining why"}"""


class AICoachRequest(BaseModel):
    prompt: str


@app.post("/api/ai-coach")
async def ai_coach(req: AICoachRequest):
    api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="CLAUDE_API_KEY is not configured on the server")
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 200,
        "system": _AI_SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": req.prompt.strip()}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"upstream error: {e}")

    if r.status_code != 200:
        try:
            err = r.json().get("error", {}).get("message", r.text)
        except Exception:
            err = r.text
        raise HTTPException(status_code=502, detail=f"Anthropic: {err}")

    body = r.json()
    raw = (body.get("content") or [{}])[0].get("text", "")
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")

    exercise = parsed.get("exercise")
    if exercise not in ("bicep", "tricep", "lateral"):
        raise HTTPException(status_code=502, detail="AI returned an unknown exercise")

    return {"exercise": exercise, "reason": parsed.get("reason", "")}


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
