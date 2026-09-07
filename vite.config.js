import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // On GitHub Actions, the full repo path prefix is needed
  // Locally, the shorter path works fine
  base: process.env.GITHUB_ACTIONS
    ? '/Healthcare-orchestration-impact-prototype/Srikanth/DataOrchestration/Prototype/'
    : '/Srikanth/DataOrchestration/Prototype/',
  server: {
    port: 3000,
    open: true,
  },
})

