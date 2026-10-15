import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Safari motorunda aynı sentetik sonuçlar ve ekran boyutları; fiziksel iPad testi değildir.
export default defineConfig({
  ...base,
  testMatch: ['ui-quality.spec.ts', 'grafik-etiketleri.spec.ts'],
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
})
