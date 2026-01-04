/* eslint-env node */
/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  // Backend URL configuration - uses VITE_BACKEND_URL or defaults to localhost:8000
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8000'

  return {
    plugins: [
      react(),
      // Plugin to add CORS headers for Chrome extension origins
      {
        name: 'configure-cors',
        configureServer (server) {
          server.middlewares.use((req, res, next) => {
            const origin = req.headers.origin

            // Allow Chrome extension origins
            if (origin && origin.startsWith('chrome-extension://')) {
              res.setHeader('Access-Control-Allow-Origin', origin)
              res.setHeader(
                'Access-Control-Allow-Methods',
                'GET, POST, PUT, DELETE, OPTIONS, HEAD'
              )
              res.setHeader(
                'Access-Control-Allow-Headers',
                'Content-Type, Authorization, X-Requested-With'
              )
              res.setHeader('Access-Control-Allow-Credentials', 'false')

              // Handle preflight requests
              if (req.method === 'OPTIONS') {
                res.writeHead(200)
                res.end()
                return
              }
            }

            next()
          })
        }
      }
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
          configure: proxy => {
            proxy.on('error', err => {
              console.log('⚠️ Vite proxy error:', err)
            })
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(
                `🔄 Proxying ${req.method} ${req.url} → ${backendUrl}${req.url}`
              )
            })
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(
                `✅ Proxy response: ${req.method} ${req.url} → ${proxyRes.statusCode}`
              )
            })
          }
        },
        '/socket.io': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 120000, // 2 minute timeout for WebSocket
          configure: proxy => {
            proxy.on('error', err => {
              console.log('⚠️ Socket.IO proxy error:', err.message)
            })
            proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
              console.log('🔌 WebSocket proxy connection established')
              socket.on('error', err => {
                console.log('⚠️ WebSocket socket error:', err.message)
              })
            })
            proxy.on('close', () => {
              console.log('🔌 WebSocket proxy connection closed')
            })
          }
        }
      }
    }
  }
})
