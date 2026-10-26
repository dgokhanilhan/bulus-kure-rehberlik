import { describe, expect, it } from 'vitest'
import { adEk, adla, odevMetni, type OdevSatiri } from './veliToplantiMetni'

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
