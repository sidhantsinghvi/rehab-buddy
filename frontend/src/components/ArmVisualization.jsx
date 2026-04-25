/**
 * SVG arm that rotates to match bicep curl progress.
 *
 * Geometry:
 *   Shoulder fixed at top-center. Upper arm hangs straight down.
 *   Forearm rotates from pointing down (progress=0) to pointing up (progress=1).
 *   A target arc (amber) marks the 72%–100% zone.
 */

const W = 280
const H = 320
const SHOULDER = { x: W / 2, y: 70 }
const UPPER_LEN = 90
const FORE_LEN = 88
const ELBOW = { x: SHOULDER.x, y: SHOULDER.y + UPPER_LEN }

function polarPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Forearm goes from 90° (pointing down in SVG) to -90° (pointing up)
function forearmAngle(progress) {
  return 90 - progress * 170  // max ~80° above horizontal = realistic full curl
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polarPoint(cx, cy, r, startDeg)
  const e = polarPoint(cx, cy, r, endDeg)
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

function stateColor(repState) {
  if (repState === 'at_top') return '#00e676'
  if (repState === 'going_up') return '#00d4ff'
  if (repState === 'going_down') return '#ffd740'
  return '#5a7a9a'
}

export default function ArmVisualization({ progress, repState }) {
  const angle = forearmAngle(progress)
  const wrist = polarPoint(ELBOW.x, ELBOW.y, FORE_LEN, angle)
  const color = stateColor(repState)

  const targetStart = forearmAngle(0.72)
  const targetEnd = forearmAngle(1.0)

  // Glow radius based on progress
  const glowR = 8 + progress * 6

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 0 18px rgba(0,212,255,0.15))' }}
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Target zone arc (amber) */}
      <path
        d={arcPath(ELBOW.x, ELBOW.y, FORE_LEN + 20, targetStart, targetEnd)}
        fill="none"
        stroke="#ffd74055"
        strokeWidth={18}
        strokeLinecap="round"
      />
      <path
        d={arcPath(ELBOW.x, ELBOW.y, FORE_LEN + 20, targetStart, targetEnd)}
        fill="none"
        stroke="#ffd740"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="4 6"
      />

      {/* Upper arm */}
      <line
        x1={SHOULDER.x} y1={SHOULDER.y}
        x2={ELBOW.x} y2={ELBOW.y}
        stroke="#1e3048"
        strokeWidth={20}
        strokeLinecap="round"
      />
      <line
        x1={SHOULDER.x} y1={SHOULDER.y}
        x2={ELBOW.x} y2={ELBOW.y}
        stroke="#2a4560"
        strokeWidth={14}
        strokeLinecap="round"
      />

      {/* Forearm */}
      <line
        x1={ELBOW.x} y1={ELBOW.y}
        x2={wrist.x} y2={wrist.y}
        stroke={color + '40'}
        strokeWidth={18}
        strokeLinecap="round"
      />
      <line
        x1={ELBOW.x} y1={ELBOW.y}
        x2={wrist.x} y2={wrist.y}
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        filter="url(#glow)"
      />

      {/* Shoulder joint */}
      <circle cx={SHOULDER.x} cy={SHOULDER.y} r={10} fill="#1e3048" />
      <circle cx={SHOULDER.x} cy={SHOULDER.y} r={6} fill="#2a4560" />

      {/* Elbow joint */}
      <circle cx={ELBOW.x} cy={ELBOW.y} r={glowR} fill={color + '30'} />
      <circle cx={ELBOW.x} cy={ELBOW.y} r={10} fill="#1e3048" />
      <circle cx={ELBOW.x} cy={ELBOW.y} r={6} fill={color} filter="url(#glow)" />

      {/* Wrist/hand */}
      <circle cx={wrist.x} cy={wrist.y} r={8} fill={color + '80'} />
      <circle cx={wrist.x} cy={wrist.y} r={5} fill={color} filter="url(#glow)" />
    </svg>
  )
}
