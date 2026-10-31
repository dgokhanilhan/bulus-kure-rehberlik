import { describe, expect, it } from 'vitest'
import { etutBolumleri } from './etut'
import { adEk, adla, etutMetni, odevIstatistigi, odevMetni, type OdevSatiri } from './veliToplantiMetni'

describe('ad çekimi', () => {
  it('ünlü uyumu ve kaynaştırma harfi', () => {
    expect(['Adar', 'Ece', 'Utku', 'Ömer', 'Elif', 'Nisanur', 'Ayşe'].map((a) => adEk(a, 'in'))).toEqual(["Adar'ın", "Ece'nin", "Utku'nun", "Ömer'in", "Elif'in", "Nisanur'un", "Ayşe'nin"])
    expect(['Adar', 'Ece', 'Utku', 'Ömer'].map((a) => adEk(a, 'e'))).toEqual(["Adar'a", "Ece'ye", "Utku'ya", "Ömer'e"])
    expect(['Adar', 'Ece', 'Utku', 'Ömer'].map((a) => adEk(a, 'i'))).toEqual(["Adar'ı", "Ece'yi", "Utku'yu", "Ömer'i"])
  })
  it('rapor metnindeki "öğrencimiz" kalıpları adla değişir', () => {
    expect(adla('Öğrencimizin netinde artış var; öğrencimizle konuşacağız, öğrencimiz için plan yapacağız.', 'Adar')).toBe(
      "Adar'ın netinde artış var; Adar ile konuşacağız, Adar için plan yapacağız.",
    )
  })
})

const O = (ders: string, durum: OdevSatiri['durum'], teslim: string | null = '2026-10-10', baslik = 'Test'): OdevSatiri => ({ baslik, ders, verilis: '2026-10-01', teslim, durum })
describe('ödev metni', () => {
  const bugun = '2026-10-26'
  it('düzenli: oran ve takdir', () => {
    const p = odevMetni([O('Matematik', 'yapti'), O('Fen', 'yapti'), O('Türkçe', 'yapti')], 'Adar', bugun)
    expect(p[0]).toBe("Bu dönem Adar'a 3 ödev verildi; öğretmenlerinin kontrol ettiği 3 ödevin 3 tanesini tam yapmış.")
    expect(p[1]).toMatch(/çok iyi/)
  })
  it('aksayan dersler, yaklaşan ödev, kontrolsüz ve devamsızlık', () => {
    const p = odevMetni(
      [O('Matematik', 'yapmadi'), O('Matematik', 'getirmedi'), O('Fen', 'eksik'), O('Türkçe', 'yapti'), O('Fen', 'bekliyor', '2026-10-30', 'Basit makineler'), O('Türkçe', 'bekliyor', '2026-10-20')],
      'Ece',
      bugun,
      2,
    )
    expect(p[0]).toBe("Bu dönem Ece'ye 6 ödev verildi; öğretmenlerinin kontrol ettiği 4 ödevin 1 tanesini tam yapmış, 1 tanesini eksik getirmiş, 2 tanesini yapmamış.")
    expect(p[1]).toMatch(/Matematik \(2\) ve Fen derslerinde/)
    expect(p.join(' ')).toMatch(/Fen – Basit makineler \(30 Ekim\)/)
    expect(p.join(' ')).toMatch(/1 ödevin kontrolü henüz girilmemiş/)
    expect(p.join(' ')).toMatch(/2 gün okula gelmediğini/)
  })
  it('ödev yok / henüz kontrol yok', () => {
    expect(odevMetni([], 'Adar', bugun)[0]).toMatch(/ödev kaydı görünmüyor/)
    expect(odevMetni([O('Fen', 'bekliyor', '2026-11-02')], 'Adar', bugun)[0]).toMatch(/henüz kontrolü yapılmış bir ödev olmadığı/)
  })
})

describe('etüt metni ve ödev istatistiği', () => {
  const bugun = '2026-10-31'
  const E = (tarih: string, yoklama: 'geldi' | 'gelmedi' | null, konu = 'Matematik') => ({ tarih, konu, yoklama })
  it('tam katılım, gelmediği etüt, yaklaşan etüt', () => {
    expect(etutMetni([E('2026-10-24', 'geldi'), E('2026-10-31', 'geldi')], 'Adar', bugun)).toEqual([
      'Bu dönem Adar 2 etüde yazıldı; yoklaması alınan 2 etüdün 2 tanesine gelmiş.',
      'Etütlere düzenli katılıyor; bu güzel bir alışkanlık, devam etmesini destekleyelim.',
    ])
    const p = etutMetni([E('2026-10-17', 'geldi'), E('2026-10-24', 'gelmedi', 'Rasyonel sayılar'), E('2026-11-07', null, 'Fen')], 'Ece', bugun)
    expect(p[0]).toBe('Bu dönem Ece 2 etüde yazıldı; yoklaması alınan 2 etüdün 1 tanesine gelmiş, 1 tanesine gelmemiş.')
    expect(p[1]).toMatch(/Gelmediği etüt: 24 Ekim Rasyonel sayılar\. Etütler eksikleri kapatmak/)
    expect(p[2]).toBe('Yaklaşan etüdü: 7 Kasım Fen.')
  })
  it('etüt yok, yoklama girilmemiş', () => {
    expect(etutMetni([], 'Adar', bugun)[0]).toMatch(/kayıtlı bir etüdü görünmüyor/)
    expect(etutMetni([E('2026-10-24', null)], 'Adar', bugun)[0]).toMatch(/yoklamaları henüz girilmediği/)
  })
  it('ödev istatistiği: bekleyen ve izinli sayılmaz', () => {
    expect(odevIstatistigi([O('Fen', 'yapti'), O('Fen', 'yapti'), O('Fen', 'yapti'), O('Fen', 'eksik'), O('Fen', 'yapmadi'), O('Fen', 'bekliyor'), O('Fen', 'izinli')])).toBe('Sistemde 5 ödev kontrol edildi: 3 tam, 1 eksik, 1 yapılmadı (%60 tam)')
    expect(odevIstatistigi([O('Fen', 'bekliyor')])).toBe('Sistemde kontrol edilmiş ödev yok.')
  })
})

describe('Etütlerim bölümleri', () => {
  const H = (tarih: string, ders: number) => ({ ders, etut_gunler: { tarih } })
  it('bugün ve sonrası üstte (yakın önce); geçmiş ayrı (yeni önce)', () => {
    const { guncel, gecmis } = etutBolumleri([H('2026-10-17', 1), H('2026-11-07', 1), H('2026-10-31', 2), H('2026-10-31', 1), H('2026-10-24', 1)], '2026-10-31')
    expect(guncel.map((x) => [x.etut_gunler.tarih, x.ders])).toEqual([['2026-10-31', 1], ['2026-10-31', 2], ['2026-11-07', 1]])
    expect(gecmis.map((x) => x.etut_gunler.tarih)).toEqual(['2026-10-24', '2026-10-17'])
  })
})
