import type { Student, DbRole } from './types'
import { calendarInScope } from './calendarScope'
export interface AlbumScope { status: string; audience: string; class_ids: string[]; student_ids: string[]; level: string | null }
export function albumInScope(a: AlbumScope, role: DbRole | undefined, children: Student[]): boolean {
  if (role === 'admin' || role === 'ogretmen') return true
  if (role !== 'veli' && role !== 'ogrenci') return false
  if (a.status !== 'yayinda' && a.status !== 'arsiv') return false
  if (a.audience === 'ogrenci') return children.some(s => a.student_ids.includes(s.id))
  return calendarInScope({ audience: [role], target: a.audience, level: a.level, class_id: null, class_ids: a.class_ids, student_id: null }, role, undefined, children)
}
