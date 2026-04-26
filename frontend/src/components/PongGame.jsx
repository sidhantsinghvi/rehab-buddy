import { useRef, useEffect, useState } from 'react'
import './PongGame.css'
import CountdownOverlay, { useStartCountdown } from './CountdownOverlay'

const W = 600
const H = 400
const PADDLE_W = 12
const PADDLE_H = 80
const BALL_R = 8
const PLAYER_X = W - 30
const AI_X = 30
const BALL_SPEED_BASE = 4.5
const AI_SPEED = 3.2
const MAX_SCORE = 7   // first to 7 wins

export default function PongGame({ data, lives: calibLives, violation, onFinish, onBack }) {
  const canvasRef = useRef(null)
  const dataRef = useRef(data)
  const [playerScore, setPlayerScore] = useState(0)
  const [aiScore, setAiScore] = useState(0)
  const [done, setDone] = useState(false)
  const [winner, setWinner] = useState(null)
  const { value: countdownValue, startedRef } = useStartCountdown()

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    function resetBall(towardPlayer = true) {
      const angle = (Math.random() * 0.6 - 0.3)  // -0.3 to 0.3 rad
      const dir = towardPlayer ? 1 : -1
      return {
        x: W / 2,
        y: H / 2,
        vx: BALL_SPEED_BASE * dir * Math.cos(angle),
        vy: BALL_SPEED_BASE * Math.sin(angle),
      }
    }

    const g = {
      playerY: H / 2 - PADDLE_H / 2,
      aiY: H / 2 - PADDLE_H / 2,
      ball: resetBall(true),
      playerScore: 0,
      aiScore: 0,
      over: false,
      winner: null,
      flashTimer: 0,
      flashSide: null,
      speed: BALL_SPEED_BASE,
    }

    let raf
    function loop() {
      if (g.over) return

      // Wait for "GO" before letting the ball move or paddles score.
      if (!startedRef.current) {
        draw()
        raf = requestAnimationFrame(loop)
        return
      }

      // Player paddle from arm
      const sp = Math.max(0, Math.min(1, dataRef.current.progress))
      g.playerY = H * sp - PADDLE_H / 2
      g.playerY = Math.max(0, Math.min(H - PADDLE_H, g.playerY))

      // AI paddle — tracks ball with limited speed
      const aiCenter = g.aiY + PADDLE_H / 2
      const diff = g.ball.y - aiCenter
      g.aiY += Math.sign(diff) * Math.min(Math.abs(diff), AI_SPEED)
      g.aiY = Math.max(0, Math.min(H - PADDLE_H, g.aiY))

      // Move ball
      g.ball.x += g.ball.vx
      g.ball.y += g.ball.vy

      // Top/bottom bounce
      if (g.ball.y - BALL_R < 0) { g.ball.y = BALL_R; g.ball.vy *= -1 }
      if (g.ball.y + BALL_R > H) { g.ball.y = H - BALL_R; g.ball.vy *= -1 }

      // Player paddle collision (right)
      if (
        g.ball.vx > 0 &&
        g.ball.x + BALL_R >= PLAYER_X - PADDLE_W / 2 &&
        g.ball.x - BALL_R <= PLAYER_X + PADDLE_W / 2 &&
        g.ball.y >= g.playerY &&
        g.ball.y <= g.playerY + PADDLE_H
      ) {
        g.ball.x = PLAYER_X - PADDLE_W / 2 - BALL_R
        const hitPos = (g.ball.y - g.playerY) / PADDLE_H - 0.5  // -0.5 to 0.5
        const speed = Math.hypot(g.ball.vx, g.ball.vy) * 1.04  // slight speed up
        const angle = hitPos * Math.PI * 0.6
        g.ball.vx = -speed * Math.cos(angle)
        g.ball.vy = speed * Math.sin(angle)
      }

      // AI paddle collision (left)
      if (
        g.ball.vx < 0 &&
        g.ball.x - BALL_R <= AI_X + PADDLE_W / 2 &&
        g.ball.x + BALL_R >= AI_X - PADDLE_W / 2 &&
        g.ball.y >= g.aiY &&
        g.ball.y <= g.aiY + PADDLE_H
      ) {
        g.ball.x = AI_X + PADDLE_W / 2 + BALL_R
        const hitPos = (g.ball.y - g.aiY) / PADDLE_H - 0.5
        const speed = Math.hypot(g.ball.vx, g.ball.vy) * 1.02
        const angle = hitPos * Math.PI * 0.6
        g.ball.vx = speed * Math.cos(angle)
        g.ball.vy = speed * Math.sin(angle)
      }

      // Ball out of bounds — score
      if (g.ball.x - BALL_R > W) {
        g.aiScore++
        setAiScore(g.aiScore)
        g.flashSide = 'ai'; g.flashTimer = 30
        g.ball = resetBall(false)
        if (g.aiScore >= MAX_SCORE) { g.over = true; g.winner = 'ai'; setWinner('ai'); setTimeout(() => setDone(true), 600) }
      }
      if (g.ball.x + BALL_R < 0) {
        g.playerScore++
        setPlayerScore(g.playerScore)
        g.flashSide = 'player'; g.flashTimer = 30
        g.ball = resetBall(true)
        if (g.playerScore >= MAX_SCORE) { g.over = true; g.winner = 'player'; setWinner('player'); setTimeout(() => setDone(true), 600) }
      }

      if (g.flashTimer > 0) g.flashTimer--

      draw()
      raf = requestAnimationFrame(loop)
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, W, H)

      // Score flash overlay
      if (g.flashTimer > 0) {
        const alpha = g.flashTimer / 30 * 0.18
        ctx.fillStyle = g.flashSide === 'player'
          ? `rgba(46,204,113,${alpha})`
          : `rgba(231,76,60,${alpha})`
        ctx.fillRect(0, 0, W, H)
      }

      // Center dashed line
      ctx.setLineDash([10, 8])
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(W / 2, 0)
      ctx.lineTo(W / 2, H)
      ctx.stroke()
      ctx.setLineDash([])

      // Scores
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.font = 'bold 64px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(g.aiScore, W / 2 - 80, 70)
      ctx.fillText(g.playerScore, W / 2 + 80, 70)

      // AI paddle (left)
      ctx.fillStyle = '#e74c3c'
      ctx.beginPath()
      ctx.roundRect(AI_X - PADDLE_W / 2, g.aiY, PADDLE_W, PADDLE_H, 4)
      ctx.fill()

      // Player paddle (right)
      ctx.fillStyle = '#2ecc71'
      ctx.beginPath()
      ctx.roundRect(PLAYER_X - PADDLE_W / 2, g.playerY, PADDLE_W, PADDLE_H, 4)
      ctx.fill()

      // Ball
      const ballGrad = ctx.createRadialGradient(g.ball.x, g.ball.y, 1, g.ball.x, g.ball.y, BALL_R)
      ballGrad.addColorStop(0, '#ffffff')
      ballGrad.addColorStop(1, '#8b92a5')
      ctx.fillStyle = ballGrad
      ctx.beginPath()
      ctx.arc(g.ball.x, g.ball.y, BALL_R, 0, Math.PI * 2)
      ctx.fill()

      // Labels
      ctx.fillStyle = '#3a4050'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('CPU', W / 2 - 80, H - 10)
      ctx.fillText('YOU', W / 2 + 80, H - 10)

      // Win/lose overlay
      if (g.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = g.winner === 'player' ? '#2ecc71' : '#e74c3c'
        ctx.font = 'bold 40px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(g.winner === 'player' ? 'You Win! 🎉' : 'CPU Wins', W / 2, H / 2 - 16)
        ctx.fillStyle = '#8b92a5'
        ctx.font = '18px monospace'
        ctx.fillText(`${g.playerScore} – ${g.aiScore}`, W / 2, H / 2 + 20)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pong-root">
      {violation && !done && (
        <div className="pong-violation">⚠️ {violation.message}</div>
      )}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas ref={canvasRef} width={W} height={H} className="pong-canvas" />
        <CountdownOverlay value={countdownValue} compact />
      </div>
      <div className="pong-bottom">
        <div className="pong-hint">
          {done
            ? `Final score: You ${playerScore} – ${aiScore} CPU`
            : 'Extend to move your paddle up — first to 7 wins'}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="p-btn" style={{ background: '#1e2330', color: '#8b92a5' }} onClick={onBack}>← Back</button>
          <button className="p-btn p-btn--primary" onClick={onFinish}>
            {done ? 'See Summary' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}
