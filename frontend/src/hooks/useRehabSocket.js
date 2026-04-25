import { useState, useEffect, useRef, useCallback } from 'react'

const INITIAL = {
  connected: false,
  sensorConnected: false,
  raw_angle: 0,
  progress: 0,
  smoothed_progress: 0,
  rep_state: 'idle',
  rep_count: 0,
  good_reps: 0,
  feedback: 'Waiting for sensor…',
  score: 0,
  session_time: 0,
  peak_angle: 0,
  last_rep_quality: 0,
}

export function useRehabSocket(wsUrl) {
  const [data, setData] = useState(INITIAL)
  const [repFlash, setRepFlash] = useState(null)  // { count, quality } on new rep
  const [config, setConfig] = useState({ phyphox_host: '' })
  const wsRef = useRef(null)
  const retryRef = useRef(null)
  const prevRepCount = useRef(0)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setData(prev => ({ ...prev, connected: true }))
    }

    ws.onmessage = e => {
      const msg = JSON.parse(e.data)

      if (msg.type === 'curl_data') {
        setData(prev => {
          if (msg.rep_count > prevRepCount.current) {
            prevRepCount.current = msg.rep_count
            setRepFlash({ count: msg.rep_count, quality: msg.last_rep_quality, ts: Date.now() })
          }
          return { ...prev, ...msg, connected: true, sensorConnected: true }
        })
      } else if (msg.type === 'sensor_status') {
        setData(prev => ({ ...prev, sensorConnected: msg.connected }))
      } else if (msg.type === 'config') {
        setConfig(msg)
      }
    }

    ws.onclose = () => {
      setData(prev => ({ ...prev, connected: false, sensorConnected: false }))
      retryRef.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => ws.close()
  }, [wsUrl])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback(msg => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { data, repFlash, config, send }
}
