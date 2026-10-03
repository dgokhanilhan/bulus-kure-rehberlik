// Veri erişimi: tüm sorgular RLS'ten geçer; her rol yalnız görebildiğini alır.
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Dataset, Exam, Outcome, Question, Result, Subject } from './analiz'
import type { ClassRow, Student } from './types'
import { examTrack, MODULE_DEFAULTS, type Modules } from './roles'
import { useAuth } from '@/auth/AuthProvider'

async function all<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

const STALE = 60_000

/**
 * İki rollü hesabın seçili rolü (0020). Yetki veritabanında rollerin toplamıdır; ekranda yalnız seçili rolün verisi gösterilir.
 * Tek rollü hesapta null (süzme yok).
 */
function useDualMode(): { uid: string; as: 'veli' | 'ogretmen' } | null {
  const { profile, switchable } = useAuth()
  return profile && switchable.length && (profile.role === 'veli' || profile.role === 'ogretmen') ? { uid: profile.id, as: profile.role } : null
}

export function useStudents(enabled = true) {
  const { profile } = useAuth()
  // Veli olarak: yalnız bağlı çocuklar (öğretmen rolü olan velinin okulun tüm öğrencilerini görmesi ekranda istenmez)
  const parentOf = profile?.role === 'veli' ? profile.id : null
  return useQuery({
    queryKey: ['students', parentOf ? 'veli' : 'hepsi'],
    staleTime: STALE,
    enabled,
    queryFn: async () => {
      let q = supabase.from('students').select('id, full_name, class_name, class_id, school_no, target_score, classes(grade)').is('archived_at', null)
      if (parentOf) {
        const { data, error } = await supabase.from('parent_links').select('student_id').eq('parent_id', parentOf)
        if (error) throw new Error(error.message)
        q = q.in('id', (data ?? []).map((r) => r.student_id as string))
      }
      const rows = await all<Student & { classes?: { grade: number } | null }>(q.order('class_name').order('full_name'))
      return rows.map(({ classes, ...s }) => ({ ...s, grade: classes?.grade ?? null }))
    },
  })
}

/** Ailenin (veli/öğrenci) sınav izleri: LGS (8. sınıf) ya da YKS (12. sınıf) uygun çocuk var mı. Yüklenirken açık sayılır. */
export function useFamilyTracks(enabled = true) {
  const students = useStudents(enabled)
  const list = students.data ?? []
  return {
    loading: students.isLoading,
    lgs: students.isLoading || list.some((s) => examTrack(s.grade) === 'lgs'),
    yks: list.some((s) => examTrack(s.grade) === 'yks'),
  }
}

// ---------- Takvim (0015) ----------
export type EventType = 'yazili' | 'deneme' | 'bursluluk' | 'gezi' | 'veli_toplantisi' | 'kulup' | 'tatil' | 'odev_teslim' | 'proje' | 'diger'
export const EVENT_TR: Record<EventType, string> = {
  yazili: 'Yazılı', deneme: 'Deneme', bursluluk: 'Bursluluk sınavı', gezi: 'Gezi', veli_toplantisi: 'Veli toplantısı',
  kulup: 'Kulüp etkinliği', tatil: 'Tatil', odev_teslim: 'Ödev teslimi', proje: 'Proje', diger: 'Diğer',
}
export const EVENT_COLOR: Record<EventType, string> = {
  yazili: '#b5541a', deneme: '#9c36b5', bursluluk: '#c92a2a', gezi: '#2b8a3e', veli_toplantisi: '#3b5bdb',
  kulup: '#0c8599', tatil: '#868e96', odev_teslim: '#1f5f5b', proje: '#e67700', diger: '#495057',
}
export interface CalEvent {
  id: string
  title: string
  description: string | null
  type: EventType
  starts_on: string
  ends_on: string
  starts_at: string | null
  ends_at: string | null
  location: string | null
  target: 'okul' | 'kademe' | 'sinif' | 'ogrenci' | 'ogretmen'
  level: 'ilkokul' | 'ortaokul' | 'lise' | null
  class_id: string | null
  student_id: string | null
  teacher_id: string | null
  course_id: string | null
  audience: ('veli' | 'ogrenci' | 'ogretmen')[]
  created_by: string | null
}
export function useCalendar(from: string, to: string) {
  const dual = useDualMode()
  return useQuery({
    queryKey: ['calendar', from, to],
    select: dual ? (l: CalEvent[]) => l.filter((e) => e.created_by === dual.uid || e.teacher_id === dual.uid || e.audience.includes(dual.as)) : undefined,
    queryFn: () =>
      all<CalEvent>(
        supabase.from('calendar_events').select('id, title, description, type, starts_on, ends_on, starts_at, ends_at, location, target, level, class_id, student_id, teacher_id, course_id, audience, created_by').lte('starts_on', to).gte('ends_on', from).order('starts_on').order('starts_at', { nullsFirst: true }),
      ),
  })
}

