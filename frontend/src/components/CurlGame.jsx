import { useState, useEffect } from 'react'
import ArmVisualization from './ArmVisualization'
import './CurlGame.css'

function qualityLabel(q) {
  if (q >= 0.90) return { text: 'PERFECT', cls: 'perfect' }
  if (q >= 0.75) return { text: 'GOOD REP', cls: 'good' }
  if (q >= 0.60) return { text: 'FAIR', cls: 'fair' }
  return { text: 'TOO LOW', cls: 'low' }
}

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CurlGame({ data, repFlash, config = {}, send, onFinish, lives = 3, violation = null }) {
  const [flashVisible, setFlashVisible] = useState(false)
  const [flashLabel, setFlashLabel] = useState(null)
  const [editingHost, setEditingHost] = useState(false)
  const [hostInput, setHostInput] = useState('')
  const [displayHost, setDisplayHost] = useState('')

  // Sync displayHost from backend config when it arrives (first connect)
  useEffect(() => {
    if (config.phyphox_host && !displayHost) setDisplayHost(config.phyphox_host)
  }, [config.phyphox_host])

  // Flash animation on new rep
  useEffect(() => {
    if (!repFlash) return
    setFlashLabel(qualityLabel(repFlash.quality))
    setFlashVisible(true)
    const t = setTimeout(() => setFlashVisible(false), 1200)
    return () => clearTimeout(t)
  }, [repFlash])

  function submitHost() {
    const newHost = hostInput.trim()
    if (newHost) {
      console.log('[RehabBuddy] Sending set_host:', newHost)
      send({ action: 'set_host', host: newHost })
      // Optimistically update displayed IP without waiting for backend echo
      setDisplayHost(newHost)
    }
    setEditingHost(false)
  }

  const progress = data.smoothed_progress
  const repState = data.rep_state

  const progressPct = Math.round(progress * 100)
  const targetReached = progress >= 0.72

  return (
    <div className="game-root">

      {/* ── top bar ── */}
      <div className="top-bar">
        <div className="stat-chip">
          <span className="stat-label">Time</span>
          <span className="stat-value mono">{formatTime(data.session_time)}</span>
        </div>
        <div className="exercise-tag">Bicep Curl</div>
        <div className="stat-chip">
          <span className="stat-label">Lives</span>
          <span className="stat-value mono">{['❤️','❤️','❤️'].map((h,i) => i < lives ? '❤️' : '🖤').join('')}</span>
        </div>
      </div>

      {/* ── violation overlay ── */}
      {violation && (
        <div className="violation-overlay">
          <div className="violation-box">
            <div className="violation-icon">⚠️</div>
            <div className="violation-msg">{violation.message}</div>
          </div>
        </div>
      )}

      {/* ── game over overlay ── */}
      {lives === 0 && (
        <div className="violation-overlay violation-overlay--gameover">
          <div className="violation-box">
            <div className="violation-icon">💔</div>
            <div className="violation-msg">Session ended — you exceeded your safe limits</div>
            <button className="btn btn-primary" style={{marginTop: 16}} onClick={onFinish}>See Summary</button>
          </div>
        </div>
      )}

      {/* ── connection status ── */}
      {!data.connected && (
        <div className="sensor-banner sensor-banner--error">
          ✗ Backend not connected — is <code>python main.py</code> running on port 8000?
        </div>
      )}
      {data.connected && !data.sensorConnected && (
        <div className="sensor-banner sensor-banner--warn">
          {editingHost ? (
            <span className="host-edit-row">
              <input
                className="host-input"
                value={hostInput}
                onChange={e => setHostInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitHost()}
                autoFocus
                placeholder="e.g. 172.20.10.1"
              />
              <button className="host-save-btn" onClick={submitHost}>Connect</button>
              <button className="host-cancel-btn" onClick={() => setEditingHost(false)}>✕</button>
            </span>
          ) : (
            <span>
              ⚠ Waiting for phyphox at{' '}
              <code
                className="host-clickable"
                onClick={() => { setHostInput(displayHost || config.phyphox_host || ''); setEditingHost(true) }}
                title="Click to change IP"
              >
                {displayHost || config.phyphox_host || '—'}
              </code>
              {' '}— <span className="host-change-link" onClick={() => { setHostInput(displayHost || config.phyphox_host || ''); setEditingHost(true) }}>change IP</span>
            </span>
          )}
        </div>
      )}

      {/* ── center stage ── */}
      <div className="stage">

        {/* rep flash overlay */}
        {flashVisible && flashLabel && (
          <div className={`rep-flash rep-flash--${flashLabel.cls}`}>
            {flashLabel.text}
          </div>
        )}

        {/* arm */}
        <div className="arm-wrap">
          <ArmVisualization progress={progress} repState={repState} />
        </div>

        {/* progress meter beside arm */}
        <div className="meter-col">
          <div className="meter-track">
            <div
              className={`meter-fill ${targetReached ? 'meter-fill--green' : ''}`}
              style={{ height: `${progressPct}%` }}
            />
            {/* target zone marker */}
            <div className="meter-target-line" style={{ bottom: '72%' }} />
            <div className="meter-target-label">Target</div>
          </div>
          <div className="meter-pct mono">{progressPct}%</div>
        </div>
      </div>

      {/* ── feedback banner ── */}
      <div className={`feedback-banner feedback--${repState}`}>
        {data.feedback}
      </div>

      {/* ── rep counter ── */}
      <div className="rep-row">
        <div className="rep-block">
          <div className="rep-number mono">{data.rep_count}</div>
          <div className="rep-sublabel">REPS</div>
        </div>
        <div className="rep-divider" />
        <div className="rep-block">
          <div className="rep-number mono green">{data.good_reps}</div>
          <div className="rep-sublabel">GOOD</div>
        </div>
        <div className="rep-divider" />
        <div className="rep-block">
          <div className="rep-number mono muted">{Math.round(data.peak_angle)}°</div>
          <div className="rep-sublabel">PEAK</div>
        </div>
      </div>

      {/* ── state dots ── */}
      <div className="state-indicator">
        {['idle', 'going_up', 'at_top', 'going_down'].map(s => (
          <div
            key={s}
            className={`state-dot ${repState === s ? 'state-dot--active' : ''}`}
            title={s.replace('_', ' ')}
          />
        ))}
        <span className="state-label">{repState.replace(/_/g, ' ')}</span>
      </div>

      {/* ── actions ── */}
      <div className="action-row">
        <button className="btn btn-ghost" onClick={() => send({ action: 'reset_session' })}>
          Reset
        </button>
        <button className="btn btn-primary" onClick={onFinish}>
          Finish Session
        </button>
      </div>
    </div>
  )
}
