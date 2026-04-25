import { motion } from 'framer-motion'

const EASE = [0.32, 0.72, 0, 1]

export default function CalibrationScreen({
  calibReps, calibStatus, calibAccY, limits, onDone, onSkip, onBack, exercise = 'bicep',
}) {
  let pct
  if (exercise === 'lateral') {
    if (limits) {
      const range = limits.max - limits.min
      pct = range > 0 ? Math.round(((limits.max - calibAccY) / range) * 100) : 0
    } else {
      pct = Math.round((-calibAccY / 8) * 100)
    }
  } else {
    pct = Math.round(((calibAccY + 13) / 26) * 100)
  }
  const barPct = Math.max(2, Math.min(98, pct))

  const verbs =
    exercise === 'tricep'  ? 'extensions' :
    exercise === 'lateral' ? 'lateral raises' : 'curls'
  const verb =
    exercise === 'tricep'  ? 'extension' :
    exercise === 'lateral' ? 'raise' : 'curl'

  const done = calibStatus === 'done'

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-16 relative">
      <button className="back-btn absolute top-8 left-8" onClick={onBack}>← Back</button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="w-full max-w-xl"
      >
        <header className="mb-10 text-center">
          <span className="eyebrow mb-4 inline-flex items-center gap-2">
            <span className="heartbeat-dot" />
            Step 2 · Calibration
          </span>
          <h1 className="display text-[48px] sm:text-[56px] leading-[1.0] mb-4">
            Set your <span className="display-italic text-signal">limits.</span>
          </h1>
          <p className="text-inkSoft text-[16px] max-w-md mx-auto leading-relaxed">
            Two slow, comfortable {verbs} at your full safe range —
            we'll learn the boundaries from there.
          </p>
        </header>

        <div className="card p-10">
          <div className="flex items-end gap-7 mb-10">
            {/* Live signal meter */}
            <div className="relative w-2 h-56 rounded-full bg-[color:var(--surface-3)] overflow-hidden">
              <motion.div
                animate={{ height: `${barPct}%` }}
                transition={{ duration: 0.4, ease: EASE }}
                className="absolute bottom-0 left-0 right-0 bg-signal"
                style={{ boxShadow: '0 0 12px rgba(214,255,74,0.6)' }}
              />
            </div>

            <div className="flex-1 pb-1">
              <div className="num text-[48px] text-ink leading-none tabular-nums">
                {pct}<span className="text-inkMute text-[24px]">%</span>
              </div>
              {exercise !== 'lateral' && (
                <div className="font-mono text-[12.5px] text-inkMute mt-1.5">
                  {calibAccY.toFixed(1)} m/s²
                </div>
              )}
              <div className="rule my-5" />
              <div className="text-[14.5px] text-inkSoft min-h-[20px] flex items-center gap-2">
                {calibStatus === 'collecting_rest' && (
                  <>
                    <span className="live-dot" />
                    Hold your arm at rest…
                  </>
                )}
                {calibStatus === 'ready' && calibReps === 0 && `Begin your first ${verb}.`}
                {calibStatus === 'ready' && calibReps === 1 && 'One done. Do one more.'}
                {done && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-signal" />
                    <span className="text-signal">Calibration complete.</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Rep ticks */}
          <div className="flex items-center gap-3 mb-2">
            {[0, 1].map(i => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-700 ease-apple ${
                  calibReps > i ? 'bg-signal' : 'bg-[color:var(--surface-3)]'
                }`}
                style={calibReps > i ? { boxShadow: '0 0 12px rgba(214,255,74,0.5)' } : {}}
              />
            ))}
          </div>
          <div className="flex justify-between text-[12px] text-inkMute">
            <span>Rep 1</span>
            <span>Rep 2</span>
          </div>

          {limits && (
            <div className="mt-8 pt-6 border-t border-[color:var(--line)]
                            flex items-center justify-between text-[13.5px]">
              <span className="text-inkMute">Safe range</span>
              <span className="font-mono text-ink">
                {limits.min.toFixed(1)} → {limits.max.toFixed(1)} m/s²
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button className="btn-text" onClick={onSkip}>
            Skip — use full range
          </button>
          <button
            className="btn-primary"
            disabled={!done}
            onClick={onDone}
          >
            {done ? 'Continue' : `${calibReps}/2 reps`}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