// ---------- Ödev (0013) ----------
export type HwStatus = 'bekliyor' | 'yapti' | 'yapmadi' | 'eksik' | 'gelmedi' | 'izinli'
export const HW_TR: Record<HwStatus, string> = { bekliyor: 'Bekliyor', yapti: 'Yaptı', yapmadi: 'Yapmadı', eksik: 'Eksik', gelmedi: 'Gelmedi', izinli: 'İzinli' }
export interface Homework {
  id: string
  class_id: string
  course_id: string
  teacher_id: string | null
  title: string
  description: string | null
  assigned_on: string
  due_on: string | null
  created_at: string
}
export function useHomework() {
  return useQuery({
    queryKey: ['homework'],
    queryFn: () => all<Homework>(supabase.from('homework').select('id, class_id, course_id, teacher_id, title, description, assigned_on, due_on, created_at').order('due_on', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).limit(500)),
  })
}
export interface HwRow {
  homework_id: string
  student_id: string
  status: HwStatus
  note: string | null
  checked_at: string | null
}
/** Ödevin öğrenci satırları (öğretmen) ya da bir öğrencinin bütün ödev satırları (veli/öğrenci). */
export function useHomeworkRows(f: { homework?: string | null; student?: string | null }) {
  return useQuery({
    queryKey: ['homework_students', f.homework ?? '', f.student ?? ''],
    enabled: !!(f.homework || f.student),
    queryFn: () => {
      let q = supabase.from('homework_students').select('homework_id, student_id, status, note, checked_at')
      if (f.homework) q = q.eq('homework_id', f.homework)
      if (f.student) q = q.eq('student_id', f.student)
      return all<HwRow>(q)
    },
  })
}
/** Ödev bölümündeki toplu durumlar (liste kartlarındaki "kontrol edildi" sayısı için). */
export function useHomeworkProgress(enabled: boolean) {
  return useQuery({
    queryKey: ['homework_students', 'progress'],
    enabled,
    queryFn: () => all<{ homework_id: string; status: HwStatus }>(supabase.from('homework_students').select('homework_id, status').limit(20000)),
  })
}

// ---------- Yönetim Merkezi (0011–0012) ----------
/** Okul ayarları (anahtar → değer). Yazma yalnız set_settings RPC'siyle. */
export function useSettings() {
  return useQuery({
    queryKey: ['school_settings'],
    staleTime: STALE,
    queryFn: async () => {
      const rows = await all<{ key: string; value: unknown }>(supabase.from('school_settings').select('key, value'))
      return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>
    },
  })
}
/** Modül durumları; yüklenirken hepsi varsayılan (açık) sayılır. */
export function useModules(): Modules {
  const s = useSettings()
  return useMemo(() => {
    const m = { ...MODULE_DEFAULTS }
    for (const k of Object.keys(m) as (keyof Modules)[]) if (typeof s.data?.[`modul.${k}`] === 'boolean') m[k] = s.data[`modul.${k}`] as boolean
    return m
  }, [s.data])
}

