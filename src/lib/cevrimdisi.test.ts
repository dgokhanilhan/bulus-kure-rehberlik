import { describe, expect, it } from 'vitest'
import { agHatasiMi, hataliTemizle, kuyrugaEkle, kuyrukOku, kuyruguGonder, type Depo, type KuyrukIs } from './cevrimdisi'
import { kurulumAdimlari, type KurulumSayilari } from './kurulum'

const bellek = (): Depo => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}
const yoklama = (etiket: string) => ({ tur: 'yoklama' as const, etiket, up: [{ student_id: 's', day: '2026-11-16', status: 'devamsiz' }], del: [] })

describe('agHatasiMi', () => {
  it('ağ hatalarını tanır, sunucu reddini tanımaz', () => {
    expect(agHatasiMi({ message: 'TypeError: Failed to fetch' }, true)).toBe(true)
    expect(agHatasiMi(new Error('Load failed'), true)).toBe(true)
    expect(agHatasiMi({ message: 'new row violates row-level security policy' }, true)).toBe(false)
    expect(agHatasiMi({ message: 'herhangi' }, false)).toBe(true) // çevrimdışıyken her hata ağ hatası
  })
})

describe('kuyruk', () => {
  it('sırayla gönderir; ağ hatasında durur, kalanlar sırada kalır', async () => {
    const d = bellek()
    kuyrugaEkle('u', yoklama('A'), d)
    kuyrugaEkle('u', yoklama('B'), d)
    kuyrugaEkle('u', yoklama('C'), d)
    const giden: string[] = []
    const r = await kuyruguGonder(
      'u',
      async (is: KuyrukIs) => {
        if (is.etiket === 'B') throw new Error('Failed to fetch')
        giden.push(is.etiket)
      },
      d,
      () => true,
    )
    expect(giden).toEqual(['A'])
    expect(r).toEqual({ gonderilen: 1, reddedilen: 0, kalan: 2 })
    expect(kuyrukOku('u', d).bekleyen.map((x) => x.etiket)).toEqual(['B', 'C'])
  })
  it('sunucunun reddettiği iş kaybolmaz: gönderilemeyenlere taşınır, sıradakine geçilir', async () => {
    const d = bellek()
    kuyrugaEkle('u', yoklama('A'), d)
    kuyrugaEkle('u', yoklama('B'), d)
    const r = await kuyruguGonder(
      'u',
      async (is) => {
        if (is.etiket === 'A') throw new Error('Bu işlem için yetki yok')
      },
      d,
      () => true,
    )
    expect(r).toEqual({ gonderilen: 1, reddedilen: 1, kalan: 0 })
    const k = kuyrukOku('u', d)
    expect(k.hatali.map((x) => [x.etiket, x.hata])).toEqual([['A', 'Bu işlem için yetki yok']])
    hataliTemizle('u', d)
    expect(kuyrukOku('u', d)).toEqual({ bekleyen: [], hatali: [] })
  })
  it('kullanıcıya özel; bozuk kayıt boş sayılır', () => {
    const d = bellek()
    kuyrugaEkle('u1', yoklama('A'), d)
    expect(kuyrukOku('u2', d).bekleyen).toHaveLength(0)
    d.setItem('bk.kuyruk.u3', '{bozuk')
    expect(kuyrukOku('u3', d)).toEqual({ bekleyen: [], hatali: [] })
  })
})

describe('kurulumAdimlari', () => {
  const bos: KurulumSayilari = { yil: 0, modul: 0, sinif: 0, ders: 0, saat: 0, ogretmen: 0, ogrenci: 0, sinifsiz: 0, atama: 0, program: 0, veli_bagli: 0, yonetici_mfa: 0 }
  it('boş okulda zorunlu adımlar yapılmadı; modül ve program gözden geçir', () => {
    const a = kurulumAdimlari(bos)
    expect(a).toHaveLength(10)
    expect(a.filter((x) => x.durum === 'gozden').map((x) => x.baslik)).toEqual(['Modüller', 'Ders programı'])
    expect(a.filter((x) => x.durum !== 'gozden').every((x) => x.durum === 'eksik')).toBe(true)
  })
  it('kısmi durumlar: sınıfsız öğrenci, az veli, ders var saat yok', () => {
    const a = kurulumAdimlari({ ...bos, ders: 5, ogrenci: 10, sinifsiz: 2, veli_bagli: 3 })
    const d = (b: string) => a.find((x) => x.baslik.startsWith(b))!.durum
    expect(d('Dersler')).toBe('kismen')
    expect(d('Öğrenciler')).toBe('kismen')
    expect(d('Veliler')).toBe('kismen')
    expect(kurulumAdimlari({ ...bos, ogrenci: 10, veli_bagli: 8 }).find((x) => x.baslik === 'Veliler')!.durum).toBe('tamam')
  })
})
