"""
Signal processing: raw IMU → bicep curl metrics.

─── Mounting assumption ────────────────────────────────────────────────────────
Phone strapped to forearm, long axis (Y) parallel to forearm, pointing toward
the wrist. Screen faces outward when the arm hangs at rest.

─── Angle from accelerometer ───────────────────────────────────────────────────
We exploit the fact that the accelerometer, when at rest, measures the gravity
vector. By computing how much the gravity has "tipped" away from the forearm
axis, we get the forearm tilt angle from vertical.

  forearm_tilt = atan2( sqrt(aX²+aZ²),  |aY| )

  • aY≈±9.8, aX≈aZ≈0  →  tilt≈0°   (arm hanging straight down)
  • aY≈0,   aX or aZ large  →  tilt≈90°  (arm horizontal, mid-curl)
  • aY≈∓9.8, opposite direction  →  tilt≈180° (arm straight up, past horizontal)

For a bicep curl we care about 0°–130° range. At full curl the forearm
is roughly 45°–60° past horizontal (>90°), depending on the person.

Limitation: during dynamic movement the accelerometer also picks up linear
acceleration (not just gravity), which adds noise at fast movements. EMA
smoothing mitigates this. Future: use complementary filter with gyroscope.

─── Rep detection state machine ────────────────────────────────────────────────
IDLE ──(progress > UP_START)──► GOING_UP
        ──(progress > TOP)──────► AT_TOP
                  ──(progress < TOP - hyst)──► GOING_DOWN
                              ──(progress < DOWN)──► IDLE  ← rep counted

Hysteresis prevents rapid back-and-forth toggling near thresholds.

─── Scoring ────────────────────────────────────────────────────────────────────
Each rep earns points based on how high the peak progress reached:
  ≥90%  →  15 pts (Perfect)
  ≥75%  →  10 pts (Good)
  ≥60%  →   6 pts (Fair)
  <60%  →   2 pts (Too low)

─── Future extensibility ───────────────────────────────────────────────────────
To add adaptive targets (Phase 2), inject a PersonalizationConfig dataclass
that overrides TOP_THRESHOLD and score weights. The agent layer computes that
config from natural language injury descriptions + session history.
"""

import math
import time
import logging
from collections import deque
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class RepState(Enum):
    IDLE = "idle"
    GOING_UP = "going_up"
    AT_TOP = "at_top"
    GOING_DOWN = "going_down"


@dataclass
class CurlFrame:
    raw_angle: float
    progress: float
    smoothed_progress: float
    rep_state: str
    rep_count: int
    good_reps: int
    feedback: str
    score: int
    session_time: float
    peak_angle: float
    last_rep_quality: float   # 0-1, peak progress of most recent completed rep


