import { describe, expect, it } from 'vitest'
import { addMin, bolmeSaati, cakisanGorevler, dersOgretmeniAta, gorevAraligi, kadro, oneri, presetOturumlar, sorunlar, uygunluk, type DersSatiri, type Gorev, type Oturum, type Uygunluk } from './gozetmen'

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

describe('sınıfa giren öğretmen ve kademe kuralı', () => {
  const lessons = [L('a', '8a', 2), L('b', '9a', 3), L('c', '8b', 3), L('d', '9a', 1, 4)]
  const k = kadro(lessons, new Map([['8a', 'ortaokul'], ['8b', 'ortaokul'], ['9a', 'lise']]))
  const bos = new Map(teachers.map((t) => [t.id, { durum: 'bos', dersler: [] } as Uygunluk]))
  it('o sınıfa giren öğretmen önce seçilir; liseye girmeyen lise sınıfına atanmaz', () => {
    const g = oneri({
      oturumlar: [sozel],
      siniflar: [
        { class_id: '8b', class_name: '8/B', level: 'ortaokul' },
        { class_id: '9a', class_name: '9/A', level: 'lise' },
      ],
      teachers,
      uygun: new Map([['s', bos]]),
      gecmis: new Map([['c', { gozetmen: 9, dinlendirici: 0 }]]),
      gorevler: [],
      dinlendiriciBasina: 0,
      kadro: k,
    })
    expect(g.find((x) => x.class_name === '8/B')!.teacher_id).toBe('c') // geçmişi fazla olsa da sınıfın öğretmeni
    expect(['b', 'd']).toContain(g.find((x) => x.class_name === '9/A')!.teacher_id) // yalnız lisede dersi olanlar
  })
  it('lise sınıfına liseye girmeyen öğretmen elle atanırsa uyarır', () => {
    const s = sorunlar({
      oturumlar: [sozel],
      siniflar: [{ class_id: '9a', class_name: '9/A', level: 'lise' }],
      gorevler: [{ oturum_key: 's', role: 'gozetmen', class_id: '9a', class_name: '9/A', teacher_id: 'a', teacher_name: 'Ayşe' }],
      uygun: new Map([['s', bos]]),
      dinlendiriciBasina: 0,
      kadro: k,
    })
    expect(s.map((x) => x.tip)).toContain('kademe')
  })
  it('dersin öğretmeni: oturumda tek ders varsa o dersin öğretmeni bütün oturumu alır', () => {
    const ls = [L('a', '8a', 2), L('b', '8b', 4)]
    const g = dersOgretmeniAta({
      weekday: 2,
      oturumlar: [{ ...sozel, ends: '10:15' }],
      siniflar: [
        { class_id: '8a', class_name: '8/A' },
        { class_id: '8b', class_name: '8/B' },
      ],
      bells,
      lessons: ls,
      teachers,
      gorevler: [],
      haric: new Set(),
    })
    // 8/B'nin dersi oturum dışında
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ class_name: '8/A', teacher_id: 'a' })
    expect(g[0]!.scope).toBeUndefined()
  })
  it('dersin öğretmeni: oturum iki öğretmenin dersine denk geliyorsa gözetmenlik ders saatlerine göre paylaşılır', () => {
    const ls = [L('a', '8a', 2), L('c', '8a', 3)]
    const args = { weekday: 2, oturumlar: [sozel], siniflar: [{ class_id: '8a', class_name: '8/A' }], bells, lessons: ls, teachers, gorevler: [] as Gorev[] }
    // Sözel 09:30–10:45: 2. ders 09:30–10:10 (Ayşe), 3. ders 10:20–11:00 (Cem); teneffüs önceki bölüme eklenir
    const g = dersOgretmeniAta({ ...args, haric: new Set() })
    expect(g.map((x) => [x.teacher_id, x.scope])).toEqual([
      ['a', '09:30–10:20'],
      ['c', '10:20–10:45'],
    ])
    expect(sorunlar({ oturumlar: [sozel], siniflar: args.siniflar, gorevler: g, uygun: new Map([['s', bos]]), dinlendiriciBasina: 0 })).toEqual([])
    // Görev verilmeyen öğretmenin bölümü diğerine katılır
    const h = dersOgretmeniAta({ ...args, haric: new Set(['a']) })
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ teacher_id: 'c' })
    expect(h[0]!.scope).toBeUndefined()
    // 15 dakikadan kısa örtüşen ders paylaşıma girmez
    const kisa = dersOgretmeniAta({ ...args, oturumlar: [{ ...sozel, ends: '10:30' }], haric: new Set() })
    expect(kisa.map((x) => x.teacher_id)).toEqual(['a'])
  })
})

