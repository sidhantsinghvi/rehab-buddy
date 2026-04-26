import { motion } from 'framer-motion'

const EASE = [0.32, 0.72, 0, 1]

const EXERCISES = [
  {
    id: 'bicep',
    title: 'Bicep curl',
    region: 'Elbow flexion',
    desc: 'Curl from a relaxed arm to a full contraction. Trains the front of the upper arm.',
    games: ['Corridor', 'Basketball', 'Tracker'],
    accent: 'text-coral',
    bar:    'bg-coral',
  },
  {
    id: 'tricep',
    title: 'Tricep extension',
    region: 'Elbow extension',
    desc: 'Extend from a bent arm to a full lockout. Builds pressing strength and control.',
    games: ['Pong', 'Archery', 'Tracker'],
    accent: 'text-amber',
    bar:    'bg-amber',
  },
  {
    id: 'lateral',
    title: 'Lateral raises',
    region: 'Shoulder abduction',
    desc: 'Raise the arm to shoulder height and back down. Activates the side deltoid.',
    games: ['Tracker', 'Meteor', 'Ring Pop', 'Wing Balance'],
    accent: 'text-moss',
    bar:    'bg-moss',
  },
]

const item = {
  initial: { opacity: 0, y: 14 },
  animate: i => ({ opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay: 0.08 * i } }),
}

export default function ExerciseSelect({ onSelect, onBack, onAICoach }) {
  return (
    <div className="min-h-screen w-full px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <button className="back-btn mb-12" onClick={onBack}>← Back</button>

        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mb-14 max-w-2xl"
        >
          <span className="eyebrow mb-4 inline-flex items-center gap-2">
            <span className="live-dot" />
            Step 1 · Choose movement
          </span>
          <h1 className="display text-[60px] sm:text-[80px] leading-[1.0]">
            What are you<br />
            <span className="display-italic text-signal">training today?</span>
          </h1>
          <p className="mt-5 text-inkSoft text-[17px] leading-relaxed">
            Pick the movement you want to work on, or have the AI coach choose
            based on your situation.
          </p>
        </motion.header>

        <div className="grid md:grid-cols-3 gap-px bg-[color:var(--line)] rounded-2xl overflow-hidden border border-[color:var(--line)]">
          {EXERCISES.map((ex, i) => (
            <motion.button
              key={ex.id}
              variants={item}
              initial="initial"
              animate="animate"
              custom={i}
              onClick={() => onSelect(ex.id)}
              className="group relative text-left bg-surface/70 backdrop-blur-md p-7 md:p-8
                         transition-all duration-700 ease-apple hover:bg-surface2/90"
            >
              {/* Top accent bar that draws in on hover */}
              <div className={`absolute top-0 left-0 h-[2px] ${ex.bar}
                               w-0 group-hover:w-full transition-all duration-700 ease-apple`} />

              <div className="flex items-center justify-between mb-12">
                <span className="num text-inkMute text-lg tabular-nums">0{i + 1}</span>
                <span className={`text-[11px] tracking-widest uppercase ${ex.accent}`}>
                  {ex.region}
                </span>
              </div>

              <h2 className="display text-[28px] mb-3">{ex.title}</h2>
              <p className="text-inkSoft text-[14.5px] leading-relaxed mb-7">{ex.desc}</p>

              <div className="flex flex-wrap gap-1.5 mb-8">
                {ex.games.map(g => (
                  <span key={g} className="text-[11px] tracking-wide text-inkSoft
                                           border border-[color:var(--line)] rounded-full
                                           px-2.5 py-0.5">
                    {g}
                  </span>
                ))}
              </div>

              <div className="text-[13.5px] text-ink flex items-center gap-1
                              opacity-0 -translate-x-1
                              group-hover:opacity-100 group-hover:translate-x-0
                              transition-all duration-700 ease-apple">
                Begin
                <span aria-hidden className="transition-transform duration-700 ease-apple group-hover:translate-x-1">→</span>
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.4 }}
          className="mt-10 flex items-center justify-between text-[14px]"
        >
          <span className="text-inkMute">Not sure what to pick?</span>
          <button onClick={onAICoach} className="btn-text">
            Ask the AI coach <span aria-hidden>→</span>
          </button>
        </motion.div>
      </div>
    </div>
  )
}
