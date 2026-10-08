import { it, expect } from 'vitest'
import { albumInScope } from '../src/lib/albumScope'
const children = [{ id: 'child', full_name: 'Test', class_name: '6/A', class_id: 'six', school_no: null, grade: 6 }]
const a = { status: 'yayinda', audience: 'sinif', class_ids: ['ten'], student_ids: [], level: null }
it('veli galeri listesi, son eklenenler ve doğrudan bağlantıda kendi çocuklarının kapsamını kullanır', () => {
  expect(albumInScope(a, 'veli', children)).toBe(false)
  expect(albumInScope(a, 'ogretmen', children)).toBe(true)
  expect(albumInScope({ ...a, class_ids: ['six'] }, 'veli', children)).toBe(true)
  expect(albumInScope({ ...a, audience: 'ogretmen' }, 'veli', children)).toBe(false)
  expect(albumInScope({ ...a, audience: 'okul', status: 'taslak' }, 'veli', children)).toBe(false)
  expect(albumInScope({ ...a, audience: 'ogrenci', student_ids: ['child'] }, 'veli', children)).toBe(true)
})
