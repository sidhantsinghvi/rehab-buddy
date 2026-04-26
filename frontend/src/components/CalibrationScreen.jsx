import { useState } from 'react'
import './CalibrationScreen.css'

const PROCESSING_MS = 1000

export default function CalibrationScreen({ calibReps, calibStatus, calibAccY, limits, onDone, onSkip, onBack, exercise = 'bicep' }) {
  const [processing, setProcessing] = useState(false)

  // Brief "processing" beat after the user accepts their calibrated range.
  // Sells that the app is locking in their personal limits before the game starts.
  function handleStart() {
    if (processing) return
    setProcessing(true)
    setTimeout(() => onDone(), PROCESSING_MS)
  }
  function handleSkip() {
    if (processing) return
    setProcessing(true)
    setTimeout(() => onSkip(), PROCESSING_MS)
  }

  let pct
  if (exercise === 'lateral') {
    if (limits) {
      // Use calibrated range: limits.max = rest, limits.min = raised
      const range = limits.max - limits.min
      pct = range > 0 ? Math.round(((limits.max - calibAccY) / range) * 100) : 0
    } else {
      // Pre-calibration estimate — assume ~8 m/s² range
      pct = Math.round((-calibAccY / 8) * 100)
    }
  } else {
    pct = Math.round(((calibAccY + 13) / 26) * 100)
  }
  const barPct = Math.max(2, Math.min(98, pct))

  return (
    <div className="calib-root">
      <button className="back-btn" style={{ position: 'absolute', top: 20, left: 24 }} onClick={onBack}>← Back</button>
      <div className="calib-card">
        <div className="calib-logo">🦾</div>
        <h1 className="calib-title">Set Your Limits</h1>
        <p className="calib-subtitle">
          Do <strong>2 slow, comfortable {exercise === 'tricep' ? 'extensions' : exercise === 'lateral' ? 'lateral raises' : 'curls'}</strong> at your full safe range.<br />
          This sets the boundaries the game will enforce.
        </p>

        {/* Live accY bar */}
        <div className="calib-bar-wrap">
          <div className="calib-bar-track">
            <div className="calib-bar-fill" style={{ height: `${barPct}%` }} />
          </div>
          {exercise !== 'lateral' && (
            <div className="calib-bar-label">{calibAccY.toFixed(1)}</div>
          )}
        </div>

        {/* Status */}
        <div className="calib-status">
          {calibStatus === 'collecting_rest' && (
            <span className="calib-hint">Hold your arm at rest…</span>
          )}
          {calibStatus === 'ready' && calibReps === 0 && (
            <span className="calib-hint">Ready — start your first {exercise === 'tricep' ? 'extension' : exercise === 'lateral' ? 'raise' : 'curl'}</span>
          )}
          {calibStatus === 'ready' && calibReps === 1 && (
            <span className="calib-hint">Rep 1 done — do one more</span>
          )}
          {calibStatus === 'done' && (
            <span className="calib-hint calib-hint--done">✓ Calibration complete!</span>
          )}
        </div>

        {/* Rep dots */}
        <div className="calib-dots">
          {[0, 1].map(i => (
            <div key={i} className={`calib-dot ${calibReps > i ? 'calib-dot--done' : ''}`} />
          ))}
        </div>

        {limits && (
          <div className="calib-limits">
            <div className="calib-limit-row">
              <span>Safe range</span>
              <span className="calib-limit-val">{limits.min.toFixed(1)} → {limits.max.toFixed(1)} m/s²</span>
            </div>
          </div>
        )}

        <button
          className="calib-btn"
          disabled={calibStatus !== 'done' || processing}
          onClick={handleStart}
        >
          {processing
            ? <span className="calib-processing"><span className="calib-spinner" /> Locking in your range…</span>
            : calibStatus === 'done' ? 'Start Session →' : `${calibReps}/2 reps…`}
        </button>

        <button className="calib-skip" onClick={handleSkip} disabled={processing}>
          Skip — use full range (±13 m/s²)
        </button>
      </div>
    </div>
  )
}