export interface AcademicYear {
  id: string
  name: string
  starts: string
  term1_ends: string
  term2_starts: string
  ends: string
  is_active: boolean
}
export function useAcademicYears() {
  return useQuery({
    queryKey: ['academic_years'],
    staleTime: STALE,
    queryFn: () => all<AcademicYear>(supabase.from('academic_years').select('id, name, starts, term1_ends, term2_starts, ends, is_active').order('starts', { ascending: false })),
  })
}

export interface Course {
  id: string
  name: string
  short_name: string
  levels: ('ilkokul' | 'ortaokul' | 'lise')[]
  color: string | null
  active: boolean
  sort: number
}
export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    staleTime: STALE,
    queryFn: () => all<Course>(supabase.from('courses').select('id, name, short_name, levels, color, active, sort').order('sort').order('name')),
  })
}

export interface Assignment {
  id: string
  class_id: string
  course_id: string
  teacher_id: string
}
export function useAssignments() {
  return useQuery({
    queryKey: ['teaching_assignments'],
    staleTime: STALE,
    queryFn: () => all<Assignment>(supabase.from('teaching_assignments').select('id, class_id, course_id, teacher_id')),
  })
}

/** Okulun sınıfları (düzey, şube sırasıyla). */
export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    staleTime: STALE,
    queryFn: () => all<ClassRow>(supabase.from('classes').select('id, name, grade, section, level, homeroom_teacher_id, active').order('grade').order('section')),
  })
}

// ---------- Okul günlüğü (0009): yoklama, ders programı, yemek listesi ----------
export type AttendanceStatus = 'devamsiz' | 'gec' | 'izinli' | 'raporlu'
export const ATT_TR: Record<AttendanceStatus, string> = { devamsiz: 'Gelmedi', gec: 'Geç geldi', izinli: 'İzinli', raporlu: 'Raporlu' }
export interface Attendance {
  id: string
  student_id: string
  day: string
  status: AttendanceStatus
  note: string | null
}
/** Bir öğrencinin bütün kayıtları ya da bir günün kayıtları (RLS: yalnız görebildiklerin). */
export function useAttendance(f: { student?: string; day?: string }) {
  return useQuery({
    queryKey: ['attendance', f.student ?? '', f.day ?? ''],
    enabled: !!(f.student || f.day),
    queryFn: () => {
      let q = supabase.from('attendance').select('id, student_id, day, status, note').order('day', { ascending: false })
      if (f.student) q = q.eq('student_id', f.student)
      if (f.day) q = q.eq('day', f.day)
      return all<Attendance>(q)
    },
  })
}

export interface Lesson {
  id: string
  class_id: string
  weekday: number
  period: number
  subject: string
  teacher_id: string | null
  course_id?: string | null
}
export function useTimetable(classId?: string | null) {
  return useQuery({
    queryKey: ['timetable', classId ?? ''],
    enabled: !!classId,
    queryFn: () => all<Lesson>(supabase.from('timetable').select('id, class_id, weekday, period, subject, teacher_id, course_id').eq('class_id', classId!).order('weekday').order('period')),
  })
}

export interface Bell {
  period: number
  starts: string
  ends: string
  active?: boolean
  label?: string | null
}
export function useBellTimes() {
  return useQuery({
    queryKey: ['bell_times'],
    staleTime: STALE,
    queryFn: () => all<Bell>(supabase.from('bell_times').select('period, starts, ends, active, label').order('period')),
  })
}

export type MealKind = 'kahvalti' | 'ogle' | 'ikindi'
export const MEAL_TR: Record<MealKind, string> = { kahvalti: 'Kahvaltı', ogle: 'Öğle yemeği', ikindi: 'İkindi' }
export interface Meal {
  id: string
  day: string
  meal: MealKind
  items: string
}
export function useMeals(from: string, to: string) {
  return useQuery({
    queryKey: ['meals', from, to],
    queryFn: () => all<Meal>(supabase.from('meals').select('id, day, meal, items').gte('day', from).lte('day', to).order('day')),
  })
}

