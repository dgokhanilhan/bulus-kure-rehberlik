// BK Akıllı Yoklama (Windows / Tauri) ön yüzü. Kök depodaki node_modules'u kullanır (ayrı paket yok).
// Supabase adresi ve anon anahtarı derlemede ortamdan gelir (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
// yerelde kökteki .env.local okunur.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  base: './',
  plugins: [react()],
  clearScreen: false,
  server: { port: 5180, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
})
