/**
 * Direct phyphox poller — no backend server required.
 * Polls http://{host}/get?accX=full&accY=full&accZ=full at 20 Hz,
 * runs signal processing (angle → progress → rep state) entirely in JS,
 * and returns the same data shape CurlGame expects.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Signal processing constants ─────────────────────────────────────────────
const EMA_ALPHA  = 0.6
const UP_START   = 0.30
const TOP        = 0.72
const TOP_HYST   = 0.12
const DOWN_DONE  = 0.22
const DEFAULT_MIN = -11.0   // accY at full curl (near -9.8)
const DEFAULT_MAX = 11.0    // accY at rest (near +9.8)
const POLL_MS    = 16   // ~60 Hz

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

function computeAngle(aX, aY, aZ) {
  // Use raw accY — increases as arm curls up (gravity shifts along Y)
  return aY
}

function scoreRep(peak) {
  if (peak >= 0.90) return 15
  if (peak >= 0.75) return 10
  if (peak >= 0.60) return 6
  return 2
}

function getFeedback(state, sp) {
  if (state === 'idle')        return sp < 0.15 ? 'Ready — start curling!' : 'Up you go!'
  if (state === 'going_up')    return sp < 0.45 ? 'Keep curling up' : sp < 0.68 ? 'Almost at target!' : 'Hit the zone!'
  if (state === 'at_top')      return 'Hold it! Now lower slowly'
  if (state === 'going_down')  return 'Lower it back down'
  return 'Go!'
}

export function usePhyphoxDirect(initialHost = '') {
  const [host, setHost] = useState(initialHost)
  const [data, setData] = useState(INITIAL_DATA)
  const [repFlash, setRepFlash] = useState(null)

  // Signal processing state — in a ref so the poll closure always sees current values
  const sp = useRef({
    smoothed: 0,
    initialized: false,
    minAngle: DEFAULT_MIN,
    maxAngle: DEFAULT_MAX,
    repState: 'idle',  // idle | going_up | at_top | going_down
    repCount: 0,
    goodReps: 0,
    score: 0,
    repPeak: 0,
    lastRepQuality: 0,
    peakAngle: 0,
    sessionStart: Date.now(),
    angleWindow: [],   // for auto-calibration
  })

  const timerRef = useRef(null)
  const prevRepCount = useRef(0)

  // When host changes, tell the Vite proxy to update its target
  useEffect(() => {
    if (!host) return
    fetch('/set-phyphox-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host }),
    }).catch(() => {})
  }, [host])

  const poll = useCallback(async () => {
    if (!host) return

    // Fetch through Vite proxy (/phyphox/*) to avoid browser CORS block
    const url = `/phyphox/get?accX=full&accY=full&accZ=full`
    let reading = null

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
      const aX = buf?.accX?.buffer?.at(-1)
      const aY = buf?.accY?.buffer?.at(-1)
      const aZ = buf?.accZ?.buffer?.at(-1)

      // Got a valid response — we're connected even if buffer is momentarily empty
      if (aX == null || aY == null || aZ == null) {
        setData(prev => ({ ...prev, connected: true, sensorConnected: true, feedback: 'Waiting for data…' }))
        return
      }
      reading = { aX, aY, aZ }
    } catch {
      setData(prev => ({ ...prev, connected: true, sensorConnected: false }))
      return
    }

    // ── signal processing ────────────────────────────────────────────────
    const s = sp.current
    const angle = computeAngle(reading.aX, reading.aY, reading.aZ)

    // auto-calibration
    s.angleWindow.push(angle)
    if (s.angleWindow.length > 600) s.angleWindow.shift()
    if (s.angleWindow.length >= 60) {
      const mn = Math.min(...s.angleWindow)
      const mx = Math.max(...s.angleWindow)
      if (mn < s.minAngle - 3) s.minAngle = Math.max(0, mn + 1)
      if (mx > s.maxAngle + 3) s.maxAngle = mx + 2
    }

    s.peakAngle = Math.max(s.peakAngle, angle)

    const span = s.maxAngle - s.minAngle
    const progress = span > 0 ? Math.max(0, Math.min(1, (angle - s.minAngle) / span)) : 0

    if (!s.initialized) { s.smoothed = progress; s.initialized = true }
    else s.smoothed += EMA_ALPHA * (progress - s.smoothed)

    const smth = s.smoothed

    // state machine
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
        const pts = scoreRep(s.repPeak)
        s.score += pts
        if (s.repPeak >= 0.68) s.goodReps++
        s.repPeak = 0
        s.repState = 'idle'
      }
    }

    const sessionTime = (Date.now() - s.sessionStart) / 1000

    setData({
      connected: true,
      sensorConnected: true,
      raw_angle: Math.round(angle * 10) / 10,
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
  }, [host])

  // Polling loop
  useEffect(() => {
    if (!host) return
    setData(prev => ({ ...prev, connected: true }))
    sp.current.sessionStart = Date.now()

    let active = true
    let timeout

    async function loop() {
      if (!active) return
      const t0 = performance.now()
      await poll()
      const elapsed = performance.now() - t0
      timeout = setTimeout(loop, Math.max(0, POLL_MS - elapsed))
    }

    loop()
    return () => { active = false; clearTimeout(timeout) }
  }, [host, poll])

  const reset = useCallback(() => {
    sp.current = {
      smoothed: 0, initialized: false,
      minAngle: DEFAULT_MIN, maxAngle: DEFAULT_MAX,
      repState: 'idle', repCount: 0, goodReps: 0,
      score: 0, repPeak: 0, lastRepQuality: 0, peakAngle: 0,
      sessionStart: Date.now(), angleWindow: [],
    }
    prevRepCount.current = 0
    setData(prev => ({ ...prev, rep_count: 0, good_reps: 0, score: 0, peak_angle: 0, rep_state: 'idle', session_time: 0 }))
  }, [])

  return { data, repFlash, host, setHost, reset }
}
