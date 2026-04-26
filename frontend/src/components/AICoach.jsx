import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const EASE = [0.32, 0.72, 0, 1]

// Slow, deliberate cadence so the agent feels like it's reasoning, not just
// firing a single HTTP request. Each line lands roughly a second apart and the
// final pad gives the model's response a moment to "settle" on screen.
const THINKING_LINE_MS = 1100
const FINAL_HOLD_MS = 1400

const THINKING_LINES = [
  'Reading your description',
  'Mapping symptoms to affected joints',
  'Identifying involved muscle groups',
  'Cross-checking rehab indications',
  'Scoring the exercise catalogue',
  'Weighing safety vs. mobility goals',
  'Selecting the best-fit movement',
  'Drafting a rationale for your plan',
]

const EXERCISE_GAMES = {
  bicep: [
    { id: 'runner',     title: 'Corridor',    desc: 'Stay between the lines. Curl up to rise, relax to lower.' },
    { id: 'basketball', title: 'Basketball',  desc: 'Aim the hoop with your curl. Lower the arm to release.' },
    { id: 'tracker',    title: 'Tracker',     desc: 'A clean rep counter for focused practice.' },
  ],
  tricep: [
    { id: 'pong',    title: 'Pong',    desc: 'Control your paddle by extending your arm. First to seven.' },
    { id: 'archery', title: 'Archery', desc: 'Extend to aim. Hold steady to fire automatically.' },
    { id: 'tracker', title: 'Tracker', desc: 'A clean rep counter for focused practice.' },
  ],
  lateral: [
    { id: 'lateral-raise',  title: 'Tracker',       desc: 'Lift to band height, hold, lower. The classic.' },
    { id: 'meteor-shield',  title: 'Meteor Shield', desc: 'Match meteor heights to block incoming hits.' },
    { id: 'ring-pop',       title: 'Ring Pop',      desc: 'Line up with floating rings as they pass.' },
    { id: 'wing-balance',   title: 'Wing Balance',  desc: 'Hold inside a drifting band. Steady wins.' },
  ],
}

const EXERCISE_LABELS = {
  bicep:   { name: 'Bicep curl',        region: 'Elbow flexion',      accent: 'text-coral' },
  tricep:  { name: 'Tricep extension',  region: 'Elbow extension',    accent: 'text-amber' },
  lateral: { name: 'Lateral raises',    region: 'Shoulder abduction', accent: 'text-moss'  },
}

