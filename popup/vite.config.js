// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../extension/popup'),
    emptyOutDir: true
  }
})
