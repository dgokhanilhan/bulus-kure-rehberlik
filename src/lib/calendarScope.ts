import type { Student, DbRole } from './types'
export interface CalendarScope { audience: string[]; target: string; class_id: string | null; class_ids?: string[]; student_id: string | null; level: string | null }

/** RLS hesabın bütün rollerini kapsar; seçili aile ekranı ayrıca daraltılır. */
export function calendarInScope(e: CalendarScope, role: DbRole | undefined, _uid: string | undefined, children: Student[]): boolean {
  if (role === 'admin' || role === 'ogretmen') return true
  if (role !== 'veli' && role !== 'ogrenci') return false
  if (!e.audience.includes(role)) return false
  if (e.target === 'okul') return true
  if (e.target === 'ogretmen') return false
  if (e.target === 'ogrenci') return children.some(s => s.id === e.student_id)
  if (e.target === 'sinif') {
    const ids = e.class_ids?.length ? e.class_ids : [e.class_id]
    return children.some(s => !!s.class_id && ids.includes(s.class_id))
  }
  return children.some(s => s.grade != null && (s.grade <= 4 ? 'ilkokul' : s.grade <= 8 ? 'ortaokul' : 'lise') === e.level)
}
