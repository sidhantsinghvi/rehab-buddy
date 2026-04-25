import './SessionSummary.css'

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}m ${s}s`
}

function grade(score, reps) {
  if (reps === 0) return { letter: '—', color: '#5a7a9a' }
  const avg = score / reps
  if (avg >= 12) return { letter: 'A', color: '#00e676' }
  if (avg >= 8)  return { letter: 'B', color: '#00d4ff' }
  if (avg >= 5)  return { letter: 'C', color: '#ffd740' }
  return { letter: 'D', color: '#ff5252' }
}

export default function SessionSummary({ data, onRestart }) {
  const { rep_count, good_reps, score, session_time, peak_angle } = data
  const g = grade(score, rep_count)
  const goodPct = rep_count > 0 ? Math.round((good_reps / rep_count) * 100) : 0

  return (
    <div className="summary-root">
      <div className="summary-card">
        <div className="summary-header">
          <h1 className="summary-title">Session Complete</h1>
          <div className="grade-badge" style={{ borderColor: g.color, color: g.color }}>
            {g.letter}
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-stat">
            <div className="summary-num">{rep_count}</div>
            <div className="summary-label">Total Reps</div>
          </div>
          <div className="summary-stat">
            <div className="summary-num green">{good_reps}</div>
            <div className="summary-label">Good Reps</div>
          </div>
          <div className="summary-stat">
            <div className="summary-num accent">{score}</div>
            <div className="summary-label">Score</div>
          </div>
          <div className="summary-stat">
            <div className="summary-num muted">{goodPct}%</div>
            <div className="summary-label">Quality</div>
          </div>
          <div className="summary-stat">
            <div className="summary-num muted">{Math.round(peak_angle)}°</div>
            <div className="summary-label">Peak Angle</div>
          </div>
          <div className="summary-stat">
            <div className="summary-num muted">{formatTime(session_time)}</div>
            <div className="summary-label">Duration</div>
          </div>
        </div>

        <div className="summary-message">
          {rep_count === 0 && "No reps recorded. Try again!"}
          {rep_count > 0 && good_reps / rep_count >= 0.8 && "Great form! Keep it up. 💪"}
          {rep_count > 0 && good_reps / rep_count >= 0.5 && good_reps / rep_count < 0.8 && "Solid session — focus on full range of motion."}
          {rep_count > 0 && good_reps / rep_count < 0.5 && "Try to reach the target zone on each rep."}
        </div>

        <button className="btn-restart" onClick={onRestart}>
          New Session
        </button>
      </div>
    </div>
  )
}
