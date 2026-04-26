import { useEffect, useRef, useState } from 'react'

// Tick durations match the basketball countdown so the cadence feels identical
// across every game.
const TICK_MS = 800
const GO_MS = 500

// Single source of truth for the 3 → 2 → 1 → GO! intro used by every game.
// Returns:
//   value     — current overlay text ("3" | "2" | "1" | "GO" | null)
//   started   — true once the countdown has fully finished (gate gameplay on this)
//   startedRef — same flag exposed as a ref for rAF loops that don't re-render
export function useStartCountdown() {
  const [value, setValue] = useState(3)
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (value === null) return
    const next =
      value === 3 ? 2 :
      value === 2 ? 1 :
      value === 1 ? 'GO' :
      null
    const delay = value === 'GO' ? GO_MS : TICK_MS
    const t = setTimeout(() => {
      setValue(next)
      if (next === null) {
        startedRef.current = true
        setStarted(true)
      }
    }, delay)
    return () => clearTimeout(t)
  }, [value])

  return { value, started, startedRef }
}

// Absolutely positioned overlay; parent must be `position: relative`.
// `compact` shrinks the digits so smaller canvases (e.g. 600×300 runner) stay legible.
export default function CountdownOverlay({ value, compact = false }) {
  if (value === null || value === undefined) return null
  const isGo = value === 'GO'
  return (
    <div style={overlayStyle}>
      <div
        key={String(value)}
        style={{
          ...digitBaseStyle,
          ...(compact ? digitCompactStyle : digitFullStyle),
          ...(isGo ? goStyle : null),
          animation: `${isGo ? 'rr-countdown-go' : 'rr-countdown-pop'} ${isGo ? GO_MS : TICK_MS}ms cubic-bezier(.2,1.2,.4,1) both`,
        }}
      >
        {value}
      </div>
      {!isGo && <div style={subStyle}>Get ready…</div>}
      <style>{KEYFRAMES}</style>
    </div>
  )
}

const overlayStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.55)',
  borderRadius: 16,
  zIndex: 30,
  pointerEvents: 'none',
}
const digitBaseStyle = {
  fontWeight: 900,
  color: '#00d4ff',
  textShadow: '0 0 40px rgba(0,212,255,0.8), 0 4px 20px rgba(0,0,0,0.6)',
  fontFamily: '-apple-system, system-ui, sans-serif',
  lineHeight: 1,
}
const digitFullStyle = { fontSize: 160 }
const digitCompactStyle = { fontSize: 110 }
const goStyle = {
  color: '#00e676',
  textShadow: '0 0 60px rgba(0,230,118,0.9), 0 4px 20px rgba(0,0,0,0.6)',
  letterSpacing: 4,
}
const subStyle = {
  marginTop: 12,
  color: '#8b92a5',
  fontSize: 14,
  letterSpacing: 2,
  textTransform: 'uppercase',
}

const KEYFRAMES = `
@keyframes rr-countdown-pop {
  0%   { transform: scale(0.3) rotate(-8deg); opacity: 0; }
  40%  { transform: scale(1.15);              opacity: 1; }
  70%  { transform: scale(1);                 opacity: 1; }
  100% { transform: scale(0.85);              opacity: 0; }
}
@keyframes rr-countdown-go {
  0%   { transform: scale(0.5);  opacity: 0; }
  30%  { transform: scale(1.25); opacity: 1; }
  100% { transform: scale(1);    opacity: 1; }
}
`
