// Veri erişimi: tüm sorgular RLS'ten geçer; her rol yalnız görebildiğini alır.
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Dataset, Exam, Outcome, Question, Result, Subject } from './analiz'
import type { ClassRow, Student } from './types'

async function all<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

const STALE = 60_000

export function useStudents() {
  return useQuery({
    queryKey: ['students'],
    staleTime: STALE,
    queryFn: () =>
      all<Student>(supabase.from('students').select('id, full_name, class_name, class_id, school_no, target_score').is('archived_at', null).order('class_name').order('full_name')),
  })
}

/** Okulun sınıfları (düzey, şube sırasıyla). */
export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    staleTime: STALE,
    queryFn: () => all<ClassRow>(supabase.from('classes').select('id, name, grade, section, level, homeroom_teacher_id').order('grade').order('section')),
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
}
export function useTimetable(classId?: string | null) {
  return useQuery({
    queryKey: ['timetable', classId ?? ''],
    enabled: !!classId,
    queryFn: () => all<Lesson>(supabase.from('timetable').select('id, class_id, weekday, period, subject, teacher_id').eq('class_id', classId!).order('weekday').order('period')),
  })
}

export interface Bell {
  period: number
  starts: string
  ends: string
}
export function useBellTimes() {
  return useQuery({
    queryKey: ['bell_times'],
    staleTime: STALE,
    queryFn: () => all<Bell>(supabase.from('bell_times').select('period, starts, ends').order('period')),
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
  return useQuery({
    queryKey: ['announcements'],
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
  return useQuery({
    queryKey: ['conversations'],
    enabled,
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
export function useDataset() {
  const q = useQuery({
    queryKey: ['dataset'],
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
  branch: string | null
  student_id: string | null
}

/** Görebildiğim profiller (öğretmen adları; tam yetkilide onaylı herkes). */
export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    staleTime: STALE,
    queryFn: () => all<PersonLite>(supabase.from('profiles').select('id, full_name, role, branch, student_id').eq('status', 'approved')),
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
