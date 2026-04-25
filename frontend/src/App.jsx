import { useState } from 'react'
import { usePhyphoxDirect } from './hooks/usePhyphoxDirect'
import Setup from './components/Setup'
import CalibrationScreen from './components/CalibrationScreen'
import GameSelect from './components/GameSelect'
import RunnerGame from './components/RunnerGame'
import BasketballGame from './components/BasketballGame'
import CurlGame from './components/CurlGame'
import SessionSummary from './components/SessionSummary'

export default function App() {
  const [screen, setScreen] = useState('setup')
  const [finalData, setFinalData] = useState(null)

  const {
    data, repFlash, host, setHost, reset,
    gamePhase, startGame, resetCalibration,
    calibReps, calibStatus, calibAccY, limits,
    lives, violation,
  } = usePhyphoxDirect('')

  function send(msg) {
    if (msg.action === 'reset_session') reset()
    if (msg.action === 'set_host') setHost(msg.host)
  }

  function handleSetupDone(enteredHost) {
    if (enteredHost) setHost(enteredHost)
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

  if (screen === 'setup')       return <Setup onStart={handleSetupDone} />
  if (screen === 'calibration') return (
    <CalibrationScreen
      calibReps={calibReps}
      calibStatus={calibStatus}
      calibAccY={calibAccY}
      limits={limits}
      onDone={handleCalibrationDone}
    />
  )
  if (screen === 'select')  return <GameSelect onSelect={setScreen} />
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

  return null
}
