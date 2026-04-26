import { useEffect, useRef, useState } from 'react'
import './LateralGames.css'
import CountdownOverlay, { useStartCountdown } from './CountdownOverlay'

const W = 920
const H = 460
const PLAYER_X = 110
const SHIELD_RADIUS = 38
const METEOR_RADIUS = 22
const BAND_TOP_FRAC = 0.18
const BAND_BOT_FRAC = 0.86
const BAND_TOLERANCE = 60
const SPAWN_MS_START = 1500
const SPAWN_MS_MIN = 700
const METEOR_SPEED_START = 180
const METEOR_SPEED_MAX = 360
const GAME_MS = 60_000
const STARTING_LIVES = 6

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

export default function MeteorShieldGame({ data, violation, onFinish, send, onBack }) {
  const progress = Number(data?.lateral_progress) || 0
  const axisZ = Number(data?.raw_z) || 0
  const progressRef = useRef(0)
  useEffect(() => { progressRef.current = progress }, [progress])

  const canvasRef = useRef(null)
  const startedAtRef = useRef(performance.now())
  const lastSpawnRef = useRef(0)
  const playerYRef = useRef(progressToY(0))
  const meteorsRef = useRef([])
  const blocksRef = useRef(0)
  const missesRef = useRef(0)
  const scoreRef = useRef(0)
  const flashRef = useRef(null)
  const livesRef = useRef(STARTING_LIVES)

  const [blocks, setBlocks] = useState(0)
  const [misses, setMisses] = useState(0)
  const [score, setScore] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [flash, setFlash] = useState(null)
  const [lives, setLives] = useState(STARTING_LIVES)
  const [done, setDone] = useState(false)
  const { value: countdownValue, started, startedRef } = useStartCountdown()

  // Anchor the game clock to the moment the countdown finishes so the 60s
  // session timer doesn't burn during 3-2-1.
  useEffect(() => {
    if (started) {
      startedAtRef.current = performance.now()
      lastSpawnRef.current = 0
    }
  }, [started])

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    let raf
    let running = true
    let lastNow = performance.now()

    function spawn(now) {
      const t = (now - startedAtRef.current) / GAME_MS
      const targetFrac = Math.random() * (BAND_BOT_FRAC - BAND_TOP_FRAC) + BAND_TOP_FRAC
      const targetY = H * targetFrac
      const speed = METEOR_SPEED_START + (METEOR_SPEED_MAX - METEOR_SPEED_START) * Math.min(1, t)
      meteorsRef.current.push({
        x: W + 30,
        y: targetY,
        vx: -speed,
        scored: false,
      })
    }

    function step(now) {
      if (!running) return

      // Countdown is showing — keep the canvas painted but freeze gameplay.
      // Re-anchor lastNow so the first real frame doesn't get a giant dt and
      // teleport the meteors / shield.
      if (!startedRef.current) {
        ctx.fillStyle = '#0a0c11'
        ctx.fillRect(0, 0, W, H)
        lastNow = now
        raf = requestAnimationFrame(step)
        return
      }

      const elapsedMs = now - startedAtRef.current
      // Real per-frame dt, clamped to 50ms so a tab-switch hiccup can't fling
      // meteors across the canvas.
      const dtMs = Math.min(50, now - lastNow)
      lastNow = now

      if (elapsedMs >= GAME_MS || livesRef.current <= 0) {
        running = false
        setDone(true)
        return
      }

      const spawnInterval = SPAWN_MS_START - (SPAWN_MS_START - SPAWN_MS_MIN) * Math.min(1, elapsedMs / GAME_MS)
      if (now - lastSpawnRef.current > spawnInterval) {
        spawn(now)
        lastSpawnRef.current = now
      }

      // Smooth the shield position toward the sensor target. Sensor updates
      // ~20 Hz, render is 60 fps, so without easing the shield steps every
      // 2-3 frames. Critically-damped lerp removes the staircase.
      const targetY = progressToY(progressRef.current)
      const smoothing = 1 - Math.pow(0.001, dtMs / 1000)
      playerYRef.current += (targetY - playerYRef.current) * smoothing
      const playerY = playerYRef.current

      for (const m of meteorsRef.current) {
        m.x += (m.vx * dtMs) / 1000

        if (!m.scored && m.x <= PLAYER_X) {
          const dy = Math.abs(m.y - playerY)
          if (dy <= BAND_TOLERANCE) {
            blocksRef.current += 1
            scoreRef.current += 10 + Math.max(0, Math.round(20 - dy / 3))
            flashRef.current = { text: 'BLOCKED +' + (10 + Math.max(0, Math.round(20 - dy / 3))), at: now, color: '#4ce89b' }
          } else {
            missesRef.current += 1
            livesRef.current = Math.max(0, livesRef.current - 1)
            flashRef.current = { text: 'MISS −1 LIFE', at: now, color: '#e84c4c' }
          }
          m.scored = true
        }
      }

      meteorsRef.current = meteorsRef.current.filter((m) => m.x > -60)

      // draw
      ctx.fillStyle = '#0a0c11'
      ctx.fillRect(0, 0, W, H)

      // starfield
      ctx.fillStyle = '#1a1f2b'
      for (let i = 0; i < 50; i++) {
        const sx = (i * 137 + (now * 0.02) % W) % W
        const sy = (i * 73) % H
        ctx.fillRect(sx, sy, 2, 2)
      }

      // band guides
      ctx.strokeStyle = '#1d2330'
      ctx.setLineDash([6, 8])
      ctx.beginPath()
      ctx.moveTo(0, H * BAND_TOP_FRAC); ctx.lineTo(W, H * BAND_TOP_FRAC)
      ctx.moveTo(0, H * BAND_BOT_FRAC); ctx.lineTo(W, H * BAND_BOT_FRAC)
      ctx.stroke()
      ctx.setLineDash([])

      // meteors
      for (const m of meteorsRef.current) {
        ctx.fillStyle = '#ff7a3d'
        ctx.beginPath()
        ctx.arc(m.x, m.y, METEOR_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 200, 120, 0.6)'
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(m.x + 4, m.y)
        ctx.lineTo(m.x + 70, m.y - 4)
        ctx.stroke()
        ctx.lineWidth = 1
      }

      // player shield
      const grad = ctx.createRadialGradient(PLAYER_X, playerY, 6, PLAYER_X, playerY, SHIELD_RADIUS)
      grad.addColorStop(0, '#4c9be8')
      grad.addColorStop(1, 'rgba(76, 155, 232, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(PLAYER_X, playerY, SHIELD_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#4c9be8'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(PLAYER_X, playerY, SHIELD_RADIUS, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1

      // tolerance band line
      ctx.strokeStyle = 'rgba(76, 155, 232, 0.25)'
      ctx.beginPath()
      ctx.moveTo(0, playerY - BAND_TOLERANCE); ctx.lineTo(W, playerY - BAND_TOLERANCE)
      ctx.moveTo(0, playerY + BAND_TOLERANCE); ctx.lineTo(W, playerY + BAND_TOLERANCE)
      ctx.stroke()

      // sync state ~6Hz
      if (Math.floor(elapsedMs / 160) !== Math.floor((elapsedMs - dtMs) / 160)) {
        setBlocks(blocksRef.current)
        setMisses(missesRef.current)
        setScore(scoreRef.current)
        setLives(livesRef.current)
        setElapsed(elapsedMs / 1000)
        if (flashRef.current && now - flashRef.current.at < 700) {
          setFlash(flashRef.current)
        } else {
          setFlash(null)
        }
      }

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => { running = false; cancelAnimationFrame(raf) }
  }, [])

  function handleFinish() {
    onFinish({
      ...data,
      rep_count: blocksRef.current,
      good_reps: blocksRef.current,
      score: scoreRef.current,
      session_time: elapsed,
      peak_angle: Math.round(progressRef.current * 100),
      feedback: `${blocksRef.current} blocks · ${missesRef.current} misses`,
    })
  }

  useEffect(() => {
    if (!done) return
    const t = setTimeout(handleFinish, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  return (
    <div className="lg-root">
      {violation && <div className="lg-violation">Warning: {violation.message}</div>}
      <div className="lg-head">
        <h1>☄️ Meteor Shield</h1>
        <div className="lg-time">{fmt(elapsed)}{done ? ' · DONE' : ''}</div>
      </div>

      <div className="lg-stats">
        <div className="lg-stat"><span>Blocks</span><strong>{blocks}</strong></div>
        <div className="lg-stat"><span>Misses</span><strong>{misses}</strong></div>
        <div className="lg-stat"><span>Score</span><strong>{score}</strong></div>
        <div className="lg-stat"><span>Lift</span><strong>{Math.round(progress * 100)}%</strong></div>
        <div className="lg-stat"><span>Axis Z</span><strong>{axisZ.toFixed(2)}</strong></div>
        <div className="lg-stat"><span>Lives</span><strong>{lives}/{STARTING_LIVES}</strong></div>
      </div>

      <div className="lg-canvas-wrap" style={{ position: 'relative' }}>
        <canvas ref={canvasRef} width={W} height={H} className="lg-canvas" />
        {flash && (
          <div className="lg-flash" style={{ background: `${flash.color}22`, borderColor: flash.color, color: flash.color }}>
            {flash.text}
          </div>
        )}
        <CountdownOverlay value={countdownValue} />
      </div>
      <div className="lg-hint">Raise your arm to align the shield with each incoming meteor.</div>

      <div className="lg-actions">
        <button className="lg-btn lg-btn--ghost" onClick={onBack}>← Back</button>
        <button className="lg-btn lg-btn--ghost" onClick={() => send?.({ action: 'reset_session' })}>Reset</button>
        <button className="lg-btn lg-btn--primary" onClick={handleFinish}>Finish</button>
      </div>
    </div>
  )
}
