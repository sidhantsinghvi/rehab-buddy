import { useState } from 'react'
import './Setup.css'

export default function Setup({ onStart }) {
  const [host, setHost] = useState('10.30.227.143')
  const [step, setStep] = useState('config')

  function handleContinue() {
    setStep('calibrate')
  }

  return (
    <div className="setup-root">
      <div className="setup-card">
        <div className="setup-logo">💪</div>
        <h1 className="setup-title">RehabBuddy</h1>
        <p className="setup-subtitle">Bicep curl trainer · powered by phyphox</p>

        {step === 'config' && (
          <>
            <div className="setup-section">
              <h2 className="setup-section-title">1. Set up your phone</h2>
              <ol className="setup-steps">
                <li>Open <strong>phyphox</strong> on your iPhone</li>
                <li>Select the <strong>"Acceleration"</strong> experiment</li>
                <li>Tap <strong>⋮ → Remote Access</strong> → enable it</li>
                <li>Strap the phone to your forearm (screen facing out)</li>
                <li>Note the IP address shown in phyphox</li>
              </ol>
            </div>

            <div className="setup-section">
              <h2 className="setup-section-title">2. Enter phone IP</h2>
              <div className="input-row">
                <input
                  className="text-input"
                  type="text"
                  placeholder="e.g. 192.168.1.42"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleContinue()}
                />
              </div>
            </div>

            <button className="btn-start" onClick={handleContinue}>
              Continue →
            </button>
          </>
        )}

        {step === 'calibrate' && (
          <>
            <div className="setup-section">
              <h2 className="setup-section-title">Quick calibration (optional)</h2>
              <p className="calibrate-note">
                The app auto-calibrates from your actual range of motion over the first
                few reps. You can skip this and start immediately.
              </p>
              <p className="calibrate-note" style={{ marginTop: 8 }}>
                <strong>Tip:</strong> Do 2–3 warm-up curls at full range before your real set
                so the auto-calibration locks in quickly.
              </p>
            </div>
            <div className="calibrate-actions">
              <button className="btn-start" onClick={() => onStart(host)}>
                Start Session
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
