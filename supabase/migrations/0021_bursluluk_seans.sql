-- Bursluluk 2.0: seanslar, seans × sınıf kontenjanı, takip kodu, başvuranın kendi başvurusunu görüntüleyip düzenlemesi.
-- Yönetici önceden sınav günlerini, seansları ve her seansta her sınıf için kontenjanı tanımlar; başvuran seansını kendisi seçer.
-- Kontenjan tek yerde (başvuru tablosundaki tetikleyici) ve seans × sınıf satırı kilitlenerek denetlenir: aynı anda gelen
-- başvurularda da, düzenlemede de, yöneticinin seans değiştirmesinde de kontenjan aşılamaz.
-- Kontenjanı "bekliyor" ve "onaylandi" doldurur; "reddedildi" ve yeni "iptal" doldurmaz.
-- Eski sınavlar ve başvurular korunur: eski başvuruların seansı boştur ("seans atanmamış").
-- Yalnız ekleme: veri silmez, tablo/sütun düşürmez. (Durum denetimi "iptal"i de kabul edecek şekilde yeniden tanımlanır;
-- admin_add_application yeni seans parametresiyle yeniden tanımlanır.)

-- ---------- Sınav: başvuran düzenlemesi ----------
alter table scholarship_exams add column if not exists self_edit boolean not null default false;
alter table scholarship_exams add column if not exists edit_until date;
alter table scholarship_exams add column if not exists edit_fields text[] not null
  default array['student_name', 'current_school', 'grade', 'parent_name', 'phone', 'email', 'session'];
do $$ begin
  alter table scholarship_exams add constraint sch_exam_edit_until check (edit_until is null or edit_until <= exam_date);
  alter table scholarship_exams add constraint sch_exam_edit_fields
    check (edit_fields <@ array['student_name', 'current_school', 'grade', 'parent_name', 'phone', 'email', 'session']);
exception when duplicate_object then null; end $$;

-- ---------- Seanslar ----------
create table if not exists scholarship_sessions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references scholarship_exams(id) on delete cascade,
  school_id uuid not null references schools(id),
  name text check (name is null or length(btrim(name)) between 1 and 60),
  session_date date not null,
  starts_at time not null,
  ends_at time not null,
  location text check (location is null or length(location) <= 200),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists sch_session_exam on scholarship_sessions (exam_id, session_date, starts_at);
alter table scholarship_sessions enable row level security;

create table if not exists scholarship_session_quotas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references scholarship_sessions(id) on delete cascade,
  grade smallint not null check (grade between 1 and 12),
  capacity int not null check (capacity between 0 and 10000),
  enabled boolean not null default true,
  unique (session_id, grade)
);
alter table scholarship_session_quotas enable row level security;

-- Seansın okulu sınavın okulu; kontenjan satırı yalnız sınavın sınıf seviyeleri için
create or replace function sch_session_before() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select school_id into new.school_id from scholarship_exams where id = new.exam_id;
  new.name := nullif(btrim(coalesce(new.name, '')), '');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sch_session_before on scholarship_sessions;
create trigger sch_session_before before insert or update on scholarship_sessions for each row execute function sch_session_before();

create or replace function sch_quota_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from scholarship_sessions s join scholarship_exams e on e.id = s.exam_id
                 where s.id = new.session_id and new.grade = any(e.grades)) then
    raise exception 'Bu sınıf seviyesi sınavda yok.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists sch_quota_check on scholarship_session_quotas;
create trigger sch_quota_check before insert or update on scholarship_session_quotas for each row execute function sch_quota_check();

drop policy if exists sch_session_admin on scholarship_sessions;
create policy sch_session_admin on scholarship_sessions for all
  using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
drop policy if exists sch_quota_admin on scholarship_session_quotas;
create policy sch_quota_admin on scholarship_session_quotas for all
  using (is_admin() and exists (select 1 from scholarship_sessions s where s.id = session_id and s.school_id = my_school()))
  with check (is_admin() and exists (select 1 from scholarship_sessions s where s.id = session_id and s.school_id = my_school()));
