import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const EASE = [0.32, 0.72, 0, 1]

const STEPS = [
  { t: 'Open phyphox',          d: 'Launch the phyphox app on your iPhone.' },
  { t: 'Pick "Acceleration"',   d: 'Select the experiment that includes gravity.' },
  { t: 'Enable Remote Access',  d: 'Tap menu → Remote Access. Note the IP shown.' },
  { t: 'Strap it to your arm',  d: 'Long axis along your forearm, screen facing out.' },
]

export default function Setup({ onStart, probeConnection, sensorConnected }) {
  const [host, setHost]     = useState('172.20.10.1')
  const [step, setStep]     = useState('config')

  const [probing, setProbing]   = useState(false)
  const [probeOk, setProbeOk]   = useState(false)
  const [probeMsg, setProbeMsg] = useState(null)
  const [sample, setSample]     = useState(null)

  async function handleTest() {
    if (probing) return
    setProbing(true)
    setProbeOk(false)
    setProbeMsg(null)
    try {
      const reading = await probeConnection(host)
      setSample(reading)
      setProbeOk(true)
      setProbeMsg('Live signal received.')
    } catch (e) {
      setProbeOk(false)
      setProbeMsg(e.message)
    } finally {
      setProbing(false)
    }
  }

  function handleContinue() {
    setStep('calibrate')
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="w-full max-w-2xl"
      >
        <header className="mb-16 text-center">
          <span className="eyebrow mb-6 inline-flex items-center gap-2">
            <span className="live-dot" />
            Sensor-driven training
          </span>
          <h1 className="display text-[68px] sm:text-[96px] leading-[0.95] tracking-tightest">
            Rehab<span className="display-italic text-signal">Buddy</span>
          </h1>
          <p className="mt-5 text-inkSoft text-[17px] max-w-md mx-auto leading-relaxed">
            Turn your phone into a coach. Real-time form feedback,
            built around your range of motion.
          </p>
        </header>

        <AnimatePresence mode="wait">
          {step === 'config' && (
            <motion.section
              key="config"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.55, ease: EASE }}
            >
              <div className="card p-8 md:p-10">
                <span className="eyebrow mb-6 block">Setup · 4 steps</span>

                <ol className="divide-y divide-[color:var(--line)] -mx-2">
                  {STEPS.map((s, i) => (
                    <li key={i} className="flex items-start gap-5 px-2 py-4">
                      <span className="num text-[26px] text-inkMute w-9 shrink-0 mt-0.5 tabular-nums">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <div className="text-ink font-medium text-[15.5px]">{s.t}</div>
                        <div className="text-inkSoft text-[14.5px] mt-0.5">{s.d}</div>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="mt-8">
                  <label className="block">
                    <span className="eyebrow mb-2 block">Phone IP address</span>
                    <div className="flex gap-2">
                      <input
                        className="input-field flex-1"
                        type="text"
                        placeholder="192.168.1.42"
                        value={host}
                        onChange={e => { setHost(e.target.value); setProbeOk(false); setProbeMsg(null); setSample(null) }}
                        onKeyDown={e => e.key === 'Enter' && handleTest()}
                      />
                      <button
                        className="btn-ghost px-5 shrink-0"
                        onClick={handleTest}
                        disabled={probing || !host.trim()}
                      >
                        {probing ? 'Testing…' : probeOk ? 'Re-test' : 'Test'}
                      </button>
                    </div>
                  </label>

                  {/* Live status row */}
                  <div className="mt-4 px-4 py-3 rounded-xl bg-surface/60 border border-[color:var(--line)]
                                  flex items-center justify-between gap-4 text-[13.5px]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {probing && <span className="heartbeat-dot" />}
                      {!probing && probeOk && <span className="live-dot" />}
                      {!probing && !probeOk && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-inkMute" />
                      )}
                      <span className={
                        probeOk ? 'text-signal' :
                        probing ? 'text-inkSoft' :
                        probeMsg ? 'text-rose' : 'text-inkMute'
                      }>
                        {probing && 'Probing sensor…'}
                        {!probing && probeOk && (probeMsg || 'Connected')}
                        {!probing && !probeOk && (probeMsg || 'Not connected')}
                      </span>
                    </div>
                    {sample && (
                      <span className="font-mono text-inkSoft tabular-nums whitespace-nowrap">
                        accY {sample.accY.toFixed(2)} · accZ {sample.accZ.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  className="btn-primary"
                  onClick={handleContinue}
                  disabled={probing}
                >
                  Continue
                </button>
              </div>
            </motion.section>
          )}

          {step === 'calibrate' && (
            <motion.section
              key="calibrate"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.55, ease: EASE }}
            >
              <div className="card p-10 text-center">
                <span className="eyebrow mb-6 inline-flex items-center gap-2">
                  <span className={sensorConnected ? 'heartbeat-dot' : 'inline-block w-2 h-2 rounded-full bg-inkMute'} />
                  {sensorConnected ? 'Live signal' : 'Awaiting signal'}
                </span>
                <h2 className="display text-[44px] mb-4">
                  You're <span className="display-italic text-signal">set up.</span>
                </h2>
                <p className="text-inkSoft text-[16px] max-w-md mx-auto leading-relaxed">
                  The app auto-calibrates from your real range of motion in the
                  first few reps. Two slow warm-ups will lock things in.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button className="btn-text" onClick={() => setStep('config')}>
                  ← Back
                </button>
                <button className="btn-primary" onClick={() => onStart(host)}>
                  Begin training
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
