import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePhyphoxDirect } from './hooks/usePhyphoxDirect'
import Setup from './components/Setup'
import AICoach from './components/AICoach'
import ExerciseSelect from './components/ExerciseSelect'
import CalibrationScreen from './components/CalibrationScreen'
import GameSelect from './components/GameSelect'
import RunnerGame from './components/RunnerGame'
import BasketballGame from './components/BasketballGame'
import PongGame from './components/PongGame'
import ArcheryGame from './components/ArcheryGame'
import CurlGame from './components/CurlGame'
import LateralRaiseGame from './components/LateralRaiseGame'
import MeteorShieldGame from './components/MeteorShieldGame'
import RingPopGame from './components/RingPopGame'
import WingBalanceGame from './components/WingBalanceGame'
import SessionSummary from './components/SessionSummary'

// Screens that get the framer-motion page transition + animated backdrop.
// Games and calibration are excluded so the sensor/render path stays clean.
const META_SCREENS = new Set(['setup', 'exerciseSelect', 'aiCoach', 'select', 'summary'])

const APPLE_EASE = [0.32, 0.72, 0, 1]
const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.7, ease: APPLE_EASE } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.4, ease: APPLE_EASE } },
}

function Page({ id, children }) {
  return (
    <motion.div
      key={id}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen w-full"
    >
      {children}
    </motion.div>
  )
}

export default function App() {
  const [screen, setScreen] = useState('setup')
  const [finalData, setFinalData] = useState(null)
  const [pendingGame, setPendingGame] = useState(null)

  const {
    data, repFlash, host, setHost, reset,
    gamePhase, startGame, resetCalibration, skipCalibration,
    calibReps, calibStatus, calibAccY, limits,
    lives, violation,
    exercise, setExercise,
    probeConnection,
  } = usePhyphoxDirect('')

  const isMeta = META_SCREENS.has(screen)
  const sensorConnected = data.connected && data.sensorConnected

  // Sensor/render perf guard: when calibration or a game is mounted, drop the
  // animated backdrop + noise overlay (see body.in-game in index.css).
  useEffect(() => {
    if (isMeta) {
      document.body.classList.remove('in-game')
    } else {
      document.body.classList.add('in-game')
    }
    return () => document.body.classList.remove('in-game')
  }, [isMeta])

  function send(msg) {
    if (msg.action === 'reset_session') reset()
    if (msg.action === 'set_host') setHost(msg.host)
  }

  function handleSetupDone(enteredHost) {
    if (enteredHost) setHost(enteredHost)
    // AI coach is the primary entry — users can opt into manual selection
    // from there if they prefer.
    setScreen('aiCoach')
  }

  function handleExerciseSelect(ex) {
    setExercise(ex)
    resetCalibration()
    setScreen('calibration')
  }

  function handleCalibrationDone() {
    startGame()
    if (pendingGame) {
      setScreen(pendingGame)
      setPendingGame(null)
    } else {
      setScreen('select')
    }
  }

  function handleAISelect(ex, gameId) {
    setExercise(ex)
    resetCalibration()
    setPendingGame(gameId)
    setScreen('calibration')
  }

  function handleFinish(payload) {
    // Each game builds its own per-session payload (rep_count, score,
    // session_time, peak_angle, …). If a game supplies one we trust it;
    // otherwise fall back to the live hook data (e.g. for the bicep tracker).
    setFinalData(payload && typeof payload === 'object' ? payload : data)
    setScreen('summary')
  }

  function handleRestart() {
    reset()
    resetCalibration()
    setScreen('setup')
  }

  // Calibration & games: render directly, no motion wrapper. This keeps the
  // sensor pipeline and game rAF loop on a quiet, idle React tree.
  function renderRaw() {
    switch (screen) {
      case 'calibration':
        return (
          <CalibrationScreen
            calibReps={calibReps}
            calibStatus={calibStatus}
            calibAccY={calibAccY}
            limits={limits}
            exercise={exercise}
            onDone={handleCalibrationDone}
            onSkip={() => { skipCalibration(); handleCalibrationDone() }}
            onBack={() => setScreen('exerciseSelect')}
          />
        )
      case 'runner':
        return <RunnerGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
      case 'basketball':
        return <BasketballGame data={data} repFlash={repFlash} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
      case 'pong':
        return <PongGame data={data} lives={lives} violation={violation} onFinish={handleFinish} onBack={() => setScreen('select')} />
      case 'archery':
        return <ArcheryGame data={data} lives={lives} violation={violation} onFinish={handleFinish} onBack={() => setScreen('select')} />
      case 'tracker':
        return (
          <CurlGame
            data={data}
            repFlash={repFlash}
            config={{ phyphox_host: host }}
            send={send}
            onFinish={handleFinish}
            lives={lives}
            violation={violation}
            exercise={exercise}
            onBack={() => setScreen('select')}
          />
        )
      case 'lateral-raise':
        return <LateralRaiseGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
      case 'meteor-shield':
        return <MeteorShieldGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
      case 'ring-pop':
        return <RingPopGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
      case 'wing-balance':
        return <WingBalanceGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
      default:
        return null
    }
  }

  // Meta screens: animated page transitions.
  function renderMeta() {
    switch (screen) {
      case 'setup':
        return (
          <Setup
            onStart={handleSetupDone}
            probeConnection={probeConnection}
            sensorConnected={sensorConnected}
            onHostChange={setHost}
            initialHost={host || '172.20.10.1'}
          />
        )
      case 'exerciseSelect':
        return (
          <ExerciseSelect
            onSelect={handleExerciseSelect}
            onBack={() => setScreen('aiCoach')}
            onAICoach={() => setScreen('aiCoach')}
          />
        )
      case 'aiCoach':
        return (
          <AICoach
            onSelect={handleAISelect}
            onBack={() => setScreen('setup')}
            onManual={() => setScreen('exerciseSelect')}
          />
        )
      case 'select':
        return <GameSelect onSelect={setScreen} exercise={exercise} onBack={() => setScreen('calibration')} />
      case 'summary':
        return <SessionSummary data={finalData} onRestart={handleRestart} onBack={() => setScreen('select')} />
      default:
        return null
    }
  }

  if (!isMeta) {
    return renderRaw()
  }

  return (
    <>
      <SensorBadge connected={sensorConnected} host={host} />
      <AnimatePresence mode="wait" initial={false}>
        <Page id={screen}>{renderMeta()}</Page>
      </AnimatePresence>
    </>
  )
}

// Persistent live-signal indicator — visible on all meta screens after Setup.
function SensorBadge({ connected, host }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: APPLE_EASE }}
      className="fixed top-5 right-5 z-50 surface rounded-full pl-3 pr-4 py-1.5
                 flex items-center gap-2.5 text-[12px]"
    >
      <span className={connected ? 'live-dot' : 'inline-block w-1.5 h-1.5 rounded-full bg-inkMute'} />
      <span className={connected ? 'text-ink' : 'text-inkSoft'}>
        {connected ? 'Live' : 'No signal'}
      </span>
      {host && <span className="text-inkMute font-mono">· {host}</span>}
    </motion.div>
  )
}
