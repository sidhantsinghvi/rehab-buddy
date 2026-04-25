import './ExerciseSelect.css'

export default function ExerciseSelect({ onSelect, onBack, onAICoach }) {
  return (
    <div className="ex-root">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="ex-title">What are you training?</h1>
      <p className="ex-sub">Pick your exercise — or let AI choose for you.</p>
      <div className="ex-cards">
        <button className="ex-card" onClick={() => onSelect('bicep')}>
          <div className="ex-icon">💪</div>
          <div className="ex-card-title">Bicep Curl</div>
          <div className="ex-card-desc">
            Basketball &amp; Tracker<br />
            Curl up to full range.
          </div>
        </button>
        <button className="ex-card" onClick={() => onSelect('tricep')}>
          <div className="ex-icon">🦾</div>
          <div className="ex-card-title">Tricep Extension</div>
          <div className="ex-card-desc">
            Pong, Archery &amp; Tracker<br />
            Extend to full lockout.
          </div>
        </button>
        <button className="ex-card" onClick={() => onSelect('lateral')}>
          <div className="ex-icon">🪽</div>
          <div className="ex-card-title">Lateral Raises</div>
          <div className="ex-card-desc">
            Tracker, Meteor Shield, Ring Pop &amp; Wing Balance<br />
            Raise to shoulder height.
          </div>
        </button>
      </div>
      <button className="ex-ai-btn" onClick={onAICoach}>
        ✨ Not sure? Let AI Coach pick for you
      </button>
    </div>
  )
}
