import { useState } from 'react'
import { usePhyphoxDirect } from './hooks/usePhyphoxDirect'
import Setup from './components/Setup'
import CalibrationScreen from './components/CalibrationScreen'
import GameSelect from './components/GameSelect'
import RunnerGame from './components/RunnerGame'
import BasketballGame from './components/BasketballGame'
import CurlGame from './components/CurlGame'
import LateralRaiseGame from './components/LateralRaiseGame'
import MeteorShieldGame from './components/MeteorShieldGame'
import RingPopGame from './components/RingPopGame'
import WingBalanceGame from './components/WingBalanceGame'
import SessionSummary from './components/SessionSummary'

const GAME_TO_EXERCISE = {
  runner: 'bicep', basketball: 'bicep', tracker: 'bicep',
  'lateral-raise': 'lateral', 'meteor-shield': 'lateral', 'ring-pop': 'lateral', 'wing-balance': 'lateral',
}

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
    setScreen('exercise-select')
  }

  // Pick an exercise from the top-level menu → reset calibration → calibrate
  function handleExercisePick(exerciseName) {
    setExercise(exerciseName)
    resetCalibration()
    setScreen('calibration')
  }

  function handleCalibrationDone() {
    startGame()
    setScreen(exercise === 'lateral' ? 'lateral-select' : 'bicep-select')
  }

  function handleCalibrationSkip() {
    skipCalibration()
    startGame()
    setScreen(exercise === 'lateral' ? 'lateral-select' : 'bicep-select')
  }

  function handleCalibrationBack() {
    setScreen('exercise-select')
  }

  function handleFinish(overrideData = null) {
    setFinalData(overrideData || data)
    setScreen('summary')
  }

  function handleRestart() {
    reset()
    resetCalibration()
    setScreen('exercise-select')
  }

  // Game-select callbacks: navigating BACK to exercise-select bubbles up here
  function handleSelect(next) {
    if (next === 'exercise-select') { setScreen('exercise-select'); return }
    // bicep-select / lateral-select are pure menu transitions
    if (next === 'bicep-select' || next === 'lateral-select') { setScreen(next); return }
    // Game routes — confirm exercise matches calibration; otherwise force recal
    const required = GAME_TO_EXERCISE[next]
    if (required && required !== exercise) {
      setExercise(required)
      resetCalibration()
      setScreen('calibration')
      return
    }
    setScreen(next)
  }

  if (screen === 'setup')       return <Setup onStart={handleSetupDone} />

  if (screen === 'exercise-select') return (
    <GameSelect
      mode="exercise"
      onSelect={(target) => {
        if (target === 'bicep-select')   handleExercisePick('bicep')
        else if (target === 'lateral-select') handleExercisePick('lateral')
        else handleSelect(target)
      }}
    />
  )

  if (screen === 'calibration') return (
    <CalibrationScreen
      exercise={exercise}
      calibReps={calibReps}
      calibStatus={calibStatus}
      calibAccY={calibAccY}
      limits={limits}
      onDone={handleCalibrationDone}
      onSkip={handleCalibrationSkip}
      onBack={handleCalibrationBack}
    />
  )

  if (screen === 'bicep-select')   return <GameSelect mode="bicep"   onSelect={handleSelect} />
  if (screen === 'lateral-select') return <GameSelect mode="lateral" onSelect={handleSelect} />

  if (screen === 'summary') return <SessionSummary data={finalData} onRestart={handleRestart} />

  if (screen === 'runner') return (
    <RunnerGame data={data} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
  )
  if (screen === 'basketball') return (
    <BasketballGame data={data} repFlash={repFlash} lives={lives} violation={violation} onFinish={handleFinish} send={send} />
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
