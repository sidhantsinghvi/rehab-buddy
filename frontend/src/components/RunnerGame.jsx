import { useRef, useEffect, useState } from 'react'
import './RunnerGame.css'

const W = 600
const H = 300
const PLAYER_X = 100
const PLAYER_R = 14
const BASE_SPEED = 2.5       // constant scroll speed — never increases
const GAP_START = 150        // generous gap
const GAP_MIN = 85
const AMP = 55               // sine wave amplitude
const FREQ_BASE = 0.007      // starting curve frequency (very gentle)
const FREQ_MAX = 0.022       // max frequency after 200m
const HIT_COOLDOWN = 90      // frames of invincibility after hit (very forgiving)

export default function RunnerGame({ data, lives: calibLives, violation, onFinish, send }) {
  const canvasRef = useRef(null)
  const dataRef = useRef(data)
  const [distance, setDistance] = useState(0)
  const [gameLives, setGameLives] = useState(3)
  const [gameOver, setGameOver] = useState(false)

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // Build initial corridor — phase goes from 0 to (W+60)*FREQ_BASE
    const corridor = []
    for (let i = 0; i < W + 60; i++) {
      const cy = H / 2 + Math.sin(i * FREQ_BASE) * AMP
      corridor.push({ top: cy - GAP_START / 2, bot: cy + GAP_START / 2 })
    }

    const g = {
      phase: (W + 60) * FREQ_BASE,  // continue from where initial build left off
      frameCount: 0,
      distance: 0,
      speed: BASE_SPEED,
      hitCooldown: 0,
      lives: 3,
      over: false,
      localSmoothed: 0.5,
    }

    function playerY() {
      // Light local EMA on top of hook's smoothed_progress for minimal extra lag
      const target = Math.max(0, Math.min(1, dataRef.current.smoothed_progress))
      g.localSmoothed += 0.88 * (target - g.localSmoothed)
      // progress=0 → near bottom, progress=1 → near top
      return H * 0.82 - g.localSmoothed * H * 0.64
    }

    let raf
    function loop() {
      if (g.over) return
      g.frameCount++
      g.distance += BASE_SPEED / 60  // speed is constant — distance only

      // Curve frequency increases after 100m, gap shrinks after 100m
      const over100 = Math.max(0, g.distance - 100)
      const curveFreq = Math.min(FREQ_BASE + over100 * 0.00025, FREQ_MAX)
      const gap = Math.max(GAP_MIN, GAP_START - over100 * 0.5)

      // Shift corridor left, add new column on right (phase advances by freq * scroll)
      corridor.shift()
      g.phase += curveFreq * BASE_SPEED
      const cy = H / 2 + Math.sin(g.phase) * AMP
      corridor.push({ top: cy - gap / 2, bot: cy + gap / 2 })

      const py = playerY()

      // Collision: use column at player X
      const col = corridor[PLAYER_X] ?? corridor[0]
      const inCorridor = py - PLAYER_R >= col.top && py + PLAYER_R <= col.bot

      if (g.hitCooldown > 0) {
        g.hitCooldown--
      } else if (!inCorridor) {
        g.hitCooldown = HIT_COOLDOWN
        g.lives--
        setGameLives(g.lives)
        if (g.lives <= 0) {
          g.over = true
          setGameOver(true)
        }
      }

      draw(py, col, gap)
      setDistance(Math.floor(g.distance))
      raf = requestAnimationFrame(loop)
    }

    function draw(py, col, gap) {
      ctx.clearRect(0, 0, W, H)

      // Background (out-of-corridor zone)
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, W, H)

      // Draw corridor as filled polygon using all columns
      ctx.beginPath()
      ctx.moveTo(0, corridor[0].top)
      for (let x = 1; x < corridor.length; x++) ctx.lineTo(x, corridor[x].top)
      for (let x = corridor.length - 1; x >= 0; x--) ctx.lineTo(x, corridor[x].bot)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#1a2840')
      grad.addColorStop(0.5, '#1e3050')
      grad.addColorStop(1, '#1a2840')
      ctx.fillStyle = grad
      ctx.fill()

      // Top edge line
      ctx.beginPath()
      ctx.moveTo(0, corridor[0].top)
      for (let x = 1; x < corridor.length; x++) ctx.lineTo(x, corridor[x].top)
      ctx.strokeStyle = '#4c9be8'
      ctx.lineWidth = 3
      ctx.stroke()

      // Bottom edge line
      ctx.beginPath()
      ctx.moveTo(0, corridor[0].bot)
      for (let x = 1; x < corridor.length; x++) ctx.lineTo(x, corridor[x].bot)
      ctx.strokeStyle = '#4c9be8'
      ctx.lineWidth = 3
      ctx.stroke()

      // Center guide (faint dashed line)
      ctx.setLineDash([12, 10])
      ctx.beginPath()
      ctx.moveTo(0, (corridor[0].top + corridor[0].bot) / 2)
      for (let x = 1; x < corridor.length; x++) {
        ctx.lineTo(x, (corridor[x].top + corridor[x].bot) / 2)
      }
      ctx.strokeStyle = 'rgba(76,155,232,0.18)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])

      // Player
      const flashing = g.hitCooldown > 0 && Math.floor(g.hitCooldown / 5) % 2 === 0
      if (!flashing) {
        ctx.beginPath()
        ctx.arc(PLAYER_X, py, PLAYER_R, 0, Math.PI * 2)
        ctx.fillStyle = '#2ecc71'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // "Safe zone" indicator at player column
      const safeFrac = 1 - (py - col.top - PLAYER_R) / (gap - PLAYER_R * 2)
      const zoneColor = safeFrac > 0.7 ? '#e74c3c' : safeFrac < 0.3 ? '#e74c3c' : '#2ecc71'
      ctx.fillStyle = zoneColor
      ctx.fillRect(PLAYER_X - 2, col.top + 2, 4, gap - 4)

      // UI bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, 0, W, 36)
      ctx.fillStyle = '#e8eaf0'
      ctx.font = 'bold 15px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${Math.floor(g.distance)}m`, 14, 24)
      ctx.textAlign = 'center'
      ctx.fillText(g.distance < 100 ? 'Stay in the corridor!' : `Level ${Math.ceil((g.distance-100)/50)+2}`, W / 2, 24)
      ctx.textAlign = 'right'
      ctx.fillText(['❤️','❤️','❤️'].map((_, i) => i < g.lives ? '❤️' : '🖤').join(''), W - 12, 24)

      if (g.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#e8eaf0'
        ctx.font = 'bold 34px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Game Over', W / 2, H / 2 - 18)
        ctx.font = '18px monospace'
        ctx.fillStyle = '#8b92a5'
        ctx.fillText(`Distance: ${Math.floor(g.distance)}m`, W / 2, H / 2 + 16)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="runner-root">
      {violation && !gameOver && (
        <div className="runner-violation">⚠️ {violation.message}</div>
      )}
      <canvas ref={canvasRef} width={W} height={H} className="runner-canvas" />
      <div className="runner-bottom">
        <div className="runner-hint">
          {gameOver
            ? `Final distance: ${distance}m`
            : 'Stay between the lines — curl up to go higher, relax to go lower'}
        </div>
        <div className="runner-actions">
          {!gameOver && (
            <button className="r-btn r-btn--ghost" onClick={() => send({ action: 'reset_session' })}>Reset</button>
          )}
          <button className="r-btn r-btn--primary" onClick={onFinish}>
            {gameOver ? 'See Summary' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}