export default function AICoach({ onSelect, onBack, onManual }) {
  const [step, setStep]             = useState('input')
  const [prompt, setPrompt]         = useState('')
  const [thinkingLines, setThinkingLines] = useState([])
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState(null)
  const [visibleCards, setVisibleCards]   = useState(0)

  async function handleSubmit() {
    if (!prompt.trim()) return
    setStep('thinking')
    setThinkingLines([])
    setError(null)

    THINKING_LINES.forEach((line, i) => {
      setTimeout(() => setThinkingLines(prev => [...prev, line]), i * THINKING_LINE_MS)
    })

    const minWait = THINKING_LINES.length * THINKING_LINE_MS + FINAL_HOLD_MS

    try {
      const res = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }

      const parsed = await res.json()
      if (!['bicep', 'tricep', 'lateral'].includes(parsed.exercise)) {
        throw new Error('Unexpected response')
      }

      setTimeout(() => {
        setResult(parsed)
        setStep('result')
        setVisibleCards(0)
        const games = EXERCISE_GAMES[parsed.exercise]
        games.forEach((_, i) => setTimeout(() => setVisibleCards(i + 1), i * 220 + 220))
      }, minWait)

    } catch (e) {
      setTimeout(() => {
        setError(e.message)
        setStep('input')
      }, minWait)
    }
  }

  /* ── Thinking ──────────────────────────────────────────────────────── */
  if (step === 'thinking') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="card p-12 max-w-xl w-full"
        >
          <span className="eyebrow mb-8 inline-flex items-center gap-2">
            <span className="heartbeat-dot" />
            Working
          </span>
          <h2 className="display text-[34px] mb-10">
            Thinking through<br />your <span className="display-italic text-signal">situation.</span>
          </h2>
          <ul className="space-y-3 font-mono text-[13.5px]">
            <AnimatePresence>
              {thinkingLines.map((line, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="flex items-center gap-3 text-inkSoft"
                >
                  <span className="w-3 h-px bg-signal" />
                  {line}
                </motion.li>
              ))}
            </AnimatePresence>
            {thinkingLines.length < THINKING_LINES.length && (
              <li className="flex items-center gap-3 text-inkMute">
                <span className="w-1.5 h-1.5 rounded-full bg-inkMute animate-pulse-quiet" />
                <span className="opacity-60">…</span>
              </li>
            )}
          </ul>
        </motion.div>
      </div>
    )
  }

  /* ── Result ────────────────────────────────────────────────────────── */
  if (step === 'result' && result) {
    const games = EXERCISE_GAMES[result.exercise]
    const label = EXERCISE_LABELS[result.exercise]
    return (
      <div className="min-h-screen w-full px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <button className="back-btn mb-12" onClick={onBack}>← Back</button>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="mb-14 max-w-2xl"
          >
            <span className="eyebrow mb-4 inline-flex items-center gap-2">
              <span className="live-dot" />
              AI recommendation
            </span>
            <div className={`text-[13px] mt-2 mb-3 tracking-widest uppercase ${label.accent}`}>{label.region}</div>
            <h1 className="display text-[56px] sm:text-[68px] leading-[1.0]">{label.name}</h1>
            <p className="mt-5 text-inkSoft text-[17px] leading-relaxed">{result.reason}</p>
          </motion.div>

          <div className="rule mb-8" />
          <p className="eyebrow mb-6">Choose a mode</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[color:var(--line)] border border-[color:var(--line)] rounded-2xl overflow-hidden">
            {games.map((g, i) => (
              <motion.button
                key={g.id}
                initial={{ opacity: 0, y: 10 }}
                animate={i < visibleCards ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.7, ease: EASE }}
                onClick={() => onSelect(result.exercise, g.id)}
                className="group relative text-left bg-surface/70 backdrop-blur-md p-7 transition-all duration-700 ease-apple hover:bg-surface2/90"
              >
                <div className="absolute top-0 left-0 h-[2px] bg-signal w-0 group-hover:w-full transition-all duration-700 ease-apple" />
                <div className="flex items-center justify-between mb-10">
                  <span className="num text-inkMute tabular-nums">0{i + 1}</span>
                  <span className="text-[13px] text-inkMute opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-apple">
                    Begin →
                  </span>
                </div>
                <h3 className="display text-[24px] mb-2">{g.title}</h3>
                <p className="text-inkSoft text-[14px] leading-relaxed">{g.desc}</p>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ── Input ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="w-full max-w-xl"
      >
        <button className="back-btn mb-10" onClick={onBack}>← Back</button>

        <header className="mb-10">
          <span className="eyebrow mb-4 inline-flex items-center gap-2">
            <span className="live-dot" />
            AI coach
          </span>
          <h1 className="display text-[44px] leading-[1.05]">
            Tell me what's<br />
            <span className="display-italic text-signal">going on.</span>
          </h1>
          <p className="mt-4 text-inkSoft text-[16px] leading-relaxed">
            Describe your injury or goal in a sentence. I'll choose the right
            movement and games for the session.
          </p>
        </header>

        <div className="card p-7 md:p-8">
          <textarea
            className="input-field font-sans resize-none"
            placeholder='e.g. I tore my rotator cuff six weeks ago and I want to start mobilising again.'
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={4}
            onKeyDown={e => e.key === 'Enter' && e.metaKey && handleSubmit()}
          />

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mt-4 px-4 py-3 rounded-xl text-[13px]
                         bg-rose/10 border border-rose/30 text-rose"
            >
              {error}
            </motion.div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {onManual ? (
            <button onClick={onManual} className="btn-text">
              Pick manually <span aria-hidden>→</span>
            </button>
          ) : <span />}
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!prompt.trim()}
          >
            Build my plan
          </button>
        </div>
      </motion.div>
    </div>
  )
}
