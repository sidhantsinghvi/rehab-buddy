import { useEffect, useRef, useState } from 'react'
import './LateralGames.css'

const W = 920
const H = 460
const PLAYER_X = W / 2
const BAND_TOP_FRAC = 0.18
const BAND_BOT_FRAC = 0.86
const BAND_HALF_START = 70
const BAND_HALF_MIN = 28
const DRIFT_SPEED_START = 0.35
const DRIFT_SPEED_MAX = 0.9
const GAME_MS = 60_000

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

export default function WingBalanceGame({ data, lives, violation, onFinish, send, onBack }) {
  const progress = Number(data?.lateral_progress) || 0
  const axisZ = Number(data?.raw_z) || 0
  const progressRef = useRef(0)
  useEffect(() => { progressRef.current = progress }, [progress])

  const canvasRef = useRef(null)
  const startedAtRef = useRef(performance.now())
  const lastFrameRef = useRef(performance.now())
  const inBandMsRef = useRef(0)
  const longestStreakMsRef = useRef(0)
  const currentStreakMsRef = useRef(0)
  const scoreRef = useRef(0)
  const flashRef = useRef(null)
  const lastInBandRef = useRef(false)

  const [inBandSec, setInBandSec] = useState(0)
  const [longestSec, setLongestSec] = useState(0)
  const [score, setScore] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [flash, setFlash] = useState(null)
  const [done, setDone] = useState(false)
  const [bandCenterFrac, setBandCenterFrac] = useState(0.5)
  const [bandHalf, setBandHalf] = useState(BAND_HALF_START)

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    let raf
    let running = true

    function step(now) {
      if (!running) return
      const dtMs = now - lastFrameRef.current
      lastFrameRef.current = now
      const elapsedMs = now - startedAtRef.current

      if (elapsedMs >= GAME_MS) {
        running = false
        setDone(true)
        return
      }

      const t = Math.min(1, elapsedMs / GAME_MS)
      const driftSpeed = DRIFT_SPEED_START + (DRIFT_SPEED_MAX - DRIFT_SPEED_START) * t
      const halfWidth = BAND_HALF_START - (BAND_HALF_START - BAND_HALF_MIN) * t

      // band center oscillates with a couple of harmonics for organic motion
      const phase = (elapsedMs / 1000) * driftSpeed
      const centerFrac = 0.5 + 0.28 * Math.sin(phase) + 0.08 * Math.sin(phase * 1.7 + 0.6)
      const clampedCenter = Math.max(BAND_TOP_FRAC + 0.05, Math.min(BAND_BOT_FRAC - 0.05, centerFrac))
      const bandY = progressToY(1 - clampedCenter) // higher frac = lower target
      const playerY = progressToY(progressRef.current)
      const inBand = Math.abs(playerY - bandY) <= halfWidth

      if (inBand) {
        inBandMsRef.current += dtMs
        currentStreakMsRef.current += dtMs
        scoreRef.current += dtMs * 0.02
        longestStreakMsRef.current = Math.max(longestStreakMsRef.current, currentStreakMsRef.current)
        if (!lastInBandRef.current) {
          flashRef.current = { text: 'IN BAND', at: now, color: '#4ce89b' }
        }
      } else {
        if (lastInBandRef.current && currentStreakMsRef.current > 1500) {
          flashRef.current = { text: `STREAK ${(currentStreakMsRef.current/1000).toFixed(1)}s`, at: now, color: '#e8b94c' }
        }
        currentStreakMsRef.current = 0
      }
      lastInBandRef.current = inBand

      // draw
      ctx.fillStyle = '#0a0c11'
      ctx.fillRect(0, 0, W, H)

      // outer band
      ctx.fillStyle = inBand ? 'rgba(76, 232, 155, 0.18)' : 'rgba(76, 155, 232, 0.10)'
      ctx.fillRect(0, bandY - halfWidth, W, halfWidth * 2)
      // band edges
      ctx.strokeStyle = inBand ? '#4ce89b' : '#4c9be8'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, bandY - halfWidth); ctx.lineTo(W, bandY - halfWidth)
      ctx.moveTo(0, bandY + halfWidth); ctx.lineTo(W, bandY + halfWidth)
      ctx.stroke()
      ctx.lineWidth = 1
      // band center
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.setLineDash([4, 6])
      ctx.beginPath(); ctx.moveTo(0, bandY); ctx.lineTo(W, bandY); ctx.stroke()
      ctx.setLineDash([])

      // player wing dot
      ctx.fillStyle = inBand ? '#4ce89b' : '#e8eaf0'
      ctx.beginPath()
      ctx.arc(PLAYER_X, playerY, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.beginPath(); ctx.moveTo(PLAYER_X - 50, playerY); ctx.lineTo(PLAYER_X + 50, playerY); ctx.stroke()

      // streak meter (bottom bar)
      const streakFrac = Math.min(1, currentStreakMsRef.current / 5000)
      ctx.fillStyle = '#161a22'
      ctx.fillRect(20, H - 22, W - 40, 8)
      ctx.fillStyle = '#4ce89b'
      ctx.fillRect(20, H - 22, (W - 40) * streakFrac, 8)

      // throttled state sync
      if (Math.floor(elapsedMs / 200) !== Math.floor((elapsedMs - dtMs) / 200)) {
        setInBandSec(inBandMsRef.current / 1000)
        setLongestSec(longestStreakMsRef.current / 1000)
        setScore(Math.round(scoreRef.current))
        setElapsed(elapsedMs / 1000)
        setBandCenterFrac(clampedCenter)
        setBandHalf(halfWidth)
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
      rep_count: Math.round(inBandMsRef.current / 1000),
      good_reps: Math.round(longestStreakMsRef.current / 1000),
      score: Math.round(scoreRef.current),
      session_time: elapsed,
      peak_angle: Math.round(progressRef.current * 100),
      feedback: `${inBandSec.toFixed(1)}s in band · longest ${longestSec.toFixed(1)}s`,
    })
  }

  return (
    <div className="lg-root">
      {violation && <div className="lg-violation">Warning: {violation.message}</div>}
      <div className="lg-head">
        <h1>🕊️ Wing Balance</h1>
        <div className="lg-time">{fmt(elapsed)}{done ? ' · DONE' : ''}</div>
      </div>

      <div className="lg-stats">
        <div className="lg-stat"><span>In-Band</span><strong>{inBandSec.toFixed(1)}s</strong></div>
        <div className="lg-stat"><span>Longest</span><strong>{longestSec.toFixed(1)}s</strong></div>
        <div className="lg-stat"><span>Score</span><strong>{score}</strong></div>
        <div className="lg-stat"><span>Lift</span><strong>{Math.round(progress * 100)}%</strong></div>
        <div className="lg-stat"><span>Band ±</span><strong>{Math.round(bandHalf)}px</strong></div>
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
      <div className="lg-hint">Stay inside the drifting band. Band narrows as time goes on.</div>

      <div className="lg-actions">
        <button className="lg-btn lg-btn--ghost" onClick={onBack}>← Back</button>
        <button className="lg-btn lg-btn--ghost" onClick={() => send?.({ action: 'reset_session' })}>Reset</button>
        <button className="lg-btn lg-btn--primary" onClick={handleFinish}>Finish</button>
      </div>
    </div>
  )
}
