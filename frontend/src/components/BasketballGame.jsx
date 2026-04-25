import { useRef, useEffect, useState } from 'react'
import './BasketballGame.css'

const W = 600
const H = 340

// Court layout
const PLAYER_X = 80
const PLAYER_Y = 240
const HOOP_X = 490
const HOOP_Y = 130
const BALL_R = 14

export default function BasketballGame({ data, repFlash, lives, violation, onFinish, send }) {
  const canvasRef = useRef(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [lastResult, setLastResult] = useState(null)
  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const shotsRef = useRef([])  // active ball animations
  const progressRef = useRef(0)
  const animRef = useRef(null)

  useEffect(() => { progressRef.current = data.smoothed_progress }, [data])

  // Static court drawing
  function drawCourt(ctx, shots) {
    ctx.clearRect(0, 0, W, H)

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#0d1117')
    bg.addColorStop(1, '#151c2a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Floor
    ctx.fillStyle = '#1a2030'
    ctx.fillRect(0, 280, W, H - 280)
    ctx.fillStyle = '#2a3860'
    ctx.fillRect(0, 280, W, 3)

    // Court lines
    ctx.strokeStyle = '#2a3860'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(W / 2, 280, 70, Math.PI, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(W / 2, 280)
    ctx.lineTo(W / 2, 240)
    ctx.stroke()

    // Backboard
    ctx.fillStyle = '#3a4460'
    ctx.fillRect(HOOP_X + 22, HOOP_Y - 30, 12, 60)
    // Square on backboard
    ctx.strokeStyle = '#e74c3c'
    ctx.lineWidth = 2
    ctx.strokeRect(HOOP_X + 23, HOOP_Y - 15, 10, 20)

    // Hoop pole
    ctx.fillStyle = '#2a3860'
    ctx.fillRect(HOOP_X + 26, HOOP_Y + 30, 6, 250)

    // Rim
    ctx.strokeStyle = '#e67e22'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(HOOP_X - 20, HOOP_Y)
    ctx.lineTo(HOOP_X + 22, HOOP_Y)
    ctx.stroke()

    // Net
    ctx.strokeStyle = '#cccccc'
    ctx.lineWidth = 1.5
    const netTop = HOOP_Y
    const netBot = HOOP_Y + 30
    const netL = HOOP_X - 18
    const netR = HOOP_X + 20
    for (let i = 0; i <= 4; i++) {
      const tx = netL + (i / 4) * (netR - netL)
      const bx = netL + 6 + (i / 4) * (netR - netL - 12)
      ctx.beginPath()
      ctx.moveTo(tx, netTop)
      ctx.lineTo(bx, netBot)
      ctx.stroke()
    }
    for (let i = 0; i <= 2; i++) {
      const y = netTop + (i + 1) * (netBot - netTop) / 3
      const shrink = i * 4
      ctx.beginPath()
      ctx.moveTo(netL + shrink, y)
      ctx.lineTo(netR - shrink, y)
      ctx.stroke()
    }

    // Player (stick figure)
    ctx.strokeStyle = '#4c9be8'
    ctx.lineWidth = 3
    // Body
    ctx.beginPath()
    ctx.moveTo(PLAYER_X, PLAYER_Y - 30)
    ctx.lineTo(PLAYER_X, PLAYER_Y)
    ctx.stroke()
    // Legs
    ctx.beginPath()
    ctx.moveTo(PLAYER_X, PLAYER_Y)
    ctx.lineTo(PLAYER_X - 12, PLAYER_Y + 28)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(PLAYER_X, PLAYER_Y)
    ctx.lineTo(PLAYER_X + 12, PLAYER_Y + 28)
    ctx.stroke()
    // Arm (raised based on progress)
    const armAngle = -Math.PI / 4 - progressRef.current * Math.PI / 3
    ctx.beginPath()
    ctx.moveTo(PLAYER_X, PLAYER_Y - 18)
    ctx.lineTo(
      PLAYER_X + Math.cos(armAngle) * 28,
      PLAYER_Y - 18 + Math.sin(armAngle) * 28,
    )
    ctx.stroke()
    // Head
    ctx.fillStyle = '#4c9be8'
    ctx.beginPath()
    ctx.arc(PLAYER_X, PLAYER_Y - 42, 13, 0, Math.PI * 2)
    ctx.fill()

    // Balls in flight
    const now = performance.now()
    for (const shot of shots) {
      const t = Math.min(1, (now - shot.startTime) / shot.duration)
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t  // ease in-out

      const bx = shot.fromX + (shot.toX - shot.fromX) * ease
      // Arc: parabola on top of the lerp
      const arcY = -Math.sin(t * Math.PI) * shot.arcHeight
      const by = shot.fromY + (shot.toY - shot.fromY) * ease + arcY

      // Spin indicator
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(t * Math.PI * 4)
      ctx.fillStyle = '#e67e22'
      ctx.beginPath()
      ctx.arc(0, 0, BALL_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c0392b'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-BALL_R, 0)
      ctx.lineTo(BALL_R, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, BALL_R, -0.5, 0.5)
      ctx.stroke()
      ctx.restore()
    }

    // Score UI
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, W, 38)
    ctx.fillStyle = '#e8eaf0'
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`Score: ${scoreRef.current}`, 14, 26)
    ctx.textAlign = 'center'
    const s = streakRef.current
    if (s >= 2) ctx.fillText(`🔥 ${s}x streak`, W / 2, 26)
    ctx.textAlign = 'right'
    ctx.fillText(['❤️', '❤️', '❤️'].map((_, i) => i < lives ? '❤️' : '🖤').join(''), W - 12, 26)
  }

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let active = true

    function loop() {
      if (!active) return
      const now = performance.now()
      shotsRef.current = shotsRef.current.filter(s => now - s.startTime < s.duration + 200)
      drawCourt(ctx, shotsRef.current)
      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { active = false; cancelAnimationFrame(animRef.current) }
  }, [lives])

  // Fire shot on each rep
  useEffect(() => {
    if (!repFlash) return
    const q = repFlash.quality

    let result, toX, toY, arcH, pts
    if (q >= 0.75) {
      result = 'in'; toX = HOOP_X; toY = HOOP_Y - 5; arcH = 160; pts = streakRef.current >= 2 ? 3 : 2
    } else if (q >= 0.50) {
      result = 'rim'; toX = HOOP_X + 22; toY = HOOP_Y; arcH = 120; pts = 1
    } else {
      result = 'miss'; toX = HOOP_X + 50 + Math.random() * 40; toY = HOOP_Y + 40 + Math.random() * 40; arcH = 90; pts = 0
    }

    shotsRef.current.push({
      id: Date.now(),
      startTime: performance.now(),
      duration: 800,
      fromX: PLAYER_X + 20,
      fromY: PLAYER_Y - 30,
      toX, toY,
      arcHeight: arcH,
      result,
    })

    scoreRef.current += pts
    setScore(scoreRef.current)

    if (result === 'in') {
      streakRef.current++
    } else {
      streakRef.current = 0
    }
    setStreak(streakRef.current)
    setLastResult(result)
    setTimeout(() => setLastResult(null), 1000)
  }, [repFlash])

  return (
    <div className="bball-root">
      {violation && (
        <div className="bball-violation">⚠️ {violation.message}</div>
      )}

      {lastResult && (
        <div className={`bball-result bball-result--${lastResult}`}>
          {lastResult === 'in'
            ? streak >= 2 ? `🔥 ${streak}x STREAK!` : '✓ BASKET!'
            : lastResult === 'rim' ? 'Rim shot +1' : 'Miss'}
        </div>
      )}

      <canvas ref={canvasRef} width={W} height={H} className="bball-canvas" />

      <div className="bball-bottom">
        <div className="bball-hint">Complete a full curl rep to shoot! Better form = better aim.</div>
        <div className="bball-actions">
          <button className="r-btn r-btn--ghost" onClick={() => send({ action: 'reset_session' })}>Reset</button>
          <button className="r-btn r-btn--primary" onClick={onFinish}>Finish</button>
        </div>
      </div>
    </div>
  )
}
