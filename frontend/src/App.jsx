import { useState } from 'react'
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

export default function App() {
  const [screen, setScreen] = useState('setup')
  const [finalData, setFinalData] = useState(null)
  const [pendingGame, setPendingGame] = useState(null)  // set by AI coach

  const {
    data, repFlash, host, setHost, reset,
    gamePhase, startGame, resetCalibration, skipCalibration,
    calibReps, calibStatus, calibAccY, limits,
    lives, violation,
    exercise, setExercise,
  } = usePhyphoxDirect('')

  function send(msg) {
    if (msg.action === 'reset_session') reset()
    if (msg.action === 'set_host') setHost(msg.host)
  }

  function handleSetupDone(enteredHost) {
    if (enteredHost) setHost(enteredHost)
    setScreen('exerciseSelect')
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

  function handleFinish() {
    setFinalData(data)
    setScreen('summary')
  }

  function handleRestart() {
    reset()
    resetCalibration()
    setScreen('setup')
  }

  if (screen === 'setup') return <Setup onStart={handleSetupDone} />

  if (screen === 'exerciseSelect') return (
    <ExerciseSelect onSelect={handleExerciseSelect} onBack={() => setScreen('setup')} onAICoach={() => setScreen('aiCoach')} />
  )

  if (screen === 'aiCoach') return (
    <AICoach onSelect={handleAISelect} onBack={() => setScreen('exerciseSelect')} />
  )

  if (screen === 'calibration') return (
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

  if (screen === 'select') return (
    <GameSelect onSelect={setScreen} exercise={exercise} onBack={() => setScreen('calibration')} />
  )
  if (screen === 'summary') return (
    <SessionSummary data={finalData} onRestart={handleRestart} onBack={() => setScreen('select')} />
  )

  if (screen === 'runner') return (
    <RunnerGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
  )
  if (screen === 'basketball') return (
    <BasketballGame data={data} repFlash={repFlash} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
  )
  if (screen === 'pong') return (
    <PongGame data={data} lives={lives} violation={violation} onFinish={handleFinish} onBack={() => setScreen('select')} />
  )
  if (screen === 'archery') return (
    <ArcheryGame data={data} lives={lives} violation={violation} onFinish={handleFinish} onBack={() => setScreen('select')} />
  )
  if (screen === 'tracker') return (
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
  if (screen === 'lateral-raise') return (
    <LateralRaiseGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
  )
  if (screen === 'meteor-shield') return (
    <MeteorShieldGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
  )
  if (screen === 'ring-pop') return (
    <RingPopGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
  )
  if (screen === 'wing-balance') return (
    <WingBalanceGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} onBack={() => setScreen('select')} />
  )

  return null
}
