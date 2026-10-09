import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { generateSync } from 'otplib'

const url = process.env.VITE_SUPABASE_URL!
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const opts = { auth: { persistSession: false, autoRefreshToken: false } }

export const anon = () => createClient(url, anonKey, opts)
export const service = () => createClient(url, serviceKey, opts)

// Seed'deki demo hesaplar (yalnız yerel)
export const ACCOUNTS = {
  admin: ['admin@buluskure.k12.tr', 'Admin123!'],
  rehber: ['rehber@buluskure.k12.tr', 'Rehber123!'],
  matematik: ['matematik@buluskure.k12.tr', 'Mat12345!'],
  fen: ['fen@buluskure.k12.tr', 'Fen12345!'],
  veliElif: ['ayse.yildiz@ornek.com', 'Veli1234!'],
  veliKerem: ['kerem.veli@ornek.com', 'Veli1234!'],
  elif: ['elif.yildiz@ornek.com', 'Ogrenci123!'],
  bekleyenMert: ['mert.demir@ornek.com', 'Ogrenci123!'],
} as const

// Seed'deki sabit öğrenci kimlikleri
export const sid = (no: string) => `00000000-0000-4000-8001-${no.padStart(12, '0')}`
export const ELIF = sid('1184')
export const AYSE_CELIK = sid('1185')
export const KEREM = sid('1201')

export async function signIn(who: keyof typeof ACCOUNTS): Promise<SupabaseClient> {
  const [email, password] = ACCOUNTS[who]
  const c = anon()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`${who} giriş yapamadı: ${error.message}`)
  return c
}

/**
 * Admin'i aal2'ye yükseltir. Testin tekrarlanabilir olması için admin'in mevcut
 * TOTP faktörleri service_role ile silinir ve yeni faktör kurulur (yalnız yerel).
 */
export async function signInAdminAal2(): Promise<SupabaseClient> {
  const c = await signIn('admin')
  const { data: u } = await c.auth.getUser()
  const svc = service()
  const { data: list } = await svc.auth.admin.mfa.listFactors({ userId: u.user!.id })
  for (const f of list?.factors ?? []) await svc.auth.admin.mfa.deleteFactor({ userId: u.user!.id, id: f.id })

  const { data: enrolled, error } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: `test-${Date.now()}` })
  if (error) throw error
  const code = generateSync({ secret: enrolled.totp.secret })
  const { error: vErr } = await c.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code })
  if (vErr) throw vErr
  return c
}

/** Rastgele e-postayla yeni (onay bekleyen) kayıt açar. */
export async function register(meta: Record<string, unknown>, password = 'Deneme123!') {
  const c = anon()
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ornek.com`
  const res = await c.auth.signUp({ email, password, options: { data: { school: 'bulus-kure', consent_version: 'v1', ...meta } } })
  return { client: c, email, password, ...res }
}

export const ids = (rows: { id?: string; student_id?: string }[] | null) => (rows ?? []).map((r) => r.id ?? r.student_id)

export const REHBER_ID = '00000000-0000-4000-8003-000000000002'

/** O anki tüm bildirim kimlikleri (DB saatine bağımlı olmadan "sonradan gelenleri" bulmak için). */
export async function snap(): Promise<Set<string>> {
  const { data } = await service().from('notifications').select('id')
  return new Set((data ?? []).map((n) => n.id as string))
}

/** Kullanıcının `before` anından sonra aldığı bildirim metinleri (eskiden yeniye). */
export async function notesOf(c: SupabaseClient, before: Set<string>) {
  const { data } = await c.from('notifications').select('id, text').order('created_at').order('id')
  return (data ?? []).filter((n) => !before.has(n.id)).map((n) => n.text as string)
}

export const inDays = (n: number) => {
  const d = new Date(Date.now() + 3 * 3600_000) // Türkiye saati
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

import { SUBJECTS, type Dataset, type Exam, type Outcome, type Question, type Result } from '../src/lib/analiz'
/** Uygulamanın useDataset() sorgusuyla aynı veri (service_role ile). */
export async function loadDataset(): Promise<Dataset> {
  const svc = service()
  const [e, q, o, r] = await Promise.all([
    svc.from('exams').select('id, name, publisher, exam_date').not('published_at', 'is', null).order('exam_date'),
    svc.from('exam_questions').select('exam_id, subject, q_no, correct_answer, outcome_code, match').limit(20000),
    svc.from('outcomes').select('code, subject, title').order('code'),
    svc.from('exam_results').select('exam_id, student_id, score, subjects, answers, outcomes_ok, kazanim').limit(20000),
  ])
  const questionsByExam = new Map<string, Question[]>()
  for (const x of (q.data ?? []) as Question[]) questionsByExam.set(x.exam_id, [...(questionsByExam.get(x.exam_id) ?? []), x])
  return { subjects: SUBJECTS, exams: e.data as Exam[], questionsByExam, outcomes: o.data as Outcome[], results: r.data as Result[] }
}

export const MOCK = `http://localhost:${process.env.SAHTE_DEEPSEEK_PORT ?? 54399}`
export const mockLog = async () => (await (await fetch(`${MOCK}/__log`)).json()) as { body: { messages: { content: string }[]; thinking?: { type: string } } }[]
export const mockMode = (mode: 'ok' | 'bad' | 'down') => fetch(`${MOCK}/__mode`, { method: 'POST', body: JSON.stringify({ mode }) })
export const mockReset = () => fetch(`${MOCK}/__reset`, { method: 'POST' })
