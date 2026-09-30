// supabase/seed.sql üretir: prototipteki (prototype/prototip.html) örnek verinin aynısı.
// Gerçek öğrenci verisi YOKTUR; isimler prototipteki uydurma isimlerdir.
// Demo şifreleri yalnız YEREL geliştirme içindir; staging/production'a bu seed uygulanmaz.
import { writeFileSync } from 'node:fs'

// ---- prototipten birebir taşınan deterministik üreteç ----
function mulberry(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s) {
  let h = 2166136261
  for (const c of String(s)) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const DERS = [
  { k: 'tr', code: 'TUR', q: 20, w: 4 },
  { k: 'mat', code: 'MAT', q: 20, w: 4 },
  { k: 'fen', code: 'FEN', q: 20, w: 4 },
  { k: 'ink', code: 'INK', q: 10, w: 1 },
  { k: 'din', code: 'DIN', q: 10, w: 1 },
  { k: 'ing', code: 'ING', q: 10, w: 1 },
]
const KONU = {
  tr: [['T.8.3.3', 'Paragrafta ana düşünce'], ['T.8.3.10', 'Söz sanatları'], ['T.8.4.1', 'Fiilimsiler'], ['T.8.4.3', 'Cümlenin ögeleri'], ['T.8.4.9', 'Yazım ve noktalama'], ['T.8.3.30', 'Görsel okuma ve grafik']],
  mat: [['M.8.1.1', 'Çarpanlar ve katlar'], ['M.8.1.2', 'Üslü ifadeler'], ['M.8.1.3', 'Kareköklü ifadeler'], ['M.8.1.4', 'Veri analizi'], ['M.8.1.5', 'Olasılık'], ['M.8.2.1', 'Cebirsel ifadeler'], ['M.8.2.2', 'Doğrusal denklemler'], ['M.8.3.1', 'Üçgenler']],
  fen: [['F.8.1', 'Mevsimler ve iklim'], ['F.8.2', 'DNA ve genetik kod'], ['F.8.3', 'Basınç'], ['F.8.4', 'Madde ve endüstri'], ['F.8.5', 'Basit makineler'], ['F.8.6', 'Enerji dönüşümleri']],
  ink: [['İ.8.1', 'Bir kahraman doğuyor'], ['İ.8.2', 'Millî uyanış'], ['İ.8.3', 'Ya istiklal ya ölüm'], ['İ.8.4', 'Atatürkçülük']],
  din: [['D.8.1', 'Kader inancı'], ['D.8.2', 'Zekât ve sadaka'], ['D.8.3', 'Din ve hayat']],
  ing: [['E8.1', 'Friendship'], ['E8.2', 'Teen Life'], ['E8.3', 'In the Kitchen'], ['E8.4', 'On the Phone']],
}
const STU = [
  ['Elif Yıldız', '8/A', '1184', 'elif'], ['Ayşe Çelik', '8/A', '1185'], ['Deniz Arslan', '8/A', '1186', 'high'], ['Zeynep Kaya', '8/A', '1187', 'absent'], ['Burak Şahin', '8/A', '1188'], ['Ece Aydemir', '8/A', '1189'], ['Kaan Polat', '8/A', '1190'],
  ['Kerem Aydın', '8/B', '1201', 'kerem'], ['Mert Demir', '8/B', '1202', 'rise'], ['Selin Kurt', '8/B', '1203'], ['Emre Yılmaz', '8/B', '1204'], ['Ali Koç', '8/B', '1205', 'low'], ['Nehir Aksoy', '8/B', '1206'], ['Yusuf Erdem', '8/B', '1207'],
  ['Can Öztürk', '8/C', '1220', 'nokz'], ['Zehra Kaya', '8/C', '1221'], ['Defne Güneş', '8/C', '1222'], ['Ömer Çınar', '8/C', '1223'], ['İrem Tekin', '8/C', '1224'], ['Arda Bulut', '8/C', '1225'], ['Melis Karaca', '8/C', '1226'], ['Efe Şen', '8/C', '1227'],
].map(([name, cls, no, persona]) => ({ name, cls, no, persona: persona || null }))
const EXAMS = [['TG-1', 'Hız Yayınları', '2026-08-08'], ['TG-2', 'ATA Yayınları', '2026-08-22'], ['TG-3', 'Hız Yayınları', '2026-09-05'], ['TG-4', 'TÖDER', '2026-09-12'], ['TG-5', 'Hız Yayınları', '2026-09-19']]

function makeKey(e, noKz) {
  const key = {}
  for (const d of DERS) {
    const n = KONU[d.k].length
    key[d.k] = Array.from({ length: d.q }, (_, i) => (noKz ? { k: null, c: 'none' } : { k: (i + e) % n, c: (i * 7 + e) % 13 === 0 ? 'guess' : 'exact' }))
  }
  return key
}
function genAnswers(st, e, key) {
  const r = mulberry(hash(st.name) + e * 977)
  const a = {}
  const p0 = st.persona
  const base = p0 === 'high' ? 0.94 : p0 === 'low' ? 0.36 : p0 === 'rise' ? 0.52 + e * 0.06 : p0 === 'kerem' ? 0.72 : p0 === 'elif' ? 0.76 : 0.55 + (hash(st.name) % 25) / 100
  for (const d of DERS) {
    let p = base + ((hash(st.name + d.k) % 11) - 5) / 100 + (p0 ? 0 : e * 0.008)
    if (p0 === 'elif' && d.k === 'mat') p = [0.72, 0.78, 0.74, 0.62, 0.5, 0.56][e] ?? 0.56
    p = Math.max(0.15, Math.min(0.985, p))
    a[d.k] = key[d.k]
      .map((q) => {
        if (p0 === 'elif' && d.k === 'mat' && q.k === 1 && e >= 2) return 'y'
        if (p0 === 'elif' && d.k === 'mat' && q.k === 2 && e >= 3) return 'y'
        if (p0 === 'kerem' && d.k === 'fen' && q.k === 2 && [0, 2, 4, 5].includes(e)) return 'y'
        const x = r()
        if (x < p) return 'd'
        return r() < 0.72 ? 'y' : 'b'
      })
      .join('')
  }
  return a
}

// ---- SQL yardımcıları ----
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const j = (o) => `${q(JSON.stringify(o))}::jsonb`
const r2 = (n) => Math.round(n * 100) / 100
const LETTERS = 'ABCD'
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const sid = (no) => `00000000-0000-4000-8001-${String(no).padStart(12, '0')}`
const eid = (i) => `00000000-0000-4000-8002-${String(i).padStart(12, '0')}`
const uidOf = (i) => `00000000-0000-4000-8003-${String(i).padStart(12, '0')}`

const out = []
out.push(`-- OTOMATİK ÜRETİLDİ — scripts/gen-seed.mjs. Elle düzenleme; \`npm run seed:gen\`.
-- Yalnız YEREL geliştirme içindir. Uydurma isimler; demo şifreler. Staging/production'a uygulanmaz.
begin;
insert into schools (id, name, slug, settings) values (${q(SCHOOL)}, 'Buluş Küre Koleji', 'bulus-kure', '{}'::jsonb);
`)

// Kazanımlar
const oc = []
for (const d of DERS) for (const [code, title] of KONU[d.k]) oc.push(`(${q(code)}, '${d.code}', ${q(title)})`)
// Resmî katalogda zaten olan kodlar korunur (0004 migration); yalnız örnek kodlar eklenir.
out.push(`insert into outcomes (code, subject, title) values\n  ${oc.join(',\n  ')}\non conflict (code) do nothing;\n`)

// Sınıflar (8'ler deneme analizi için; diğer kademelerden birer boş örnek sınıf)
const CLASSES = [...new Set(STU.map((s) => s.cls)), '3/A', '6/A', '10/A']
out.push(`insert into classes (school_id, grade, section) values\n  ${CLASSES.map((c) => `(${q(SCHOOL)}, ${c.split('/')[0]}, ${q(c.split('/')[1])})`).join(',\n  ')};\n`)

// Öğrenciler
out.push(`insert into students (id, school_id, full_name, class_name, school_no, target_score) values\n  ${STU.map((s) => `(${q(sid(s.no))}, ${q(SCHOOL)}, ${q(s.name)}, ${q(s.cls)}, ${q(s.no)}, 450)`).join(',\n  ')};\n`)

// Denemeler, cevap anahtarı, sonuçlar
EXAMS.forEach(([name, pub, date], e) => {
  const key = makeKey(e, e === 1)
  const ex = eid(e + 1)
  out.push(`insert into exams (id, school_id, name, publisher, exam_date, published_at) values (${q(ex)}, ${q(SCHOOL)}, ${q(name)}, ${q(pub)}, ${q(date)}, ${q(date + ' 18:00+03')});`)
  const rk = mulberry(hash(name) + 17)
  const correct = {}
  const qs = []
  for (const d of DERS) {
    correct[d.k] = key[d.k].map(() => LETTERS[Math.floor(rk() * 4)])
    key[d.k].forEach((kq, i) => {
      const code = kq.k === null ? null : KONU[d.k][kq.k][0]
      const match = kq.k === null ? 'none' : kq.c === 'guess' ? 'semantic' : 'code_exact'
      qs.push(`(${q(ex)}, '${d.code}', ${i + 1}, ${q(correct[d.k][i])}, ${q(code)}, '${match}')`)
    })
  }
  out.push(`insert into exam_questions (exam_id, subject, q_no, correct_answer, outcome_code, match) values\n  ${qs.join(',\n  ')};`)
  const rows = []
  for (const st of STU) {
    if (st.persona === 'absent' && e >= 3) continue
    const a = genAnswers(st, e, key)
    const subjects = {}
    const answers = {}
    let wnet = 0
    for (const d of DERS) {
      const s = a[d.k]
      const D = [...s].filter((c) => c === 'd').length
      const Y = [...s].filter((c) => c === 'y').length
      const B = [...s].filter((c) => c === 'b').length
      const net = D - Y / 3
      subjects[d.code] = { d: D, y: Y, b: B, net: r2(net) }
      wnet += net * d.w
      // Harf cevaplar: doğru → anahtar, yanlış → başka şık, boş → '_'
      answers[d.code] = [...s].map((c, i) => (c === 'd' ? correct[d.k][i] : c === 'b' ? '_' : LETTERS[(LETTERS.indexOf(correct[d.k][i]) + 1 + (i % 3)) % 4])).join('')
    }
    // Örnek puan: prototipteki gösterim formülü. Gerçekte puan PDF'ten okunur; burada örnek veridir.
    const score = r2(100 + (wnet / 270) * 400)
    rows.push(`(${q(ex)}, ${q(sid(st.no))}, ${score}, ${j(subjects)}, ${j(answers)}, ${st.persona === 'nokz' ? 'false' : 'true'})`)
  }
  out.push(`insert into exam_results (exam_id, student_id, score, subjects, answers, outcomes_ok) values\n  ${rows.join(',\n  ')};\n`)
})

// Kullanıcılar: auth.users'a eklemek profiles trigger'ını çalıştırır (hepsi pending gelir),
// sonra rol/durum burada düzeltilir.
const USERS = [
  { email: 'admin@buluskure.k12.tr', pass: 'Admin123!', name: 'Okul Yöneticisi', role: 'ogretmen', branch: 'Rehberlik', final: 'admin' },
  { email: 'rehber@buluskure.k12.tr', pass: 'Rehber123!', name: 'Selin Aksoy', role: 'ogretmen', branch: 'Rehberlik' },
  { email: 'matematik@buluskure.k12.tr', pass: 'Mat12345!', name: 'Murat Kaya', role: 'ogretmen', branch: 'Matematik' },
  { email: 'fen@buluskure.k12.tr', pass: 'Fen12345!', name: 'Esra Demir', role: 'ogretmen', branch: 'Fen Bilimleri' },
  { email: 'turkce@buluskure.k12.tr', pass: 'Turkce123!', name: 'Hakan Oral', role: 'ogretmen', branch: 'Türkçe' },
  { email: 'ayse.yildiz@ornek.com', pass: 'Veli1234!', name: 'Ayşe Yıldız', role: 'veli', declared: { childName: 'Elif Yıldız', childClass: '8/A', relation: 'Anne' }, child: '1184' },
  { email: 'elif.yildiz@ornek.com', pass: 'Ogrenci123!', name: 'Elif Yıldız', role: 'ogrenci', declared: { className: '8/A', schoolNo: '1184' }, student: '1184' },
  { email: 'kerem.veli@ornek.com', pass: 'Veli1234!', name: 'Hasan Aydın', role: 'veli', declared: { childName: 'Kerem Aydın', childClass: '8/B', relation: 'Baba' }, child: '1201' },
  // onay bekleyenler
  { email: 'mert.demir@ornek.com', pass: 'Ogrenci123!', name: 'Mert Demir', role: 'ogrenci', declared: { className: '8/B', schoolNo: '1202' }, pending: '5 hours' },
  { email: 'fatma.kaya@ornek.com', pass: 'Veli1234!', name: 'Fatma Kaya', role: 'veli', declared: { childName: 'Zeynep Kaya', childClass: '8/A', relation: 'Anne' }, pending: '3 hours' },
  { email: 'ingilizce@buluskure.k12.tr', pass: 'Ing12345!', name: 'Deniz Er', role: 'ogretmen', branch: 'İngilizce', pending: '1 hour' },
]
USERS.forEach((u, i) => (u.id = uidOf(i + 1)))
const byEmail = Object.fromEntries(USERS.map((u) => [u.email, u]))

for (const u of USERS) {
  const meta = { full_name: u.name, role: u.role, school: 'bulus-kure', ...(u.branch ? { branch: u.branch } : {}), ...(u.declared ? { declared: u.declared } : {}) }
  const created = u.pending ? `now() - interval '${u.pending}'` : `now() - interval '20 days'`
  out.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated', ${q(u.email)}, extensions.crypt(${q(u.pass)}, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, ${j(meta)}, ${created}, ${created}, '', '', '', '', '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), ${q(u.id)}, ${q(u.id)}, ${j({ sub: u.id, email: u.email, email_verified: true })}, 'email', now(), now(), now());
