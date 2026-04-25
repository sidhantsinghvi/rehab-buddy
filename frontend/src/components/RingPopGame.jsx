import { useEffect, useRef, useState } from 'react'
import './LateralGames.css'

const W = 920
const H = 460
const POPPER_X = W - 110
const POPPER_R = 14
const RING_R = 36
const RING_THICK = 8
const TOL = 42
const SPAWN_MS_START = 1400
const SPAWN_MS_MIN = 600
const RING_SPEED_START = 160
const RING_SPEED_MAX = 320
const GAME_MS = 60_000
const BAND_TOP_FRAC = 0.18
const BAND_BOT_FRAC = 0.86

function fmt(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function progressToY(p) {
  const top = H * BAND_TOP_FRAC
  const bot = H * BAND_BOT_FRAC
  return bot - p * (bot - top)
}

export default function RingPopGame({ data, lives, violation, onFinish, send }) {
  const progress = Number(data?.lateral_progress) || 0
  const axisZ = Number(data?.raw_z) || 0
  const progressRef = useRef(0)
  useEffect(() => { progressRef.current = progress }, [progress])

  const canvasRef = useRef(null)
  const startedAtRef = useRef(performance.now())
  const lastSpawnRef = useRef(0)
  const ringsRef = useRef([])
  const popsRef = useRef(0)
  const missesRef = useRef(0)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const bestComboRef = useRef(0)
  const flashRef = useRef(null)

  const [pops, setPops] = useState(0)
  const [misses, setMisses] = useState(0)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [flash, setFlash] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    let raf
    let running = true

    function spawn(now) {
      const t = (now - startedAtRef.current) / GAME_MS
      const frac = Math.random() * (BAND_BOT_FRAC - BAND_TOP_FRAC) + BAND_TOP_FRAC
      const y = H * frac
      const speed = RING_SPEED_START + (RING_SPEED_MAX - RING_SPEED_START) * Math.min(1, t)
      const colors = ['#4ce89b', '#4c9be8', '#e8b94c', '#e84cb1']
      ringsRef.current.push({
        x: -40,
        y,
        vx: speed,
        scored: false,
        color: colors[Math.floor(Math.random() * colors.length)],
        wobble: Math.random() * Math.PI * 2,
      })
    }

    function step(now) {
      if (!running) return
      const elapsedMs = now - startedAtRef.current
      const dtMs = 1000 / 60

      if (elapsedMs >= GAME_MS) {
        running = false
        setDone(true)
        return
      }

      const spawnInterval = SPAWN_MS_START - (SPAWN_MS_START - SPAWN_MS_MIN) * Math.min(1, elapsedMs / GAME_MS)
      if (now - lastSpawnRef.current > spawnInterval) {
        spawn(now)
        lastSpawnRef.current = now
      }

      const popperY = progressToY(progressRef.current)

      for (const r of ringsRef.current) {
        r.x += (r.vx * dtMs) / 1000
        r.wobble += 0.06
        if (!r.scored && r.x >= POPPER_X) {
          const dy = Math.abs(r.y - popperY)
          if (dy <= TOL) {
            popsRef.current += 1
            comboRef.current += 1
            bestComboRef.current = Math.max(bestComboRef.current, comboRef.current)
            const accuracyBonus = Math.max(0, Math.round(20 - dy / 2))
            const comboBonus = Math.min(comboRef.current * 2, 30)
            const pts = 10 + accuracyBonus + comboBonus
            scoreRef.current += pts
            flashRef.current = { text: `POP +${pts}${comboRef.current > 1 ? ` x${comboRef.current}` : ''}`, at: now, color: '#4ce89b' }
            r.popped = true
          } else {
            missesRef.current += 1
            comboRef.current = 0
            flashRef.current = { text: 'MISS', at: now, color: '#e84c4c' }
          }
          r.scored = true
        }
      }

      ringsRef.current = ringsRef.current.filter((r) => r.x < W + 60 && !r.popped)

      // draw
      ctx.fillStyle = '#0a0c11'
      ctx.fillRect(0, 0, W, H)

      // soft horizontal guide where popper sits
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      for (let i = 0; i < 6; i++) {
        const y = H * (BAND_TOP_FRAC + i * (BAND_BOT_FRAC - BAND_TOP_FRAC) / 5)
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // rings
      for (const r of ringsRef.current) {
        const wob = Math.sin(r.wobble) * 6
        ctx.strokeStyle = r.color
        ctx.lineWidth = RING_THICK
        ctx.beginPath()
        ctx.arc(r.x, r.y + wob, RING_R, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = 1
      }

      // popper
      ctx.fillStyle = '#e8eaf0'
      ctx.beginPath()
      ctx.arc(POPPER_X, popperY, POPPER_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath(); ctx.moveTo(POPPER_X - 30, popperY); ctx.lineTo(POPPER_X + 30, popperY); ctx.stroke()

      if (Math.floor(elapsedMs / 160) !== Math.floor((elapsedMs - dtMs) / 160)) {
        setPops(popsRef.current)
        setMisses(missesRef.current)
        setScore(scoreRef.current)
        setCombo(comboRef.current)
        setElapsed(elapsedMs / 1000)
        if (flashRef.current && now - flashRef.current.at < 700) setFlash(flashRef.current)
        else setFlash(null)
      }

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => { running = false; cancelAnimationFrame(raf) }
  }, [])

  function handleFinish() {
    onFinish({
      ...data,
      rep_count: popsRef.current,
      good_reps: popsRef.current,
      score: scoreRef.current,
      session_time: elapsed,
      peak_angle: Math.round(progressRef.current * 100),
      feedback: `${popsRef.current} pops · best combo x${bestComboRef.current}`,
    })
  }

  return (
    <div className="lg-root">
      {violation && <div className="lg-violation">Warning: {violation.message}</div>}
      <div className="lg-head">
        <h1>⭕ Ring Pop</h1>
        <div className="lg-time">{fmt(elapsed)}{done ? ' · DONE' : ''}</div>
      </div>

      <div className="lg-stats">
        <div className="lg-stat"><span>Pops</span><strong>{pops}</strong></div>
        <div className="lg-stat"><span>Misses</span><strong>{misses}</strong></div>
        <div className="lg-stat"><span>Combo</span><strong>x{combo}</strong></div>
        <div className="lg-stat"><span>Score</span><strong>{score}</strong></div>
        <div className="lg-stat"><span>Lift</span><strong>{Math.round(progress * 100)}%</strong></div>
        <div className="lg-stat"><span>Axis Z</span><strong>{axisZ.toFixed(2)}</strong></div>
      </div>

      <div className="lg-canvas-wrap">
        <canvas ref={canvasRef} width={W} height={H} className="lg-canvas" />
        {flash && (
          <div className="lg-flash" style={{ background: `${flash.color}22`, borderColor: flash.color, color: flash.color }}>
            {flash.text}
          </div>
        )}
      </div>
      <div className="lg-hint">Raise your arm to align the popper with each ring as it crosses the right side.</div>

      <div className="lg-actions">
        <button className="lg-btn lg-btn--ghost" onClick={() => send?.({ action: 'reset_session' })}>Reset</button>
        <button className="lg-btn lg-btn--primary" onClick={handleFinish}>Finish</button>
      </div>
    </div>
  )
}
