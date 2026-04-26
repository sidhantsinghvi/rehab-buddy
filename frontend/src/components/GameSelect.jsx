import { motion } from 'framer-motion'

const EASE = [0.32, 0.72, 0, 1]

const GAMES = {
  bicep: [
    { id: 'runner',     title: 'Corridor',     tag: 'Endurance', desc: 'Stay between the lines. Curl up to rise, relax to lower.' },
    { id: 'basketball', title: 'Basketball',   tag: 'Aim',       desc: 'Aim the hoop with your curl. Lower the arm to release.' },
    { id: 'tracker',    title: 'Tracker',      tag: 'Focused',   desc: 'A clean rep counter for focused practice.' },
  ],
  lateral: [
    { id: 'lateral-raise', title: 'Tracker',       tag: 'Focused',  desc: 'Lift to band height, hold, lower. The classic.' },
    { id: 'meteor-shield', title: 'Meteor Shield', tag: 'Reaction', desc: 'Match meteor heights to block incoming hits.' },
    { id: 'ring-pop',      title: 'Ring Pop',      tag: 'Timing',   desc: 'Line up with floating rings as they pass.' },
    { id: 'wing-balance',  title: 'Wing Balance',  tag: 'Stability', desc: 'Hold inside a drifting band. Steady wins.' },
  ],
  tricep: [
    { id: 'pong',    title: 'Pong',    tag: 'Reaction', desc: 'Control your paddle with your arm. First to seven.' },
    { id: 'archery', title: 'Archery', tag: 'Aim',      desc: 'Extend to aim. Hold steady to fire.' },
    { id: 'tracker', title: 'Tracker', tag: 'Focused',  desc: 'A clean rep counter for focused practice.' },
  ],
}

const TITLE = {
  bicep:   { name: 'Bicep curl',       region: 'Elbow flexion',     accent: 'text-coral' },
  tricep:  { name: 'Tricep extension', region: 'Elbow extension',   accent: 'text-amber' },
  lateral: { name: 'Lateral raises',   region: 'Shoulder abduction',accent: 'text-moss'  },
}

export default function GameSelect({ onSelect, exercise = 'bicep', onBack }) {
  const games = GAMES[exercise] ?? GAMES.bicep
  const meta  = TITLE[exercise]   ?? TITLE.bicep

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
            Step 3 · Choose mode
          </span>
          <div className={`text-[13px] mt-2 mb-3 tracking-widest uppercase ${meta.accent}`}>{meta.region}</div>
          <h1 className="display text-[56px] sm:text-[68px] leading-[1.0]">
            {meta.name},<br />
            <span className="display-italic text-signal">your way.</span>
          </h1>
          <p className="mt-5 text-inkSoft text-[17px] leading-relaxed">
            Same movement, different intent. Pick one.
          </p>
        </motion.header>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[color:var(--line)] border border-[color:var(--line)] rounded-2xl overflow-hidden">
          {games.map((g, i) => (
            <motion.button
              key={g.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.06 * i }}
              onClick={() => onSelect(g.id)}
              className="group relative text-left bg-surface/70 backdrop-blur-md p-7
                         transition-all duration-700 ease-apple hover:bg-surface2/90"
            >
              <div className="absolute top-0 left-0 h-[2px] bg-signal
                              w-0 group-hover:w-full transition-all duration-700 ease-apple" />
              <div className="flex items-center justify-between mb-12">
                <span className="num text-inkMute text-lg tabular-nums">0{i + 1}</span>
                <span className="text-[11px] tracking-widest uppercase text-inkMute">
                  {g.tag}
                </span>
              </div>

              <h3 className="display text-[28px] mb-2.5">{g.title}</h3>
              <p className="text-inkSoft text-[14.5px] leading-relaxed mb-8">{g.desc}</p>

              <div className="text-[13.5px] text-ink flex items-center gap-1
                              opacity-0 -translate-x-1
                              group-hover:opacity-100 group-hover:translate-x-0
                              transition-all duration-700 ease-apple">
                Play
                <span aria-hidden className="transition-transform duration-700 ease-apple group-hover:translate-x-1">→</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
