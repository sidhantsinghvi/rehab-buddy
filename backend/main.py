"""
RepRight backend — FastAPI + WebSocket

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
import re
from dataclasses import asdict
from typing import Set

import httpx
import uvicorn
from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from processing.signal_processor import SignalProcessor
from sensor.phyphox_client import PhyphoxClient

# Load .env from repo root regardless of where uvicorn is launched from.
_DOTENV_PATH = find_dotenv(usecwd=True) or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"
)
load_dotenv(_DOTENV_PATH)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="RepRight")

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
    logger.info(f"RepRight started. Watching phyphox at {phyphox_host}:8080")


# ── AI coach (server-side, keeps Anthropic key out of the browser) ──────────

# Catalogue of every exercise the agent can prescribe. Each entry has a stable
# numeric id so the LLM can pick by id (cheaper / less ambiguous than free-form
# strings) and the backend can map back to the frontend's exercise key. The
# `games` list is shown to the model so it knows what the patient will actually
# be doing — picking an exercise is also picking a set of training modalities.
_EXERCISE_CATALOGUE = [
    {
        "id": 1,
        "key": "bicep",
        "name": "Bicep curl",
        "targets": "elbow flexion · biceps brachii · brachialis",
        "indications": "biceps strain, distal biceps tendinopathy, elbow flexion weakness, post-immobilisation forearm deconditioning, generic upper-arm strengthening",
        "games": [
            {"id": 11, "key": "runner",     "name": "Corridor",   "desc": "Curl up to rise, relax to lower — stay between the lines."},
            {"id": 12, "key": "basketball", "name": "Basketball", "desc": "Aim the hoop with your curl, lower the arm to release."},
            {"id": 13, "key": "tracker",    "name": "Tracker",    "desc": "Plain rep counter for focused practice."},
        ],
    },
    {
        "id": 2,
        "key": "tricep",
        "name": "Tricep extension",
        "targets": "elbow extension · triceps brachii (long/lateral/medial)",
        "indications": "triceps tendinopathy, posterior elbow pain, push-strength deficits, post-overhead-injury extension reconditioning",
        "games": [
            {"id": 21, "key": "pong",    "name": "Pong",    "desc": "Extend your arm to control the paddle. First to seven."},
            {"id": 22, "key": "archery", "name": "Archery", "desc": "Extend to aim, hold steady to fire automatically."},
            {"id": 23, "key": "tracker", "name": "Tracker", "desc": "Plain rep counter for focused practice."},
        ],
    },
    {
        "id": 3,
        "key": "lateral",
        "name": "Lateral raise",
        "targets": "shoulder abduction · medial deltoid · supraspinatus · scapular stabilisers",
        "indications": "rotator cuff rehab, subacromial impingement, frozen shoulder mobility, deltoid weakness, post-op shoulder range-of-motion work",
        "games": [
            {"id": 31, "key": "lateral-raise", "name": "Tracker",       "desc": "Lift to band height, hold, lower."},
            {"id": 32, "key": "meteor-shield", "name": "Meteor Shield", "desc": "Match meteor heights to block incoming hits."},
            {"id": 33, "key": "ring-pop",      "name": "Ring Pop",      "desc": "Line up with floating rings as they pass."},
            {"id": 34, "key": "wing-balance",  "name": "Wing Balance",  "desc": "Hold inside a drifting band — steady wins."},
        ],
    },
]


def _build_ai_system_prompt() -> str:
    catalogue_json = json.dumps(_EXERCISE_CATALOGUE, indent=2)
    valid_ids = ", ".join(str(ex["id"]) for ex in _EXERCISE_CATALOGUE)
    return (
        "You are the RepRight triage agent — a rehab physiotherapist that picks ONE exercise "
        "from a fixed catalogue based on the patient's free-text description of their injury "
        "or goal. Each exercise comes with its training games; the patient will play those "
        "games to perform the chosen exercise, so consider whether the games are appropriate "
        "(load, complexity, safety) for the situation when ranking exercises.\n\n"
        "Reasoning rules:\n"
        "  • Pick the exercise whose target muscles and indications best match the patient.\n"
        "  • If the description is vague, default to the safest mobility-focused option.\n"
        "  • Never invent exercises or games outside the catalogue.\n\n"
        "Catalogue (authoritative):\n"
        f"{catalogue_json}\n\n"
        "Respond with STRICT JSON ONLY — a single JSON object, no prose, no markdown fences, "
        "no commentary, no trailing text. Schema:\n"
        '{"exercise_id": <int>, "reason": "<one concise clinical sentence, ≤ 22 words>"}\n\n'
        f"`exercise_id` MUST be one of: {valid_ids}. Do not return any other field."
    )


def _extract_json_object(text: str) -> str:
    """Robustly pull the first {...} block out of an LLM response.

    Handles bare JSON, ```json fences, ``` fences, and prose that wraps a JSON
    object. Falls back to the original text so json.loads can produce a clean
    error if everything else fails.
    """
    s = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", s, re.DOTALL)
    if fenced:
        return fenced.group(1).strip()
    bare = re.search(r"\{.*\}", s, re.DOTALL)
    if bare:
        return bare.group(0).strip()
    return s


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
        "max_tokens": 300,
        "temperature": 0,
        "system": _build_ai_system_prompt(),
        "messages": [
            {"role": "user", "content": req.prompt.strip()},
            # Pre-fill the assistant turn with `{` so the model is forced to
            # continue inside a JSON object — avoids ```json fences entirely.
            {"role": "assistant", "content": "{"},
        ],
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
        logger.exception("Anthropic upstream error")
        raise HTTPException(status_code=502, detail=f"upstream error: {e}")

    if r.status_code != 200:
        try:
            err = r.json().get("error", {}).get("message", r.text)
        except Exception:
            err = r.text
        logger.error("Anthropic non-200 (%s): %s", r.status_code, err)
        raise HTTPException(status_code=502, detail=f"Anthropic: {err}")

    body = r.json()
    raw = (body.get("content") or [{}])[0].get("text", "")
    # The assistant turn was prefilled with `{`; if the model continued cleanly
    # the response won't include that opening brace, so re-attach it. If the
    # model ignored the prefill and produced its own object somewhere in the
    # text, the extractor will find it directly.
    candidate = _extract_json_object(raw if "{" in raw else "{" + raw)

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        logger.error("AI returned invalid JSON. raw=%r candidate=%r", raw, candidate)
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")

    # Accept either the new id-based schema or the legacy key-based schema so a
    # mid-session model regression doesn't break the flow.
    chosen = None
    eid = parsed.get("exercise_id")
    if isinstance(eid, (int, float)):
        chosen = next((e for e in _EXERCISE_CATALOGUE if e["id"] == int(eid)), None)
    if chosen is None and isinstance(parsed.get("exercise"), str):
        chosen = next((e for e in _EXERCISE_CATALOGUE if e["key"] == parsed["exercise"]), None)

    if chosen is None:
        logger.error("AI picked unknown exercise. parsed=%r", parsed)
        raise HTTPException(status_code=502, detail="AI returned an unknown exercise")

    return {
        "exercise_id": chosen["id"],
        "exercise": chosen["key"],
        "name": chosen["name"],
        "reason": parsed.get("reason", ""),
        "games": chosen["games"],
    }


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
