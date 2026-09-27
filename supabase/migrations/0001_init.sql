-- Buluş Küre Koleji · Rehberlik & Mentörlük — başlangıç şeması (taslak)
-- Kural: her tabloda RLS açık. Yetki gevşetilmez; gerekirse daraltılır.
-- Not: Claude Code bu dosyayı yerel Supabase'de çalıştırıp RLS testleriyle doğrulamalı.

create extension if not exists pgcrypto;

-- ---------- Tipler ----------
create type user_role as enum ('admin','ogretmen','veli','ogrenci');
create type user_status as enum ('pending','approved','rejected');
create type subject_code as enum ('TUR','MAT','FEN','INK','DIN','ING');   -- legacy Deneme Köprüsü ile aynı kodlar
create type match_level as enum ('code_exact','code_inferred','text_exact','text_match','semantic','none');
create type note_visibility as enum ('ogretmen','rehber','veli');
create type meeting_with as enum ('veli','ogrenci','ikisi');
create type report_type as enum ('veli','ogretmen');

-- ---------- Okul ve kullanıcılar ----------
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,          -- Bugün kuralları eşikleri vb.
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  full_name text not null,
  class_name text not null,                           -- '8/A'
  school_no text,
  target_score numeric,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, school_no)
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references schools(id),
  full_name text not null,
  role user_role not null,
  branch text,                                        -- öğretmen: 'Matematik' … 'Rehberlik'
  status user_status not null default 'pending',
  student_id uuid references students(id),            -- rol = ogrenci ise
  -- kayıtta beyan edilen bilgiler (admin onayında eşleştirme için)
  declared jsonb not null default '{}'::jsonb,        -- {childName, childClass, relation, className, schoolNo}
  consent_version text, consent_at timestamptz,       -- KVKK aydınlatma/rıza
  approved_by uuid references profiles(id), approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table parent_links (                           -- veli ↔ öğrenci (bir veli birden çok çocuk)
  parent_id uuid references profiles(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  relation text,
  primary key (parent_id, student_id)
);

-- ---------- Yardımcı fonksiyonlar (RLS) ----------
create or replace function me() returns profiles language sql stable security definer set search_path = public as
$$ select * from profiles where id = auth.uid() $$;

create or replace function is_approved() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and status = 'approved') $$;

create or replace function my_school() returns uuid language sql stable security definer set search_path = public as
$$ select school_id from profiles where id = auth.uid() and status = 'approved' $$;

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and status='approved' and role='admin')
          and coalesce(auth.jwt()->>'aal','aal1') = 'aal2' $$;           -- admin işlemleri MFA ister

create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or exists(select 1 from profiles where id = auth.uid() and status='approved' and role='ogretmen' and branch='Rehberlik') $$;

create or replace function is_teacher() returns boolean language sql stable security definer set search_path = public as
$$ select is_staff() or exists(select 1 from profiles where id = auth.uid() and status='approved' and role='ogretmen') $$;

create or replace function can_see_student(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from students s where s.id = sid and s.school_id = my_school()) and (
     is_teacher()
     or exists(select 1 from parent_links pl join profiles p on p.id = pl.parent_id where pl.parent_id = auth.uid() and pl.student_id = sid and p.status='approved')
     or exists(select 1 from profiles p where p.id = auth.uid() and p.status='approved' and p.role='ogrenci' and p.student_id = sid)
   ) $$;

create or replace function is_parent_of(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from parent_links pl join profiles p on p.id=pl.parent_id where pl.parent_id=auth.uid() and pl.student_id=sid and p.status='approved') $$;

create or replace function is_student_self(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id=auth.uid() and status='approved' and role='ogrenci' and student_id=sid) $$;

-- ---------- Kazanımlar ve denemeler ----------
create table outcomes (                               -- resmî kazanım listesi
  code text primary key,                              -- 'M.8.1.2'
  subject subject_code not null,
  title text not null,                                -- kısa konu adı (veliye gösterilen)
  full_text text
);

