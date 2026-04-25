import { useState } from 'react'
import './AICoach.css'

const THINKING_LINES = [
  'Reading your situation…',
  'Identifying affected muscle groups…',
  'Checking exercise compatibility…',
  'Analysing movement patterns…',
  'Selecting optimal exercises…',
  'Building your personalised plan…',
]

const EXERCISE_GAMES = {
  bicep: [
    { id: 'runner',     icon: '〰️', title: 'Corridor',    desc: 'Stay between the lines. Curl up to go higher, relax to go lower.' },
    { id: 'basketball', icon: '🏀', title: 'Basketball',  desc: 'Aim the hoop with your curl. Lower your arm to shoot.' },
    { id: 'tracker',    icon: '📊', title: 'Tracker',     desc: 'Classic rep counter. Score reps, track your form.' },
  ],
  tricep: [
    { id: 'pong',    icon: '🏓', title: 'Pong',    desc: 'Control your paddle with your arm. First to 7 beats the CPU!' },
    { id: 'archery', icon: '🏹', title: 'Archery', desc: 'Extend to aim at the target. Hold steady to auto-fire!' },
    { id: 'tracker', icon: '📊', title: 'Tracker', desc: 'Classic rep counter. Score reps, track your form.' },
  ],
  lateral: [
    { id: 'lateral-raise',  icon: '🎯', title: 'Tracker',        desc: 'Lift to band, hold, lower. Classic raise practice.' },
    { id: 'meteor-shield',  icon: '☄️', title: 'Meteor Shield',  desc: 'Match the meteor height. Block incoming hits.' },
    { id: 'ring-pop',       icon: '⭕', title: 'Ring Pop',       desc: 'Line up with floating rings. Pop them as they pass.' },
    { id: 'wing-balance',   icon: '🕊️', title: 'Wing Balance',  desc: 'Hold inside a drifting band. Steady wins.' },
  ],
}

const EXERCISE_LABELS = {
  bicep:   { name: 'Bicep Curl',        icon: '💪' },
  tricep:  { name: 'Tricep Extension',  icon: '🦾' },
  lateral: { name: 'Lateral Raises',    icon: '🪽' },
}

export default function AICoach({ onSelect, onBack }) {
  const [step, setStep]             = useState('input')   // 'input' | 'thinking' | 'result'
  const [prompt, setPrompt]         = useState('')
  const [apiKey, setApiKey]         = useState(() => localStorage.getItem('rehab_api_key') || '')
  const [thinkingLines, setThinkingLines] = useState([])
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState(null)
  const [visibleCards, setVisibleCards]   = useState(0)

  async function handleSubmit() {
    if (!prompt.trim() || !apiKey.trim()) return
    localStorage.setItem('rehab_api_key', apiKey)
    setStep('thinking')
    setThinkingLines([])
    setError(null)

    // Thinking animation — lines appear one by one
    THINKING_LINES.forEach((line, i) => {
      setTimeout(() => setThinkingLines(prev => [...prev, line]), i * 550)
    })

    const minWait = THINKING_LINES.length * 550 + 500

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          system: `You are a rehab exercise advisor for RehabBuddy, a physiotherapy game app.
Based on the user's description of their injury or exercise goal, choose exactly one exercise type.

Available exercises:
- "bicep"   → bicep curls (elbow flexion, forearm/bicep injuries, upper arm curling)
- "tricep"  → tricep extensions (elbow extension, back-of-arm injuries, pushing movements)
- "lateral" → lateral raises (shoulder injuries, deltoid strengthening, rotator cuff rehab, side raises)

Return ONLY valid JSON, no extra text:
{"exercise": "bicep"|"tricep"|"lateral", "reason": "one concise sentence explaining why"}`,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || `HTTP ${res.status}`)
      }

      const json = await res.json()
      const text = json.content?.[0]?.text ?? ''
      const parsed = JSON.parse(text)
      if (!['bicep', 'tricep', 'lateral'].includes(parsed.exercise)) throw new Error('Unexpected response')

      setTimeout(() => {
        setResult(parsed)
        setStep('result')
        setVisibleCards(0)
        const games = EXERCISE_GAMES[parsed.exercise]
        games.forEach((_, i) => setTimeout(() => setVisibleCards(i + 1), i * 220 + 200))
      }, minWait)

    } catch (e) {
      setTimeout(() => {
        setError(e.message)
        setStep('input')
      }, minWait)
    }
  }

  /* ── Thinking screen ─────────────────────────────────────────────────── */
  if (step === 'thinking') {
    return (
      <div className="ai-root">
        <div className="ai-thinking-wrap">
          <div className="ai-thinking-icon">✨</div>
          <h2 className="ai-thinking-title">Analysing your situation</h2>
          <div className="ai-log">
            {thinkingLines.map((line, i) => (
              <div key={i} className="ai-log-line">
                <span className="ai-log-arrow">▸</span>{line}
              </div>
            ))}
            <span className="ai-cursor">▌</span>
          </div>
        </div>
      </div>
    )
  }

  /* ── Result screen ───────────────────────────────────────────────────── */
  if (step === 'result' && result) {
    const games = EXERCISE_GAMES[result.exercise]
    const label = EXERCISE_LABELS[result.exercise]
    return (
      <div className="ai-root">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="ai-result-header">
          <span className="ai-result-badge">AI Recommendation</span>
          <div className="ai-result-icon">{label.icon}</div>
          <h1 className="ai-result-title">{label.name}</h1>
          <p className="ai-result-reason">{result.reason}</p>
        </div>
        <p className="ai-result-sub">Your exercises — tap one to begin calibration</p>
        <div className="ai-cards">
          {games.map((g, i) => (
            <button
              key={g.id}
              className={`ai-card ${i < visibleCards ? 'ai-card--visible' : ''}`}
              onClick={() => onSelect(result.exercise, g.id)}
            >
              <div className="ai-card-icon">{g.icon}</div>
              <div className="ai-card-title">{g.title}</div>
              <div className="ai-card-desc">{g.desc}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  /* ── Input screen ────────────────────────────────────────────────────── */
  return (
    <div className="ai-root">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div className="ai-input-card">
        <div className="ai-input-icon">✨</div>
        <h1 className="ai-input-title">AI Coach</h1>
        <p className="ai-input-sub">
          Describe your injury or goal and I'll pick the right exercises and games for you.
        </p>

        <textarea
          className="ai-textarea"
          placeholder={'e.g. "I hurt my right shoulder lifting weights"\ne.g. "I want to strengthen my bicep after surgery"'}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          onKeyDown={e => e.key === 'Enter' && e.metaKey && handleSubmit()}
        />

        {error && <div className="ai-error">⚠ {error}</div>}

        <input
          className="ai-key-input"
          type="password"
          placeholder="Anthropic API key  (sk-ant-…)"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        <p className="ai-key-note">Saved locally — never sent anywhere except Anthropic.</p>

        <button
          className="ai-submit"
          onClick={handleSubmit}
          disabled={!prompt.trim() || !apiKey.trim()}
        >
          Build My Plan →
        </button>
      </div>
    </div>
  )
}
