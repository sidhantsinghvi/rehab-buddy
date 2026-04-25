import './CalibrationScreen.css'

const COPY = {
  bicep: {
    icon: '💪',
    title: 'Calibrate — Bicep Curls',
    instruction: <>Do <strong>2 slow, comfortable curls</strong> at your full safe range.<br />This sets the boundaries the game will enforce.</>,
    restHint: 'Hold your arm at rest…',
    repNoun: 'curl',
    axisLabel: 'accY',
    skipLabel: 'Skip (Use max test range)',
  },
  lateral: {
    icon: '🪽',
    title: 'Calibrate — Lateral Raises',
    instruction: <>Do <strong>2 slow lateral raises</strong> — lift to shoulder height, then lower.<br />This sets your safe Z-axis range.</>,
    restHint: 'Hold your arm down at your side…',
    repNoun: 'raise',
    axisLabel: 'accZ',
    skipLabel: 'Skip (Use approx range)',
  },
}

export default function CalibrationScreen({
  exercise = 'bicep',
  calibReps,
  calibStatus,
  calibAccY,
  limits,
  onDone,
  onSkip,
  onBack,
}) {
  const copy = COPY[exercise] ?? COPY.bicep
  const pct = Math.round(((calibAccY + 13) / 26) * 100)
  const barPct = Math.max(2, Math.min(98, pct))

  return (
    <div className="calib-root">
      <div className="calib-card">
        <div className="calib-logo">{copy.icon}</div>
        <h1 className="calib-title">{copy.title}</h1>
        <p className="calib-subtitle">{copy.instruction}</p>

        <div className="calib-bar-wrap">
          <div className="calib-bar-track">
            <div className="calib-bar-fill" style={{ height: `${barPct}%` }} />
          </div>
          <div className="calib-bar-label">{copy.axisLabel}: {calibAccY.toFixed(1)}</div>
        </div>

        <div className="calib-status">
          {calibStatus === 'collecting_rest' && (
            <span className="calib-hint">{copy.restHint}</span>
          )}
          {calibStatus === 'ready' && calibReps === 0 && (
            <span className="calib-hint">Ready — start your first {copy.repNoun}</span>
          )}
          {calibStatus === 'ready' && calibReps === 1 && (
            <span className="calib-hint">Rep 1 done — do one more</span>
          )}
          {calibStatus === 'done' && (
            <span className="calib-hint calib-hint--done">✓ Calibration complete!</span>
          )}
        </div>

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

        <div className="calib-actions">
          <button
            className="calib-btn"
            disabled={calibStatus !== 'done'}
            onClick={onDone}
          >
            {calibStatus === 'done' ? 'Continue →' : `${calibReps}/2 reps…`}
          </button>
          <button className="calib-skip-btn" onClick={onSkip}>
            {copy.skipLabel}
          </button>
          {onBack && (
            <button className="calib-skip-btn" onClick={onBack}>← Back</button>
          )}
        </div>
      </div>
    </div>
  )
}