update profiles set created_at = ${created} where id = ${q(u.id)};`)
}
// Bekleyen kayıtlar için oluşan admin bildirimleri de dahil, seed bildirimlerini temizle (henüz admin onaylı değildi).
out.push(`delete from notifications;`)

const approved = USERS.filter((u) => !u.pending)
out.push(`update profiles set status = 'approved', approved_at = now() - interval '19 days' where id in (${approved.map((u) => q(u.id)).join(', ')});`)
out.push(`update profiles set role = 'admin', branch = null where id = ${q(byEmail['admin@buluskure.k12.tr'].id)};`)
for (const u of approved) {
  if (u.student) out.push(`update profiles set student_id = ${q(sid(u.student))} where id = ${q(u.id)};`)
  if (u.child) out.push(`insert into parent_links (parent_id, student_id, relation) values (${q(u.id)}, ${q(sid(u.child))}, ${q(u.declared.relation)});`)
}

const admin = byEmail['admin@buluskure.k12.tr'].id
const reh = byEmail['rehber@buluskure.k12.tr'].id
const mat = byEmail['matematik@buluskure.k12.tr'].id

// Görevler, görüşmeler, notlar (prototiple aynı; tarihler bugüne göre)
const nextDow = (isodow) => `(current_date + ((${isodow} - extract(isodow from current_date)::int + 6) % 7 + 1))`
out.push(`insert into tasks (student_id, subject, topic, outcome_code, question_count, solved, due_date, weekly, parent_visible, note, created_by, created_at, completed_at) values
  (${q(sid('1184'))}, 'MAT', 'Üslü ifadeler', 'M.8.1.2', 20, 12, current_date + 3, false, true, null, ${q(reh)}, now() - interval '2 days', null),
  (${q(sid('1184'))}, 'MAT', 'Kareköklü ifadeler', 'M.8.1.3', 15, 0, current_date + 6, true, true, 'Önce konu özetini oku.', ${q(reh)}, now() - interval '1 day', null),
  (${q(sid('1185'))}, 'TUR', 'Paragrafta ana düşünce', 'T.8.3.3', 40, 22, current_date - 2, false, true, null, ${q(reh)}, now() - interval '6 days', null),
  (${q(sid('1201'))}, 'FEN', 'Basınç', 'F.8.3', 25, 25, current_date - 1, false, true, null, ${q(reh)}, now() - interval '7 days', now() - interval '2 days');

