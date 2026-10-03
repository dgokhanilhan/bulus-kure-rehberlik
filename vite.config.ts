import { defineConfig, loadEnv, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { checkDist } from './deploy/dist-kontrol.ts'

/** deploy/_headers.template → dist/_headers (CSP'deki Supabase adresi derleme ortamından). */
function securityHeaders(mode: string): Plugin {
  return {
    name: 'bk-security-headers',
    apply: 'build',
    generateBundle() {
      const url = loadEnv(mode, process.cwd(), '').VITE_SUPABASE_URL ?? ''
      const origin = url ? new URL(url).origin : 'https://*.supabase.co'
      const ws = origin.replace(/^http/, 'ws')
      const src = readFileSync('deploy/_headers.template', 'utf8').replaceAll('%SUPABASE_ORIGIN%', origin).replaceAll('%SUPABASE_WS%', ws)
      this.emitFile({ type: 'asset', fileName: '_headers', source: src })
    },
  }
}

/** Derleme bitince dist bütünlüğü: index.html'in istediği her dosya, _headers ve önbellek kuralları. Sorun varsa derleme düşer. */
function distIntegrity(): Plugin {
  let outDir = 'dist'
  return {
    name: 'bk-dist-integrity',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const errs = checkDist(outDir)
      if (errs.length) throw new Error(`Derleme çıktısı bozuk, yayınlanmamalı:\n- ${errs.join('\n- ')}`)
      console.log('dist bütünlük kontrolü: tamam')
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), securityHeaders(mode), distIntegrity()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true },
}))
