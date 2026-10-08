import { describe, it, expect } from 'vitest'
import { calendarInScope } from '../src/lib/calendarScope'
const event = { audience: ['veli', 'ogrenci'], target: 'sinif', class_ids: ['six'], class_id: 'six', student_id: null, level: null }
const six = [{ id: 'child6', full_name: 'Test', class_name: '6/A', class_id: 'six', school_no: null, grade: 6 }]
const ten = [{ ...six[0]!, id: 'child10', class_id: 'ten', grade: 10 }]
describe('Seçili rolün etkinlik kapsamı', () => {
  it('öğretmen bütün okunabilir etkinlikleri görür; veli yalnız çocuğunun sınıfını görür', () => {
    expect(calendarInScope(event, 'ogretmen', 'dual', ten)).toBe(true)
    expect(calendarInScope(event, 'veli', 'dual', ten)).toBe(false)
    expect(calendarInScope(event, 'veli', 'dual', six)).toBe(true)
    expect(calendarInScope(event, 'veli', 'dual', [])).toBe(false)
  })
  it('çoklu sınıf, eski tek sınıf, kademe, öğrenci ve hedef kitleyi ayrı kontrol eder', () => {
    expect(calendarInScope({ ...event, class_ids: ['ten','six'] }, 'veli', 'dual', ten)).toBe(true)
    expect(calendarInScope({ ...event, class_ids: [] }, 'veli', 'dual', ten)).toBe(false)
    expect(calendarInScope({ ...event, target: 'kademe', level: 'ortaokul' }, 'veli', 'dual', ten)).toBe(false)
    expect(calendarInScope({ ...event, target: 'ogrenci', student_id: 'child6' }, 'veli', 'dual', six)).toBe(true)
    expect(calendarInScope({ ...event, audience: ['ogretmen'], target: 'okul' }, 'veli', 'dual', six)).toBe(false)
  })
})
