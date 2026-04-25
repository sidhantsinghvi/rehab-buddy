# RehabBuddy — Iteration 1

Phyphox-driven bicep curl trainer with a game-like visualization.

## Quick start

### 1. Phone setup
1. Open **phyphox** on your iPhone
2. Select **"Acceleration"** (the one that includes gravity)
3. Tap **⋮ → Remote Access** → enable it
4. Note the IP shown (e.g. `192.168.1.42`)
5. Strap the phone to your forearm, long axis along the forearm, screen facing outward

### 2. Backend
```bash
cd rehab-buddy/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — set PHYPHOX_HOST=<your phone IP>

python main.py
# Runs on http://localhost:8000
```

### 3. Frontend
```bash
cd rehab-buddy/frontend
npm install
npm run dev
# Opens on http://localhost:5173
```

Open `http://localhost:5173` in your browser. Enter the phone IP if you didn't set it in `.env`, then hit **Start Session**.

---

## Architecture

```
iPhone (phyphox)
  │  HTTP GET /get?accX=full&accY=full&accZ=full   @ ~20 Hz
  ▼
backend/sensor/phyphox_client.py      ← thin HTTP client, swappable
  │  raw {accX, accY, accZ}
  ▼
backend/processing/signal_processor.py
  │  angle → smoothed progress → rep state machine → CurlFrame
  ▼
backend/main.py  (FastAPI + WebSocket)
  │  JSON broadcast to all WS clients
  ▼
frontend React app
  hooks/useRehabSocket.js → components/CurlGame.jsx
```

### Module map

| Path | Role |
|---|---|
| `backend/sensor/` | Sensor ingestion (swap for native app or BLE IMU here) |
| `backend/processing/` | Signal math, rep logic, scoring |
| `backend/main.py` | API + WS server; session state |
| `frontend/src/hooks/` | WebSocket client, state management |
| `frontend/src/components/` | Game UI, arm viz, setup, summary |

---

## Part C — Key heuristics

### Angle from accelerometer
The accelerometer (with gravity) measures the gravity vector projected onto the phone's axes. With the phone's Y-axis along the forearm:

```
tilt = atan2( sqrt(aX² + aZ²), |aY| )
```

- Arm down → Y≈9.8, lateral≈0 → tilt≈0°
- Arm horizontal → Y≈0, lateral≈9.8 → tilt≈90°
- Full curl → tilt≈110–130°

Limitations: during fast movement, linear acceleration adds noise. EMA filter (α=0.22) reduces this. A complementary filter with gyroscope would be more accurate but adds complexity.

### Calibration
Default range: 8°–105°. Auto-calibration expands bounds when observed data exceeds them (never shrinks). Stable after ~3 full reps.

### Rep state machine
```
IDLE → GOING_UP  (smoothed progress > 30%)
     → AT_TOP    (progress > 72%)  ← "good rep" zone
     → GOING_DOWN (progress drops below 60%)
     → IDLE      (progress < 22%) → rep counted ✓
```
Hysteresis (12%) prevents false triggers at the top.

### Scoring
| Peak reached | Points |
|---|---|
| ≥90% | 15 (Perfect) |
| ≥75% | 10 (Good) |
| ≥60% | 6 (Fair) |
| <60% | 2 (Too low) |

---

## Part D — Phase 2 roadmap (not implemented)

### Natural language injury input
Add an `/intake` API endpoint. User describes their condition ("my right shoulder aches above 90°"). A Claude API call with structured output returns `PersonalizationConfig`:
```python
@dataclass
class PersonalizationConfig:
    top_threshold: float       # e.g. 0.55 instead of 0.72
    max_angle_override: float  # cap range of motion
    pacing_factor: float       # slow reps down
    exercise_notes: str
```
Inject this into `SignalProcessor` — the thresholds are already soft constants.

### Adaptive personalization
After each session, summarize rep quality data + user feedback. Claude reasons over the trend (improving? plateauing? compensating?) and adjusts targets for the next session. Store sessions in SQLite (one table, trivial schema).

### More exercises
Add `ExerciseConfig` objects (shoulder press, lateral raise, etc.) each with their own axis mapping and rep state machine. `SignalProcessor` becomes `ExerciseProcessor(config)`. The frontend `CurlGame` becomes `ExerciseGame(exerciseType)`.

### Agentic loop
A background agent polls session history every N sessions and proposes a weekly rehab plan. The plan surfaces in the UI as a simple daily exercise queue. The user can say "too hard" or "my elbow is sore" and the agent re-plans.
