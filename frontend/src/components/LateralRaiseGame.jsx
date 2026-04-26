import { useEffect, useRef, useState } from 'react'
import './LateralRaiseGame.css'
import CountdownOverlay, { useStartCountdown } from './CountdownOverlay'

const START_LIFT = 0.15
const BAND_LOW = 0.50
const BAND_HIGH = 0.95
const OVER_RAISE = 1.5    // effectively disabled — progress is clamped to 1.0
const RETURN_DOWN = 0.12
const HOLD_MS = 200

// Hard safety ceiling on the raw lateral axis. accZ < this is treated as
// "raised past safe range" and surfaces a too-high alert.
const AXIS_Z_TOO_HIGH = -7
const TOO_HIGH_COOLDOWN_MS = 1500
const STARTING_LIVES = 3
const GAME_MS = 60_000

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function scoreRaise(peak, holdMs, overRaised) {
  if (overRaised) return { points: 6, label: 'Too high' }
  if (peak >= BAND_LOW && peak <= BAND_HIGH && holdMs >= HOLD_MS) return { points: 12, label: 'Perfect raise' }
  if (peak >= BAND_LOW && peak <= OVER_RAISE) return { points: 9, label: 'Good raise' }
  if (peak >= 0.55) return { points: 5, label: 'A little low' }
  return { points: 2, label: 'Too shallow' }
}

