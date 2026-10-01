-- Çoklu rol (tek hesapta öğretmen + veli).
-- Bir kişinin tek Auth kullanıcısı ve tek profili olur; uygulama rolleri profile_roles tablosunda tutulur.
-- profiles.role ana (ilk) rol olarak kalır, hiçbir kayıtta değişmez. Yetki, kişinin rollerinin toplamıdır (has_role).
-- Arayüzdeki "seçili rol" yalnız ekranı belirler; veritabanı ona bakmaz, tarayıcıdan değiştirilerek yetki kazanılamaz.
-- Ek rol yalnız öğretmen ↔ veli birleşimi içindir ve yalnız yönetici (aal2) ekler/kaldırır; ilişkiler sessizce silinmez.
-- Bu dosya yalnız ekleme yapar: veri silmez, sütun/tablo düşürmez; tekrar çalıştırılabilir.

-- ---------- Tablo ----------
create table if not exists profile_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role user_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  unique (profile_id, role)
);
create index if not exists profile_roles_role on profile_roles (role);
alter table profile_roles enable row level security;

-- Mevcut her profilin ana rolü (kimsenin yetkisi değişmez)
insert into profile_roles (profile_id, role, created_at)
select id, role, created_at from profiles
on conflict (profile_id, role) do nothing;

-- Yeni kayıtlar (kendi kaydı, davet) ana rolleriyle otomatik eklenir. Ana rol elle değiştirilirse (ör. öğretmen → yönetici)
-- eski ana rolün otomatik satırı kalkar; yöneticinin admin_add_role ile eklediği roller (created_by dolu) korunur.
create or replace function profile_roles_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.role is distinct from new.role then
    delete from profile_roles where profile_id = new.id and role = old.role and created_by is null;
  end if;
  insert into profile_roles (profile_id, role) values (new.id, new.role) on conflict (profile_id, role) do nothing;
  return new;
end $$;
drop trigger if exists profiles_roles_sync on profiles;
create trigger profiles_roles_sync after insert or update of role on profiles
  for each row execute function profile_roles_sync();

-- Okuma: kendi rolleri; öğretmen/yönetim okulundaki kişilerin rollerini (listelerde doğru görünsün diye).
-- Yazma politikası yok: yalnız aşağıdaki yönetici fonksiyonları yazar.
drop policy if exists profile_roles_read on profile_roles;
create policy profile_roles_read on profile_roles for select using (
  profile_id = auth.uid()
  or (is_teacher() and exists (select 1 from profiles p where p.id = profile_id and p.school_id = my_school()))
);

-- ---------- Yardımcılar ----------
create or replace function has_role(uid uuid, r user_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profile_roles pr join profiles p on p.id = pr.profile_id
                 where pr.profile_id = uid and pr.role = r and p.status = 'approved')
$$;
revoke all on function has_role(uuid, user_role) from public, anon;
grant execute on function has_role(uuid, user_role) to authenticated;

-- is_admin() değişmez (ana rol admin + aal2). Öğretmen ve rehberlik yetkisi rol listesinden gelir.
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (has_role(auth.uid(), 'ogretmen')
                        and exists (select 1 from profiles where id = auth.uid() and branch = 'Rehberlik'))
$$;
create or replace function is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or has_role(auth.uid(), 'ogretmen')
$$;

