# RehabBuddy 💪

**AI-powered rehabilitation platform for injury recovery.** Replaces traditional physiotherapy with an intelligent, adaptive system that tracks your movement, monitors form in real-time, and personalizes exercises to accelerate healing. Uses your phone's accelerometer to deliver professional-grade physical therapy at home.

## Overview

**For injury recovery, RehabBuddy is your at-home physical therapist.**

After surgery, injury, or stroke, you need consistent, guided rehabilitation to regain strength and mobility. RehabBuddy replaces expensive physiotherapy visits with an intelligent system that:

- **Captures precise movement data** via your iPhone (no special equipment needed)
- **Monitors form 24/7** — detects even small deviations in your technique
- **Adapts in real-time** — a backend AI system analyzes your performance and customizes difficulty, exercises, and feedback on-the-fly
- **Keeps you motivated** — game-based training makes recovery engaging instead of painful and boring
- **Ensures safety** — prevents over-extension and tracks safe range of motion automatically

The app generates exercises tailored to your specific injury and rehab phase, making recovery faster and more effective than traditional PT alone.

## Features

### Replaces Physiotherapy
- **AI Coach monitors every rep** — catches form errors that could slow recovery or cause re-injury
- **Personalized exercise library** — constantly generates new exercises matched to your injury type and rehab stage
- **24/7 availability** — practice whenever you want, no appointment scheduling
- **Progress tracking** — detailed metrics show exactly how you're improving week-to-week

### AI-Powered Adaptive Training
The app creates exercises dynamically based on your specific needs:
- **Bicep Curls** with form tracking — for shoulder/arm recovery
- **Tricep Extensions** with responsive control — for overhead stability
- **Lateral Raises** with shoulder stability feedback — for rotator cuff rehab

Each exercise comes with a game mode that reinforces proper technique while keeping you engaged.

### Intelligent Safety & Feedback
- **Real-time Form Feedback** — Live guidance to prevent cheating or compensation patterns
- **Range of Motion Auto-Calibration** — Learns your safe limits and prevents over-extension
- **Rep Grading** — A–D scoring shows exactly how well each rep was executed
- **Performance Analytics** — Tracks strength gains, consistency, and readiness to progress
- **Session Summary** — Complete breakdown of your workout quality and intensity

## Setup

### Requirements
- iPhone with [phyphox](https://phyphox.org/) app installed
- phyphox "Acceleration" experiment enabled with Remote Access active
- Same WiFi network or direct connection to phone IP

### Quick Start
1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```

3. Open the app and enter your phone's IP address from phyphox
4. Do 2 warm-up reps to calibrate (or skip and estimate range)
5. Choose your exercise and game mode
6. Start training!

## Architecture

### Frontend
- **React** with Vite for fast builds
- **Tailwind CSS** + custom CSS variables for theming (dark mode)
- **Canvas-based games** for low-latency, frame-by-frame rendering

### Backend API
- **Real-time Game Customization** — Analyzes user performance on-the-fly and adjusts difficulty, mechanics, and feedback
- **Exercise Generation** — AI-powered system creates personalized exercises based on:
  - User's current range of motion and strength
  - Rehab phase and goals
  - Performance metrics from previous sessions
  - Real-time form quality during active play
- **Adaptive Difficulty** — Dynamically adjusts game parameters to maintain engagement and optimal challenge level

### Sensor Pipeline
- **phyphox Remote Access** — Captures live accelerometer data (accX, accY, accZ)
- **usePhyphoxDirect hook** — Real-time signal processing
  - EMA smoothing for bicep (smooth motion feel)
  - Instant tricep response (no EMA) for snappy control
  - Lateral raise detection via accY auto-direction
- **Data to Backend** — Streams form quality, rep metrics, and user state to API for analysis

### Key Files
- `src/hooks/usePhyphoxDirect.js` — Sensor data processing, calibration, rep counting
- `src/components/App.jsx` — Navigation & exercise router
- `src/components/*Game.jsx` — Game logic for AI-generated exercises
- `src/components/CalibrationScreen.jsx` — Range of motion setup
- `src/components/AICoach.jsx` — Exercise generation and real-time game customization

## Calibration

The app auto-detects your arm's direction of motion during calibration:
1. **First rep** — Determines whether accY increases or decreases when you raise your arm
2. **Second rep** — Confirms direction and computes range
3. **Auto-correct** — Applies this throughout the session

This means the same code works for different phone orientations without manual configuration.

## Recent Updates

### Sensor & Calibration Improvements
- ✅ Enhanced axis selection for improved motion detection
- ✅ Auto-detect calibration direction (works with any phone orientation)
- ✅ Direction-aware output transformations for accurate feedback
- ✅ Smooth interpolation for responsive game controls
- ✅ Safety checks focused on range limits, not underperformance
- ✅ Instant sensor response for high-precision feedback

### Stability
Core exercise and calibration logic is production-ready and extensively tested for accuracy and responsiveness.

## Sensor Integration & Real-Time Customization

The app creates a bidirectional data flow between your phone's accelerometer and the backend AI:

**Data Flow:**
1. **Capture** — Phone accelerometer sends motion data to the app via phyphox Remote Access (typically ~50–100ms response time)
2. **Process** — Frontend hook reads accY/accZ values and compares against calibrated rest/peak positions
3. **Analyze** — Form quality, rep metrics, and user state are streamed to the backend API in real-time
4. **Customize** — Backend analyzes performance and sends back game parameter adjustments (difficulty, mechanics, visual feedback style)
5. **Render** — Updated game rules and parameters are applied to the current exercise game instantly

This enables the backend AI to monitor your form in real-time, detect struggles or perfect form, and dynamically adjust the game to keep you challenged—never too easy, never too hard. Each rep makes the system smarter about what you need next.

## Development

### Sensor Debugging
- **CalibrationScreen** shows live `calibAccY` (raw input)
- **Game screens** show `lateral_progress`, `smoothed_progress`, `rep_state`
- Look at `raw_z` to verify Z-axis is stable (currently logged but not used)

### Common Issues
- **Phone not responding:** Check phyphox Remote Access is enabled, IP is correct
- **Calibration stuck:** Do 2 full, clear reps (big range of motion)
- **Game feels delayed:** Verify network latency; Vite should be < 100ms E2E
- **Lateral raises flipped:** Force recalibration after code changes

## License

Internal project. Built with ❤️ for injury recovery.

---

**Status:** Fully functional real-time sensor tracking with AI-powered exercise generation. Auto-calibration and intelligent game-based feedback enable personalized rehabilitation training at scale.