drop policy if exists mod_bursluluk_s on scholarship_sessions;
create policy mod_bursluluk_s on scholarship_sessions as restrictive for all using (is_admin() or module_enabled('bursluluk'));
drop policy if exists mod_bursluluk_q on scholarship_session_quotas;
create policy mod_bursluluk_q on scholarship_session_quotas as restrictive for all using (is_admin() or module_enabled('bursluluk'));
drop trigger if exists audit_sch_sessions on scholarship_sessions;
create trigger audit_sch_sessions after insert or update or delete on scholarship_sessions for each row execute function audit_row();
drop trigger if exists audit_sch_quotas on scholarship_session_quotas;
create trigger audit_sch_quotas after insert or update or delete on scholarship_session_quotas for each row execute function audit_row();

-- ---------- Başvuru: seans, takip kodu, iptal ----------
alter table scholarship_applications add column if not exists session_id uuid references scholarship_sessions(id); -- başvurusu olan seans silinemez (pasif yapılır)
alter table scholarship_applications add column if not exists tracking_code text unique;
alter table scholarship_applications add column if not exists self_edited_at timestamptz;
create index if not exists sch_app_session on scholarship_applications (session_id, grade, status);

alter table scholarship_applications drop constraint if exists scholarship_applications_status_check;
do $$ begin
  alter table scholarship_applications add constraint scholarship_applications_status_check
    check (status in ('bekliyor', 'onaylandi', 'reddedildi', 'iptal'));
exception when duplicate_object then null; end $$;

-- Takip kodu: BK-XXXX-XXXX, 32 harflik alfabe (0/O/1/I yok), kriptografik rastgele; 8 karakter = 40 bit
create or replace function sch_tracking_code() returns text language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); c text := ''; i int;
begin
  for i in 0..7 loop c := c || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return 'BK-' || substr(c, 1, 4) || '-' || substr(c, 5, 4);
end $$;
revoke all on function sch_tracking_code() from public, anon, authenticated;

-- Kontenjan (tek yer): seans × sınıf satırı kilitlenir, sonra sayılır. Yönetici dahil hiçbir yol kontenjanı aşamaz.
create or replace function sch_app_capacity() returns trigger language plpgsql security definer set search_path = public as $$
declare q scholarship_session_quotas; s scholarship_sessions; used int;
begin
  if tg_op = 'INSERT' and new.tracking_code is null then
    loop
      new.tracking_code := sch_tracking_code();
      exit when not exists (select 1 from scholarship_applications where tracking_code = new.tracking_code);
    end loop;
  end if;
  if new.session_id is null or new.status not in ('bekliyor', 'onaylandi') then return new; end if;
  if tg_op = 'UPDATE' and new.session_id is not distinct from old.session_id and new.grade = old.grade
     and old.status in ('bekliyor', 'onaylandi') then
    return new; -- yer değişmedi
  end if;
  select * into s from scholarship_sessions where id = new.session_id;
  if s.id is null or s.exam_id <> new.exam_id then raise exception 'Seans bu sınava ait değil.' using errcode = '22023'; end if;
  select * into q from scholarship_session_quotas where session_id = new.session_id and grade = new.grade for update;
  if q.id is null or not q.enabled then
    raise exception 'Bu seans seçilen sınıf seviyesine açık değil.' using errcode = '22023';
  end if;
  select count(*) into used from scholarship_applications
   where session_id = new.session_id and grade = new.grade and status in ('bekliyor', 'onaylandi') and id <> new.id;
  if used >= q.capacity then raise exception 'Bu seans için kontenjan doldu.' using errcode = '22023'; end if;
  new.session_time := s.starts_at; -- eski ekranlar ve bildirim için
  return new;
end $$;
drop trigger if exists sch_app_capacity on scholarship_applications;
create trigger sch_app_capacity before insert or update on scholarship_applications for each row execute function sch_app_capacity();