// ---------- İletişim (0010): duyurular ve mesajlar ----------
export interface Announcement {
  id: string
  title: string
  body: string
  scope: 'okul' | 'kademe' | 'sinif'
  level: 'ilkokul' | 'ortaokul' | 'lise' | null
  class_id: string | null
  audience: ('veli' | 'ogrenci' | 'ogretmen')[]
  created_by: string | null
  author_name: string | null
  created_at: string
}
export function useAnnouncements() {
  const dual = useDualMode()
  return useQuery({
    queryKey: ['announcements'],
    select: dual ? (l: Announcement[]) => l.filter((a) => a.created_by === dual.uid || a.audience.includes(dual.as)) : undefined,
    queryFn: () => all<Announcement>(supabase.from('announcements').select('id, title, body, scope, level, class_id, audience, created_by, author_name, created_at').order('created_at', { ascending: false }).limit(200)),
  })
}

export interface Conversation {
  id: string
  student_id: string
  student_name: string
  parent_id: string
  parent_name: string
  teacher_id: string
  teacher_name: string
  teacher_branch: string | null
  last_at: string
  last_body: string | null
  unread: number
}
/** Yazışmalarım (yönetici: okulun bütün yazışmaları). 30 sn'de bir tazelenir. */
export function useConversations(enabled = true) {
  const dual = useDualMode()
  return useQuery({
    queryKey: ['conversations'],
    enabled,
    // İki rollü hesap: veli olarak yalnız veli sıfatıyla, öğretmen olarak yalnız öğretmen sıfatıyla yazışmalar
    select: dual ? (l: Conversation[]) => l.filter((c) => (dual.as === 'veli' ? c.parent_id : c.teacher_id) === dual.uid) : undefined,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_conversations')
      if (error) throw error
      return (data ?? []) as Conversation[]
    },
  })
}

export interface Message {
  id: string
  sender_id: string | null
  body: string
  created_at: string
  read_at: string | null
}
export function useMessages(conv: string | null) {
  return useQuery({
    queryKey: ['messages', conv ?? ''],
    enabled: !!conv,
    refetchInterval: 10_000,
    queryFn: () => all<Message>(supabase.from('messages').select('id, sender_id, body, created_at, read_at').eq('conversation_id', conv!).order('created_at')),
  })
}

/** Velinin çocuğu için yazışabileceği kişiler (öğretmenler, rehberlik, yönetim) — öğretmen adları da buradan. */
export function useChildContacts(sid?: string) {
  return useQuery({
    queryKey: ['child_contacts', sid ?? ''],
    enabled: !!sid,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('child_contacts', { p_student: sid })
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string; branch: string | null; role: string; subjects: string[]; homeroom: boolean }[]
    },
  })
}

/** Denemeler + cevap anahtarı + kazanımlar + (görülebilen) sonuçlar. */
/** Deneme verisi (LGS). enabled=false iken sorgu hiç çalışmaz (LGS'ye uygun olmayan öğrencide gereksiz yük olmasın). */
export function useDataset(enabled = true) {
  const q = useQuery({
    queryKey: ['dataset'],
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const [exams, questions, outcomes, results] = await Promise.all([
        all<Exam>(supabase.from('exams').select('id, name, publisher, exam_date').not('published_at', 'is', null).order('exam_date')),
        all<Question>(supabase.from('exam_questions').select('exam_id, subject, q_no, correct_answer, outcome_code, match').limit(20000)),
        all<Outcome>(supabase.from('outcomes').select('code, subject, title').order('code')),
        all<Result>(supabase.from('exam_results').select('exam_id, student_id, score, subjects, answers, outcomes_ok, kazanim').limit(20000)),
      ])
      const questionsByExam = new Map<string, Question[]>()
      for (const x of questions) {
        const l = questionsByExam.get(x.exam_id)
        if (l) l.push(x)
        else questionsByExam.set(x.exam_id, [x])
      }
      return { exams, questionsByExam, outcomes, results } satisfies Dataset
    },
  })
  return q
}

export interface Task {
  id: string
  student_id: string
  subject: Subject
  topic: string
  outcome_code: string | null
  question_count: number
  solved: number
  due_date: string
  weekly: boolean
  parent_visible: boolean
  note: string | null
  created_by: string
  created_at: string
  completed_at: string | null
}

