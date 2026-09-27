// Veri erişimi: tüm sorgular RLS'ten geçer; her rol yalnız görebildiğini alır.
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Dataset, Exam, Outcome, Question, Result, Subject } from './analiz'
import type { Student } from './types'

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
      all<Student>(supabase.from('students').select('id, full_name, class_name, school_no, target_score').is('archived_at', null).order('class_name').order('full_name')),
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