create table exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null, publisher text, template_id text,
  exam_date date not null,
  published_at timestamptz, published_by uuid references profiles(id),
  source_pdf_path text,                               -- Storage (özel bucket), 30 gün sonra silinir
  created_at timestamptz not null default now()
);

create table exam_questions (                         -- cevap anahtarı + kazanım eşleşmesi (sınav başına)
  exam_id uuid references exams(id) on delete cascade,
  subject subject_code not null,
  q_no int not null,
  correct_answer text,
  outcome_code text references outcomes(code),
  match match_level not null default 'none',
  primary key (exam_id, subject, q_no)
);

create table exam_results (
  exam_id uuid references exams(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  score numeric,                                      -- PDF'teki resmî puan (yoksa null)
  subjects jsonb not null,                            -- {"TUR":{"d":18,"y":2,"b":0,"net":17.33}, ...}  (1. sayfa = otoriter kaynak)
  answers jsonb,                                      -- {"TUR":"ABCD_ …"} öğrenci cevapları; okunamayan '?' (boş değildir)
  outcomes_ok boolean not null default true,          -- kazanım bölümü okunabildi mi
  created_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);

-- ---------- Görev, görüşme, not, etüt ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject subject_code not null,
  topic text not null,
  outcome_code text references outcomes(code),
  question_count int not null check (question_count between 1 and 500),
  solved int not null default 0 check (solved >= 0),
  due_date date not null,
  weekly boolean not null default false,
  parent_visible boolean not null default true,
  note text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  overdue_notified_at timestamptz,
  spawned_next boolean not null default false
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  with_whom meeting_with not null,
  starts_at timestamptz not null,
  note text,
  reply text check (reply in ('ok','no')),
  replied_by uuid references profiles(id),
  canceled_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  author_id uuid not null references profiles(id),
  visibility note_visibility not null default 'ogretmen',
  body text,                                          -- visibility='rehber' ise NULL; metin body_enc'te (Vault/pgsodium)
  body_enc bytea,
  created_at timestamptz not null default now()
);

