import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API routes are same-origin. In dev, proxy them to the Flask backend on :5002
// so the frontend can use relative URLs (matching the production single-origin
// deploy where Flask serves the built SPA).
const API_TARGET = 'http://127.0.0.1:5002'
const API_ROUTES = ['/upload', '/change-page', '/get-image', '/thumbnail', '/status', '/search', '/health']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(API_ROUTES.map((route) => [route, API_TARGET])),
  },
})
