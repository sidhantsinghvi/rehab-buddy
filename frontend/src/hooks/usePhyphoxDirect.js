import { useState, useEffect, useRef, useCallback } from 'react'

// ── Game signal processing ───────────────────────────────────────────────────
const EMA_ALPHA   = 0.82   // higher = less smoothing lag
const UP_START    = 0.30
const TOP         = 0.72
const TOP_HYST    = 0.12
const DOWN_DONE   = 0.22
const POLL_MS     = 16    // ~60 Hz

// ── Calibration ──────────────────────────────────────────────────────────────
const REST_SAMPLES_NEEDED = 20   // ~0.3s at 60Hz to establish rest baseline
const REP_START_DEVIATION = 1.5  // accY must move this far from rest to start rep
const REP_END_DEVIATION   = 0.8  // accY must return this close to rest to end rep
const CALIB_REPS_NEEDED   = 2
const LIMIT_TOLERANCE     = 0.8  // noise buffer around calibrated limits
const GLOBAL_MIN          = -13  // absolute hard bounds regardless of calibration
const GLOBAL_MAX          = 13

// ── Speed enforcement ────────────────────────────────────────────────────────
const SPEED_THRESHOLD     = 30   // max |Δ accY| per second

// ── Lives ────────────────────────────────────────────────────────────────────
const MAX_LIVES           = 3
const VIOLATION_COOLDOWN  = 2000 // ms between violations

const INITIAL_DATA = {
  connected: false,
  sensorConnected: false,
  raw_angle: 0,
  progress: 0,
  smoothed_progress: 0,
  rep_state: 'idle',
  rep_count: 0,
  good_reps: 0,
  feedback: 'Waiting for sensor…',
  score: 0,
  session_time: 0,
  peak_angle: 0,
  last_rep_quality: 0,
}

function scoreRep(peak) {
  if (peak >= 0.90) return 15
  if (peak >= 0.75) return 10
  if (peak >= 0.60) return 6
  return 2
}

function getFeedback(state, sp) {
  if (state === 'idle')       return sp < 0.15 ? 'Ready — start curling!' : 'Up you go!'
  if (state === 'going_up')   return sp < 0.45 ? 'Keep curling up' : sp < 0.68 ? 'Almost there!' : 'Hit the zone!'
  if (state === 'at_top')     return 'Hold it! Now lower slowly'
  if (state === 'going_down') return 'Lower it back down'
  return 'Go!'
}

