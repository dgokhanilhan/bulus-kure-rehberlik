import { describe, it, expect } from 'vitest'
import { codeKey, emptyProgramColumns, programPeriod, programReading, matchProgramCourse, normalizeProgramReading, validCorners, orderProgramCorners, readProgramImage } from '../src/lib/programImage'
const course = (id: string, name: string, short_name = id) => ({ id, name, short_name, active: true })
const courses = [course('mat', 'Matematik'), course('ing', 'İngilizce'), course('reh', 'Rehberlik'), course('sd', 'Seçmeli Ders'), course('tur', 'Türkçe')]
describe('Program görselindeki ders eşleşmeleri', () => {
  it('düşük güvenli metin ve sahte kısa ders okunamadı kalır; gerçek boş hücre ayrılır', () => {
    expect(programReading('EY',30,true)).toEqual({text:'',unreadable:true})
    expect(programReading('M',30,true)).toEqual({text:'',unreadable:true})
    expect(programReading('',0,true)).toEqual({text:'',unreadable:true})
    expect(programReading('',100,false)).toEqual({text:'',unreadable:false})
    expect(programReading('P-Ç',83,true)).toEqual({text:'PC',unreadable:false})
    expect(programReading('MATEM ATIK',47,true)).toEqual({text:'MATEMATIK',unreadable:false})
  })
  it('açık ders adındaki tek harf hatası birleşir, bilinmeyen kısaltma tahmin edilmez', () => {
    expect(normalizeProgramReading('TÜRKÇE E')).toBe('TURKCE')
    expect(normalizeProgramReading('SOSYA I')).toBe('SOSYAL')
    expect(normalizeProgramReading('MATEM ATİK')).toBe('MATEMATIK')
    expect(normalizeProgramReading('P-Ç')).toBe('PC')
    expect(normalizeProgramReading('EY')).toBe('EY')
    expect(normalizeProgramReading('SOSYAKULL')).toBe('SOSYAKULL')
    expect(matchProgramCourse('DIN',[course('din','Din Kültürü','DİN')])).toBe('din')
    expect(matchProgramCourse('DIN',[course('a','Din Kültürü'),course('b','Din Kültürü ve Ahlak Bilgisi')])).toBe('')
  })
  it('okunamayan hücre boş saat sayılmaz', () => {
    expect(emptyProgramColumns([{weekday:1,period:2,text:'',confidence:20,unreadable:true}])).toEqual([])
  })
  it('aynı fotoğraf alanının 24 dokunma sırası aynı geçerli tabloyu verir', () => {
    const points = [{x:.1,y:.15},{x:.95,y:.1},{x:.94,y:.85},{x:.1,y:.9}]
    const permutations = (items: typeof points): typeof points[] => items.length ? items.flatMap((p,i) => permutations(items.filter((_,j) => i!==j)).map((tail) => [p,...tail])) : [[]]
    for (const permutation of permutations(points)) {
      expect(orderProgramCorners(permutation)).toEqual(points)
      expect(validCorners(orderProgramCorners(permutation))).toBe(true)
    }
    expect(validCorners(orderProgramCorners([points[0]!,points[0]!,points[2]!,points[3]!]))).toBe(false)
  })
  it('öğle arası sayımından yalnız bütün günlerde boş kalan sütun çıkarılır', () => {
    const cells = [1,2,3,4,5].flatMap((weekday) => [1,2,3].map((period) => ({weekday,period,text:period===2 ? '' : weekday===5 && period===3 ? '' : 'M',confidence:100})))
    const omitted=emptyProgramColumns(cells)
    expect(omitted).toEqual([2])
    expect(programPeriod(2,omitted)).toBeNull()
    expect(programPeriod(3,omitted)).toBe(2)
    expect(programPeriod(3,[])).toBe(3)
  })
  it('iptal edilmiş okuma çalışan veya görsel işlemi başlatmaz', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(readProgramImage(null as unknown as HTMLCanvasElement,10,5,()=>{},controller.signal)).rejects.toThrow('İşlem iptal edildi.')
  })
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