describe('paylaşılan gözetmenlik', () => {
  const siniflar = [{ class_id: '8a', class_name: '8/A' }]
  const bos = new Map(teachers.map((t) => [t.id, { durum: 'bos', dersler: [] } as Uygunluk]))
  const G = (teacher_id: string, scope?: string, class_name = '8/A'): Gorev => ({ oturum_key: 's', role: 'gozetmen', class_id: '8a', class_name, scope, teacher_id, teacher_name: teacher_id })
  it('gorevAraligi kapsamı okur; saat olmayan kapsam bütün oturumdur', () => {
    expect(gorevAraligi(G('a', '09:30–10:20'), sozel)).toEqual([570, 620])
    expect(gorevAraligi(G('a'), sozel)).toEqual([570, 645])
    expect(gorevAraligi({ role: 'dinlendirici', scope: '09:30–10:20' }, sozel)).toEqual([570, 645])
  })
  it('aynı öğretmen aynı oturumda farklı saatlerde çakışmaz; saatler örtüşürse çakışır', () => {
    const ok = [G('a', '09:30–10:20'), G('a', '10:20–10:45', '8/B')]
    expect(cakisanGorevler([sozel], ok).size).toBe(0)
    const bad = [G('a', '09:30–10:30'), G('a', '10:20–10:45', '8/B')]
    expect(cakisanGorevler([sozel], bad).size).toBe(2)
    expect(sorunlar({ oturumlar: [sozel], siniflar: [...siniflar, { class_id: '8b', class_name: '8/B' }], gorevler: bad, uygun: new Map([['s', bos]]), dinlendiriciBasina: 0 }).map((x) => x.tip)).toContain('cakisma')
  })
  it('paylaşılan sınıfta boş kalan saat bildirilir', () => {
    const s = sorunlar({ oturumlar: [sozel], siniflar, gorevler: [G('a', '09:30–10:00'), G('c', '10:20–10:45')], uygun: new Map([['s', bos]]), dinlendiriciBasina: 0 })
    expect(s.map((x) => x.text)).toContain('Sözel: 8/A sınıfında 10:00–10:20 arası gözetmen yok.')
  })
  it('akıllı dağıt: ders bilgisi verilince iki öğretmenin dersine denk gelen oturumu paylaştırır', () => {
    const g = oneri({
      oturumlar: [sozel],
      siniflar,
      teachers,
      uygun: new Map([['s', bos]]),
      gecmis: new Map(),
      gorevler: [],
      dinlendiriciBasina: 0,
      dersler: { weekday: 2, bells, lessons: [L('a', '8a', 2), L('c', '8a', 3), L('c', '9a', 2)] },
    })
    expect(g.map((x) => [x.teacher_id, x.scope])).toEqual([
      ['a', '09:30–10:20'],
      ['c', '10:20–10:45'],
    ])
    // Paylaşacak öğretmenin kendi saatinde sınava girmeyen sınıfta dersi varsa paylaşılmaz
    const h = oneri({
      oturumlar: [sozel],
      siniflar,
      teachers,
      uygun: new Map([['s', bos]]),
      gecmis: new Map(),
      gorevler: [],
      dinlendiriciBasina: 0,
      dersler: { weekday: 2, bells, lessons: [L('a', '8a', 2), L('c', '8a', 3), L('c', '9a', 3)] },
    })
    expect(h.filter((x) => x.role === 'gozetmen')).toHaveLength(1)
  })
  it('bölme saati: ortaya en yakın ders başlangıcı, yoksa ortası', () => {
    expect(bolmeSaati(570, 645, bells)).toBe(620)
    expect(bolmeSaati(570, 645, [])).toBe(610)
    expect(bolmeSaati(570, 585, bells)).toBeNull()
  })
})