insert into meetings (student_id, with_whom, starts_at, note, created_by, created_at) values
  (${q(sid('1201'))}, 'veli', (${nextDow(2)} + time '14:10') at time zone 'Europe/Istanbul', 'Fen Bilimleri takibi', ${q(reh)}, now() - interval '1 day'),
  (${q(sid('1184'))}, 'ogrenci', (${nextDow(3)} + time '12:30') at time zone 'Europe/Istanbul', 'Matematik planı', ${q(reh)}, now() - interval '1 day');

insert into notes (student_id, author_id, visibility, body, created_at) values
  (${q(sid('1184'))}, ${q(mat)}, 'ogretmen', 'Derste konuyu anlıyor; denemede işlem hatası yapıyor olabilir.', now() - interval '4 days'),
  -- Aşağıdaki iki not RLS testleri için: rehber-gizli ve veli görünür.
  -- Rehber notu trigger ile şifrelenir (anahtar Vault'ta); body sütunu NULL kalır.
  (${q(sid('1184'))}, ${q(reh)}, 'rehber', 'Rehberlik görüşmesi: aile içi durum takip edilecek.', now() - interval '3 days'),
  (${q(sid('1184'))}, ${q(reh)}, 'veli', 'Bu hafta matematik çalışma planına iyi uydu.', now() - interval '2 days');
`)

// Örnek kayıtlar trigger'larla bildirim üretti; prototipteki başlangıç durumuna dön:
// yalnız bekleyen kayıtlar için admin bildirimleri.
out.push(`delete from notifications;`)
// Bekleyen kayıtlar için admin bildirimleri (prototipteki gibi)
out.push(`insert into notifications (user_id, text, link, created_at) values
  (${q(admin)}, 'Yeni kayıt onay bekliyor: Mert Demir (Öğrenci)', '{"page":"onaylar"}', now() - interval '5 hours'),
  (${q(admin)}, 'Yeni kayıt onay bekliyor: Fatma Kaya (Veli)', '{"page":"onaylar"}', now() - interval '3 hours'),
  (${q(admin)}, 'Yeni kayıt onay bekliyor: Deniz Er (Branş öğretmeni · İngilizce)', '{"page":"onaylar"}', now() - interval '1 hour');
`)
// Okul günlüğü örneği (0009): zil saatleri, 8/A ders programı, bu haftanın yemek listesi (tarih seed anında hesaplanır).
const BELLS = [['08:30', '09:10'], ['09:20', '10:00'], ['10:10', '10:50'], ['11:00', '11:40'], ['11:50', '12:30'], ['13:20', '14:00'], ['14:10', '14:50'], ['15:00', '15:40']]
out.push(`insert into bell_times (school_id, period, starts, ends) values\n  ${BELLS.map(([a, b], i) => `(${q(SCHOOL)}, ${i + 1}, '${a}', '${b}')`).join(',\n  ')};\n`)
const PROG = [
  ['Türkçe', 'Türkçe', 'Matematik', 'Matematik', 'Fen Bilimleri', 'Fen Bilimleri', 'İngilizce', 'Beden Eğitimi'],
  ['Matematik', 'Matematik', 'T.C. İnkılap Tarihi', 'T.C. İnkılap Tarihi', 'Türkçe', 'Türkçe', 'Din Kültürü', 'Müzik'],
  ['Fen Bilimleri', 'Fen Bilimleri', 'Türkçe', 'İngilizce', 'İngilizce', 'Matematik', 'Görsel Sanatlar', 'Bilişim Teknolojileri'],
  ['Türkçe', 'Matematik', 'Matematik', 'Fen Bilimleri', 'Din Kültürü', 'T.C. İnkılap Tarihi', 'Rehberlik ve Yönlendirme', 'Beden Eğitimi'],
  ['İngilizce', 'Türkçe', 'Fen Bilimleri', 'Matematik', 'Matematik', 'Türkçe', 'Seçmeli', 'Seçmeli'],
]
out.push(`insert into timetable (school_id, class_id, weekday, period, subject) values\n  ${PROG.flatMap((g, d) => g.map((ders, p) => `(${q(SCHOOL)}, (select id from classes where school_id = ${q(SCHOOL)} and name = '8/A'), ${d + 1}, ${p + 1}, ${q(ders)})`)).join(',\n  ')};\n`)
// Ders programında branş öğretmenleri (iletişim: öğretmen yalnız ders verdiği sınıfın velileriyle yazışır)
out.push(`update timetable set teacher_id = (select id from profiles where email = 'matematik@buluskure.k12.tr') where subject = 'Matematik';
update timetable set teacher_id = (select id from profiles where email = 'fen@buluskure.k12.tr') where subject = 'Fen Bilimleri';
update classes set homeroom_teacher_id = (select id from profiles where email = 'rehber@buluskure.k12.tr') where name = '8/A';
`)
// Ödev örneği (0013): 8/A matematik — biri açık, biri süresi geçmiş (kontrol edilmiş)
out.push(`insert into homework (school_id, class_id, course_id, teacher_id, title, description, assigned_on, due_on) values
  (${q(SCHOOL)}, (select id from classes where name = '8/A'), (select id from courses where name = 'Matematik'), (select id from profiles where email = 'matematik@buluskure.k12.tr'),
   'Çarpanlar ve katlar — test 3', 'Kitap s. 42–44, 20 soru.', current_date - 1, current_date + 3),
  (${q(SCHOOL)}, (select id from classes where name = '8/A'), (select id from courses where name = 'Matematik'), (select id from profiles where email = 'matematik@buluskure.k12.tr'),
   'Üslü ifadeler özet', 'Konu özetini deftere çıkar.', current_date - 7, current_date - 2);
update homework_students set status = 'yapti', checked_at = now() where homework_id = (select id from homework where title = 'Üslü ifadeler özet');
update homework_students set status = 'eksik', note = '4. sorudan sonrası eksik.' where homework_id = (select id from homework where title = 'Üslü ifadeler özet')
  and student_id = (select id from students where full_name = 'Burak Şahin');
`)
// Takvim örneği (0015)
out.push(`insert into calendar_events (school_id, title, type, starts_on, ends_on, starts_at, ends_at, location, target, class_id, audience, created_by) values
  (${q(SCHOOL)}, '1. dönem veli toplantısı', 'veli_toplantisi', current_date + 6, current_date + 6, '17:00', '18:30', 'Konferans salonu', 'okul', null, '{veli}', (select id from profiles where email = 'admin@buluskure.k12.tr')),
  (${q(SCHOOL)}, 'Matematik 1. yazılı', 'yazili', current_date + 9, current_date + 9, '10:10', '10:50', null, 'sinif', (select id from classes where name = '8/A'), '{veli,ogrenci,ogretmen}', (select id from profiles where email = 'matematik@buluskure.k12.tr')),
  (${q(SCHOOL)}, 'Cumhuriyet Bayramı', 'tatil', current_date + 20, current_date + 20, null, null, null, 'okul', null, '{veli,ogrenci,ogretmen}', (select id from profiles where email = 'admin@buluskure.k12.tr'));
`)
const YEMEK = ['Mercimek çorbası, tavuk sote, bulgur pilavı, ayran', 'Ezogelin çorbası, etli kuru fasulye, pirinç pilavı, turşu', 'Yayla çorbası, fırın köfte, patates püresi, mevsim salata', 'Domates çorbası, zeytinyağlı taze fasulye, makarna, yoğurt', 'Tarhana çorbası, izmir köfte, şehriyeli pilav, meyve']
out.push(`insert into meals (school_id, day, meal, items) values\n  ${YEMEK.map((y, i) => `(${q(SCHOOL)}, date_trunc('week', current_date)::date + ${i}, 'ogle', ${q(y)})`).join(',\n  ')};\n`)

out.push(`commit;`)

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), out.join('\n'))
console.log(`seed.sql: ${STU.length} öğrenci, ${EXAMS.length} deneme, ${USERS.length} kullanıcı`)
