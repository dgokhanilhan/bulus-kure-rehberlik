import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

Object.assign(process.env, loadEnv('development', process.cwd(), ''))
// E2E_DIST=1: üretim derlemesini güvenlik başlıklarıyla (CSP) sunup test et.
const DIST = process.env.E2E_DIST === '1'
// E2E_MOBIL=1: mobil (Capacitor) paketini telefon boyutunda test et (npm run e2e:mobil).
const MOBIL = process.env.E2E_MOBIL === '1'
const BASE = MOBIL ? 'http://localhost:4174' : DIST ? 'http://localhost:4173' : 'http://localhost:5173'

export default defineConfig({
  testDir: 'e2e',
  // Aynı yerel veritabanı ve admin TOTP faktörü paylaşılır: sıralı çalış.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    MOBIL
      ? { name: 'mobil', use: { ...devices['Pixel 7'] } }
      : { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: MOBIL ? 'node scripts/serve-dist.mjs' : DIST ? 'node scripts/serve-dist.mjs' : 'npm run dev',
    env: MOBIL ? { SERVE_DIR: 'dist-mobil', PORT: '4174' } : {},
    url: BASE,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
