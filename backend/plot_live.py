"""
Live phyphox plotter — no backend server needed.

Usage:
  cd rehab-buddy/backend
  PHYPHOX_HOST=172.20.10.1 python plot_live.py

Shows a live scrolling chart of:
  • raw tilt angle (°)
  • smoothed curl progress (0–100%)
  • rep state and rep count in the title
"""

import os
import sys
import time
import math
import collections

import httpx
import matplotlib.pyplot as plt
import matplotlib.animation as animation

# allow importing from this backend directory
sys.path.insert(0, os.path.dirname(__file__))
from processing.signal_processor import SignalProcessor

HOST = os.getenv("PHYPHOX_HOST", "172.20.10.1")
PORT = int(os.getenv("PHYPHOX_PORT", "80"))
POLL_HZ = 20
WINDOW_SECS = 10  # seconds of history shown
WINDOW_SAMPLES = WINDOW_SECS * POLL_HZ

angles    = collections.deque([0.0] * WINDOW_SAMPLES, maxlen=WINDOW_SAMPLES)
progresses = collections.deque([0.0] * WINDOW_SAMPLES, maxlen=WINDOW_SAMPLES)
times_     = collections.deque(range(-WINDOW_SAMPLES, 0), maxlen=WINDOW_SAMPLES)

processor = SignalProcessor(mode="acceleration")
client = httpx.Client(timeout=1.5)
t_start = time.time()
last_rep_count = 0


def fetch():
    url = f"http://{HOST}:{PORT}/get?accX=full&accY=full&accZ=full&acc_time=full"
    try:
        r = client.get(url)
        r.raise_for_status()
        data = r.json()
        status = data.get("status", {})
        if isinstance(status, dict) and not status.get("measuring", True):
            return None
        buffers = data.get("buffer", data)
        result = {}
        for ch in ["accX", "accY", "accZ"]:
            buf = buffers.get(ch, {}).get("buffer", [])
            if not buf:
                return None
            result[ch] = buf[-1]
        return result
    except Exception as e:
        print(f"[fetch error] {e}", flush=True)
        return None


fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 6), sharex=True)
fig.suptitle("RehabBuddy — Live Sensor Data", fontsize=13, fontweight="bold")

line_angle,    = ax1.plot([], [], color="#4C9BE8", lw=1.5, label="Tilt angle (°)")
line_progress, = ax2.plot([], [], color="#2ECC71", lw=1.5, label="Progress (%)")
target_line    = ax2.axhline(72, color="#E74C3C", lw=1, ls="--", label="Target (72%)")

ax1.set_ylabel("Angle (°)")
ax1.set_ylim(0, 150)
ax1.legend(loc="upper left", fontsize=8)
ax1.grid(True, alpha=0.3)

ax2.set_ylabel("Progress (%)")
ax2.set_ylim(-5, 105)
ax2.set_xlabel("Time (s)")
ax2.legend(loc="upper left", fontsize=8)
ax2.grid(True, alpha=0.3)

status_text = ax1.text(0.99, 0.95, "connecting…", transform=ax1.transAxes,
                       ha="right", va="top", fontsize=9,
                       bbox=dict(boxstyle="round,pad=0.3", fc="white", alpha=0.7))


def update(_frame):
    global last_rep_count

    reading = fetch()
    now = time.time() - t_start

    if reading is not None:
        frame = processor.process(reading)
        if frame is not None:
            angles.append(frame.raw_angle)
            progresses.append(frame.smoothed_progress * 100)
            times_.append(now)

            if frame.rep_count > last_rep_count:
                last_rep_count = frame.rep_count
                q = frame.last_rep_quality
                label = "PERFECT" if q >= 0.90 else "GOOD" if q >= 0.75 else "FAIR" if q >= 0.60 else "LOW"
                print(f"  Rep #{frame.rep_count}  peak={q:.0%}  [{label}]  score={frame.score}", flush=True)

            state_str = frame.rep_state.replace("_", " ").upper()
            status_text.set_text(
                f"Reps: {frame.rep_count}  Good: {frame.good_reps}  Score: {frame.score}\n"
                f"State: {state_str}  Angle: {frame.raw_angle:.1f}°"
            )
            fig.suptitle(
                f"RehabBuddy  |  {frame.feedback}",
                fontsize=13, fontweight="bold"
            )
    else:
        angles.append(0)
        progresses.append(0)
        times_.append(now)
        status_text.set_text(f"⚠ No data from {HOST}:{PORT}")

    xs = list(times_)
    line_angle.set_data(xs, list(angles))
    line_progress.set_data(xs, list(progresses))

    if xs:
        ax1.set_xlim(xs[0], xs[-1] + 0.1)
        ax2.set_xlim(xs[0], xs[-1] + 0.1)

    return line_angle, line_progress, status_text


print(f"Connecting to phyphox at {HOST}:{PORT} — press Ctrl-C or close window to stop")

ani = animation.FuncAnimation(
    fig, update,
    interval=int(1000 / POLL_HZ),
    blit=False,
    cache_frame_data=False,
)

plt.tight_layout()
plt.show()
client.close()