export function useTasks(sid?: string) {
  return useQuery({
    queryKey: ['tasks', sid ?? 'all'],
    queryFn: () => {
      let q = supabase.from('tasks').select('*').order('due_date')
      if (sid) q = q.eq('student_id', sid)
      return all<Task>(q)
    },
  })
}

export interface Meeting {
  id: string
  student_id: string
  with_whom: 'veli' | 'ogrenci' | 'ikisi'
  starts_at: string
  note: string | null
  reply: 'ok' | 'no' | null
  canceled_at: string | null
  created_by: string
}

export function useMeetings(sid?: string) {
  return useQuery({
    queryKey: ['meetings', sid ?? 'all'],
    queryFn: () => {
      let q = supabase.from('meetings').select('id, student_id, with_whom, starts_at, note, reply, canceled_at, created_by').is('canceled_at', null).order('starts_at', { ascending: false })
      if (sid) q = q.eq('student_id', sid)
      return all<Meeting>(q)
    },
  })
}

export interface Note {
  id: string
  student_id: string
  author_id: string
  visibility: 'ogretmen' | 'rehber' | 'veli'
  body: string | null
  created_at: string
}

export function useNotes(sid?: string) {
  return useQuery({
    queryKey: ['notes', sid ?? 'all'],
    queryFn: () => {
      let q = supabase.from('notes_view').select('*').order('created_at', { ascending: false })
      if (sid) q = q.eq('student_id', sid)
      return all<Note>(q)
    },
  })
}

export interface PersonLite {
  id: string
  full_name: string
  role: string
  roles?: string[]
  branch: string | null
  student_id: string | null
}

/** Görebildiğim profiller (öğretmen adları; tam yetkilide onaylı herkes). */
export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    staleTime: STALE,
    queryFn: async () =>
      (await all<PersonLite & { profile_roles?: { role: string }[] }>(
        supabase.from('profiles').select('id, full_name, role, branch, student_id, profile_roles!profile_roles_profile_id_fkey(role)').eq('status', 'approved'),
      )).map(({ profile_roles, ...p }) => ({ ...p, roles: (profile_roles ?? []).map((r) => r.role) })),
  })
}

export function useParentLinks(enabled: boolean) {
  return useQuery({
    queryKey: ['parent_links'],
    enabled,
    staleTime: STALE,
    queryFn: () => all<{ parent_id: string; student_id: string }>(supabase.from('parent_links').select('parent_id, student_id')),
  })
}

export function useStudySessions() {
  return useQuery({
    queryKey: ['study_sessions'],
    staleTime: STALE,
    queryFn: () =>
      all<{ id: string; class_name: string; subject: Subject; topics: string[]; session_date: string; slot: string }>(
        supabase.from('study_sessions').select('id, class_name, subject, topics, session_date, slot').order('session_date'),
      ),
  })
}

export function useReports(sid?: string) {
  return useQuery({
    queryKey: ['reports', sid ?? 'all'],
    queryFn: () => {
      let q = supabase.from('reports_view').select('id, type, student_id, exam_id, status, sent_at, updated_at, created_by, sent_to_parent, sent_to_student').order('updated_at', { ascending: false })
      if (sid) q = q.eq('student_id', sid)
      return all<{ id: string; type: 'veli' | 'ogretmen'; student_id: string; exam_id: string; status: 'draft' | 'sent'; sent_at: string | null; updated_at: string; created_by: string; sent_to_parent: boolean; sent_to_student: boolean }>(q)
    },
  })
}

/** Okul ayarları (Bugün kuralları eşikleri). */
export function useSchoolSettings() {
  return useQuery({
    queryKey: ['school'],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('schools').select('settings').maybeSingle()
      if (error) throw error
      return (data?.settings ?? {}) as Record<string, unknown>
    },
  })
}

/** Bir değişiklikten sonra ilgili listeleri ve bildirimleri tazele. */
export function useRefresh() {
  const qc = useQueryClient()
  return useMemo(
    () => (...keys: string[]) => {
      for (const k of [...keys, 'notifications']) qc.invalidateQueries({ queryKey: [k] })
    },
    [qc],
  )
}
