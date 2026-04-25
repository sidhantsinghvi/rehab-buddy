import './CalibrationScreen.css'

export default function CalibrationScreen({ calibReps, calibStatus, calibAccY, limits, onDone }) {
  const pct = Math.round(((calibAccY + 13) / 26) * 100)
  const barPct = Math.max(2, Math.min(98, pct))

  return (
    <div className="calib-root">
      <div className="calib-card">
        <div className="calib-logo">🦾</div>
        <h1 className="calib-title">Set Your Limits</h1>
        <p className="calib-subtitle">
          Do <strong>2 slow, comfortable curls</strong> at your full safe range.<br />
          This sets the boundaries the game will enforce.
        </p>

        {/* Live accY bar */}
        <div className="calib-bar-wrap">
          <div className="calib-bar-track">
            <div className="calib-bar-fill" style={{ height: `${barPct}%` }} />
          </div>
          <div className="calib-bar-label">{calibAccY.toFixed(1)}</div>
        </div>

        {/* Status */}
        <div className="calib-status">
          {calibStatus === 'collecting_rest' && (
            <span className="calib-hint">Hold your arm at rest…</span>
          )}
          {calibStatus === 'ready' && calibReps === 0 && (
            <span className="calib-hint">Ready — start your first curl</span>
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
          disabled={calibStatus !== 'done'}
          onClick={onDone}
        >
          {calibStatus === 'done' ? 'Start Session →' : `${calibReps}/2 reps…`}
        </button>
      </div>
    </div>
  )
}
