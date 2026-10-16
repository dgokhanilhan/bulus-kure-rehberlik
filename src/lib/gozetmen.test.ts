import { describe, expect, it } from 'vitest'
import { addMin, oneri, presetOturumlar, sorunlar, uygunluk, type DersSatiri, type Gorev, type Oturum, type Uygunluk } from './gozetmen'

const bells = [
  { period: 1, starts: '08:40', ends: '09:20' },
  { period: 2, starts: '09:30', ends: '10:10' },
  { period: 3, starts: '10:20', ends: '11:00' },
  { period: 4, starts: '11:10', ends: '11:50' },
  { period: 5, starts: '12:00', ends: '12:40', active: false },
]
const teachers = [
  { id: 'a', full_name: 'Ayşe' },
  { id: 'b', full_name: 'Bora' },
  { id: 'c', full_name: 'Cem' },
  { id: 'd', full_name: 'Deniz' },
]
const L = (teacher_id: string, class_id: string, period: number, weekday = 2): DersSatiri => ({ teacher_id, class_id, period, weekday, subject: 'Matematik' })
const classNames = new Map([['8a', '8/A'], ['8b', '8/B'], ['9a', '9/A']])
const sozel: Oturum = { key: 's', name: 'Sözel', starts: '09:30', ends: '10:45' }
const sayisal: Oturum = { key: 'y', name: 'Sayısal', starts: '11:15', ends: '12:35' }

describe('uygunluk', () => {
  const u = uygunluk({
    weekday: 2,
    oturum: sozel,
    bells,
    lessons: [L('a', '8a', 2), L('b', '9a', 3), L('c', '9a', 1), L('d', '9a', 2, 3), L('d', '9a', 5)],
    examClassIds: new Set(['8a', '8b']),
    classNames,
    teachers,
  })
  it('sınava giren sınıftaki dersi olan öğretmen serbest kalır', () => expect(u.get('a')!.durum).toBe('serbest'))
  it('sınava girmeyen sınıfta dersi olan öğretmen uygun değil', () => {
    expect(u.get('b')!.durum).toBe('dersi_var')
    expect(u.get('b')!.dersler[0]).toMatchObject({ class_name: '9/A', inExam: false })
  })
  it('oturumla çakışmayan ders, başka gün ve pasif ders saati hesaba katılmaz', () => {
    expect(u.get('c')!.durum).toBe('bos')
    expect(u.get('d')!.durum).toBe('bos')
  })
})

describe('dengeli dağıtım', () => {
  const siniflar = [
    { class_id: '8a', class_name: '8/A' },
    { class_id: '8b', class_name: '8/B' },
  ]
  const all = (d: Uygunluk['durum']) => new Map(teachers.map((t) => [t.id, { durum: d, dersler: [] } as Uygunluk]))
  it('dersi olanı atamaz, geçmiş görevi az olanı seçer, çakışan oturumda aynı kişiyi iki kez kullanmaz', () => {
    const uyg = all('bos')
    uyg.set('b', { durum: 'dersi_var', dersler: [{ class_id: '9a', class_name: '9/A', subject: 'Fizik', period: 2, inExam: false }] })
    const g = oneri({
      oturumlar: [sozel],
      siniflar,
      teachers,
      uygun: new Map([['s', uyg]]),
      gecmis: new Map([['a', { gozetmen: 5, dinlendirici: 0 }]]),
      gorevler: [],
      dinlendiriciBasina: 2,
    })
    const ids = g.map((x) => x.teacher_id)
    expect(ids).not.toContain('b')
    expect(new Set(ids).size).toBe(ids.length)
    expect(g.filter((x) => x.role === 'gozetmen').map((x) => x.teacher_id)).toEqual(['c', 'd'])
    expect(g.find((x) => x.role === 'dinlendirici')?.teacher_id).toBe('a')
  })
  it('elle seçilen görev korunur; yük iki oturuma dengeli yayılır ve sınıf değişir', () => {
    const manual: Gorev = { oturum_key: 's', role: 'gozetmen', class_id: '8a', class_name: '8/A', teacher_id: 'd', teacher_name: 'Deniz' }
    const g = oneri({
      oturumlar: [sozel, sayisal],
      siniflar,
      teachers,
      uygun: new Map([['s', all('bos')], ['y', all('bos')]]),
      gecmis: new Map(),
      gorevler: [manual],
      dinlendiriciBasina: 0,
    })
    expect(g[0]).toBe(manual)
    const counts = new Map<string, number>()
    for (const x of g) counts.set(x.teacher_id!, (counts.get(x.teacher_id!) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBe(1)
    const sameClass = g.filter((x) => x.oturum_key === 'y' && x.class_name === '8/A')[0]!
    expect(sameClass.teacher_id).not.toBe('d')
  })
})

describe('sorunlar', () => {
  it('eksik atama, çakışma ve dersi olan öğretmeni bildirir', () => {
    const uyg = new Map<string, Uygunluk>([['b', { durum: 'dersi_var', dersler: [{ class_id: '9a', class_name: '9/A', subject: 'Fizik', period: 2, inExam: false }] }]])
    const s = sorunlar({
      oturumlar: [sozel],
      siniflar: [
        { class_id: '8a', class_name: '8/A' },
        { class_id: '8b', class_name: '8/B' },
      ],
      gorevler: [
        { oturum_key: 's', role: 'gozetmen', class_id: '8a', class_name: '8/A', teacher_id: 'b', teacher_name: 'Bora' },
        { oturum_key: 's', role: 'dinlendirici', class_id: null, class_name: null, teacher_id: 'b', teacher_name: 'Bora' },
      ],
      uygun: new Map([['s', uyg]]),
      dinlendiriciBasina: 4,
    })
    const tips = s.map((x) => x.tip)
    expect(tips).toContain('eksik')
    expect(tips).toContain('cakisma')
    expect(tips).toContain('ders')
    expect(s.find((x) => x.tip === 'eksik')!.text).toContain('8/B')
  })
})

it('hazır düzenler okulun saatlerini verir', () => {
  const o = presetOturumlar('ortaokul')
  expect(o.map((x) => [x.starts, x.ends])).toEqual([['09:30', '10:45'], ['11:15', '12:35']])
  expect(presetOturumlar('tyt').map((x) => [x.starts, x.ends])).toEqual([['10:15', '13:00']])
  expect(presetOturumlar('ayt').map((x) => [x.starts, x.ends])).toEqual([['10:00', '13:00']])
  expect(addMin('23:50', 20)).toBe('00:10')
})

it('Gözetmen Bul menüsü yalnız yöneticide', async () => {
  const { navItems } = await import('./roles')
  expect(navItems('admin').map((n) => n.id)).toContain('gozetmen')
  for (const r of ['rehber', 'brans', 'veli', 'ogrenci'] as const) expect(navItems(r).map((n) => n.id)).not.toContain('gozetmen')
})
