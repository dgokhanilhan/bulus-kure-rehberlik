import { describe, expect, it } from 'vitest'
import { outcomeCode, proposeOutcome, type MatchOutcome } from './outcomeMatching'

const o = (id: string, code: string, title = 'Sayı kümelerini birbiriyle ilişkilendirir.'): MatchOutcome => ({ id, code, title, grade: 9, subject_code: 'MAT', curriculum_version_id: 'v' })
const row = (raw_code: string | null, raw_text: string | null = null) => ({ raw_code, raw_text, subject_code: 'MAT' })
describe('Toplu kazanım önerileri', () => {
  it('TYT/AYT ders ön ekini temizleyerek tam kodu eşler', () => {
    expect(proposeOutcome(row('TYT.MAT.9.3.1.1'), [o('a', '9.3.1.1')])).toMatchObject({ certain: true, outcome: { id: 'a' } })
    expect(outcomeCode('AYT.PSKL.10.36', 'FEL')).toBeNull()
    expect(outcomeCode('MAT.6.1.1.', 'MAT')).toBe('6.1.1')
  })
  it('ekranda görülen eksik kodu önerir fakat otomatik seçmez', () => {
    expect(proposeOutcome(row('TYT.MAT.9.3.1', 'Sayı Kümeleri'), [o('a', '9.3.1.1')])).toMatchObject({ certain: false, outcome: { id: 'a' } })
  })
  it('birden fazla alt kazanımdan tahmin yapmaz', () => {
    expect(proposeOutcome(row('TYT.MAT.9.3.1'), [o('a', '9.3.1.1'), o('b', '9.3.1.2')]).outcome).toBeNull()
  })
  it('birebir metin eşleşmesinde Türkçe harf ve noktalama farklarını tolere eder', () => {
    expect(proposeOutcome(row(null, 'SAYI KÜMELERİNİ BİRBİRİYLE İLİŞKİLENDİRİR'), [o('a', '9.3.1.1')])).toMatchObject({ certain: true, outcome: { id: 'a' } })
  })
  it('kod/metin çelişkisini ve farklı dersleri eşlemez', () => {
    expect(proposeOutcome(row('9.3.1.1', 'Üçgenleri inceler'), [o('a', '9.3.1.1'), o('b', '9.3.1.2', 'Üçgenleri inceler')]).outcome).toBeNull()
    expect(proposeOutcome(row('9.3.1.1'), [{ ...o('a', '9.3.1.1'), subject_code: 'FIZ' }]).outcome).toBeNull()
  })
  it('aynı kodun farklı program adayları arasında keyfi seçim yapmaz', () => {
    expect(proposeOutcome(row('9.3.1.1'), [o('a', '9.3.1.1'), { ...o('b', '9.3.1.1'), curriculum_version_id: 'v2' }]).outcome).toBeNull()
  })
})
