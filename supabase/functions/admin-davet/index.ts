// admin-davet: yönetici, öğretmen ya da veli hesabı açar (Faz F · 0017); toplu öğretmen aktarımı (Faz H).
// Güvenlik: çağıranın JWT'si + onaylı yönetici + iki adımlı doğrulama (aal2) — is_admin() bunları birlikte denetler.
// Hesap Supabase Auth Admin inviteUserByEmail ile açılır: kişiye şifre belirleme bağlantısı gider, yönetici şifre görmez.
// service_role yalnız burada (Edge Function ortam değişkeni); tarayıcıya çıkmaz.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { cors, json } from '../_shared/ai.ts'

const BRANCHES = ['Sınıf Öğretmeni', 'Okul Öncesi', 'Türkçe', 'Türk Dili ve Edebiyatı', 'Matematik', 'Fen Bilimleri', 'Fizik', 'Kimya', 'Biyoloji', 'Sosyal Bilgiler', 'T.C. İnkılap Tarihi', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'İngilizce', 'Almanca', 'Beden Eğitimi', 'Müzik', 'Görsel Sanatlar', 'Bilişim Teknolojileri', 'Rehberlik']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type Result = { ok: true; user_id: string } | { ok: false; error: string; status: number }
// deno-lint-ignore no-explicit-any
type Body = Record<string, any>
interface Ctx {
  svc: SupabaseClient
  adminId: string
  schoolId: string
  slug: string
  redirectTo?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: u } = await user.auth.getUser()
  if (!u.user) return json({ error: 'Oturum bulunamadı.' }, 401)
  const { data: admin } = await user.rpc('is_admin')
  if (admin !== true) return json({ error: 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir.' }, 403)
  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const b = (await req.json().catch(() => null)) as Body | null
  if (!b || typeof b !== 'object') return json({ error: 'Geçersiz istek.' }, 400)
  const { data: me } = await svc.from('profiles').select('id, school_id').eq('id', u.user.id).single()
  const { data: school } = await svc.from('schools').select('slug').eq('id', me!.school_id).single()
  const ctx: Ctx = {
    svc,
    adminId: u.user.id,
    schoolId: me!.school_id as string,
    slug: school!.slug as string,
    redirectTo: typeof b.redirect_to === 'string' && /^https?:\/\/[^/]+\/?$/.test(b.redirect_to) ? (b.redirect_to as string) : undefined,
  }

  // Daveti yeniden gönder (hesap açılmış ama kişi henüz giriş yapmamış)
  if (b.action === 'resend') {
    if (!UUID.test(b.user_id ?? '')) return json({ error: 'Kullanıcı geçersiz.' }, 400)
    const { data: p } = await svc.from('profiles').select('email, school_id, invited_at').eq('id', b.user_id).single()
    if (!p || p.school_id !== ctx.schoolId || !p.invited_at) return json({ error: 'Davet bulunamadı.' }, 404)
    const { data: au } = await svc.auth.admin.getUserById(b.user_id)
    if (au.user?.last_sign_in_at) return json({ error: 'Bu kişi zaten giriş yapmış; şifre sıfırlama kullanılmalı.' }, 409)
    const { error } = await svc.auth.admin.inviteUserByEmail(p.email!, { redirectTo: ctx.redirectTo })
    if (error) return json({ error: `Davet gönderilemedi: ${error.message}` }, 502)
    await svc.from('audit_log').insert({ user_id: u.user.id, action: 'invite_resend', entity: 'profiles', entity_id: b.user_id, meta: {} })
    return json({ ok: true })
  }

  // Toplu öğretmen daveti (toplu aktarım): satır satır, her satırın sonucu ayrı döner
  if (b.action === 'bulk') {
    const rows: Body[] = Array.isArray(b.rows) ? b.rows.slice(0, 100) : []
    if (!rows.length) return json({ error: 'Aktarılacak satır yok.' }, 400)
    const results: { row: number; email: string; ok: boolean; error?: string }[] = []
    for (const [i, r] of rows.entries()) {
      const res = await inviteOne(ctx, { ...r, role: 'ogretmen' })
      results.push({ row: i + 1, email: String(r?.email ?? ''), ok: res.ok, error: res.ok ? undefined : res.error })
      if (!res.ok && res.status === 429) break // e-posta gönderim sınırı: kalanları deneme
    }
    await svc.from('audit_log').insert({ user_id: u.user.id, action: 'import', entity: 'profiles', entity_id: null, meta: { role: 'ogretmen', ok: results.filter((x) => x.ok).length, total: rows.length } })
    return json({ ok: true, results })
  }

  const res = await inviteOne(ctx, b)
  return res.ok ? json({ ok: true, user_id: res.user_id }) : json({ error: res.error }, res.status)
})

