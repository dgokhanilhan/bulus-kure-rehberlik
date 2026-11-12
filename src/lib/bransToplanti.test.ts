import { describe, expect, it } from 'vitest'
import { DERSE_OZEL, DERS_ICI, YAZI, bransSorulari, cevapTemizle, denemeOzeti, dersGrubu, dersSirala, formDolu, odevCumlesi, odevOzeti, tumSorular, type DersOdevi } from './bransToplanti'
import type { Dataset, Result } from './analiz'

describe('derse özel sorular', () => {
  it('ders adı doğru gruba düşer', () => {
    expect(dersGrubu('Matematik')).toBe('matematik')
    expect(dersGrubu('Türk Dili ve Edebiyatı')).toBe('turkce')
    expect(dersGrubu('Fen Bilimleri')).toBe('fen')
    expect(dersGrubu('Fizik')).toBe('fen')
    expect(dersGrubu('T.C. İnkılap Tarihi ve Atatürkçülük')).toBe('sosyal')
    expect(dersGrubu('Din Kültürü ve Ahlak Bilgisi')).toBe('sosyal')
    expect(dersGrubu('İngilizce')).toBe('dil')
    expect(dersGrubu('Beden Eğitimi')).toBe('diger')
  })
  it('her derste ders içi + derse özel + yazı alanları; anahtarlar benzersiz ve veritabanı biçiminde', () => {
    for (const ders of ['Matematik', 'Türkçe', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Müzik']) {
      const b = bransSorulari(ders)
      expect(b.dersIci).toBe(DERS_ICI)
      expect(b.yazi).toBe(YAZI)
      expect(b.ozel.length).toBeGreaterThanOrEqual(3)
      const ks = tumSorular(ders).map((q) => q.k)
      expect(new Set(ks).size).toBe(ks.length)
      for (const k of ks) expect(k).toMatch(/^[a-z][a-z0-9_]{0,39}$/)
    }
    // Gruplar arası anahtar çakışması yok (ders değişince eski cevap başka soruya düşmez)
    const hepsi = [...DERS_ICI, ...YAZI, ...Object.values(DERSE_OZEL).flat()].map((q) => q.k)
    expect(new Set(hepsi).size).toBe(hepsi.length)
  })
  it('veliye giden metinlerde etiketleyici ifade ve teknik terim yok', () => {
    const metin = [...DERS_ICI, ...YAZI, ...Object.values(DERSE_OZEL).flat()]
      .flatMap((q) => [q.metin, ...(q.tur === 'secim' ? q.secenekler.map((x) => x[1]) : [])])
      .join(' ')
    expect(metin).not.toMatch(/başarısız|yetersiz|zayıf|kötü|tembel|OCR|kazanım/i)
  })
  it('yalnız geçerli cevaplar saklanır', () => {
    expect(cevapTemizle('Matematik', { katilim: 'evet', tempo: 'rahat', m_hata: 'konu', d_kelime: 'evet', dikkat: 'belki', evde: '  20 soru  ', olmayan: 'x', guclu: '' })).toEqual({
      katilim: 'evet',
      tempo: 'rahat',
      m_hata: 'konu',
      evde: '20 soru',
    })
    expect(cevapTemizle('Matematik', { evde: 'a'.repeat(700) }).evde).toHaveLength(600)
    expect(formDolu({})).toBe(false)
    expect(formDolu({ katilim: undefined, evde: ' ' })).toBe(false)
    expect(formDolu({ katilim: 'evet' })).toBe(true)
  })
  it('öğretmenin branşına uyan ders ilk sırada', () => {
    const d = [{ name: 'Türkçe' }, { name: 'Matematik' }, { name: 'Fen Bilimleri' }]
    expect(dersSirala(d, 'Matematik').map((x) => x.name)).toEqual(['Matematik', 'Türkçe', 'Fen Bilimleri'])
    expect(dersSirala(d, 'Rehberlik').map((x) => x.name)).toEqual(['Türkçe', 'Matematik', 'Fen Bilimleri'])
  })
})

describe('ödev özeti', () => {
  const o = (durum: DersOdevi['durum'], verilis: string): DersOdevi => ({ baslik: 'Ödev', verilis, teslim: null, durum })
  it('kontrol edilenler sayılır; bekleyen, izinli ve okulda olmadığı gün sayılmaz', () => {
    const x = odevOzeti([o('yapti', '2026-10-01'), o('yapti', '2026-10-02'), o('eksik', '2026-10-03'), o('yapmadi', '2026-10-04'), o('bekliyor', '2026-10-05'), o('izinli', '2026-10-06'), o('gelmedi', '2026-10-07')])
    expect(x).toMatchObject({ kontrol: 4, tam: 2, eksik: 1, yapilmadi: 1, bekleyen: 1, oran: 50 })
    expect(x.son[0]!.verilis).toBe('2026-10-07')
    expect(odevCumlesi(x)).toBe('Kontrol edilen 4 ödevin 2 tam, 1 eksik, 1 yapılmadı (%50 tam).')
  })
  it('ödev yoksa ya da kontrol edilmediyse sayı uydurulmaz', () => {
    expect(odevCumlesi(odevOzeti([]))).toBe('Bu derste sistemde kayıtlı ödev yok.')
    expect(odevCumlesi(odevOzeti([o('bekliyor', '2026-10-05')]))).toBe('Bu derste 1 ödev verildi; henüz kontrol edilmedi.')
    expect(odevOzeti([]).oran).toBeNull()
  })
})

describe('deneme özeti (yalnız o ders)', () => {
  const res = (exam_id: string, student_id: string, mat: number | null, tur: number): Result => ({
    exam_id,
    student_id,
    score: 300,
    subjects: { ...(mat === null ? {} : { MAT: { d: 0, y: 0, b: 0, net: mat } }), TUR: { d: 0, y: 0, b: 0, net: tur } },
    answers: null,
    outcomes_ok: true,
  })
  const ds: Dataset = {
    subjects: [
      { code: 'TUR', ad: 'Türkçe', short: 'Türkçe', q: 20 },
      { code: 'MAT', ad: 'Matematik', short: 'Matematik', q: 20 },
    ],
    exams: [
      { id: 'e1', name: 'D-1', publisher: null, exam_date: '2026-09-01' },
      { id: 'e2', name: 'D-2', publisher: null, exam_date: '2026-09-15' },
      { id: 'e3', name: 'D-3', publisher: null, exam_date: '2026-10-01' },
    ],
    questionsByExam: new Map(),
    outcomes: [],
    results: [res('e1', 'a', 8, 12), res('e3', 'a', 11.5, 10), res('e2', 'b', null, 9)],
  }
  it('öğrencinin girdiği denemelerde o dersin neti ve değişimi; girmediği deneme atlanır', () => {
    const x = denemeOzeti(ds, 'a', ['MAT'])
    expect(x.denemeler.map((d) => [d.ad, d.net, d.degisim, d.soru])).toEqual([
      ['D-1', 8, null, 20],
      ['D-3', 11.5, 3.5, 20],
    ])
    expect(x.egilim).toBe(3.5)
  })
  it('ders sonucu yoksa ya da dersin denemede karşılığı yoksa boş (deneme az olan sınıflar)', () => {
    expect(denemeOzeti(ds, 'b', ['MAT'])).toEqual({ denemeler: [], egilim: null, konular: [] })
    expect(denemeOzeti(ds, 'a', [])).toEqual({ denemeler: [], egilim: null, konular: [] })
    expect(denemeOzeti(null, 'a', ['MAT'])).toEqual({ denemeler: [], egilim: null, konular: [] })
  })
})
