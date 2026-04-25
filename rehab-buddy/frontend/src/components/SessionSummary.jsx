import { motion } from 'framer-motion'

const EASE = [0.32, 0.72, 0, 1]

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}m ${s}s`
}

function grade(score, reps) {
  if (reps === 0) return { letter: '—', tone: 'text-inkMute' }
  const avg = score / reps
  if (avg >= 12) return { letter: 'A', tone: 'text-signal' }
  if (avg >= 8)  return { letter: 'B', tone: 'text-moss'   }
  if (avg >= 5)  return { letter: 'C', tone: 'text-amber'  }
  return            { letter: 'D', tone: 'text-rose'    }
}

function message(rep_count, good_reps) {
  if (rep_count === 0) return 'No reps recorded. Try again when you’re ready.'
  const ratio = good_reps / rep_count
  if (ratio >= 0.8) return 'Beautiful form. Keep showing up.'
  if (ratio >= 0.5) return 'Solid session. Focus on full range of motion next time.'
  return 'Aim for the target zone on each rep.'
}

const Stat = ({ value, label, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: EASE, delay }}
    className="py-5"
  >
    <div className="num text-[44px] text-ink leading-none">{value}</div>
    <div className="eyebrow mt-2">{label}</div>
  </motion.div>
)

export default function SessionSummary({ data, onRestart, onBack }) {
  const { rep_count, good_reps, score, session_time, peak_angle } = data
  const g = grade(score, rep_count)
  const goodPct = rep_count > 0 ? Math.round((good_reps / rep_count) * 100) : 0

  return (
    <div className="min-h-screen w-full px-6 py-16 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="w-full max-w-3xl"
      >
        <div className="mb-10 flex items-end justify-between">
          <div>
            <span className="eyebrow mb-4 inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-signal" />
              Session complete
            </span>
            <h1 className="display text-[52px] sm:text-[64px] leading-[1.0]">
              Nice <span className="display-italic text-signal">work.</span>
            </h1>
          </div>
          <div className={`num text-[96px] leading-none tabular-nums ${g.tone}`}>{g.letter}</div>
        </div>

        <div className="card divide-y divide-[color:var(--line)] px-8">
          <div className="grid grid-cols-3 gap-x-8">
            <Stat value={rep_count}              label="Total reps" delay={0.05} />
            <Stat value={good_reps}              label="Good reps"  delay={0.10} />
            <Stat value={score}                  label="Score"      delay={0.15} />
          </div>
          <div className="grid grid-cols-3 gap-x-8">
            <Stat value={`${goodPct}%`}                label="Quality"  delay={0.20} />
            <Stat value={`${Math.round(peak_angle)}°`} label="Peak"     delay={0.25} />
            <Stat value={formatTime(session_time)}     label="Duration" delay={0.30} />
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.4 }}
          className="mt-8 text-center text-inkSoft text-[15px]"
        >
          {message(rep_count, good_reps)}
        </motion.p>

        <div className="mt-10 flex items-center justify-between">
          <button className="btn-text" onClick={onBack}>← Pick another mode</button>
          <button className="btn-primary" onClick={onRestart}>New session</button>
        </div>
      </motion.div>
    </div>
  )
}