export function usePhyphoxDirect(initialHost = '') {
  const [host, setHost] = useState(initialHost)
  const [data, setData] = useState(INITIAL_DATA)
  const [repFlash, setRepFlash] = useState(null)
  const [gamePhase, setGamePhase] = useState('calibrating') // 'calibrating' | 'gaming'

  // Calibration state
  const [calibReps, setCalibReps] = useState(0)
  const [calibStatus, setCalibStatus] = useState('collecting_rest') // 'collecting_rest' | 'ready' | 'done'
  const [calibAccY, setCalibAccY] = useState(0)
  const [limits, setLimits] = useState(null)

  // Enforcement state
  const [lives, setLives] = useState(MAX_LIVES)
  const [violation, setViolation] = useState(null) // { type, message }

  const sp = useRef({
    // game signal processing
    smoothed: 0, initialized: false,
    repState: 'idle', repCount: 0, goodReps: 0,
    score: 0, repPeak: 0, lastRepQuality: 0, peakAngle: 0,
    sessionStart: Date.now(),

    // calibration
    restSamples: [],
    restValue: null,
    calibMin: Infinity,
    calibMax: -Infinity,
    calibReps: 0,
    inRep: false,

    // set after calibration — used to orient progress correctly
    curlRestValue: null,  // accY at rest (progress = 0)
    curlTopValue: null,   // accY at top of curl (progress = 1)

    // limits (set after calibration)
    limits: null,

    // speed tracking
    prevAccY: null,
    prevTime: null,

    // violation cooldown
    lastViolationTime: 0,
    lives: MAX_LIVES,
  })

  const prevRepCount = useRef(0)

  // ── Tell Vite proxy which host to forward to ─────────────────────────────
  useEffect(() => {
    if (!host) return
    fetch('/set-phyphox-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host }),
    }).catch(() => {})
  }, [host])

  // ── Calibration logic ─────────────────────────────────────────────────────
  const processCalibration = useCallback((accY) => {
    const s = sp.current
    setCalibAccY(accY)

    // Phase 1: collect rest baseline
    if (s.restSamples.length < REST_SAMPLES_NEEDED) {
      s.restSamples.push(accY)
      if (s.restSamples.length === REST_SAMPLES_NEEDED) {
        s.restValue = s.restSamples.reduce((a, b) => a + b, 0) / s.restSamples.length
        setCalibStatus('ready')
      }
      return
    }

    const deviation = Math.abs(accY - s.restValue)

    // Track min/max while in a rep
    if (s.inRep) {
      s.calibMin = Math.min(s.calibMin, accY)
      s.calibMax = Math.max(s.calibMax, accY)

      // Rep ends when user returns close to rest
      if (deviation < REP_END_DEVIATION) {
        s.inRep = false
        s.calibReps++
        setCalibReps(s.calibReps)

        if (s.calibReps >= CALIB_REPS_NEEDED) {
          const safeMin = Math.max(s.calibMin, GLOBAL_MIN)
          const safeMax = Math.min(s.calibMax, GLOBAL_MAX)
          s.limits = { min: safeMin, max: safeMax }
          setLimits(s.limits)

          // Orient progress: rest=0, top of curl=1
          // whichever extreme (calibMin or calibMax) is farther from rest is "top"
          const distToMin = Math.abs(safeMin - s.restValue)
          const distToMax = Math.abs(safeMax - s.restValue)
          s.curlRestValue = s.restValue
          s.curlTopValue = distToMin > distToMax ? safeMin : safeMax

          setCalibStatus('done')
        }
      }
    } else {
      // Start of a rep
      if (deviation > REP_START_DEVIATION) {
        s.inRep = true
        // Reset min/max tracking for this rep direction
      }
    }
  }, [])

  // ── Game violation check ──────────────────────────────────────────────────
  const checkViolations = useCallback((accY, now) => {
    const s = sp.current
    if (!s.limits) return

    const sinceLastViolation = now - s.lastViolationTime
    if (sinceLastViolation < VIOLATION_COOLDOWN) return

    let violationType = null
    let message = null

    // Speed check
    if (s.prevAccY !== null && s.prevTime !== null) {
      const dt = (now - s.prevTime) / 1000
      if (dt > 0) {
        const speed = Math.abs(accY - s.prevAccY) / dt
        if (speed > SPEED_THRESHOLD) {
          violationType = 'too_fast'
          message = 'Too fast! Slow down to protect your injury'
        }
      }
    }

    // Range check (only if no speed violation — don't double-penalise)
    if (!violationType) {
      const { min, max } = s.limits
      const direction = max > min ? 1 : -1 // which way is "up"

      if (direction === 1) {
        // accY increases going up: max is top, min is rest
        if (accY > max + LIMIT_TOLERANCE) {
          violationType = 'too_high'
          message = 'Too high! You went beyond your safe curl range'
        } else if (accY < min - LIMIT_TOLERANCE) {
          violationType = 'too_low'
          message = 'Too low! Overextension — stay in your safe range'
        }
      } else {
        // accY decreases going up: min is top, max is rest
        if (accY < min - LIMIT_TOLERANCE) {
          violationType = 'too_high'
          message = 'Too high! You went beyond your safe curl range'
        } else if (accY > max + LIMIT_TOLERANCE) {
          violationType = 'too_low'
          message = 'Too low! Overextension — stay in your safe range'
        }
      }
    }

    if (violationType) {
      s.lastViolationTime = now
      s.lives = Math.max(0, s.lives - 1)
      setLives(s.lives)
      setViolation({ type: violationType, message })
      setTimeout(() => setViolation(null), 1800)
    }
  }, [])

  // ── Game signal processing ────────────────────────────────────────────────
  const processGame = useCallback((accY) => {
    const s = sp.current

    s.peakAngle = Math.max(s.peakAngle, Math.abs(accY))

    // Use calibrated orientation: restValue→0, topValue→1
    // Works regardless of which direction accY moves during curl
    let progress
    if (s.curlRestValue !== null && s.curlTopValue !== null) {
      const range = s.curlTopValue - s.curlRestValue
      progress = range !== 0 ? Math.max(0, Math.min(1, (accY - s.curlRestValue) / range)) : 0
    } else {
      progress = 0  // wait for calibration
    }

    if (!s.initialized) { s.smoothed = progress; s.initialized = true }
    else s.smoothed += EMA_ALPHA * (progress - s.smoothed)

    const smth = s.smoothed

    // State machine
    const prev = s.repState
    if (prev === 'idle') {
      if (smth > UP_START) { s.repState = 'going_up'; s.repPeak = smth }
    } else if (prev === 'going_up') {
      s.repPeak = Math.max(s.repPeak, smth)
      if (smth >= TOP) s.repState = 'at_top'
    } else if (prev === 'at_top') {
      s.repPeak = Math.max(s.repPeak, smth)
      if (smth < TOP - TOP_HYST) s.repState = 'going_down'
    } else if (prev === 'going_down') {
      if (smth > TOP) { s.repState = 'at_top'; return }
      if (smth < DOWN_DONE) {
        s.repCount++
        s.lastRepQuality = s.repPeak
        s.score += scoreRep(s.repPeak)
        if (s.repPeak >= 0.68) s.goodReps++
        s.repPeak = 0
        s.repState = 'idle'
      }
    }

    const sessionTime = (Date.now() - s.sessionStart) / 1000

    setData({
      connected: true,
      sensorConnected: true,
      raw_angle: Math.round(accY * 10) / 10,
      progress: Math.round(progress * 1000) / 1000,
      smoothed_progress: Math.round(smth * 1000) / 1000,
      rep_state: s.repState,
      rep_count: s.repCount,
      good_reps: s.goodReps,
      feedback: getFeedback(s.repState, smth),
      score: s.score,
      session_time: Math.round(sessionTime * 10) / 10,
      peak_angle: Math.round(s.peakAngle * 10) / 10,
      last_rep_quality: Math.round(s.lastRepQuality * 1000) / 1000,
    })

    if (s.repCount > prevRepCount.current) {
      prevRepCount.current = s.repCount
      setRepFlash({ count: s.repCount, quality: s.lastRepQuality, ts: Date.now() })
    }
  }, [])

  // ── Poll loop ─────────────────────────────────────────────────────────────
  const poll = useCallback(async (currentPhase) => {
    if (!host) return

    const url = `/phyphox/get?accX=full&accY=full&accZ=full`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1400) })
      if (!res.ok) throw new Error('http error')
      const json = await res.json()

      const status = json.status
      if (typeof status === 'object' && status !== null && status.measuring === false) {
        setData(prev => ({ ...prev, connected: true, sensorConnected: false, feedback: 'phyphox not measuring — press play' }))
        return
      }

      const buf = json.buffer ?? json
      const accY = buf?.accY?.buffer?.at(-1)
      if (accY == null) {
        setData(prev => ({ ...prev, connected: true, sensorConnected: true, feedback: 'Waiting for data…' }))
        return
      }

      const now = performance.now()

      if (currentPhase === 'calibrating') {
        processCalibration(accY)
      } else {
        checkViolations(accY, now)
        processGame(accY)
      }

      sp.current.prevAccY = accY
      sp.current.prevTime = now

    } catch {
      setData(prev => ({ ...prev, connected: true, sensorConnected: false }))
    }
  }, [host, processCalibration, checkViolations, processGame])

  // Keep gamePhase in a ref so poll closure always sees current value
  const gamePhaseRef = useRef(gamePhase)
  useEffect(() => { gamePhaseRef.current = gamePhase }, [gamePhase])

  useEffect(() => {
    if (!host) return
    setData(prev => ({ ...prev, connected: true }))

    let active = true
    let timeout

    async function loop() {
      if (!active) return
      const t0 = performance.now()
      await poll(gamePhaseRef.current)
      const elapsed = performance.now() - t0
      timeout = setTimeout(loop, Math.max(0, POLL_MS - elapsed))
    }

    loop()
    return () => { active = false; clearTimeout(timeout) }
  }, [host, poll])

  const startGame = useCallback(() => {
    sp.current.sessionStart = Date.now()
    prevRepCount.current = 0
    setGamePhase('gaming')
  }, [])

  const reset = useCallback(() => {
    const s = sp.current
    s.smoothed = 0; s.initialized = false
    s.repState = 'idle'; s.repCount = 0; s.goodReps = 0
    s.score = 0; s.repPeak = 0; s.lastRepQuality = 0; s.peakAngle = 0
    s.sessionStart = Date.now()
    s.lives = MAX_LIVES
    s.lastViolationTime = 0
    // keep curlRestValue/curlTopValue/limits — calibration stays valid
    prevRepCount.current = 0
    setLives(MAX_LIVES)
    setViolation(null)
    setData(INITIAL_DATA)
  }, [])

  const resetCalibration = useCallback(() => {
    const s = sp.current
    s.restSamples = []; s.restValue = null
    s.calibMin = Infinity; s.calibMax = -Infinity
    s.calibReps = 0; s.inRep = false; s.limits = null
    s.curlRestValue = null; s.curlTopValue = null
    setCalibReps(0)
    setCalibStatus('collecting_rest')
    setLimits(null)
    setGamePhase('calibrating')
  }, [])

  return {
    data, repFlash, host, setHost, reset,
    gamePhase, startGame, resetCalibration,
    calibReps, calibStatus, calibAccY, limits,
    lives, violation,
  }
}
