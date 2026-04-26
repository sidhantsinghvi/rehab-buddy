# RepRight

A gamified rehab trainer that uses phone accelerometer data to track arm movements and provide real-time feedback on exercise form and range of motion.

## Overview

RehabBuddy connects to your iPhone running [phyphox](https://phyphox.org/) to capture accelerometer data from your forearm during rehabilitation exercises. The app uses AI to generate custom exercises and game-based training modes tailored to your rehab needs, making recovery engaging while ensuring proper form and safe range of motion.

## Features

### AI-Powered Exercise Generation
The app can dynamically create exercises based on your specific rehabilitation goals. Examples include:
- **Bicep Curls** with form tracking
- **Tricep Extensions** with responsive control
- **Lateral Raises** with shoulder stability feedback

Each generated exercise comes with a custom game mode designed to reinforce proper technique.

### Core Capabilities
- **AI Coach** — Generates exercises tailored to your rehab phase and goals
- **Calibration** — Auto-detects your range of motion on first use
- **Real-time Form Feedback** — Live guidance during exercises
- **Rep Grading** — Scores each rep (A–D) based on form quality and consistency
- **Safety Monitoring** — Alerts when you exceed safe range limits
- **Session Summary** — Shows reps, quality percentage, score, and peak angle

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

### Sensor Pipeline
- **phyphox Remote Access API** — Polls accelerometer (accX, accY, accZ) via HTTP
- **usePhyphoxDirect hook** — Real-time signal processing
  - EMA smoothing for bicep (smooth motion feel)
  - Instant tricep response (no EMA) for snappy control
  - Lateral raise detection via accY auto-direction

### Key Files
- `src/hooks/usePhyphoxDirect.js` — Sensor data processing, calibration, rep counting
- `src/components/App.jsx` — Navigation & exercise router
- `src/components/*Game.jsx` — Game logic for AI-generated exercises
- `src/components/CalibrationScreen.jsx` — Range of motion setup
- `src/components/AICoach.jsx` — Exercise generation and personalization

## Calibration

The app auto-detects your arm's direction of motion during calibration:
1. **First rep** — Determines whether accY increases or decreases when you raise your arm
2. **Second rep** — Confirms direction and computes range
3. **Auto-correct** — Applies this throughout the session

This means the same code works for different phone orientations without manual configuration.

## Recent Updates

### Sensor & Calibration Improvements
- Enhanced axis selection for improved motion detection
- Auto-detect calibration direction (works with any phone orientation)
- Direction-aware output transformations for accurate feedback
- Smooth interpolation for responsive game controls
- Safety checks focused on range limits, not underperformance
- Instant sensor response for high-precision feedback

### Stability
Core exercise and calibration logic is production-ready and extensively tested for accuracy and responsiveness.

## Sensor Integration

The app connects directly to your phone's accelerometer via phyphox Remote Access, capturing real-time motion data (typically ~50–100ms response time). The sensor processing pipeline:
1. Reads accelerometer values (accY axis primary, accZ secondary)
2. Compares against calibrated rest/peak positions to compute progress (0–1)
3. Applies direction-aware transformations for accurate movement tracking
4. Feeds live data to the current exercise game for immediate visual feedback

This enables the AI coach to monitor your form in real-time and generate appropriate exercises based on your current capabilities.

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


---

**Status:** Fully functional real-time sensor tracking with AI-powered exercise generation. Auto-calibration and intelligent game-based feedback enable personalized rehabilitation training at scale.
