export type DbRole = 'admin' | 'ogretmen' | 'veli' | 'ogrenci'
export type Status = 'pending' | 'approved' | 'rejected'
/** Arayüz rolü: öğretmen, branşına göre rehber ya da branş öğretmenidir. */
export type Role = 'admin' | 'rehber' | 'brans' | 'veli' | 'ogrenci'

export interface Declared {
  childName?: string
  childClass?: string
  relation?: string
  className?: string
  schoolNo?: string
}

export interface Profile {
  id: string
  school_id: string
  full_name: string
  role: DbRole
  branch: string | null
  status: Status
  student_id: string | null
  declared: Declared
  email: string | null
  created_at: string
}

export interface Student {
  id: string
  full_name: string
  class_name: string
  school_no: string | null
  target_score?: number | null
}

export interface Notification {
  id: string
  text: string
  link: { page?: string; sid?: string; tab?: string; report?: string; meeting?: string }
  read_at: string | null
  created_at: string
}
