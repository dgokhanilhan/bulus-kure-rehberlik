import { describe, expect, it } from 'vitest'
import { column, listRows, newList, projectRows, type ListSources } from './schoolLists'
import { listWorkbook } from './listExcel'
const data: ListSources = {
  school: 'Türkçe Okul',
  classes: [
    { id: 'c1', name: '8/A', grade: 8, active: true },
    { id: 'c2', name: '6/A', grade: 6, active: true },
  ],
  students: [
    { id: 's1', name: 'Çağrı Şen', classId: 'c1', className: '8/A', schoolNo: '001' },
    { id: 's2', name: 'İpek Şen', classId: 'c2', className: '6/A', schoolNo: '001' },
  ],
  parents: [
    {
      id: 'p1',
      name: 'Özge Şen',
      phone: '+905551112233',
      email: 'private@example.com',
      contactEmail: null,
      loginEmail: 'login@example.com',
      updatedAt: null,
    },
    { id: 'p2', name: 'Ümit', phone: null, email: null, contactEmail: null, loginEmail: null, updatedAt: null },
  ],
  links: [
    { parentId: 'p1', studentId: 's1', relation: 'anne' },
    { parentId: 'p1', studentId: 's2', relation: 'anne' },
  ],
}
describe('Liste veri izdüşümü', () => {
  it('aynı okul numarasına rağmen öğrencileri birleştirmez; sınıf/öğrenci seçimi kesişir', () => {
    const c = newList('students')
    expect(listRows(data, 'students', c)).toHaveLength(2)
    c.classIds = ['c1']
    expect(listRows(data, 'students', c).map((r) => r.id)).toEqual(['s1'])
    c.studentIds = ['s2']
    expect(listRows(data, 'students', c)).toHaveLength(0)
  })
  it('veli tekilleştirme, çocuk bazlı satırlar ve eksik iletişim', () => {
    const c = newList('parents')
    expect(listRows(data, 'parents', c)).toHaveLength(2)
    c.grouping = 'child'
    expect(listRows(data, 'parents', c)).toHaveLength(3)
    c.classIds = ['c1']
    expect(listRows(data, 'parents', c)).toHaveLength(1)
    c.classIds = []
    c.missingPhone = true
    expect(listRows(data, 'parents', c)[0]?.values.parentName).toBe('Ümit')
  })
  it('seçilmemiş iletişim bilgilerini çıktıya taşımaz; boş sütunu uydurmaz', () => {
    const c = newList('students')
    c.columns.push(column('blank', 'İmza'))
    const rows = listRows(data, 'students', c)
    c.excluded = [rows[0]!.id]
    const result = projectRows(rows, c)
    expect(result).toHaveLength(1)
    expect(result[0]?.[0]).toBe('1')
    expect(result[0]?.at(-1)).toBe('')
    expect(JSON.stringify(result)).not.toContain('private@')
    expect(JSON.stringify(result)).not.toContain('+90555')
  })
  it('Excel gerçek hücreleri, Türkçe metni, baştaki sıfırı ve formül benzeri metni korur', async () => {
    const c = newList('students')
    c.columns = [column('studentName'), column('schoolNo'), column('blank')]
    const b = await listWorkbook(c, [['Çağrı Şen', '001', '=HYPERLINK("https://example.com")']], 'Okul')
    const bytes = await b.xlsx.writeBuffer()
    const loaded = await new (await import('exceljs')).default.Workbook().xlsx.load(bytes)
    const s = loaded.worksheets[0]!
    expect(s.getCell('A4').value).toBe('Çağrı Şen')
    expect(s.getCell('B4').value).toBe('001')
    expect(s.getCell('C4').type).toBe(3)
    expect(s.autoFilter).toBeTruthy()
    expect(s.pageSetup.printTitlesRow).toBe('3:3')
  })
})
