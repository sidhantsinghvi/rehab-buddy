import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Current phyphox target — updated at runtime via POST /set-phyphox-host
let phyphoxTarget = `http://${process.env.PHYPHOX_HOST || '10.30.227.143'}`

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'phyphox-proxy',
      configureServer(server) {
        // GET /phyphox/* — forward to phyphox device (avoids browser CORS block)
        server.middlewares.use('/phyphox', async (req, res) => {
          const url = phyphoxTarget + (req.url || '/')
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout(1400) })
            const text = await r.text()
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(text)
          } catch (e) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: e.message }))
          }
        })

        // POST /set-phyphox-host { host } — update proxy target without restarting
        server.middlewares.use('/set-phyphox-host', (req, res) => {
          let body = ''
          req.on('data', c => (body += c))
          req.on('end', () => {
            try {
              const { host } = JSON.parse(body)
              phyphoxTarget = `http://${host}`
              console.log(`[phyphox proxy] target → ${phyphoxTarget}`)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'bad request' }))
            }
          })
        })
      },
    },
  ],
  server: { port: 5173 },
})