/** Tek davet: doğrulama → davet niyeti → hesap + e-posta → profil tamamlama (öğrenci bağları / ders atamaları). */
async function inviteOne(ctx: Ctx, b: Body): Promise<Result> {
  const { svc } = ctx
  const fail = (error: string, status: number): Result => ({ ok: false, error, status })
  const role = b.role
  const full_name = typeof b.full_name === 'string' ? b.full_name.trim().replace(/\s+/g, ' ') : ''
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  if (role !== 'ogretmen' && role !== 'veli') return fail('Rol öğretmen ya da veli olmalı.', 400)
  if (full_name.length < 3 || full_name.length > 80) return fail('Ad soyad 3–80 karakter olmalı.', 400)
  if (!EMAIL.test(email)) return fail('E-posta geçersiz.', 400)
  if (b.phone && !/^[0-9 +()-]{7,20}$/.test(b.phone)) return fail('Telefon geçersiz.', 400)
  const meta: Record<string, unknown> = { school: ctx.slug, role, full_name }
  let finish: Record<string, unknown> = { phone: b.phone || null }

  if (role === 'ogretmen') {
    if (!BRANCHES.includes(b.branch)) return fail('Branş geçersiz.', 400)
    meta.branch = b.branch
    const assignments = Array.isArray(b.assignments) ? b.assignments.filter((a: Body) => UUID.test(a?.class_id ?? '') && UUID.test(a?.course_id ?? '')) : []
    finish = { ...finish, assignments, homeroom_class_id: UUID.test(b.homeroom_class_id ?? '') ? b.homeroom_class_id : null }
  } else {
    const students = Array.isArray(b.students) ? b.students.filter((s: Body) => UUID.test(s?.student_id ?? '')) : []
    if (!students.length) return fail('Velinin en az bir öğrencisini seç.', 400)
    // Kayıt trigger'ı velide beyan ister: ilk öğrencinin adı ve sınıfı
    const { data: st } = await svc.from('students').select('full_name, class_name, school_id').eq('id', students[0].student_id).single()
    if (!st || st.school_id !== ctx.schoolId) return fail('Öğrenci bulunamadı.', 404)
    meta.declared = { childName: st.full_name, childClass: st.class_name, relation: students[0].relation ?? 'Diğer' }
    finish = { ...finish, students }
  }

  const { data: existing } = await svc.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) return fail('Bu e-postayla bir hesap zaten var.', 409)

  // 1) Davet niyeti (yalnız service_role yazabilir; KVKK onayının ilk girişe ertelenmesi buna bağlı, 0017)
  const { error: ie0 } = await svc.from('invite_intents').upsert({ email, admin_id: ctx.adminId, created_at: new Date().toISOString() })
  if (ie0) return fail(`Davet hazırlanamadı: ${ie0.message}`, 500)
  // 2) Hesap + şifre belirleme bağlantılı davet e-postası
  const { data: inv, error } = await svc.auth.admin.inviteUserByEmail(email, { data: meta, redirectTo: ctx.redirectTo })
  if (error || !inv.user) {
    await svc.from('invite_intents').delete().eq('email', email)
    const m = error?.message ?? ''
    if (/already|registered|exists/i.test(m)) return fail('Bu e-postayla bir hesap zaten var.', 409)
    if (/rate|limit/i.test(m) || error?.status === 429) return fail('E-posta gönderim sınırına ulaşıldı; biraz sonra tekrar dene.', 429)
    return fail(`Davet gönderilemedi: ${m}`, 502)
  }
  // 3) Profil onayı, öğrenci bağları / ders atamaları
  const { error: fe } = await svc.rpc('finish_invite', { p_user: inv.user.id, p_admin: ctx.adminId, p: finish })
  if (fe) {
    // Yarım kalan hesabı geri al (bağlantı çalışmaz; yönetici tekrar deneyebilir)
    await svc.auth.admin.deleteUser(inv.user.id)
    return fail(`Hesap tamamlanamadı: ${fe.message}`, 400)
  }
  return { ok: true, user_id: inv.user.id }
}
