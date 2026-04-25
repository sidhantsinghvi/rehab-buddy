import { useState } from 'react'
import { usePhyphoxDirect } from './hooks/usePhyphoxDirect'
import Setup from './components/Setup'
import CurlGame from './components/CurlGame'
import SessionSummary from './components/SessionSummary'

export default function App() {
  const [screen, setScreen] = useState('setup')
  const [finalData, setFinalData] = useState(null)

  const { data, repFlash, host, setHost, reset } = usePhyphoxDirect('')

  // Build a send() shim so CurlGame doesn't need changes
  function send(msg) {
    if (msg.action === 'reset_session') reset()
    if (msg.action === 'set_host') setHost(msg.host)
  }

  function handleStart(enteredHost) {
    if (enteredHost) setHost(enteredHost)
    reset()
    setScreen('game')
  }

  function handleFinish() {
    setFinalData(data)
    setScreen('summary')
  }

  function handleRestart() {
    reset()
    setScreen('setup')
  }

  if (screen === 'setup') {
    return <Setup onStart={handleStart} />
  }

  if (screen === 'summary') {
    return <SessionSummary data={finalData} onRestart={handleRestart} />
  }

  return (
    <CurlGame
      data={data}
      repFlash={repFlash}
      config={{ phyphox_host: host }}
      send={send}
      onFinish={handleFinish}
    />
  )
}
