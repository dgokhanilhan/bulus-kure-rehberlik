import { describe, expect, it } from 'vitest'
import { bulunmaEki } from './turkceEk'

describe('bulunmaEki', () => {
  it.each([
    ['TG-5', 'te'], ['Deneme 2', 'de'], ['Deneme 6', 'da'], ['Deneme 10', 'da'], ['Deneme 40', 'ta'], ['Deneme 100', 'de'],
    ['LGS', 'de'], ['Kasım denemesi', 'de'], ['Ekim sınavı', 'da'], ['Özdebir', 'de'], ['Hız Yayınları', 'da'],
    ['Matematik', 'te'], ['Ara tatil', 'de'],
  ])('%s → %s', (ad, ek) => expect(bulunmaEki(ad)).toBe(ek))
})
