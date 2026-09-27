-- Aşama 1 · Kayıt, onay ve yetki sıkılaştırmaları
-- 0001 taslağı üzerine: yetki gevşetilmez, yalnız daraltılır.

-- ---------- Okul kısa adı (kayıtta okul seçimi için) ----------
alter table schools add column slug text unique;

-- ---------- Profil: e-posta (onay ekranı için) ----------
alter table profiles add column email text;

-- ---------- anon rolü hiçbir tabloya dokunamaz (RLS'e ek savunma) ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------- Profil görünürlüğü daraltması ----------
-- Rehber öğretmen onay bekleyen kayıtları görmez (onay yalnız admin işi).
drop policy profiles_staff on profiles;
create policy profiles_admin_read on profiles for select using (is_admin() and school_id = my_school());
create policy profiles_staff on profiles for select using (is_staff() and school_id = my_school() and status = 'approved');
-- Öğretmenler yalnız onaylı öğretmen/yönetici adlarını görür (0001'de bekleyen kayıtlar da görünüyordu).
drop policy profiles_teacher_names on profiles;
create policy profiles_teacher_names on profiles for select
  using (is_teacher() and school_id = my_school() and role in ('admin','ogretmen') and status = 'approved');

-- İstemci profil ekleyemez; profil yalnız aşağıdaki trigger ile oluşur.
drop policy profiles_insert_self on profiles;

-- Admin profili güncelleyebilir ama okul değiştiremez.
drop policy profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update
  using (is_admin() and school_id = my_school())
  with check (school_id = my_school());

-- ---------- Kayıt: auth.users → profiles ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role user_role;
  v_school uuid;
  v_name text := btrim(coalesce(m->>'full_name', ''));
  v_branch text := nullif(btrim(coalesce(m->>'branch', '')), '');
  v_declared jsonb := '{}'::jsonb;
  v_class text;
begin
  -- Rol yalnız öğrenci / veli / öğretmen olabilir. Admin kayıtla olunamaz.
  if m->>'role' not in ('ogrenci', 'veli', 'ogretmen') then
    raise exception 'Geçersiz rol' using errcode = '22023';
  end if;
  v_role := (m->>'role')::user_role;

  select id into v_school from schools where slug = m->>'school';
  if v_school is null then
    raise exception 'Okul bulunamadı' using errcode = '22023';
  end if;

  if length(v_name) < 3 or length(v_name) > 80 then
    raise exception 'Ad soyad geçersiz' using errcode = '22023';
  end if;

  if v_role = 'ogretmen' then
    if v_branch is null or v_branch not in ('Türkçe','Matematik','Fen Bilimleri','T.C. İnkılap Tarihi','Din Kültürü','İngilizce','Rehberlik') then
      raise exception 'Branş geçersiz' using errcode = '22023';
    end if;
  else
    v_branch := null;
  end if;

  -- Beyan edilen bilgiler: yalnız izinli alanlar, uzunluk sınırlı.
  if v_role = 'ogrenci' then
    v_class := m->'declared'->>'className';
    if v_class !~ '^8/[A-Z]$' then raise exception 'Şube geçersiz' using errcode = '22023'; end if;
    v_declared := jsonb_build_object(
      'className', v_class,
      'schoolNo', left(regexp_replace(coalesce(m->'declared'->>'schoolNo', ''), '\D', '', 'g'), 10));
  elsif v_role = 'veli' then
    v_class := m->'declared'->>'childClass';
    if v_class !~ '^8/[A-Z]$' then raise exception 'Şube geçersiz' using errcode = '22023'; end if;
    if length(btrim(coalesce(m->'declared'->>'childName', ''))) < 3 then
      raise exception 'Öğrenci adı gerekli' using errcode = '22023';
    end if;
    v_declared := jsonb_build_object(
      'childName', left(btrim(m->'declared'->>'childName'), 80),
      'childClass', v_class,
      'relation', case when m->'declared'->>'relation' in ('Anne','Baba','Vasi','Diğer') then m->'declared'->>'relation' else 'Diğer' end);
  end if;

  insert into profiles (id, school_id, full_name, role, branch, status, declared, email)
  values (new.id, v_school, v_name, v_role, v_branch, 'pending', v_declared, lower(new.email));

  -- Adminlere bildirim
  insert into notifications (user_id, text, link)
  select p.id,
         'Yeni kayıt onay bekliyor: ' || v_name || ' (' ||
           case v_role when 'ogrenci' then 'Öğrenci' when 'veli' then 'Veli'
             else case when v_branch = 'Rehberlik' then 'Rehber öğretmen' else 'Branş öğretmeni · ' || v_branch end end || ')',
         jsonb_build_object('page', 'onaylar')
  from profiles p
  where p.school_id = v_school and p.role = 'admin' and p.status = 'approved';

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Onay / ret (yalnız admin, aal2) ----------
-- p_student: öğrenci/veli için eşleştirilecek öğrenci kaydı.
-- Öğrenci rolünde p_student NULL ise beyan edilen bilgilerle yeni öğrenci kaydı açılır.
create or replace function approve_registration(p_profile uuid, p_student uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  v_student uuid := p_student;
begin
  if not is_admin() then
    raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501';
  end if;

  select * into p from profiles where id = p_profile for update;
  if p.id is null or p.school_id <> my_school() then
    raise exception 'Kayıt bulunamadı' using errcode = 'P0002';
  end if;
  if p.status <> 'pending' then
    raise exception 'Bu kayıt zaten işlenmiş' using errcode = '22023';
  end if;

  if v_student is not null and not exists (select 1 from students where id = v_student and school_id = p.school_id and archived_at is null) then
    raise exception 'Öğrenci kaydı bulunamadı' using errcode = 'P0002';
  end if;

  if p.role = 'veli' then
    if v_student is null then
      raise exception 'Velinin öğrencisini seç' using errcode = '22023';
    end if;
    insert into parent_links (parent_id, student_id, relation)
    values (p.id, v_student, p.declared->>'relation')
    on conflict do nothing;
  elsif p.role = 'ogrenci' then
    if v_student is null then
      insert into students (school_id, full_name, class_name, school_no)
      values (p.school_id, p.full_name, p.declared->>'className', nullif(p.declared->>'schoolNo', ''))
      returning id into v_student;
    elsif exists (select 1 from profiles where student_id = v_student and role = 'ogrenci' and status = 'approved') then
      raise exception 'Bu öğrenci kaydına bağlı bir öğrenci hesabı zaten var' using errcode = '23505';
    end if;
    update profiles set student_id = v_student where id = p.id;
  end if;

  update profiles set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p.id;

  insert into notifications (user_id, text, link)
  values (p.id, 'Kaydın onaylandı. Hoş geldin!', '{}'::jsonb);

  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'approve', 'profiles', p.id, jsonb_build_object('role', p.role, 'student_id', v_student));
end $$;

create or replace function reject_registration(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if not is_admin() then
    raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501';
  end if;
  select * into p from profiles where id = p_profile for update;
  if p.id is null or p.school_id <> my_school() then
    raise exception 'Kayıt bulunamadı' using errcode = 'P0002';
  end if;
  if p.status <> 'pending' then
    raise exception 'Bu kayıt zaten işlenmiş' using errcode = '22023';
  end if;
  update profiles set status = 'rejected', approved_by = auth.uid(), approved_at = now() where id = p.id;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'reject', 'profiles', p.id, jsonb_build_object('role', p.role));
end $$;

revoke all on function approve_registration(uuid, uuid) from public, anon;
revoke all on function reject_registration(uuid) from public, anon;
grant execute on function approve_registration(uuid, uuid) to authenticated;
grant execute on function reject_registration(uuid) to authenticated;

-- ---------- Sütun kısıtları: öğrenci yalnız ilerlemesini, veli/öğrenci yalnız görüşme yanıtını değiştirir ----------
create or replace function guard_task_student_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_staff() then return new; end if;
  if (new.id, new.student_id, new.subject, new.topic, new.outcome_code, new.question_count, new.due_date,
      new.weekly, new.parent_visible, new.note, new.created_by, new.created_at, new.overdue_notified_at, new.spawned_next)
     is distinct from
     (old.id, old.student_id, old.subject, old.topic, old.outcome_code, old.question_count, old.due_date,
      old.weekly, old.parent_visible, old.note, old.created_by, old.created_at, old.overdue_notified_at, old.spawned_next) then
    raise exception 'Görevde yalnız ilerleme güncellenebilir' using errcode = '42501';
  end if;
  if new.solved > new.question_count then
    raise exception 'Çözülen soru sayısı görevden fazla olamaz' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger tasks_student_guard before update on tasks
  for each row execute function guard_task_student_update();

create or replace function guard_meeting_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_staff() then return new; end if;
  if (new.id, new.student_id, new.with_whom, new.starts_at, new.note, new.canceled_at, new.created_by, new.created_at)
     is distinct from
     (old.id, old.student_id, old.with_whom, old.starts_at, old.note, old.canceled_at, old.created_by, old.created_at) then
    raise exception 'Görüşmede yalnız yanıt verilebilir' using errcode = '42501';
  end if;
  new.replied_by := auth.uid();
  return new;
end $$;
create trigger meetings_reply_guard before update on meetings
  for each row execute function guard_meeting_reply();

-- Bildirimde kullanıcı yalnız okundu bilgisini değiştirir.
create or replace function guard_notification_update() returns trigger
language plpgsql as $$
begin
  if (new.id, new.user_id, new.text, new.link, new.created_at) is distinct from (old.id, old.user_id, old.text, old.link, old.created_at) then
    raise exception 'Bildirimde yalnız okundu bilgisi değişir' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on notifications
  for each row execute function guard_notification_update();
