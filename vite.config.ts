import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const mpTicket = env.MERCADO_PUBLICO_TICKET ?? ''
  const apiBase = env.API_BASE_URL || 'http://localhost:3001'

  const apiProxies = [
    '/api/products',
    '/api/categories',
    '/api/brands',
    '/api/health',
    '/api/auth',
    '/api/quotes',
    '/api/users',
    '/api/uploads',
    '/api/price-lists',
    '/api/orders',
    '/api/notifications',
    '/api/companies',
    '/api/customers',
    '/api/import',
  ]

  return {
    plugins: [react()],
    server: {
      proxy: {
        ...Object.fromEntries(
          apiProxies.map((path) => [path, { target: apiBase, changeOrigin: true }]),
        ),
        '/uploads': {
          target: apiBase,
          changeOrigin: true,
        },
        '/api/mp': {
          target: 'https://api.mercadopublico.cl/servicios/v1/publico',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mp/, ''),
          configure: (proxy) => {
            if (!mpTicket) return
            proxy.on('proxyReq', (proxyReq) => {
              const idx = proxyReq.path.indexOf('?')
              const searchParams = new URLSearchParams(idx !== -1 ? proxyReq.path.slice(idx + 1) : '')
              searchParams.set('ticket', mpTicket)
              const pathname = idx !== -1 ? proxyReq.path.slice(0, idx) : proxyReq.path
              proxyReq.path = `${pathname}?${searchParams.toString()}`
            })
          },
        },
      },
    },
  }
})