-- Öğretmen olarak ders verdiği / sınıf öğretmeni olduğu sınıflar (veli olarak çocuğunun sınıfı burada YOK).
create or replace function teacher_classes(uid uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from classes c join profiles p on p.id = uid and p.status = 'approved' where c.homeroom_teacher_id = uid
  union
  select t.class_id from timetable t join profiles p on p.id = uid and p.status = 'approved' where t.teacher_id = uid
  union
  select a.class_id from teaching_assignments a join profiles p on p.id = uid and p.status = 'approved' where a.teacher_id = uid
$$;

-- Bir rolün sınıfları: veli → çocuklarının, öğrenci → kendi, öğretmen/yönetici → ders verdiği sınıflar.
create or replace function role_classes(uid uuid, r user_role) returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.class_id from profiles p join students s on s.id = p.student_id
   where r = 'ogrenci' and p.id = uid and p.status = 'approved' and s.class_id is not null
  union
  select s.class_id from parent_links pl join profiles p on p.id = pl.parent_id join students s on s.id = pl.student_id
   where r = 'veli' and pl.parent_id = uid and p.status = 'approved' and s.class_id is not null
  union
  select tc from teacher_classes(uid) tc where r in ('ogretmen', 'admin')
$$;

-- "Öğrenciye ders veriyor mu": yalnız öğretmenlik sınıfları (velinin çocuğunun sınıfı öğretmenlik sayılmaz).
create or replace function teaches_student(uid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s where s.id = sid and s.class_id in (select teacher_classes(uid)))
$$;

revoke all on function teacher_classes(uuid) from public, anon;
revoke all on function role_classes(uuid, user_role) from public, anon;
grant execute on function teacher_classes(uuid) to authenticated;
grant execute on function role_classes(uuid, user_role) to authenticated;

-- ---------- Hedefleme: her rol kendi sınıflarıyla değerlendirilir ----------
create or replace function announcement_reaches(uid uuid, a announcements) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join profile_roles pr on pr.profile_id = p.id
    where p.id = uid and p.status = 'approved' and p.school_id = a.school_id
      and (case when pr.role in ('admin', 'ogretmen') then 'ogretmen' else pr.role::text end) = any(a.audience)
      and (a.scope = 'okul'
        or pr.role = 'admin'
        or (a.scope = 'kademe' and exists (select 1 from classes c where c.id in (select role_classes(uid, pr.role)) and c.level = a.level))
        or (a.scope = 'sinif' and a.class_id in (select role_classes(uid, pr.role)))))
$$;

create or replace function event_reaches(uid uuid, e calendar_events, p_all boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = uid and p.status = 'approved' and p.school_id = e.school_id and (
      (p_all and (p.role = 'admin' or (has_role(uid, 'ogretmen') and p.branch = 'Rehberlik') or e.created_by = uid))
      or exists (
        select 1 from profile_roles pr where pr.profile_id = uid
          and (case when pr.role in ('admin', 'ogretmen') then 'ogretmen' else pr.role::text end) = any(e.audience)
          and (e.target = 'okul'
            or (e.target = 'kademe' and exists (select 1 from classes c where c.id in (select role_classes(uid, pr.role)) and c.level = e.level))
            or (e.target = 'sinif' and e.class_id in (select role_classes(uid, pr.role)))
            or (e.target = 'ogrenci' and (
                  (pr.role = 'ogrenci' and p.student_id = e.student_id)
               or (pr.role = 'veli' and exists (select 1 from parent_links pl where pl.parent_id = uid and pl.student_id = e.student_id))
               or (pr.role in ('ogretmen', 'admin') and teaches_student(uid, e.student_id))))))
      or (e.target = 'ogretmen' and e.teacher_id = uid)))
$$;