-- ---------- Hız sınırı (takip kodu sorgusu, düzenleme, başvuru) ----------
-- IP adresi saklanmaz; okul + IP'nin özeti (sha256) tutulur.
create table if not exists scholarship_rate (
  k text not null,
  at timestamptz not null default now()
);
create index if not exists sch_rate_k on scholarship_rate (k, at);
alter table scholarship_rate enable row level security; -- politika yok: yalnız aşağıdaki fonksiyonlar

create or replace function sch_rate_hit(p_school uuid, p_kind text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = public as $$
declare h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
        ip text := coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip', 'yok');
        v_k text := p_kind || ':' || encode(extensions.digest(p_school::text || btrim(ip), 'sha256'), 'hex');
        n int;
begin
  delete from scholarship_rate r where r.k = v_k and r.at < now() - interval '1 day'; -- yalnız bu anahtarın eski kayıtları
  select count(*) into n from scholarship_rate r where r.k = v_k and r.at > now() - p_window;
  if n >= p_max then raise exception 'Çok fazla deneme yapıldı; biraz sonra tekrar dene.' using errcode = '54000'; end if;
  insert into scholarship_rate (k) values (v_k);
end $$;
revoke all on function sch_rate_hit(uuid, text, int, interval) from public, anon, authenticated;

-- ---------- Herkese açık: açık sınavlar + seanslar + kalan yer ----------
create or replace function sch_sessions_json(p_exam uuid, p_except uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'date', s.session_date, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'location', s.location,
           'grades', (select coalesce(jsonb_agg(jsonb_build_object('grade', q.grade, 'capacity', q.capacity,
                        'remaining', greatest(0, q.capacity - (select count(*) from scholarship_applications a
                            where a.session_id = s.id and a.grade = q.grade and a.status in ('bekliyor', 'onaylandi')
                              and a.id is distinct from p_except)))
                      order by q.grade), '[]'::jsonb)
                      from scholarship_session_quotas q where q.session_id = s.id and q.enabled))
         order by s.session_date, s.starts_at, s.sort_order), '[]'::jsonb)
  from scholarship_sessions s where s.exam_id = p_exam and s.active
$$;
revoke all on function sch_sessions_json(uuid, uuid) from public, anon, authenticated;

create or replace function public_scholarship_exams(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'exam_date', e.exam_date, 'starts_at', e.starts_at,
           'ends_at', e.ends_at, 'grades', e.grades, 'location', e.location, 'description', e.description, 'apply_until', e.apply_until,
           'full', e.quota is not null and (select count(*) from scholarship_applications a where a.exam_id = e.id and a.status in ('bekliyor', 'onaylandi')) >= e.quota,
           'sessions', sch_sessions_json(e.id))
         order by e.exam_date), '[]'::jsonb)
  from scholarship_exams e join schools s on s.id = e.school_id
  where s.slug = p_slug and e.active and e.applications_open
    and (school_setting(s.id, 'modul.bursluluk'))::text::boolean and (school_setting(s.id, 'bursluluk.basvuru_acik'))::text::boolean
    and (now() at time zone 'Europe/Istanbul')::date between e.apply_from and e.apply_until
$$;

