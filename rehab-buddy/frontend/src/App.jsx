import { useState } from 'react'
import { usePhyphoxDirect } from './hooks/usePhyphoxDirect'
import Setup from './components/Setup'
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
    setScreen('select')
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

  if (screen === 'exerciseSelect') return <ExerciseSelect onSelect={handleExerciseSelect} />

  if (screen === 'calibration') return (
    <CalibrationScreen
      calibReps={calibReps}
      calibStatus={calibStatus}
      calibAccY={calibAccY}
      limits={limits}
      exercise={exercise}
      onDone={handleCalibrationDone}
      onSkip={() => { skipCalibration(); handleCalibrationDone() }}
    />
  )

  if (screen === 'select') return <GameSelect onSelect={setScreen} exercise={exercise} />
  if (screen === 'summary') return <SessionSummary data={finalData} onRestart={handleRestart} />

  if (screen === 'runner') return (
    <RunnerGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
  )
  if (screen === 'basketball') return (
    <BasketballGame data={data} repFlash={repFlash} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
  )
  if (screen === 'pong') return (
    <PongGame data={data} lives={lives} violation={violation} onFinish={handleFinish} />
  )
  if (screen === 'archery') return (
    <ArcheryGame data={data} lives={lives} violation={violation} onFinish={handleFinish} />
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
    />
  )
  if (screen === 'lateral-raise') return (
    <LateralRaiseGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
  )
  if (screen === 'meteor-shield') return (
    <MeteorShieldGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
  )
  if (screen === 'ring-pop') return (
    <RingPopGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
  )
  if (screen === 'wing-balance') return (
    <WingBalanceGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
  )

  return null
}
