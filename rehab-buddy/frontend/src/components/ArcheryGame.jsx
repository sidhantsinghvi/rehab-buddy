import { useRef, useEffect, useState } from 'react'
import './ArcheryGame.css'

const W = 600
const H = 400
const TARGET_X = W - 80
const ARROW_X = 80
const TARGET_H = 120      // total height of target face
const RING_COUNT = 4
const STABILITY_FRAMES = 55   // ~0.9s at 60Hz to auto-fire
const STABILITY_WINDOW = 0.08 // smoothed_progress must stay within ±this to count stable
const ARROW_SPEED = 14
const TARGET_SPEED_BASE = 0.7
const TARGET_SPEED_MAX = 1.9
const MAX_ARROWS = 10

function ringScore(frac) {
  // frac = 0 at outer edge, 1 at bullseye
  if (frac >= 0.85) return 10
  if (frac >= 0.60) return 7
  if (frac >= 0.35) return 4
  return 1
}

function ringColor(i, total) {
  const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71']
  return colors[i] ?? '#2ecc71'
}

export default function ArcheryGame({ data, lives: calibLives, violation, onFinish, onBack }) {
  const canvasRef = useRef(null)
  const dataRef = useRef(data)
  const [score, setScore] = useState(0)
  const [arrowsLeft, setArrowsLeft] = useState(MAX_ARROWS)
  const [done, setDone] = useState(false)
  const [lastHit, setLastHit] = useState(null)

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const g = {
      targetY: H / 2,
      targetDir: 1,
      targetSpeed: TARGET_SPEED_BASE,
      arrowY: null,        // current arrow in flight Y at ARROW_X
      arrowTravelX: null,  // current arrow tip X
      arrowFiredY: null,   // Y when arrow was fired
      stableFrames: 0,
      stableSample: null,
      score: 0,
      arrowsLeft: MAX_ARROWS,
      over: false,
      hitFlash: 0,         // frames to show hit score
      hitScore: 0,
      hitY: 0,
      recentProgress: [],  // ring buffer for stability detection
    }

    function getAimY() {
      const sp = Math.max(0, Math.min(1, dataRef.current.smoothed_progress))
      return H * 0.15 + sp * H * 0.70
    }

    function fireArrow(fromY) {
      g.arrowY = fromY
      g.arrowTravelX = ARROW_X + 20
      g.arrowFiredY = fromY
    }

    let raf
    function loop() {
      if (g.over) return

      // Target movement — speed ramps with arrows used
      const used = MAX_ARROWS - g.arrowsLeft
      g.targetSpeed = Math.min(TARGET_SPEED_BASE + used * 0.2, TARGET_SPEED_MAX)
      g.targetY += g.targetDir * g.targetSpeed
      const halfH = TARGET_H / 2 + 10
      if (g.targetY - halfH < 0) { g.targetY = halfH; g.targetDir = 1 }
      if (g.targetY + halfH > H) { g.targetY = H - halfH; g.targetDir = -1 }

      const aimY = getAimY()

      // Stability detection — check if arm is steady
      const sp = Math.max(0, Math.min(1, dataRef.current.smoothed_progress))
      g.recentProgress.push(sp)
      if (g.recentProgress.length > STABILITY_FRAMES) g.recentProgress.shift()

      const canFire = g.arrowTravelX === null  // not currently shooting

      if (canFire && g.recentProgress.length >= STABILITY_FRAMES) {
        const min = Math.min(...g.recentProgress)
        const max = Math.max(...g.recentProgress)
        if (max - min < STABILITY_WINDOW * 2) {
          g.stableFrames++
          if (g.stableFrames >= STABILITY_FRAMES) {
            g.stableFrames = 0
            g.recentProgress = []
            if (g.arrowsLeft > 0) {
              g.arrowsLeft--
              setArrowsLeft(g.arrowsLeft)
              fireArrow(aimY)
            }
          }
        } else {
          g.stableFrames = 0
        }
      }

      // Stableframes decays naturally when not stable
      if (g.recentProgress.length < STABILITY_FRAMES || (g.recentProgress.length >= STABILITY_FRAMES && Math.max(...g.recentProgress) - Math.min(...g.recentProgress) >= STABILITY_WINDOW * 2)) {
        g.stableFrames = Math.max(0, g.stableFrames - 2)
      }

      // Arrow flight
      if (g.arrowTravelX !== null) {
        g.arrowTravelX += ARROW_SPEED
        if (g.arrowTravelX >= TARGET_X) {
          // Score the hit
          const hitY = g.arrowFiredY
          const dist = Math.abs(hitY - g.targetY)
          const frac = Math.max(0, 1 - dist / (TARGET_H / 2))
          const pts = dist < TARGET_H / 2 ? ringScore(frac) : 0
          g.score += pts
          g.hitFlash = 60
          g.hitScore = pts
          g.hitY = hitY
          setScore(g.score)
          if (pts > 0) setLastHit({ pts, ts: Date.now() })

          g.arrowTravelX = null
          g.arrowY = null
          g.arrowFiredY = null

          if (g.arrowsLeft === 0) {
            g.over = true
            setTimeout(() => setDone(true), 800)
          }
        }
      }

      if (g.hitFlash > 0) g.hitFlash--

      draw(aimY, g.stableFrames / STABILITY_FRAMES)
      raf = requestAnimationFrame(loop)
    }

    function draw(aimY, stabilityFrac) {
      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, W, H)

      // Sky / ground gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H)
      skyGrad.addColorStop(0, '#0a1628')
      skyGrad.addColorStop(1, '#111a10')
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, W, H)

      // Ground line
      ctx.strokeStyle = '#1e3020'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, H - 30)
      ctx.lineTo(W, H - 30)
      ctx.stroke()

      // Target rings (back to front)
      for (let i = RING_COUNT - 1; i >= 0; i--) {
        const rh = (TARGET_H / 2) * ((i + 1) / RING_COUNT)
        ctx.fillStyle = ringColor(i, RING_COUNT)
        ctx.beginPath()
        ctx.ellipse(TARGET_X, g.targetY, rh * 0.35, rh, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Target stand
      ctx.strokeStyle = '#5a4a30'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(TARGET_X, g.targetY + TARGET_H / 2)
      ctx.lineTo(TARGET_X, H - 30)
      ctx.stroke()

      // Archer silhouette at left
      ctx.fillStyle = '#2a3040'
      // body
      ctx.fillRect(ARROW_X - 10, H - 130, 20, 70)
      // head
      ctx.beginPath()
      ctx.arc(ARROW_X, H - 140, 14, 0, Math.PI * 2)
      ctx.fill()
      // arm pointing toward aim
      ctx.strokeStyle = '#2a3040'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(ARROW_X + 8, H - 100)
      ctx.lineTo(ARROW_X + 40, aimY)
      ctx.stroke()

      // Arrow in flight
      if (g.arrowTravelX !== null) {
        const dx = g.arrowTravelX - ARROW_X
        const totalDx = TARGET_X - ARROW_X
        const t = dx / totalDx
        const arrowCurY = g.arrowFiredY + (g.targetY - g.arrowFiredY) * t

        ctx.strokeStyle = '#c8a060'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(g.arrowTravelX - 30, arrowCurY)
        ctx.lineTo(g.arrowTravelX, arrowCurY)
        ctx.stroke()
        // arrowhead
        ctx.fillStyle = '#a0a0a0'
        ctx.beginPath()
        ctx.moveTo(g.arrowTravelX, arrowCurY)
        ctx.lineTo(g.arrowTravelX - 8, arrowCurY - 4)
        ctx.lineTo(g.arrowTravelX - 8, arrowCurY + 4)
        ctx.closePath()
        ctx.fill()
      }

      // Aim crosshair
      if (g.arrowTravelX === null) {
        const stabColor = stabilityFrac > 0.85
          ? `rgba(46,204,113,${0.6 + stabilityFrac * 0.4})`
          : stabilityFrac > 0.4
            ? `rgba(241,196,15,${0.5 + stabilityFrac * 0.5})`
            : 'rgba(231,76,60,0.6)'

        ctx.strokeStyle = stabColor
        ctx.lineWidth = 2
        // crosshair lines
        ctx.beginPath()
        ctx.moveTo(TARGET_X - 30, aimY)
        ctx.lineTo(TARGET_X + 30, aimY)
        ctx.moveTo(TARGET_X, aimY - 30)
        ctx.lineTo(TARGET_X, aimY + 30)
        ctx.stroke()
        // circle
        const r = 18 * (1 - stabilityFrac * 0.5)
        ctx.beginPath()
        ctx.arc(TARGET_X, aimY, r, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Stability charge bar (bottom left)
      const barW = 160
      const barH = 14
      const barX = 16
      const barY = H - 55
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4)
      const chargeColor = stabilityFrac > 0.85 ? '#2ecc71' : stabilityFrac > 0.4 ? '#f1c40f' : '#e74c3c'
      ctx.fillStyle = chargeColor
      ctx.fillRect(barX, barY, barW * stabilityFrac, barH)
      ctx.fillStyle = '#8b92a5'
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(stabilityFrac >= 1 ? '🏹 FIRING!' : 'Hold steady to fire', barX, barY - 6)

      // Hit score flash
      if (g.hitFlash > 0 && g.hitScore > 0) {
        const alpha = Math.min(1, g.hitFlash / 20)
        ctx.fillStyle = `rgba(46,204,113,${alpha})`
        ctx.font = `bold ${28 + Math.round((1 - alpha) * 8)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(`+${g.hitScore}`, TARGET_X, g.hitY - 30)
      }

      // UI bar
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, W, 38)
      ctx.fillStyle = '#e8eaf0'
      ctx.font = 'bold 15px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`Score: ${g.score}`, 14, 26)
      ctx.textAlign = 'center'
      ctx.fillText('Archery', W / 2, 26)
      ctx.textAlign = 'right'
      ctx.fillText(`🏹 × ${g.arrowsLeft}`, W - 14, 26)

      if (g.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#e8eaf0'
        ctx.font = 'bold 36px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Round Over!', W / 2, H / 2 - 24)
        ctx.font = '20px monospace'
        ctx.fillStyle = '#8b92a5'
        ctx.fillText(`Final Score: ${g.score} / ${MAX_ARROWS * 10}`, W / 2, H / 2 + 16)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="archery-root">
      {violation && !done && (
        <div className="archery-violation">⚠️ {violation.message}</div>
      )}
      <canvas ref={canvasRef} width={W} height={H} className="archery-canvas" />
      <div className="archery-bottom">
        <div className="archery-hint">
          {done
            ? `Final score: ${score} / ${MAX_ARROWS * 10}`
            : 'Extend your arm to aim — hold steady for ~1s to auto-fire'}
        </div>
        <div className="archery-actions">
          <button className="a-btn a-btn--ghost" onClick={onBack}>← Back</button>
          <button className="a-btn a-btn--primary" onClick={onFinish}>
            {done ? 'See Summary' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}