create table study_sessions (                          -- Cumartesi etütleri
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  class_name text not null,
  subject subject_code not null,
  topics text[] not null check (array_length(topics,1) >= 1),
  session_date date not null check (extract(isodow from session_date) = 6),   -- yalnız Cumartesi
  slot text not null check (slot in ('09-10','10-11','11-12','12-13')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (school_id, class_name, session_date, slot)
);

-- ---------- Raporlar, bildirimler, kayıtlar ----------
create table reports (
  id uuid primary key default gen_random_uuid(),
  type report_type not null,
  student_id uuid not null references students(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  body jsonb not null,                                -- {genel,guclu,gelisim,oneriler[],mentor,rehber} | {toplanti}
  ai_generated boolean not null default false,
  status text not null default 'draft' check (status in ('draft','sent')),
  sent_to_parent boolean not null default false,
  sent_to_student boolean not null default false,
  created_by uuid not null references profiles(id),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create table report_recipients (                      -- öğretmen raporu alıcıları
  report_id uuid references reports(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (report_id, user_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  link jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  fn text not null, input_tokens int, output_tokens int, cost_usd numeric(10,6),
  ok boolean not null, ms int,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  user_id uuid, action text not null, entity text not null, entity_id uuid, meta jsonb,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table schools enable row level security;
alter table students enable row level security;
alter table profiles enable row level security;
alter table parent_links enable row level security;
alter table outcomes enable row level security;
alter table exams enable row level security;
alter table exam_questions enable row level security;
alter table exam_results enable row level security;
alter table tasks enable row level security;
alter table meetings enable row level security;
alter table notes enable row level security;
alter table study_sessions enable row level security;
alter table reports enable row level security;
alter table report_recipients enable row level security;
alter table notifications enable row level security;
alter table ai_usage enable row level security;
alter table audit_log enable row level security;

create policy schools_read on schools for select using (id = my_school());

create policy profiles_self on profiles for select using (id = auth.uid());
create policy profiles_staff on profiles for select using (is_staff() and school_id = my_school());
create policy profiles_teacher_names on profiles for select using (is_teacher() and school_id = my_school() and role in ('admin','ogretmen'));
create policy profiles_insert_self on profiles for insert with check (id = auth.uid() and status = 'pending' and role <> 'admin');
create policy profiles_admin_update on profiles for update using (is_admin() and school_id = my_school());

create policy students_read on students for select using (can_see_student(id));
create policy students_admin on students for all using (is_admin() and school_id = my_school()) with check (school_id = my_school());

create policy parent_links_read on parent_links for select using (parent_id = auth.uid() or is_staff());
create policy parent_links_admin on parent_links for all using (is_admin()) with check (is_admin());

create policy outcomes_read on outcomes for select using (is_approved());

create policy exams_read on exams for select using (school_id = my_school());
create policy exams_staff on exams for all using (is_staff() and school_id = my_school()) with check (school_id = my_school());
create policy exam_q_read on exam_questions for select using (exists(select 1 from exams e where e.id = exam_id and e.school_id = my_school()));
create policy exam_q_staff on exam_questions for all using (is_staff()) with check (is_staff());
create policy results_read on exam_results for select using (can_see_student(student_id));
create policy results_staff on exam_results for all using (is_staff()) with check (is_staff());

create policy tasks_read on tasks for select using (
  is_teacher() and can_see_student(student_id)
  or is_student_self(student_id)
  or (is_parent_of(student_id) and parent_visible));
create policy tasks_staff on tasks for all using (is_staff() and can_see_student(student_id)) with check (is_staff());
-- öğrenci yalnız ilerleme alanlarını günceller (kolon kısıtı bir trigger ile de zorlanmalı)
create policy tasks_student_progress on tasks for update using (is_student_self(student_id)) with check (is_student_self(student_id));

create policy meetings_read on meetings for select using (
  is_staff() and can_see_student(student_id)
  or (is_parent_of(student_id) and with_whom in ('veli','ikisi'))
  or (is_student_self(student_id) and with_whom in ('ogrenci','ikisi')));
create policy meetings_staff on meetings for all using (is_staff()) with check (is_staff());
create policy meetings_reply on meetings for update using (
  (is_parent_of(student_id) and with_whom in ('veli','ikisi')) or (is_student_self(student_id) and with_whom in ('ogrenci','ikisi')));

create policy notes_read on notes for select using (
  (is_staff() and can_see_student(student_id))
  or (is_teacher() and visibility in ('ogretmen','veli') and can_see_student(student_id))
  or (visibility = 'veli' and is_parent_of(student_id)));
create policy notes_insert on notes for insert with check (
  author_id = auth.uid() and is_teacher() and can_see_student(student_id)
  and (visibility = 'ogretmen' or is_staff()));

create policy sessions_read on study_sessions for select using (school_id = my_school());
create policy sessions_staff on study_sessions for all using (is_staff() and school_id = my_school()) with check (school_id = my_school());

create policy reports_staff on reports for all using (is_staff() and can_see_student(student_id)) with check (is_staff());
create policy reports_parent on reports for select using (type='veli' and status='sent' and sent_to_parent and is_parent_of(student_id));
create policy reports_student on reports for select using (type='veli' and status='sent' and sent_to_student and is_student_self(student_id));
create policy reports_teacher on reports for select using (type='ogretmen' and status='sent' and exists(select 1 from report_recipients r where r.report_id = id and r.user_id = auth.uid()));
create policy recipients_staff on report_recipients for all using (is_staff()) with check (is_staff());
create policy recipients_self on report_recipients for select using (user_id = auth.uid());

create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_mark on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- bildirim ekleme yalnız Edge Function (service_role) ve security definer fonksiyonlarla

create policy ai_usage_admin on ai_usage for select using (is_admin());
create policy audit_admin on audit_log for select using (is_admin());
