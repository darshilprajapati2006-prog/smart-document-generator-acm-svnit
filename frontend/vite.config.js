import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // Keep Vite's root anchored to this frontend even when launched from the
  // repository root. This also makes /src/... available for local DevTools.
  root: frontendRoot,
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