-- ---------- Başvuru (seans zorunlu) ----------
create or replace function apply_scholarship(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e scholarship_exams; s schools; ses scholarship_sessions; a scholarship_applications; n int;
  today date := (now() at time zone 'Europe/Istanbul')::date;
  v_name text := btrim(regexp_replace(coalesce(p->>'student_name', ''), '\s+', ' ', 'g'));
  v_parent text := btrim(regexp_replace(coalesce(p->>'parent_name', ''), '\s+', ' ', 'g'));
  v_phone text := btrim(coalesce(p->>'phone', ''));
  v_digits text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_grade int; v_session uuid;
begin
  select * into s from schools where slug = p_slug;
  begin select * into e from scholarship_exams where id = (p->>'exam_id')::uuid and school_id = s.id;
  exception when others then e := null; end;
  if s.id is null or e.id is null or not e.active or not e.applications_open
     or not (school_setting(s.id, 'modul.bursluluk'))::text::boolean or not (school_setting(s.id, 'bursluluk.basvuru_acik'))::text::boolean then
    raise exception 'Bu sınav için başvuru alınmıyor.' using errcode = '22023';
  end if;
  if today < e.apply_from or today > e.apply_until then raise exception 'Başvuru tarihleri dışında.' using errcode = '22023'; end if;
  perform sch_rate_hit(s.id, 'basvuru', 30, interval '1 hour');
  if coalesce(p->>'consent_version', '') = '' then raise exception 'Aydınlatma metni onaylanmalı.' using errcode = '22023'; end if;
  begin v_grade := (p->>'grade')::int; exception when others then v_grade := null; end;
  if v_grade is null or not (v_grade = any(e.grades)) then raise exception 'Bu sınav seçilen sınıf seviyesi için değil.' using errcode = '22023'; end if;
  if length(v_name) < 3 or length(v_name) > 80 or length(v_parent) < 3 or length(v_parent) > 80 then
    raise exception 'Öğrenci ve veli adını yaz.' using errcode = '22023';
  end if;
  if length(v_digits) < 10 or length(v_digits) > 13 then raise exception 'Telefon numarası geçersiz.' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'E-posta geçersiz.' using errcode = '22023'; end if;
  -- Seans: sınavda tanımlı ve etkin seanslardan biri seçilmeli
  if not exists (select 1 from scholarship_sessions where exam_id = e.id and active) then
    raise exception 'Bu sınav için henüz seans tanımlanmamış.' using errcode = '22023';
  end if;
  begin v_session := (p->>'session_id')::uuid; exception when others then v_session := null; end;
  select * into ses from scholarship_sessions where id = v_session and exam_id = e.id and active;
  if ses.id is null then raise exception 'Seans seç.' using errcode = '22023'; end if;
  -- Kötüye kullanım: aynı telefondan son 1 saatte en fazla 5 başvuru; sınav başına dakikada en fazla 30
  select count(*) into n from scholarship_applications where regexp_replace(phone, '\D', '', 'g') = v_digits and created_at > now() - interval '1 hour';
  if n >= 5 then raise exception 'Çok fazla başvuru yapıldı; biraz sonra tekrar dene.' using errcode = '54000'; end if;
  select count(*) into n from scholarship_applications where exam_id = e.id and created_at > now() - interval '1 minute';
  if n >= 30 then raise exception 'Şu an çok yoğun; birkaç dakika sonra tekrar dene.' using errcode = '54000'; end if;
  -- Aynı öğrenci (ad + telefon) aynı sınava bir kez — seans farklı olsa da
  if exists (select 1 from scholarship_applications x where x.exam_id = e.id and lower(x.student_name) = lower(v_name)
             and regexp_replace(x.phone, '\D', '', 'g') = v_digits and x.status <> 'iptal') then
    raise exception 'Bu öğrenci için bu sınava zaten başvuru yapılmış.' using errcode = '23505';
  end if;
  -- Sınav geneli üst sınır (eski alan, isteğe bağlı): sınav satırı kilitlenerek sayılır
  if e.quota is not null then
    perform 1 from scholarship_exams where id = e.id for update;
    if (select count(*) from scholarship_applications x where x.exam_id = e.id and x.status in ('bekliyor', 'onaylandi')) >= e.quota then
      raise exception 'Kontenjan doldu.' using errcode = '22023';
    end if;
  end if;
  -- Seans × sınıf kontenjanı sch_app_capacity tetikleyicisinde (kilitli)
  insert into scholarship_applications (exam_id, school_id, session_id, student_name, grade, current_school, parent_name, phone, email, consent_version, source)
  values (e.id, s.id, ses.id, v_name, v_grade, nullif(btrim(coalesce(p->>'current_school', '')), ''), v_parent, v_phone, v_email,
          left(p->>'consent_version', 40), 'form')
  returning * into a;
  perform notify_many(array(select admin_accounts(s.id)), 'Bursluluk başvurusu: ' || v_name || ' (' || v_grade || '. sınıf) · ' || e.name,
                      jsonb_build_object('page', 'yonetim', 'tab', 'bursluluk'));
  return jsonb_build_object('code', a.code, 'tracking_code', a.tracking_code, 'exam', e.name, 'exam_date', e.exam_date,
    'student_name', a.student_name, 'grade', a.grade,
    'session', jsonb_build_object('name', ses.name, 'date', ses.session_date, 'starts_at', ses.starts_at, 'ends_at', ses.ends_at, 'location', ses.location));
end $$;
revoke all on function apply_scholarship(text, jsonb) from public;
grant execute on function apply_scholarship(text, jsonb) to anon, authenticated;

-- ---------- Takip: kodla başvuruyu görüntüleme ----------
create or replace function sch_mask_phone(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) < 4 then '***'
    else left(regexp_replace(p, '\D', '', 'g'), 2) || '** *** ** ' || right(regexp_replace(p, '\D', '', 'g'), 2) end
$$;
create or replace function sch_mask_email(p text) returns text language sql immutable as $$
  select case when p is null or position('@' in p) = 0 then null
    else left(p, 1) || '***@' || split_part(p, '@', 2) end
$$;

-- Kodla başvuru bulur; bulunamazsa NULL döner (hata fırlatmaz: hata işlemi geri alır ve deneme sayılmazdı).
-- Her deneme, doğru ya da yanlış, hız sınırına yazılır (okul + IP özeti başına 10 dakikada 20).
create or replace function sch_find(p_slug text, p_code text) returns scholarship_applications
language plpgsql security definer set search_path = public as $$
declare s schools; a scholarship_applications; c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into s from schools where slug = p_slug;
  if s.id is null then return null; end if;
  perform sch_rate_hit(s.id, 'takip', 20, interval '10 minutes');
  if c like 'BK%' then c := substr(c, 3); end if;
  if length(c) <> 8 or not (school_setting(s.id, 'modul.bursluluk'))::text::boolean then return null; end if;
  select * into a from scholarship_applications
   where tracking_code = 'BK-' || substr(c, 1, 4) || '-' || substr(c, 5, 4) and school_id = s.id;
  return a;
end $$;
revoke all on function sch_find(text, text) from public, anon, authenticated;

create or replace function sch_view(a scholarship_applications) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e scholarship_exams; ses scholarship_sessions; today date := (now() at time zone 'Europe/Istanbul')::date; can boolean;
begin
  select * into e from scholarship_exams where id = a.exam_id;
  select * into ses from scholarship_sessions where id = a.session_id;
  can := e.self_edit and e.edit_until is not null and today <= e.edit_until and a.status in ('bekliyor', 'onaylandi') and e.active;
  return jsonb_build_object(
    'tracking_code', a.tracking_code, 'student_name', a.student_name, 'grade', a.grade, 'current_school', a.current_school,
    'parent_name', a.parent_name, 'phone_masked', sch_mask_phone(a.phone), 'email_masked', sch_mask_email(a.email),
    'exam', e.name, 'exam_date', e.exam_date, 'location', coalesce(ses.location, e.location),
    'session', case when ses.id is null then null else jsonb_build_object('id', ses.id, 'name', ses.name, 'date', ses.session_date,
                 'starts_at', ses.starts_at, 'ends_at', ses.ends_at) end,
    'hall', a.hall, 'status', a.status, 'created_at', a.created_at,
    'grades', e.grades, 'edit_until', e.edit_until, 'can_edit', can,
    'edit_fields', case when can then to_jsonb(e.edit_fields) else '[]'::jsonb end,
    'sessions', case when can and 'session' = any(e.edit_fields) then sch_sessions_json(e.id, a.id) else '[]'::jsonb end);
end $$;
revoke all on function sch_view(scholarship_applications) from public, anon, authenticated;

create or replace function track_scholarship(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a scholarship_applications := sch_find(p_slug, p_code);
begin
  if a.id is null then return jsonb_build_object('error', 'Başvuru bulunamadı.'); end if;
  return sch_view(a);
end $$;
revoke all on function track_scholarship(text, text) from public;
grant execute on function track_scholarship(text, text) to anon, authenticated;

-- ---------- Başvuranın düzenlemesi / iptali ----------
-- Yalnız sınavda açıksa, son tarihe kadar ve yöneticinin izin verdiği alanlar. Seans/sınıf değişince kontenjan yeniden denetlenir.
create or replace function edit_scholarship(p_slug text, p_code text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a scholarship_applications := sch_find(p_slug, p_code); e scholarship_exams; f text[];
  today date := (now() at time zone 'Europe/Istanbul')::date;
  v_name text; v_parent text; v_phone text; v_digits text; v_email text; v_grade int; v_session uuid; v_school text;
begin
  if a.id is null then return jsonb_build_object('error', 'Başvuru bulunamadı.'); end if;
  select * into a from scholarship_applications where id = a.id for update;
  select * into e from scholarship_exams where id = a.exam_id;
  if not (e.self_edit and e.active and e.edit_until is not null and today <= e.edit_until) then
    raise exception 'Düzenleme süresi sona ermiştir.' using errcode = '22023';
  end if;
  if a.status not in ('bekliyor', 'onaylandi') then raise exception 'Bu başvuru düzenlenemez.' using errcode = '22023'; end if;
  perform sch_rate_hit(a.school_id, 'duzenle', 10, interval '1 hour');
  f := e.edit_fields;

  if coalesce((p->>'cancel')::boolean, false) then
    update scholarship_applications set status = 'iptal', self_edited_at = now() where id = a.id returning * into a;
    return sch_view(a);
  end if;

  v_name := case when 'student_name' = any(f) and p ? 'student_name' then btrim(regexp_replace(p->>'student_name', '\s+', ' ', 'g')) else a.student_name end;
  v_parent := case when 'parent_name' = any(f) and p ? 'parent_name' then btrim(regexp_replace(p->>'parent_name', '\s+', ' ', 'g')) else a.parent_name end;
  v_school := case when 'current_school' = any(f) and p ? 'current_school' then nullif(btrim(p->>'current_school'), '') else a.current_school end;
  v_phone := case when 'phone' = any(f) and coalesce(p->>'phone', '') <> '' then btrim(p->>'phone') else a.phone end;
  v_email := case when 'email' = any(f) and p ? 'email' then nullif(lower(btrim(p->>'email')), '') else a.email end;
  begin
    v_grade := case when 'grade' = any(f) and p ? 'grade' then (p->>'grade')::int else a.grade end;
    v_session := case when 'session' = any(f) and p ? 'session_id' then (p->>'session_id')::uuid else a.session_id end;
  exception when others then raise exception 'Geçersiz değer.' using errcode = '22023';
  end;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if length(v_name) < 3 or length(v_name) > 80 or length(v_parent) < 3 or length(v_parent) > 80 then
    raise exception 'Öğrenci ve veli adını yaz.' using errcode = '22023';
  end if;
  if length(v_digits) < 10 or length(v_digits) > 13 then raise exception 'Telefon numarası geçersiz.' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'E-posta geçersiz.' using errcode = '22023'; end if;
  if v_grade is null or not (v_grade = any(e.grades)) then raise exception 'Bu sınav seçilen sınıf seviyesi için değil.' using errcode = '22023'; end if;
  if v_session is not null and not exists (select 1 from scholarship_sessions where id = v_session and exam_id = e.id and active) then
    raise exception 'Seans seç.' using errcode = '22023';
  end if;
  if exists (select 1 from scholarship_applications x where x.exam_id = e.id and x.id <> a.id and x.status <> 'iptal'
             and lower(x.student_name) = lower(v_name) and regexp_replace(x.phone, '\D', '', 'g') = v_digits) then
    raise exception 'Bu öğrenci için bu sınava zaten başvuru yapılmış.' using errcode = '23505';
  end if;
  update scholarship_applications set student_name = v_name, parent_name = v_parent, current_school = v_school, phone = v_phone,
         email = v_email, grade = v_grade, session_id = v_session, self_edited_at = now()
   where id = a.id returning * into a;  -- kontenjan: sch_app_capacity (kilitli)
  return sch_view(a);
end $$;
revoke all on function edit_scholarship(text, text, jsonb) from public;
grant execute on function edit_scholarship(text, text, jsonb) to anon, authenticated;

-- ---------- Yönetici: okul öğrencisinden başvuru (seans seçerek) ----------
-- Eski iki parametreli sürüm, aynı adla üç parametreli sürüm çağrılarını belirsiz yapacağı için kaldırılır (veri değil, fonksiyon).
drop function if exists admin_add_application(uuid, uuid);
create or replace function admin_add_application(p_exam uuid, p_student uuid, p_session uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare e scholarship_exams; st students; par profiles; v_id uuid; g int;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select * into e from scholarship_exams where id = p_exam and school_id = my_school();
  select * into st from students where id = p_student and school_id = my_school();
  if e.id is null or st.id is null then raise exception 'Sınav ya da öğrenci bulunamadı.' using errcode = 'P0002'; end if;
  select c.grade into g from classes c where c.id = st.class_id;
  if g is null then g := nullif(split_part(st.class_name, '/', 1), '')::int; end if;
  if g is null or not (g = any(e.grades)) then raise exception 'Öğrencinin sınıf seviyesi bu sınavda yok.' using errcode = '22023'; end if;
  if exists (select 1 from scholarship_applications where exam_id = e.id and student_id = st.id and status <> 'iptal') then
    raise exception 'Bu öğrenci için bu sınava zaten başvuru var.' using errcode = '23505';
  end if;
  if p_session is null and exists (select 1 from scholarship_sessions where exam_id = e.id and active) then
    raise exception 'Seans seç.' using errcode = '22023';
  end if;
  select p.* into par from parent_links pl join profiles p on p.id = pl.parent_id where pl.student_id = st.id and p.status = 'approved' order by p.created_at limit 1;
  insert into scholarship_applications (exam_id, school_id, student_id, session_id, student_name, grade, current_school, parent_name, phone, email, source, status)
  values (e.id, e.school_id, st.id, p_session, st.full_name, g, (select name from schools where id = e.school_id),
          coalesce(par.full_name, 'Veli bilgisi yok'), coalesce(par.phone, '0000000000'), par.email, 'okul', 'onaylandi')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function admin_add_application(uuid, uuid, uuid) from public, anon;
grant execute on function admin_add_application(uuid, uuid, uuid) to authenticated;

-- Okul öğrencisinin başvurusu onaylanınca / seans ya da salon değişince veliye ve öğrenciye bilgi (seans tarihi ve saatiyle)
create or replace function sch_app_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare e scholarship_exams; ses scholarship_sessions;
begin
  if new.student_id is null then return null; end if;
  if (new.status, new.hall, new.session_time, new.session_id) is not distinct from (old.status, old.hall, old.session_time, old.session_id) then return null; end if;
  select * into e from scholarship_exams where id = new.exam_id;
  select * into ses from scholarship_sessions where id = new.session_id;
  if new.status = 'onaylandi' and (new.hall is not null or new.session_time is not null) then
    perform notify_many(array(select parent_accounts(new.student_id)) || array(select student_accounts(new.student_id)),
      'Bursluluk sınavı: ' || e.name || ' · ' || to_char(coalesce(ses.session_date, e.exam_date), 'DD.MM.YYYY') ||
      coalesce(' · ' || to_char(new.session_time, 'HH24:MI'), '') || coalesce(' · Salon ' || new.hall, ''), jsonb_build_object('page', 'okul'));
  end if;
  return null;
end $$;
