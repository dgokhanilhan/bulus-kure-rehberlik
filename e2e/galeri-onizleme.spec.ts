import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

test('fotoğraf önizlemesi: ImageBitmap başarısızsa img ile açılır, ölçüler korunur', async ({ page }) => {
  await page.goto('/')
  const bytes = [...readFileSync(path.join(import.meta.dirname, 'fixtures/galeri/gezi-1.jpg'))]
  const result = await page.evaluate(async (bytes) => {
    window.createImageBitmap = async () => { throw new Error('desteklenmiyor') }
    const modulePath = '/src/lib/galeri.ts'
    const { previews } = await import(modulePath)
    const p = await previews(new File([new Uint8Array(bytes)], 'foto.jpg', { type: 'image/jpeg' }), 'foto')
    return { width: p.width, height: p.height, thumb: p.thumb?.type }
  }, bytes)
  expect(result.width).toBeGreaterThan(0)
  expect(result.height).toBeGreaterThan(0)
  expect(result.thumb).toBe('image/webp')
})
