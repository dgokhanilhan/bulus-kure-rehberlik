import { describe, it, expect } from 'vitest'
import { codeKey, matchProgramCourse, validCorners } from '../src/lib/programImage'
const course = (id: string, name: string, short_name = id) => ({ id, name, short_name, active: true })
const courses = [course('mat', 'Matematik'), course('ing', 'İngilizce'), course('reh', 'Rehberlik'), course('sd', 'Seçmeli Ders'), course('tur', 'Türkçe')]
describe('Program görselindeki ders eşleşmeleri', () => {
  it('verilen kısaltmaları ve iki satıra bölünmüş dersleri birleştirir', () => {
    for (const s of ['M', 'MU', 'MATEM ATİK']) expect(matchProgramCourse(s, courses)).toBe('mat')
    expect(matchProgramCourse('Eng', courses)).toBe('ing')
    expect(matchProgramCourse('Reh', courses)).toBe('reh')
    expect(matchProgramCourse('SD', courses)).toBe('sd')
    expect(matchProgramCourse('TÜRKÇ E', courses)).toBe('tur')
    expect(codeKey('BİYOLO Jİ')).toBe('BIYOLOJI')
  })
  it('bilinmeyen, belirsiz ve pasif dersler otomatik seçilmez', () => {
    expect(matchProgramCourse('P-S-K', courses)).toBe('')
    expect(matchProgramCourse('', courses)).toBe('')
    expect(matchProgramCourse('M', [course('m1','Matematik'),course('m2','Matematik')])).toBe('')
    expect(matchProgramCourse('ENG', [{ ...course('i','İngilizce'), active:false }])).toBe('')
  })
  it('ters, kesişen ve çok küçük alan seçimleri kabul edilmez', () => {
    const corners = [{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]
    expect(validCorners(corners)).toBe(true)
    expect(validCorners(corners.slice(0,3))).toBe(false)
    expect(validCorners([...corners].reverse())).toBe(false)
    expect(validCorners([corners[0]!, corners[2]!, corners[1]!, corners[3]!])).toBe(false)
    expect(validCorners([{x:0,y:0},{x:2,y:0},{x:2,y:1},{x:0,y:1}])).toBe(false)
  })
})
