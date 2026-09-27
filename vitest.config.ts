import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: loadEnv('development', process.cwd(), ''),
    globalSetup: ['tests/global-setup.ts'],
    // RLS testleri aynı yerel veritabanını paylaşır; dosyalar sıralı çalışır.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