class SignalProcessor:
    # ── rep detection thresholds (as fraction 0–1 of calibrated range) ──
    UP_START = 0.30     # begin tracking an upward curl
    TOP = 0.72          # "good rep" zone — target to reach
    TOP_HYST = 0.12     # hysteresis so small drops at top don't reset state
    DOWN_DONE = 0.22    # rep complete; arm back near rest

    # ── smoothing ──
    EMA_ALPHA = 0.22    # lower = smoother but more lag; 0.22 ≈ 50ms lag at 20Hz

    # ── calibration defaults (degrees) ──
    DEFAULT_MIN = 8.0   # typical arm-at-rest tilt (never exactly 0 due to mounting)
    DEFAULT_MAX = 105.0 # typical full curl tilt; 105° = forearm past horizontal

    # ── scoring ──
    GOOD_REP_MIN = 0.68

    def __init__(self, mode: str = "acceleration"):
        self.mode = mode

        # calibration
        self.min_angle = self.DEFAULT_MIN
        self.max_angle = self.DEFAULT_MAX

        # session state
        self.rep_state = RepState.IDLE
        self.rep_count = 0
        self.good_reps = 0
        self.score = 0
        self._session_start = time.time()

        # per-rep tracking
        self._rep_peak = 0.0
        self.last_rep_quality = 0.0
        self.peak_angle = 0.0

        # smoothing state
        self._smoothed = 0.0
        self._initialized = False

        # auto-calibration — tracks observed range
        self._angle_window: deque = deque(maxlen=600)  # ~30s at 20Hz

    # ── public API ──────────────────────────────────────────────────────────

    def set_calibration(self, min_angle: float, max_angle: float):
        self.min_angle = min_angle
        self.max_angle = max_angle
        logger.info(f"Calibration: min={min_angle:.1f}° max={max_angle:.1f}°")

    def reset(self):
        self.__init__(mode=self.mode)

    def process(self, reading: dict) -> Optional[CurlFrame]:
        angle = self._compute_angle(reading)
        if angle is None:
            return None

        self._update_auto_calibration(angle)
        self.peak_angle = max(self.peak_angle, angle)

        progress = self._to_progress(angle)

        # Seed EMA on first frame instead of starting from 0
        if not self._initialized:
            self._smoothed = progress
            self._initialized = True
        else:
            self._smoothed += self.EMA_ALPHA * (progress - self._smoothed)

        sp = self._smoothed
        self._run_state_machine(sp)

        return CurlFrame(
            raw_angle=round(angle, 2),
            progress=round(progress, 3),
            smoothed_progress=round(sp, 3),
            rep_state=self.rep_state.value,
            rep_count=self.rep_count,
            good_reps=self.good_reps,
            feedback=self._feedback(sp),
            score=self.score,
            session_time=round(time.time() - self._session_start, 1),
            peak_angle=round(self.peak_angle, 1),
            last_rep_quality=round(self.last_rep_quality, 3),
        )

    # ── internals ───────────────────────────────────────────────────────────

    def _compute_angle(self, reading: dict) -> Optional[float]:
        if self.mode == "attitude":
            pitch = reading.get("pitch")
            if pitch is None:
                return None
            # phyphox returns attitude in radians
            return abs(math.degrees(pitch))

        # acceleration mode (default)
        aX = reading.get("accX")
        aY = reading.get("accY")
        aZ = reading.get("accZ")
        if any(v is None for v in [aX, aY, aZ]):
            return None

        # lateral = component perpendicular to forearm axis (Y)
        lateral = math.sqrt(aX ** 2 + aZ ** 2)
        # tilt from arm-down position
        angle = math.degrees(math.atan2(lateral, abs(aY)))
        return angle

    def _to_progress(self, angle: float) -> float:
        span = self.max_angle - self.min_angle
        if span <= 0:
            return 0.0
        return max(0.0, min(1.0, (angle - self.min_angle) / span))

    def _update_auto_calibration(self, angle: float):
        """
        Gently expand calibration bounds based on observed data.
        Never shrinks bounds — only grows them so existing progress mappings
        don't suddenly shift mid-session.
        """
        self._angle_window.append(angle)
        if len(self._angle_window) < 60:
            return

        obs_min = min(self._angle_window)
        obs_max = max(self._angle_window)

        # Expand downward if user's rest is lower than current min
        if obs_min < self.min_angle - 3:
            self.min_angle = max(0.0, obs_min + 1)

        # Expand upward if user is reaching higher than default max
        if obs_max > self.max_angle + 3:
            self.max_angle = obs_max + 2

    def _run_state_machine(self, sp: float):
        if self.rep_state == RepState.IDLE:
            if sp > self.UP_START:
                self.rep_state = RepState.GOING_UP
                self._rep_peak = sp

        elif self.rep_state == RepState.GOING_UP:
            self._rep_peak = max(self._rep_peak, sp)
            if sp >= self.TOP:
                self.rep_state = RepState.AT_TOP

        elif self.rep_state == RepState.AT_TOP:
            self._rep_peak = max(self._rep_peak, sp)
            if sp < (self.TOP - self.TOP_HYST):
                self.rep_state = RepState.GOING_DOWN

        elif self.rep_state == RepState.GOING_DOWN:
            if sp > self.TOP:
                # user went back up — not a complete rep yet
                self.rep_state = RepState.AT_TOP
                return

            if sp < self.DOWN_DONE:
                self._complete_rep()

    def _complete_rep(self):
        self.rep_count += 1
        self.last_rep_quality = self._rep_peak
        pts = self._score_rep(self._rep_peak)
        self.score += pts

        if self._rep_peak >= self.GOOD_REP_MIN:
            self.good_reps += 1

        logger.info(
            f"Rep #{self.rep_count} | peak={self._rep_peak:.2f} "
            f"| +{pts}pts | total={self.score} | good={self.good_reps}"
        )

        self._rep_peak = 0.0
        self.rep_state = RepState.IDLE

    @staticmethod
    def _score_rep(peak: float) -> int:
        if peak >= 0.90:
            return 15
        if peak >= 0.75:
            return 10
        if peak >= 0.60:
            return 6
        return 2

    def _feedback(self, sp: float) -> str:
        state = self.rep_state
        if state == RepState.IDLE:
            return "Ready — start curling!" if sp < 0.15 else "Up you go!"
        if state == RepState.GOING_UP:
            if sp < 0.45:
                return "Keep curling up"
            if sp < 0.68:
                return "Almost at target!"
            return "Hit the zone!"
        if state == RepState.AT_TOP:
            return "Hold it! Now lower slowly"
        if state == RepState.GOING_DOWN:
            return "Lower it back down"
        return "Go!"
