import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// VITE_BASE set in GitHub Actions to `/<repo-name>/` for project Pages
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  plugins: [svelte()],
  base,
  server: {
    port: 5173,
  },
})