export default function LateralRaiseGame({ data, violation, onFinish, send, onBack }) {
  const [reps, setReps] = useState(0)
  const [goodReps, setGoodReps] = useState(0)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState('Lift to shoulder-height band, hold briefly, then lower')
  const [flash, setFlash] = useState(null)
  const [lives, setLives] = useState(STARTING_LIVES)

  const phaseRef = useRef('idle')
  const peakRef = useRef(0)
  const holdStartRef = useRef(null)
  const holdAccumRef = useRef(0)
  const overRaiseRef = useRef(false)
  const startRef = useRef(Date.now())
  const repCountRef = useRef(0)
  const goodRepRef = useRef(0)
  const scoreRef = useRef(0)
  const peakSessionRef = useRef(0)
  const lastTooHighRef = useRef(0)
  const [tooHigh, setTooHigh] = useState(false)
  const { value: countdownValue, started, startedRef } = useStartCountdown()

  const axisZ = Number(data?.raw_z) || 0
  const p = Number(data?.lateral_progress) || 0
  const progressPct = Math.round(p * 100)
  const elapsed = started ? (Date.now() - startRef.current) / 1000 : 0

  // Reset the session clock the moment the countdown finishes so "GO" feels
  // like the real start.
  useEffect(() => {
    if (started) startRef.current = Date.now()
  }, [started])

  useEffect(() => {
    if (!startedRef.current) return
    if (axisZ <= AXIS_Z_TOO_HIGH) {
      const now = Date.now()
      if (now - lastTooHighRef.current > TOO_HIGH_COOLDOWN_MS) {
        lastTooHighRef.current = now
        setTooHigh(true)
        setLives(prev => Math.max(0, prev - 1))
        setTimeout(() => setTooHigh(false), 1400)
      }
    }
  }, [axisZ])

  useEffect(() => {
    if (!startedRef.current) return
    const phase = phaseRef.current
    const now = performance.now()

    peakRef.current = Math.max(peakRef.current, p)
    peakSessionRef.current = Math.max(peakSessionRef.current, p)
    if (p > OVER_RAISE) overRaiseRef.current = true

    if (phase === 'idle') {
      if (p > START_LIFT) {
        phaseRef.current = 'lifting'
        holdStartRef.current = null
        holdAccumRef.current = 0
        overRaiseRef.current = false
      }
      return
    }

    if (phase === 'lifting') {
      if (p >= BAND_LOW && p <= BAND_HIGH) {
        phaseRef.current = 'in_band'
        holdStartRef.current = now
      }
      if (p < RETURN_DOWN) {
        phaseRef.current = 'idle'
        peakRef.current = 0
      }
      return
    }

    if (phase === 'in_band') {
      if (p >= BAND_LOW && p <= BAND_HIGH) {
        if (holdStartRef.current != null) {
          holdAccumRef.current += now - holdStartRef.current
        }
        holdStartRef.current = now
      } else {
        holdStartRef.current = null
      }

      if (p < BAND_LOW - 0.08) {
        phaseRef.current = 'lowering'
      }
      return
    }

    if (phase === 'lowering') {
      if (p < RETURN_DOWN) {
        const repScore = scoreRaise(peakRef.current, holdAccumRef.current, overRaiseRef.current)
        repCountRef.current += 1
        scoreRef.current += repScore.points
        if (repScore.points >= 9) goodRepRef.current += 1

        setReps(repCountRef.current)
        setScore(scoreRef.current)
        setGoodReps(goodRepRef.current)
        setFeedback(repScore.label)
        setFlash(`${repScore.label} +${repScore.points}`)
        setTimeout(() => setFlash(null), 800)

        phaseRef.current = 'idle'
        peakRef.current = 0
        holdStartRef.current = null
        holdAccumRef.current = 0
        overRaiseRef.current = false
      }
    }
  }, [p])

  function handleFinish() {
    onFinish({
      ...data,
      rep_count: repCountRef.current,
      good_reps: goodRepRef.current,
      score: scoreRef.current,
      session_time: elapsed,
      peak_angle: Math.round(peakSessionRef.current * 100),
      feedback,
    })
  }

  useEffect(() => {
    if (lives <= 0) handleFinish()
    // handleFinish closes over latest refs/state — fine to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lives])

  useEffect(() => {
    if (!started) return
    const t = setTimeout(handleFinish, GAME_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  const qualityPct = reps > 0 ? Math.round((goodReps / reps) * 100) : 0

  return (
    <div className="lr-root">
      {tooHigh && <div className="lr-violation">Too high! Lower your arm — beyond safe range</div>}
      {!tooHigh && violation && <div className="lr-violation">Warning: {violation.message}</div>}

      <div className="lr-card">
        <div className="lr-head">
          <h1>Lateral Raise</h1>
          <div className="lr-time">{formatTime(elapsed)}</div>
        </div>

        {flash && <div className="lr-flash">{flash}</div>}

        <div className="lr-main">
          <div className="lr-meter-wrap" style={{ position: 'relative' }}>
            <div className="lr-meter">
              <div className="lr-band" style={{ bottom: `${BAND_LOW * 100}%`, height: `${(BAND_HIGH - BAND_LOW) * 100}%` }} />
              <div className="lr-over" style={{ bottom: `${OVER_RAISE * 100}%` }} />
              <div className="lr-fill" style={{ height: `${progressPct}%` }} />
            </div>
            <div className="lr-pct">{progressPct}%</div>
            <div className="lr-hint">Target: shoulder-height band (Z-axis only)</div>
            <CountdownOverlay value={countdownValue} compact />
          </div>

          <div className="lr-stats">
            <div className="lr-stat"><span>Reps</span><strong>{reps}</strong></div>
            <div className="lr-stat"><span>Good</span><strong>{goodReps}</strong></div>
            <div className="lr-stat"><span>Quality</span><strong>{qualityPct}%</strong></div>
            <div className="lr-stat"><span>Score</span><strong>{score}</strong></div>
            <div className="lr-stat"><span>Axis Z</span><strong>{axisZ.toFixed(2)}</strong></div>
            <div className="lr-stat"><span>Lives</span><strong>{lives}/3</strong></div>
            <div className="lr-stat"><span>State</span><strong>{phaseRef.current}</strong></div>
          </div>
        </div>

        <div className="lr-feedback">{feedback}</div>

        <div className="lr-actions">
          <button className="lr-btn lr-btn--ghost" onClick={onBack}>← Back</button>
          <button className="lr-btn lr-btn--ghost" onClick={() => send({ action: 'reset_session' })}>Reset</button>
          <button className="lr-btn lr-btn--primary" onClick={handleFinish}>Finish</button>
        </div>
      </div>
    </div>
  )
}
