import { createClient } from '@supabase/supabase-js'

/** Sunucu saati (Docker VM saati bilgisayarınkinden farklı olabilir). */
export async function serverNow(url: string, key: string) {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } })
  const d = res.headers.get('date')
  return new Date((d ? Date.parse(d) : Date.now()) - 2000).toISOString()
}

/**
 * Testlerin açtığı hesapları (test-… / e2e-… e-postaları) ve bu sürede oluşan
 * öğrenci kayıtlarını, bildirimleri siler. Yalnız yerel veritabanında çalışır.
 */
export async function cleanupTestData(url: string, serviceKey: string, since: string) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('Temizlik yalnız yerel veritabanında çalışır.')
  const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profs } = await svc.from('profiles').select('id, student_id').or('email.like.test-%,email.like.e2e-%')
  for (const p of profs ?? []) await svc.auth.admin.deleteUser(p.id)
  const created = (profs ?? []).map((p) => p.student_id).filter(Boolean) as string[]
  if (created.length) await svc.from('students').delete().in('id', created).gte('created_at', since)
  await svc.from('study_sessions').delete().gte('created_at', since)
  // Testlerin yazdığı raporlar ve yapay zekâ kullanım kayıtları
  await svc.from('reports').delete().gte('updated_at', since)
  await svc.from('ai_usage').delete().gte('created_at', since)
  // Testlerin yayınladığı denemeler (sonuçlarıyla) ve açtığı öğrenci kayıtları
  await svc.from('exams').delete().gte('created_at', since)
  await svc.from('students').delete().gte('created_at', since)
  // Testlerin oluşturduğu görev, görüşme ve notlar; günlük işin işaretledikleri geri alınır.
  for (const t of ['tasks', 'meetings', 'notes'] as const) await svc.from(t).delete().gte('created_at', since)
  await svc.from('tasks').update({ overdue_notified_at: null }).gte('overdue_notified_at', since)
  await svc.from('notifications').delete().gte('created_at', since)
}