-- ---------- Veli ↔ öğretmen yazışması ----------
-- Çocuğun öğretmenleri: ana rolü veli olup sonradan öğretmen olanlar da listelenir; kişi kendini görmez.
create or replace function child_contacts(p_student uuid)
returns table (id uuid, full_name text, branch text, role text, subjects text[], homeroom boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.branch, case when p.role = 'admin' then 'admin' else 'ogretmen' end,
         coalesce(array(select distinct x.n from (
             select t.subject n from timetable t join students s on s.class_id = t.class_id where s.id = p_student and t.teacher_id = p.id
             union select c.name from teaching_assignments a join courses c on c.id = a.course_id join students s on s.class_id = a.class_id
                   where s.id = p_student and a.teacher_id = p.id) x order by 1), '{}'),
         exists (select 1 from classes c join students s on s.class_id = c.id where s.id = p_student and c.homeroom_teacher_id = p.id)
  from profiles p
  where can_see_student(p_student)
    and p.school_id = my_school() and p.status = 'approved' and p.id <> auth.uid()
    and (p.role = 'admin' or (has_role(p.id, 'ogretmen') and (p.branch = 'Rehberlik' or teaches_student(p.id, p_student))))
  order by (p.role = 'admin'), p.full_name
$$;

-- Hangi sıfatla yazıldığı karşı tarafa göre belirlenir: çocuğunun öğretmenine veli olarak, öğrencisinin velisine öğretmen olarak.
create or replace function start_conversation(p_student uuid, p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles; v_parent uuid; v_teacher uuid; v_id uuid; s students; v_veli boolean; v_ogr boolean;
begin
  select * into me from profiles where id = auth.uid() and status = 'approved';
  select * into s from students where id = p_student and school_id = me.school_id;
  if me.id is null or s.id is null then raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002'; end if;
  if p_other = me.id then raise exception 'Kendinle yazışma başlatamazsın.' using errcode = '22023'; end if;
  v_veli := has_role(me.id, 'veli');
  v_ogr := me.role = 'admin' or has_role(me.id, 'ogretmen');
  if v_veli and is_parent_of(p_student) and exists (select 1 from child_contacts(p_student) c where c.id = p_other) then
    v_parent := me.id; v_teacher := p_other;
  elsif v_ogr and exists (select 1 from student_parents(p_student) sp where sp.id = p_other) then
    v_parent := p_other; v_teacher := me.id;
  elsif v_veli and not v_ogr then
    if not is_parent_of(p_student) then raise exception 'Yalnız kendi çocuğun için yazabilirsin.' using errcode = '42501'; end if;
    raise exception 'Bu kişiye yazamazsın: çocuğunun öğretmenlerinden biri değil.' using errcode = '42501';
  elsif v_ogr then
    raise exception 'Bu veliye yazamazsın: öğrenci senin sınıflarından birinde değil ya da veli bağlı değil.' using errcode = '42501';
  else
    raise exception 'Mesajlaşma veli ve öğretmenler içindir.' using errcode = '42501';
  end if;
  insert into conversations (school_id, student_id, parent_id, teacher_id)
  values (me.school_id, p_student, v_parent, v_teacher)
  on conflict (student_id, parent_id, teacher_id) do update set last_at = conversations.last_at
  returning id into v_id;
  return v_id;
end $$;

-- ---------- "Öğretmen mi" denetimleri: ana rol yerine rol listesi ----------
-- Gövdeleri değişmeden yalnız ilgili ifade değiştirilir; ifade bulunamazsa migration durur.
create or replace function pg_temp.yama(fn regprocedure, a text, b text) returns void language plpgsql as $$
declare src text;
begin
  src := pg_get_functiondef(fn);
  if position(a in src) = 0 then
    if position(b in src) > 0 then return; end if; -- daha önce uygulanmış
    raise exception 'Yama uygulanamadı: % → %', fn, a;
  end if;
  execute replace(src, a, b);
end $$;

select pg_temp.yama('assignments_check()', $x$p.role in ('ogretmen', 'admin')$x$, $x$(p.role = 'admin' or has_role(p.id, 'ogretmen'))$x$);
select pg_temp.yama('classes_check_teacher()', $x$p.role in ('ogretmen', 'admin')$x$, $x$(p.role = 'admin' or has_role(p.id, 'ogretmen'))$x$);
select pg_temp.yama('timetable_check_teacher()', $x$p.role in ('ogretmen', 'admin')$x$, $x$(p.role = 'admin' or has_role(p.id, 'ogretmen'))$x$);
select pg_temp.yama('calendar_before()', $x$school_id = new.school_id and role in ('ogretmen', 'admin')$x$, $x$school_id = new.school_id and (role = 'admin' or has_role(id, 'ogretmen'))$x$);
select pg_temp.yama('send_report(uuid, boolean, boolean, uuid[])', $x$p.role in ('ogretmen','admin')$x$, $x$(p.role = 'admin' or has_role(p.id, 'ogretmen'))$x$);
select pg_temp.yama('notes_after_insert()', $x$a.role = 'ogretmen' and coalesce(a.branch, '') <> 'Rehberlik'$x$, $x$has_role(a.id, 'ogretmen') and coalesce(a.branch, '') <> 'Rehberlik'$x$);
select pg_temp.yama('staff_accounts(uuid)', $x$(role = 'ogretmen' and branch = 'Rehberlik')$x$, $x$(has_role(id, 'ogretmen') and branch = 'Rehberlik')$x$);
select pg_temp.yama('admin_update_profile(uuid, text, text)', $x$p.role = 'ogretmen'$x$, $x$has_role(p.id, 'ogretmen')$x$);

-- Öğretmenler birbirinin adını görür: ana rolü veli olup öğretmen rolü eklenen kişi de
alter policy profiles_teacher_names on profiles using (
  is_teacher() and school_id = my_school() and status = 'approved'
  and (role = any (array['admin'::user_role, 'ogretmen'::user_role]) or has_role(id, 'ogretmen'))
);

-- ---------- Yönetici: rol ekle / kaldır ----------
-- Veli rolü: en az bir öğrenci + yakınlık (parent_links). Öğretmen rolü: branş; isteğe bağlı ders atamaları ve sınıf öğretmenliği.
create or replace function admin_add_role(p_profile uuid, p_role user_role, p jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles; it jsonb; n int := 0; school uuid := my_school();
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select * into u from profiles where id = p_profile and school_id = school for update;
  if u.id is null then raise exception 'Kişi bulunamadı.' using errcode = 'P0002'; end if;
  if u.status <> 'approved' then raise exception 'Önce kaydın onaylanması gerekir.' using errcode = '22023'; end if;
  if p_role not in ('ogretmen', 'veli') or u.role not in ('ogretmen', 'veli') then
    raise exception 'Ek rol yalnız öğretmen ve veli için verilebilir.' using errcode = '22023';
  end if;
  if exists (select 1 from profile_roles where profile_id = u.id and role = p_role) then
    raise exception 'Bu kişide bu rol zaten var.' using errcode = '23505';
  end if;

  if p_role = 'veli' then
    if jsonb_array_length(coalesce(p->'students', '[]')) = 0 then raise exception 'En az bir öğrenci seç.' using errcode = '22023'; end if;
    for it in select * from jsonb_array_elements(p->'students') loop
      if not exists (select 1 from students where id = (it->>'student_id')::uuid and school_id = school and archived_at is null) then
        raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002';
      end if;
      insert into parent_links (parent_id, student_id, relation)
      values (u.id, (it->>'student_id')::uuid, case when it->>'relation' in ('Anne', 'Baba', 'Vasi', 'Diğer') then it->>'relation' else 'Diğer' end)
      on conflict do nothing;
      n := n + 1;
    end loop;
  else
    if not (coalesce(p->>'branch', '') = any(valid_branches())) then raise exception 'Branş geçersiz.' using errcode = '22023'; end if;
    update profiles set branch = p->>'branch' where id = u.id;
  end if;

  insert into profile_roles (profile_id, role, created_by) values (u.id, p_role, auth.uid());

  if p_role = 'ogretmen' then -- rol eklendikten sonra: atama tetikleyicileri öğretmen rolünü arar
    for it in select * from jsonb_array_elements(coalesce(p->'assignments', '[]')) loop
      insert into teaching_assignments (school_id, class_id, course_id, teacher_id)
      values (school, (it->>'class_id')::uuid, (it->>'course_id')::uuid, u.id) on conflict do nothing;
      n := n + 1;
    end loop;
    if p->>'homeroom_class_id' is not null then
      update classes set homeroom_teacher_id = u.id where id = (p->>'homeroom_class_id')::uuid and school_id = school;
    end if;
  end if;

  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'role_add', 'profiles', u.id, jsonb_build_object('role', p_role, 'links', n, 'branch', p->>'branch'));
  perform notify_many(array[u.id],
    'Hesabına ' || case p_role when 'veli' then 'veli' else 'öğretmen' end || ' rolü eklendi. Profil menüsünden "Rol değiştir" ile geçebilirsin.',
    '{}'::jsonb);
end $$;

-- Kaldırma: ana rol kaldırılamaz; bağlı ilişkiler varsa önce onlar kaldırılmalı (sessiz silme yok).
create or replace function admin_remove_role(p_profile uuid, p_role user_role) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles; a int; h int; t int; l int;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select * into u from profiles where id = p_profile and school_id = my_school() for update;
  if u.id is null then raise exception 'Kişi bulunamadı.' using errcode = 'P0002'; end if;
  if u.role = p_role then raise exception 'Kişinin ana rolü kaldırılamaz.' using errcode = '22023'; end if;
  if not exists (select 1 from profile_roles where profile_id = u.id and role = p_role) then
    raise exception 'Bu kişide bu rol yok.' using errcode = 'P0002';
  end if;
  if p_role = 'ogretmen' then
    select count(*) into a from teaching_assignments where teacher_id = u.id;
    select count(*) into h from classes where homeroom_teacher_id = u.id;
    select count(*) into t from timetable where teacher_id = u.id;
    if a + h + t > 0 then
      raise exception 'Öğretmen rolü kaldırılamadı: önce % ders ataması, % sınıf öğretmenliği ve % ders programı satırını kaldır.', a, h, t
        using errcode = '23503';
    end if;
  elsif p_role = 'veli' then
    select count(*) into l from parent_links where parent_id = u.id;
    if l > 0 then
      raise exception 'Veli rolü kaldırılamadı: önce % öğrenciyle veli bağlantısını kaldır.', l using errcode = '23503';
    end if;
  end if;
  delete from profile_roles where profile_id = u.id and role = p_role;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'role_remove', 'profiles', u.id, jsonb_build_object('role', p_role));
end $$;

revoke all on function admin_add_role(uuid, user_role, jsonb) from public, anon;
revoke all on function admin_remove_role(uuid, user_role) from public, anon;
grant execute on function admin_add_role(uuid, user_role, jsonb) to authenticated;
grant execute on function admin_remove_role(uuid, user_role) to authenticated;
