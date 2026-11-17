/**
 * BK Akıllı Yoklama: yalnızca istemci/sunucu arasında paylaşılan saf veri kuralları.
 * Güvenlik doğrulaması değildir. Yetki, TOTP, cihaz ve kayıt bütünlüğü sunucuda kontrol edilir.
 * Mevcut attendance tablosunda "geldi" satırı bulunmaz; burada bilinçli olarak korunur.
 */
export type BoardMark = 'geldi' | 'devamsiz' | 'gec' | 'izinli' | 'raporlu'
export type PersistedMark = Exclude<BoardMark, 'geldi'>

export interface BoardStudent {
  id: string
  full_name: string
  class_id: string
}

export interface BoardSelection {
  student_id: string
  status: BoardMark
}

export interface DailyBoardDraft {
  class_id: string
  day: string
  selections: BoardSelection[]
}

export interface AttendanceMutation {
  upserts: { student_id: string; day: string; status: PersistedMark }[]
  deletes: string[]
}

const allowed = new Set<BoardMark>(['geldi', 'devamsiz', 'gec', 'izinli', 'raporlu'])
const dayPattern = /^\d{4}-\d{2}-\d{2}$/

/**
 * Sunucunun güncel sınıf listesini esas alır. Eksik, fazla veya tekrarlı seçim reddedilir.
 * savedIds: aynı gün mevcut attendance satırları (student_id -> attendance.id).
 * Bu plan doğrudan istemciden veritabanına uygulanmamalıdır; atomik sunucu işlemi gerekir.
 */
export function planDailyAttendance(
  draft: DailyBoardDraft,
  students: BoardStudent[],
  savedIds: ReadonlyMap<string, string>,
): AttendanceMutation {
  if (!draft.class_id || !dayPattern.test(draft.day) ||
      Number.isNaN(Date.parse(draft.day + 'T00:00:00Z')) ||
      new Date(draft.day + 'T00:00:00Z').toISOString().slice(0, 10) !== draft.day) {
    throw new Error('Geçersiz sınıf veya tarih.')
  }
  const roster = new Set<string>()
  for (const student of students) {
    if (student.class_id !== draft.class_id || roster.has(student.id)) throw new Error('Sınıf listesi tutarsız.')
    roster.add(student.id)
  }
  if (roster.size === 0 || draft.selections.length !== roster.size) {
    throw new Error('Tüm öğrencilerin yoklaması açıkça işaretlenmelidir.')
  }
  const seen = new Set<string>()
  const upserts: AttendanceMutation['upserts'] = []
  const deletes: string[] = []
  for (const entry of draft.selections) {
    if (!roster.has(entry.student_id) || seen.has(entry.student_id) || !allowed.has(entry.status)) {
      throw new Error('Yoklama seçimleri geçersiz veya tekrarlı.')
    }
    seen.add(entry.student_id)
    if (entry.status === 'geldi') {
      const id = savedIds.get(entry.student_id)
      if (id) deletes.push(id)
    } else {
      upserts.push({ student_id: entry.student_id, day: draft.day, status: entry.status })
    }
  }
  return { upserts, deletes }
}
