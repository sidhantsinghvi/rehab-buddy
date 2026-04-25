import { useRef, useEffect, useState } from 'react'
import './BasketballGame.css'

// ── Canvas geometry ────────────────────────────────────────────────────────
const W = 720
const H = 440
const FLOOR_Y = 380

// ── Player ────────────────────────────────────────────────────────────────
const PLAYER_X = 110
const PLAYER_HEAD_Y = FLOOR_Y - 110
const SHOULDER = { x: PLAYER_X, y: PLAYER_HEAD_Y + 22 }
const ARM_LEN = 38

// ── Hoop ──────────────────────────────────────────────────────────────────
const HOOP_X = 540
const RIM_HALF = 24            // half-width of rim opening
const HOOP_MIN_Y = 150         // highest hoop position (needs ~95-100% curl)
const HOOP_MAX_Y = 245         // lowest hoop position (needs ~70% curl)
const HOOP_DRIFT = 0.06        // smoothing toward target y

// Backboard (bigger, framed, 3D)
const BB_OFFSET_X = 10         // gap between rim end and backboard inner edge
const BB_WIDTH = 22            // backboard depth (visual thickness)
const BB_HEIGHT = 150          // backboard tall
const BB_TOP_OFFSET = 78       // backboard extends this far above the rim
const BB_INNER_OFFSET_Y = 30   // red square sits this far above rim
const BB_INNER_W = 18
const BB_INNER_H = 46

// ── Ball / physics ────────────────────────────────────────────────────────
const BALL_R = 12
const GRAVITY = 1500           // px/s²

// ── Shot mapping (curl progress → launch params) ──────────────────────────
// Below SHOT_THRESH the shot is intentionally weak: ball falls short of
// the hoop. From SHOT_THRESH..1.0 the shot is "real" and reaches hoop range.
const SHOT_THRESH = 0.65
const WEAK_ANGLE = 30          // flat-ish arc for weak shots
const WEAK_SPEED_MIN = 320
const WEAK_SPEED_MAX = 720     // even strongest weak shot won't reach hoop
const STRONG_SPEED = 900       // fixed speed for "real" shots
const STRONG_ANGLE_LO = 30     // 65% curl → ball arrives at low hoop
const STRONG_ANGLE_HI = 52     // 100% curl → ball arrives at high hoop

// ── Shot detection (independent of hook's rep state machine) ──────────────
const RELEASE_DROP = 0.08      // peak − current must exceed this to release
const MIN_CHARGE = 0.18        // peak must reach this to count as a shot
const REARM_BELOW = 0.13       // must drop below this before next shot loads

// ── Scoring ───────────────────────────────────────────────────────────────
const PTS_BASKET = 2
const PTS_STREAK_BONUS = 1     // added to basket when streak ≥ 2

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

// Maps curl progress to launch (angle°, speed px/s).
// Two regimes: a "weak" zone (p < SHOT_THRESH) where shots fall short of the
// hoop on purpose, and a "real" zone (p >= SHOT_THRESH) that scales angle
// across the hoop's vertical range at a fixed speed.
function shotParams(p) {
  const c = clamp01(p)
  if (c < SHOT_THRESH) {
    const t = c / SHOT_THRESH
    return {
      angle: WEAK_ANGLE,
      speed: WEAK_SPEED_MIN + (WEAK_SPEED_MAX - WEAK_SPEED_MIN) * t,
    }
  }
  const t = (c - SHOT_THRESH) / (1 - SHOT_THRESH)
  return {
    angle: STRONG_ANGLE_LO + (STRONG_ANGLE_HI - STRONG_ANGLE_LO) * t,
    speed: STRONG_SPEED,
  }
}

