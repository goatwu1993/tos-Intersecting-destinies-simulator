import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works from any static path (GitHub Pages, file host, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
})
