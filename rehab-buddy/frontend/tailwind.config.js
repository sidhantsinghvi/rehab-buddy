/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Athletic dark theme
        bg:       '#0E1013',  // warm graphite
        surface:  '#171A1F',
        surface2: '#1F2329',
        surface3: '#262B32',
        ink:      '#F2EFEA',  // warm cream-white
        inkSoft:  '#A8A6A0',
        inkMute:  '#5E6168',
        line:     '#262B32',  // border tone (also see rgba below)
        signal:   '#D6FF4A',  // electric lime — primary accent
        signalDim:'#A6CC2E',
        coral:    '#FF8C6B',  // bicep / warmth
        moss:     '#7AB07C',  // lateral / cool
        amber:    '#FFC66B',  // tricep / focus
        rose:     '#FF6B7A',  // alerts

        // Legacy aliases so old game CSS files inherit the new palette
        cream:    '#0E1013',
        bone:     '#171A1F',
        mauve:    '#D6FF4A',
        clay:     '#FF8C6B',
        sage:     '#7AB07C',
        slate2:   '#FFC66B',
        plum:     '#1F2329',
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter:  '-0.025em',
      },
      boxShadow: {
        edge: '0 0 0 1px rgba(255, 255, 255, 0.06)',
        lift: '0 1px 2px rgba(0,0,0,0.3), 0 16px 40px -16px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgba(214, 255, 74, 0.35), 0 12px 40px -12px rgba(214, 255, 74, 0.25)',
      },
      transitionTimingFunction: {
        apple:    'cubic-bezier(0.32, 0.72, 0, 1)',
        appleOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'rise-in': {
          '0%':   { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'pulse-quiet': {
          '0%, 100%': { opacity: 0.5 },
          '50%':      { opacity: 1 },
        },
        // Heartbeat — two quick beats, then a pause
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)',   opacity: 0.85 },
          '14%':      { transform: 'scale(1.4)', opacity: 1 },
          '28%':      { transform: 'scale(1)',   opacity: 0.9 },
          '42%':      { transform: 'scale(1.25)',opacity: 1 },
          '70%':      { transform: 'scale(1)',   opacity: 0.85 },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(214,255,74,0.45)' },
          '50%':      { boxShadow: '0 0 0 12px rgba(214,255,74,0)' },
        },
        // Atmospheric drift for the ambient glow
        drift: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%':      { transform: 'translate3d(2%, -1%, 0)' },
        },
      },
      animation: {
        'fade-in':     'fade-in 0.7s cubic-bezier(0.32,0.72,0,1) both',
        'rise-in':     'rise-in 0.7s cubic-bezier(0.32,0.72,0,1) both',
        'pulse-quiet': 'pulse-quiet 2.4s ease-in-out infinite',
        heartbeat:    'heartbeat 1.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-out infinite',
        drift:        'drift 18s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