// Hand position for current arm pose. Arm rotates from down-forward (rest)
// to up-forward (cocked back ready to release) as progress rises.
function handPos(progress) {
  // π/4 (45° down-forward) at p=0 → −π*0.42 (~ −76° up-forward) at p=1
  const armAngle = Math.PI / 4 - clamp01(progress) * (Math.PI * 0.71)
  return {
    x: SHOULDER.x + Math.cos(armAngle) * ARM_LEN,
    y: SHOULDER.y + Math.sin(armAngle) * ARM_LEN,
  }
}

export default function BasketballGame({ data, lives, violation, onFinish, send }) {
  const canvasRef = useRef(null)

  // React state only for things that drive HTML overlays. Everything else
  // lives in the rAF loop's ref to avoid re-renders per frame.
  const [resultFlash, setResultFlash] = useState(null)
  const [gameOver, setGameOver] = useState(false)
  const [countdown, setCountdown] = useState(3)  // 3, 2, 1, 'GO', null

  const livesRef = useRef(lives)
  useEffect(() => { livesRef.current = lives }, [lives])

  // Block shot detection until the countdown finishes
  const playingRef = useRef(false)
  useEffect(() => { playingRef.current = countdown === null }, [countdown])

  // 3 → 2 → 1 → GO! → start
  useEffect(() => {
    if (countdown === null) return
    const next = countdown === 3 ? 2 : countdown === 2 ? 1 : countdown === 1 ? 'GO' : null
    const delay = countdown === 'GO' ? 500 : 800
    const t = setTimeout(() => setCountdown(next), delay)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    if (lives === 0 && !gameOver) setGameOver(true)
  }, [lives, gameOver])

  // Hand off the latest progress reading into the loop's ref each render.
  const progressRef = useRef(0)
  useEffect(() => { progressRef.current = data.smoothed_progress }, [data.smoothed_progress])

  // ── Game loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const s = {
      peak: 0,
      armed: true,
      balls: [],                  // {x,y,prevX,prevY,vx,vy,alive,scored,rimmed,crossed,trail[]}
      hoopY: 200,
      hoopTargetY: 200,
      hoopMovePulse: 0,           // pulse when hoop relocates
      score: 0,
      streak: 0,
      shots: 0,
      makes: 0,
      swishGlow: 0,
      rimGlow: 0,
      shake: 0,                   // screen shake magnitude (px), decays
      flashOverlay: 0,            // brief white-ish flash on swish
      particles: [],              // {x,y,vx,vy,life,maxLife,color,size,rot,vrot}
      popups: [],                 // {x,y,vy,life,maxLife,text,color}
      time: 0,                    // running time for ambient effects
    }

    function moveHoop() {
      s.hoopTargetY = HOOP_MIN_Y + Math.random() * (HOOP_MAX_Y - HOOP_MIN_Y)
      s.hoopMovePulse = 1
    }
    moveHoop()

    function flash(text, kind, ms = 800) {
      setResultFlash({ text, kind })
      setTimeout(() => setResultFlash(prev => (prev && prev.text === text ? null : prev)), ms)
    }

    function spawnConfetti(x, y, count = 28) {
      const palette = ['#00e676', '#ffd740', '#ff6b3d', '#4c9be8', '#e74c3c', '#ffffff']
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
        const speed = 220 + Math.random() * 360
        s.particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 0.9 + Math.random() * 0.7,
          color: palette[(Math.random() * palette.length) | 0],
          size: 2 + Math.random() * 4,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 14,
        })
      }
    }

    function spawnSparks(x, y, count = 10) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 80 + Math.random() * 200
        s.particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          life: 1,
          maxLife: 0.4 + Math.random() * 0.3,
          color: '#ff9332',
          size: 1.5 + Math.random() * 2,
          rot: 0,
          vrot: 0,
        })
      }
    }

    function spawnPopup(text, x, y, color) {
      s.popups.push({ x, y, vy: -55, life: 1, maxLife: 1.0, text, color })
    }

    function fireShot(power) {
      const { angle, speed: v } = shotParams(power)
      const rad = (angle * Math.PI) / 180
      const hand = handPos(power)
      s.balls.push({
        x: hand.x,
        y: hand.y,
        prevX: hand.x,
        prevY: hand.y,
        vx: Math.cos(rad) * v,
        vy: -Math.sin(rad) * v,
        alive: true,
        scored: false,
        rimmed: false,
        crossed: false,
        trail: [],
        spin: 0,
      })
      s.shots++
      s.shake = Math.max(s.shake, 3)  // tiny kick on release
    }

    function handleBallHoop(b) {
      // Trigger once per ball, on first crossing of the rim plane (X = HOOP_X).
      if (b.crossed) return
      if (b.prevX < HOOP_X && b.x >= HOOP_X) {
        b.crossed = true
        const t = (HOOP_X - b.prevX) / (b.x - b.prevX)
        const yAtRim = b.prevY + (b.y - b.prevY) * t
        const dy = yAtRim - s.hoopY

        // Swish: ball passes cleanly through the opening, moving downward.
        if (b.vy > 0 && Math.abs(dy) <= RIM_HALF - BALL_R) {
          b.scored = true
          s.makes++
          s.streak++
          const pts = PTS_BASKET + (s.streak >= 2 ? PTS_STREAK_BONUS : 0)
          s.score += pts
          s.swishGlow = 1
          s.shake = Math.max(s.shake, s.streak >= 3 ? 9 : 6)
          s.flashOverlay = 0.35
          spawnConfetti(HOOP_X, s.hoopY + 6, s.streak >= 3 ? 50 : 28)
          spawnPopup(`+${pts}`, HOOP_X, s.hoopY - 14, '#00e676')
          flash(s.streak >= 3 ? `🔥 ${s.streak}x SWISH` : 'SWISH! +' + pts, 'in', 900)
          moveHoop()
          return
        }

        // Rim hit: bounce. Counts as the shot's outcome (miss for streak).
        if (Math.abs(dy) <= RIM_HALF + BALL_R) {
          b.rimmed = true
          s.rimGlow = 1
          s.shake = Math.max(s.shake, 4)
          spawnSparks(HOOP_X + (dy > 0 ? RIM_HALF : -RIM_HALF), s.hoopY)
          // Reflect mostly upward, dampen, push backward a hair to suggest deflection.
          b.vy = -Math.abs(b.vy) * 0.45
          b.vx = b.vx * 0.4
          if (s.streak > 0) s.streak = 0
          flash('RIM!', 'rim', 700)
        }
      }
    }

    function step(dt) {
      const p = progressRef.current

      // Shot detection (blocked during countdown)
      if (livesRef.current > 0 && playingRef.current) {
        if (s.armed) {
          if (p > s.peak) s.peak = p
          if (s.peak >= MIN_CHARGE && (s.peak - p) >= RELEASE_DROP) {
            fireShot(s.peak)
            s.peak = 0
            s.armed = false
          }
        } else if (p < REARM_BELOW) {
          s.armed = true
          s.peak = 0
        }
      } else {
        // Force reset while gated so the user can't pre-load a shot during countdown
        s.peak = 0
        s.armed = true
      }

      // Hoop drifts toward target so it's not jarring.
      s.hoopY += (s.hoopTargetY - s.hoopY) * HOOP_DRIFT

      // Ball physics
      for (const b of s.balls) {
        if (!b.alive) continue
        b.prevX = b.x
        b.prevY = b.y
        b.vy += GRAVITY * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.spin += dt * 16

        // Trail: short-lived motion-blur dots
        b.trail.push({ x: b.x, y: b.y, life: 1 })
        if (b.trail.length > 10) b.trail.shift()
        for (const t of b.trail) t.life -= dt * 3.5

        handleBallHoop(b)

        // Floor bounce
        if (b.y > FLOOR_Y - BALL_R) {
          b.y = FLOOR_Y - BALL_R
          b.vy = -b.vy * 0.4
          b.vx *= 0.6
          if (Math.abs(b.vy) < 80) b.alive = false
        }

        // Off-screen — finalize miss if it never scored or rimmed
        if (b.x > W + 30 || b.x < -30 || b.y > H + 30) {
          if (!b.scored && !b.rimmed) {
            if (s.streak > 0) s.streak = 0
            flash('MISS', 'miss', 600)
            moveHoop()
          }
          b.alive = false
        }
      }

      // Cap ball list
      if (s.balls.length > 8) s.balls = s.balls.filter(b => b.alive).slice(-6)

      // Particles
      for (const p of s.particles) {
        p.vy += GRAVITY * 0.6 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vrot * dt
        p.life -= dt / p.maxLife
      }
      if (s.particles.length > 0) s.particles = s.particles.filter(p => p.life > 0 && p.y < H + 20)

      // Floating popups
      for (const pp of s.popups) {
        pp.y += pp.vy * dt
        pp.vy += 50 * dt   // slight deceleration as they float up
        pp.life -= dt / pp.maxLife
      }
      if (s.popups.length > 0) s.popups = s.popups.filter(pp => pp.life > 0)

      // Decay glows / shake / time
      s.swishGlow *= 0.92
      s.rimGlow *= 0.9
      s.hoopMovePulse *= 0.94
      s.shake *= 0.85
      s.flashOverlay *= 0.86
      s.time += dt
    }

    // ── Drawing ─────────────────────────────────────────────────────────
    function drawCourt() {
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#0d1117')
      bg.addColorStop(1, '#1b2536')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Floor
      ctx.fillStyle = '#1a2030'
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)
      ctx.strokeStyle = '#2a3860'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, FLOOR_Y)
      ctx.lineTo(W, FLOOR_Y)
      ctx.stroke()

      // Three-point arc (decorative)
      ctx.beginPath()
      ctx.arc(W * 0.72, FLOOR_Y, 230, Math.PI, 2 * Math.PI)
      ctx.stroke()
    }

    function drawHoop() {
      const hy = s.hoopY
      const bbX = HOOP_X + RIM_HALF + BB_OFFSET_X        // backboard left edge
      const bbTop = hy - BB_TOP_OFFSET
      const pulse = s.hoopMovePulse

      // Pole — emerges from behind the backboard
      ctx.fillStyle = '#3a4460'
      ctx.fillRect(bbX + BB_WIDTH * 0.55, hy + 6, 9, FLOOR_Y - hy - 6)

      // Backboard glass — gradient + frame for a real-feeling 3D plate
      const bbGrad = ctx.createLinearGradient(bbX, bbTop, bbX + BB_WIDTH, bbTop + BB_HEIGHT)
      bbGrad.addColorStop(0, '#5b6788')
      bbGrad.addColorStop(0.5, '#3d4a66')
      bbGrad.addColorStop(1, '#5b6788')
      ctx.fillStyle = bbGrad
      ctx.fillRect(bbX, bbTop, BB_WIDTH, BB_HEIGHT)

      // Pulse highlight when hoop just moved (draws attention)
      if (pulse > 0.05) {
        ctx.fillStyle = `rgba(0,212,255,${pulse * 0.35})`
        ctx.fillRect(bbX, bbTop, BB_WIDTH, BB_HEIGHT)
      }

      // Backboard frame
      ctx.strokeStyle = '#7a86a8'
      ctx.lineWidth = 2
      ctx.strokeRect(bbX, bbTop, BB_WIDTH, BB_HEIGHT)

      // Inner red square (target)
      ctx.strokeStyle = pulse > 0.1
        ? `rgba(255,${100 + pulse * 100},${100 + pulse * 80},1)`
        : '#e74c3c'
      ctx.lineWidth = 2.5
      const innerX = bbX + (BB_WIDTH - BB_INNER_W) / 2
      const innerY = hy - BB_INNER_OFFSET_Y
      ctx.strokeRect(innerX, innerY, BB_INNER_W, BB_INNER_H)
      // Top bar of square stands out
      ctx.beginPath()
      ctx.moveTo(innerX, innerY)
      ctx.lineTo(innerX + BB_INNER_W, innerY)
      ctx.stroke()

      // Rim (glows on rim hit)
      ctx.strokeStyle = s.rimGlow > 0.1
        ? `rgba(255,140,60,${0.7 + s.rimGlow * 0.3})`
        : '#e67e22'
      ctx.lineWidth = 4 + s.rimGlow * 2
      ctx.beginPath()
      ctx.moveTo(HOOP_X - RIM_HALF, hy)
      ctx.lineTo(HOOP_X + RIM_HALF, hy)
      ctx.stroke()
      // Rim front lip (subtle 3D)
      ctx.strokeStyle = `rgba(195,90,30,${0.5 + s.rimGlow * 0.4})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(HOOP_X - RIM_HALF, hy + 3)
      ctx.lineTo(HOOP_X + RIM_HALF, hy + 3)
      ctx.stroke()

      // Net (shakes / brightens on swish)
      const netH = 26 + s.swishGlow * 14
      ctx.strokeStyle = `rgba(220,220,220,${0.55 + s.swishGlow * 0.4})`
      ctx.lineWidth = 1.2
      const jitter = s.swishGlow * 3
      for (let i = 0; i <= 5; i++) {
        const tx = HOOP_X - RIM_HALF + (i / 5) * (RIM_HALF * 2)
        const bx = HOOP_X - RIM_HALF + 5 + (i / 5) * (RIM_HALF * 2 - 10) + (Math.random() - 0.5) * jitter
        ctx.beginPath()
        ctx.moveTo(tx, hy)
        ctx.lineTo(bx, hy + netH)
        ctx.stroke()
      }
      for (let i = 1; i <= 3; i++) {
        const yy = hy + (i / 3) * netH
        const shrink = i * 3
        ctx.beginPath()
        ctx.moveTo(HOOP_X - RIM_HALF + shrink, yy)
        ctx.lineTo(HOOP_X + RIM_HALF - shrink, yy)
        ctx.stroke()
      }
    }

    function drawAimPreview(progress) {
      if (!s.armed || progress < 0.06 || livesRef.current === 0) return
      // Use the higher of current or peak so the preview "remembers" the cock-back.
      const aim = Math.max(progress, s.peak)
      const { angle, speed: v } = shotParams(aim)
      const rad = (angle * Math.PI) / 180
      const vx = Math.cos(rad) * v
      const vy = -Math.sin(rad) * v
      const hand = handPos(aim)

      // Red below the strong-shot threshold (will fall short), green above.
      const reaches = aim >= SHOT_THRESH
      ctx.strokeStyle = reaches
        ? 'rgba(0,230,118,0.75)'
        : 'rgba(231,76,60,0.55)'
      ctx.lineWidth = reaches ? 2.4 : 1.8
      ctx.setLineDash(reaches ? [6, 6] : [3, 5])
      ctx.beginPath()
      ctx.moveTo(hand.x, hand.y)
      for (let i = 1; i < 36; i++) {
        const t = i * 0.035
        const x = hand.x + vx * t
        const y = hand.y + vy * t + 0.5 * GRAVITY * t * t
        ctx.lineTo(x, y)
        if (y > FLOOR_Y || x > W) break
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    function drawPlayer(progress) {
      const hand = handPos(progress)

      // Head
      ctx.fillStyle = '#4c9be8'
      ctx.beginPath()
      ctx.arc(PLAYER_X, PLAYER_HEAD_Y, 14, 0, Math.PI * 2)
      ctx.fill()

      // Body + legs
      ctx.strokeStyle = '#4c9be8'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(PLAYER_X, PLAYER_HEAD_Y + 14)
      ctx.lineTo(PLAYER_X, FLOOR_Y - 30)
      ctx.moveTo(PLAYER_X, FLOOR_Y - 30)
      ctx.lineTo(PLAYER_X - 14, FLOOR_Y)
      ctx.moveTo(PLAYER_X, FLOOR_Y - 30)
      ctx.lineTo(PLAYER_X + 14, FLOOR_Y)
      ctx.stroke()

      // Off arm (planted)
      ctx.beginPath()
      ctx.moveTo(SHOULDER.x, SHOULDER.y)
      ctx.lineTo(SHOULDER.x - 18, SHOULDER.y + 22)
      ctx.stroke()

      // Shooting arm
      ctx.beginPath()
      ctx.moveTo(SHOULDER.x, SHOULDER.y)
      ctx.lineTo(hand.x, hand.y)
      ctx.stroke()

      // Held ball
      if (s.armed) {
        drawBall(hand.x + 2, hand.y - 2, 0)
      }
    }

    function drawBall(x, y, spin) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(spin)
      ctx.fillStyle = '#e67e22'
      ctx.beginPath()
      ctx.arc(0, 0, BALL_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#7a2e0a'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(-BALL_R, 0)
      ctx.lineTo(BALL_R, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, BALL_R, -0.6, 0.6)
      ctx.stroke()
      ctx.restore()
    }

    function drawFlyingBalls() {
      for (const b of s.balls) {
        if (!b.alive) continue
        // Motion trail
        for (const t of b.trail) {
          if (t.life <= 0) continue
          ctx.fillStyle = `rgba(230,126,34,${t.life * 0.35})`
          ctx.beginPath()
          ctx.arc(t.x, t.y, BALL_R * (0.4 + t.life * 0.6), 0, Math.PI * 2)
          ctx.fill()
        }
        drawBall(b.x, b.y, b.spin)
      }
    }

    function drawParticles() {
      for (const p of s.particles) {
        const a = clamp01(p.life)
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = a
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }

    function drawPopups() {
      for (const pp of s.popups) {
        const a = clamp01(pp.life)
        ctx.globalAlpha = a
        ctx.fillStyle = pp.color
        ctx.font = 'bold 22px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(pp.text, pp.x, pp.y)
      }
      ctx.globalAlpha = 1
    }

    function drawFlashOverlay() {
      if (s.flashOverlay < 0.02) return
      ctx.fillStyle = `rgba(255,255,255,${s.flashOverlay})`
      ctx.fillRect(0, 0, W, H)
    }

    function drawPowerMeter(progress) {
      const meterX = 28
      const meterY = 110
      const meterH = 220
      const aim = Math.max(progress, s.peak)
      const charged = aim > 0.85

      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(meterX, meterY, 16, meterH)

      const fill = clamp01(aim) * meterH
      const color = aim > 0.8 ? '#00e676' : aim > 0.5 ? '#ffd740' : '#4c9be8'
      ctx.fillStyle = color
      ctx.fillRect(meterX, meterY + meterH - fill, 16, fill)

      // Pulsing glow when fully charged
      if (charged && s.armed) {
        const pulse = 0.4 + 0.4 * Math.sin(s.time * 8)
        ctx.fillStyle = `rgba(0,230,118,${pulse * 0.5})`
        ctx.fillRect(meterX - 4, meterY + meterH - fill - 4, 24, fill + 8)
      }

      ctx.strokeStyle = '#3a4460'
      ctx.lineWidth = 1
      ctx.strokeRect(meterX, meterY, 16, meterH)

      // Threshold line: aim must clear this for the ball to actually reach the hoop
      const threshY = meterY + meterH - SHOT_THRESH * meterH
      ctx.strokeStyle = '#00e676'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(meterX - 4, threshY)
      ctx.lineTo(meterX + 20, threshY)
      ctx.stroke()
      ctx.fillStyle = '#00e676'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('REACH', meterX + 22, threshY + 3)

      ctx.fillStyle = charged && s.armed ? '#00e676' : '#8b92a5'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('AIM', meterX + 8, meterY - 8)
      ctx.fillText(s.armed ? (charged ? 'MAX!' : 'READY') : 'WAIT', meterX + 8, meterY + meterH + 16)
    }

    function drawHud() {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, 0, W, 40)

      ctx.fillStyle = '#e8eaf0'
      ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`Score: ${s.score}`, 14, 26)

      const acc = s.shots > 0 ? Math.round((s.makes / s.shots) * 100) : 0
      ctx.textAlign = 'center'
      ctx.fillText(`${s.makes}/${s.shots}  (${acc}%)`, W * 0.42, 26)

      if (s.streak >= 2) {
        ctx.fillStyle = '#ff9332'
        ctx.fillText(`🔥 ${s.streak}x`, W * 0.62, 26)
      }

      ctx.fillStyle = '#e8eaf0'
      ctx.textAlign = 'right'
      const lv = livesRef.current
      ctx.fillText(['❤️','❤️','❤️'].map((_, i) => i < lv ? '❤️' : '🖤').join(''), W - 12, 26)
    }

    function drawGameOver() {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#e8eaf0'
      ctx.font = 'bold 36px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Game Over', W / 2, H / 2 - 20)
      ctx.font = '18px monospace'
      ctx.fillStyle = '#8b92a5'
      ctx.fillText(`${s.makes}/${s.shots} shots · ${s.score} pts`, W / 2, H / 2 + 14)
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)

      // Screen shake: translate the world layer (HUD drawn after restore so it stays still)
      const shakeX = s.shake > 0.1 ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake > 0.1 ? (Math.random() - 0.5) * s.shake : 0
      ctx.save()
      ctx.translate(shakeX, shakeY)

      drawCourt()
      drawHoop()
      drawAimPreview(progressRef.current)
      drawPlayer(progressRef.current)
      drawFlyingBalls()
      drawParticles()
      drawPopups()
      drawFlashOverlay()

      ctx.restore()

      // HUD + power meter sit above shake so they don't jitter
      drawPowerMeter(progressRef.current)
      drawHud()
      if (livesRef.current === 0) drawGameOver()
    }

    let raf
    let lastT = performance.now()
    function loop(now) {
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      step(dt)
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(raf)
  }, [])  // run loop once; livesRef + progressRef carry latest values

  return (
    <div className="bball-root">
      {violation && !gameOver && (
        <div className="bball-violation">⚠️ {violation.message}</div>
      )}

      {resultFlash && countdown === null && (
        <div className={`bball-result bball-result--${resultFlash.kind}`}>
          {resultFlash.text}
        </div>
      )}

      <div className="bball-canvas-wrap">
        <canvas ref={canvasRef} width={W} height={H} className="bball-canvas" />
        {countdown !== null && (
          <div className="bball-countdown-overlay">
            <div
              key={countdown}
              className={`bball-countdown ${countdown === 'GO' ? 'bball-countdown--go' : ''}`}
            >
              {countdown}
            </div>
            {countdown !== 'GO' && (
              <div className="bball-countdown-sub">Get ready…</div>
            )}
          </div>
        )}
      </div>

      <div className="bball-bottom">
        <div className="bball-hint">
          <strong>Curl up</strong> to charge & aim — the dotted line shows your trajectory.
          {' '}<strong>Lower your arm</strong> to release the shot.
          {' '}Match the curl to the hoop's height.
        </div>
        <div className="bball-actions">
          <button className="r-btn r-btn--ghost" onClick={() => send({ action: 'reset_session' })}>
            Reset
          </button>
          <button className="r-btn r-btn--primary" onClick={onFinish}>
            {gameOver ? 'See Summary' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}
