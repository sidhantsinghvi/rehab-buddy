import './GameSelect.css'

export default function GameSelect({ onSelect }) {
  return (
    <div className="gs-root">
      <h1 className="gs-title">Choose Your Mode</h1>
      <p className="gs-sub">Your limits are set. Pick how you want to train.</p>
      <div className="gs-cards">
        <button className="gs-card" onClick={() => onSelect('runner')}>
          <div className="gs-icon">〰️</div>
          <div className="gs-card-title">Corridor</div>
          <div className="gs-card-desc">
            Stay between the lines.<br />
            Curl to go up, relax to go down.
          </div>
        </button>
        <button className="gs-card" onClick={() => onSelect('basketball')}>
          <div className="gs-icon">🏀</div>
          <div className="gs-card-title">Basketball</div>
          <div className="gs-card-desc">
            Aim the hoop with your curl.<br />
            Shoot when ready!
          </div>
        </button>
        <button className="gs-card" onClick={() => onSelect('tracker')}>
          <div className="gs-icon">📊</div>
          <div className="gs-card-title">Tracker</div>
          <div className="gs-card-desc">
            Classic rep counter.<br />
            Score reps, track your form.
          </div>
        </button>
      </div>
    </div>
  )
}
