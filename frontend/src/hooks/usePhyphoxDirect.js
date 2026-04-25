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
const REP_START_DEVIATION = 1.5  // axis must move this far from rest to start rep
const REP_END_DEVIATION   = 0.8  // axis must return this close to rest to end rep
const CALIB_REPS_NEEDED   = 2
const LIMIT_TOLERANCE     = 0.8  // noise buffer around calibrated limits
const GLOBAL_MIN          = -13  // absolute hard bounds regardless of calibration
const GLOBAL_MAX          = 13

// ── Speed enforcement ────────────────────────────────────────────────────────
const SPEED_THRESHOLD     = 30   // max |Δ axis| per second

// ── Lives ────────────────────────────────────────────────────────────────────
const MAX_LIVES           = 3
const VIOLATION_COOLDOWN  = 2000 // ms between violations

const INITIAL_DATA = {
  connected: false,
  sensorConnected: false,
  raw_angle: 0,
  raw_z: 0,
  progress: 0,
  smoothed_progress: 0,
  lateral_progress: 0,
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
  const [exercise, setExerciseState] = useState('bicep')    // 'bicep' | 'lateral'

  // Calibration state (shared display: reps, status, live axis value, limits)
  const [calibReps, setCalibReps] = useState(0)
  const [calibStatus, setCalibStatus] = useState('collecting_rest')
  const [calibAccY, setCalibAccY] = useState(0)
  const [limits, setLimits] = useState(null)

  // Enforcement state
  const [lives, setLives] = useState(MAX_LIVES)
  const [violation, setViolation] = useState(null)

  const sp = useRef({
    // game signal processing (bicep)
    smoothed: 0, initialized: false,
    repState: 'idle', repCount: 0, goodReps: 0,
    score: 0, repPeak: 0, lastRepQuality: 0, peakAngle: 0,
    sessionStart: Date.now(),

    // bicep calibration
    restSamples: [],
    restValue: null,
    calibMin: Infinity,
    calibMax: -Infinity,
    calibReps: 0,
    inRep: false,
    curlRestValue: null,
    curlTopValue: null,
    limits: null,

    // lateral calibration (Z-axis: track min/max, pick "top" = farther from rest)
    lateralRestSamples: [],
    lateralRestZ: null,
    lateralTopZ: null,
    lateralCalibMinZ: Infinity,
    lateralCalibMaxZ: -Infinity,
    lateralCalibReps: 0,
    lateralInRep: false,
    /** First significant move off rest: +Z = peak is high-Z end, −Z = peak is low-Z end (common for "Z drops" on raise) */
    lateralDirCaptured: false,
    lateralTopIsMaxZ: true,

    // speed tracking
    prevAccY: null,
    prevAccZ: null,
    prevTime: null,

    // violation cooldown
    lastViolationTime: 0,
    lives: MAX_LIVES,
  })

  const prevRepCount = useRef(0)
  const exerciseRef = useRef('bicep')
  useEffect(() => { exerciseRef.current = exercise }, [exercise])

  // ── Tell Vite proxy which host to forward to ─────────────────────────────
  useEffect(() => {
    if (!host) return
    fetch('/set-phyphox-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host }),
    }).catch(() => {})
  }, [host])

  // ── Bicep calibration (accY-based) ────────────────────────────────────────
  const processBicepCalibration = useCallback((accY) => {
    const s = sp.current
    setCalibAccY(accY)

    if (s.restSamples.length < REST_SAMPLES_NEEDED) {
      s.restSamples.push(accY)
      if (s.restSamples.length === REST_SAMPLES_NEEDED) {
        s.restValue = s.restSamples.reduce((a, b) => a + b, 0) / s.restSamples.length
        setCalibStatus('ready')
      }
      return
    }

    const deviation = Math.abs(accY - s.restValue)

    if (s.inRep) {
      s.calibMin = Math.min(s.calibMin, accY)
      s.calibMax = Math.max(s.calibMax, accY)

      if (deviation < REP_END_DEVIATION) {
        s.inRep = false
        s.calibReps++
        setCalibReps(s.calibReps)

        if (s.calibReps >= CALIB_REPS_NEEDED) {
          const safeMin = Math.max(s.calibMin, GLOBAL_MIN)
          const safeMax = Math.min(s.calibMax, GLOBAL_MAX)
          s.limits = { min: safeMin, max: safeMax }
          setLimits(s.limits)

          const distToMin = Math.abs(safeMin - s.restValue)
          const distToMax = Math.abs(safeMax - s.restValue)
          s.curlRestValue = s.restValue
          s.curlTopValue = distToMin > distToMax ? safeMin : safeMax

          setCalibStatus('done')
        }
      }
    } else {
      if (deviation > REP_START_DEVIATION) s.inRep = true
    }
  }, [])

  // ── Lateral calibration (accZ): "top" = min or max of in-rep Z from first significant move (down vs up)
  const processLateralCalibration = useCallback((accZ) => {
    const s = sp.current
    setCalibAccY(accZ) // re-use display field for the live axis value

    if (s.lateralRestSamples.length < REST_SAMPLES_NEEDED) {
      s.lateralRestSamples.push(accZ)
      if (s.lateralRestSamples.length === REST_SAMPLES_NEEDED) {
        s.lateralRestZ = s.lateralRestSamples.reduce((a, b) => a + b, 0) / s.lateralRestSamples.length
        setCalibStatus('ready')
      }
      return
    }

    const off = accZ - s.lateralRestZ
    const deviation = Math.abs(off)

    if (s.lateralInRep) {
      s.lateralCalibMinZ = Math.min(s.lateralCalibMinZ, accZ)
      s.lateralCalibMaxZ = Math.max(s.lateralCalibMaxZ, accZ)

      if (deviation < REP_END_DEVIATION) {
        s.lateralInRep = false
        s.lateralCalibReps++
        setCalibReps(s.lateralCalibReps)

        if (s.lateralCalibReps >= CALIB_REPS_NEEDED) {
          s.lateralTopZ = s.lateralTopIsMaxZ ? s.lateralCalibMaxZ : s.lateralCalibMinZ
          setLimits({
            min: Math.min(s.lateralTopZ, s.lateralRestZ),
            max: Math.max(s.lateralTopZ, s.lateralRestZ),
          })
          setCalibStatus('done')
        }
      }
    } else {
      if (deviation > REP_START_DEVIATION) {
        if (!s.lateralDirCaptured) {
          s.lateralDirCaptured = true
          s.lateralTopIsMaxZ = off > 0
        }
        s.lateralInRep = true
        s.lateralCalibMinZ = Math.min(s.lateralCalibMinZ, accZ)
        s.lateralCalibMaxZ = Math.max(s.lateralCalibMaxZ, accZ)
      }
    }
  }, [])

  // ── Game violation check (bicep only — uses accY limits) ─────────────────
  const checkViolations = useCallback((accY, now) => {
    const s = sp.current
    if (!s.limits || exerciseRef.current !== 'bicep') return

    const sinceLastViolation = now - s.lastViolationTime
    if (sinceLastViolation < VIOLATION_COOLDOWN) return

    let violationType = null
    let message = null

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

    if (!violationType) {
      const { min, max } = s.limits
      const direction = max > min ? 1 : -1

      if (direction === 1) {
        if (accY > max + LIMIT_TOLERANCE) {
          violationType = 'too_high'; message = 'Too high! You went beyond your safe curl range'
        } else if (accY < min - LIMIT_TOLERANCE) {
          violationType = 'too_low';  message = 'Too low! Overextension — stay in your safe range'
        }
      } else {
        if (accY < min - LIMIT_TOLERANCE) {
          violationType = 'too_high'; message = 'Too high! You went beyond your safe curl range'
        } else if (accY > max + LIMIT_TOLERANCE) {
          violationType = 'too_low';  message = 'Too low! Overextension — stay in your safe range'
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
  const processGame = useCallback((accY, accZ) => {
    const s = sp.current

    s.peakAngle = Math.max(s.peakAngle, Math.abs(accY))

    // Bicep progress (accY)
    let progress = 0
    if (s.curlRestValue !== null && s.curlTopValue !== null) {
      const range = s.curlTopValue - s.curlRestValue
      progress = range !== 0 ? Math.max(0, Math.min(1, (accY - s.curlRestValue) / range)) : 0
    }

    if (!s.initialized) { s.smoothed = progress; s.initialized = true }
    else s.smoothed += EMA_ALPHA * (progress - s.smoothed)
    const smth = s.smoothed

    // Lateral progress: 0% = rest Z, 100% = peak Z. No EMA (instant).
    // Use a sign-aware map so whether Z goes up or down to reach the top, "raise" monotonically increases p.
    let lateralProgress = 0
    if (s.lateralRestZ !== null && s.lateralTopZ !== null) {
      const r = s.lateralRestZ
      const T = s.lateralTopZ
      const lo = Math.min(r, T)
      const hi = Math.max(r, T)
      const range = hi - lo
      if (range >= 0.2) {
        if (T > r) {
          // raise increases Z: rest on low side, peak on high side
          lateralProgress = Math.max(0, Math.min(1, (accZ - lo) / range))
        } else {
          // raise decreases Z: rest on high side, peak on low side (typical: Z "drops" when you lift)
          lateralProgress = Math.max(0, Math.min(1, (hi - accZ) / range))
        }
      }
    }

    // Bicep rep state machine (only relevant when exercise='bicep')
    if (exerciseRef.current === 'bicep') {
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
        if (smth > TOP) { s.repState = 'at_top' }
        else if (smth < DOWN_DONE) {
          s.repCount++
          s.lastRepQuality = s.repPeak
          s.score += scoreRep(s.repPeak)
          if (s.repPeak >= 0.68) s.goodReps++
          s.repPeak = 0
          s.repState = 'idle'
        }
      }
    }

    const sessionTime = (Date.now() - s.sessionStart) / 1000

    setData({
      connected: true,
      sensorConnected: true,
      raw_angle: Math.round(accY * 10) / 10,
      raw_z: Math.round(accZ * 10) / 10,
      progress: Math.round(progress * 1000) / 1000,
      smoothed_progress: Math.round(smth * 1000) / 1000,
      lateral_progress: Math.round(lateralProgress * 1000) / 1000,
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
      const accZ = buf?.accZ?.buffer?.at(-1)
      if (accY == null || accZ == null) {
        setData(prev => ({ ...prev, connected: true, sensorConnected: true, feedback: 'Waiting for data…' }))
        return
      }

      const now = performance.now()

      if (currentPhase === 'calibrating') {
        if (exerciseRef.current === 'lateral') processLateralCalibration(accZ)
        else processBicepCalibration(accY)
      } else {
        checkViolations(accY, now)
        processGame(accY, accZ)
      }

      sp.current.prevAccY = accY
      sp.current.prevAccZ = accZ
      sp.current.prevTime = now

    } catch {
      setData(prev => ({ ...prev, connected: true, sensorConnected: false }))
    }
  }, [host, processBicepCalibration, processLateralCalibration, checkViolations, processGame])

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
    prevRepCount.current = 0
    setLives(MAX_LIVES)
    setViolation(null)
    setData(INITIAL_DATA)
  }, [])

  const resetCalibration = useCallback(() => {
    const s = sp.current
    // bicep
    s.restSamples = []; s.restValue = null
    s.calibMin = Infinity; s.calibMax = -Infinity
    s.calibReps = 0; s.inRep = false; s.limits = null
    s.curlRestValue = null; s.curlTopValue = null
    // lateral
    s.lateralRestSamples = []; s.lateralRestZ = null; s.lateralTopZ = null
    s.lateralCalibMinZ = Infinity; s.lateralCalibMaxZ = -Infinity; s.lateralCalibReps = 0; s.lateralInRep = false
    s.lateralDirCaptured = false; s.lateralTopIsMaxZ = true

    setCalibReps(0)
    setCalibStatus('collecting_rest')
    setLimits(null)
    setGamePhase('calibrating')
  }, [])

  const setExercise = useCallback((name) => {
    setExerciseState(name)
  }, [])

  const skipCalibration = useCallback(() => {
    const s = sp.current

    if (exerciseRef.current === 'lateral') {
      const currentZ = Number.isFinite(s.prevAccZ) ? s.prevAccZ : 0
      s.lateralRestZ = currentZ
      s.lateralTopZ = currentZ - 6
      setLimits({ min: Math.min(s.lateralTopZ, s.lateralRestZ), max: Math.max(s.lateralTopZ, s.lateralRestZ) })
    } else {
      const current = Number.isFinite(s.prevAccY) ? s.prevAccY : 0
      s.restValue = current
      s.calibMin = GLOBAL_MIN
      s.calibMax = GLOBAL_MAX
      s.calibReps = CALIB_REPS_NEEDED
      s.inRep = false
      s.limits = { min: GLOBAL_MIN, max: GLOBAL_MAX }
      const distToMin = Math.abs(GLOBAL_MIN - current)
      const distToMax = Math.abs(GLOBAL_MAX - current)
      s.curlRestValue = current
      s.curlTopValue = distToMin > distToMax ? GLOBAL_MIN : GLOBAL_MAX
      setLimits(s.limits)
    }

    setCalibReps(CALIB_REPS_NEEDED)
    setCalibStatus('done')
  }, [])

  return {
    data, repFlash, host, setHost, reset,
    gamePhase, startGame, resetCalibration, skipCalibration,
    calibReps, calibStatus, calibAccY, limits,
    lives, violation,
    exercise, setExercise,
  }
}
