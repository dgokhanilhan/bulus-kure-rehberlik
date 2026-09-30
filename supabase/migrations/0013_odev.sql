-- Faz B · Ödev sistemi.
-- Öğretmen yalnız ders verdiği sınıf + derse (ders ataması / ders programı) ya da sınıf öğretmeni olduğu sınıfa ödev verir;
-- yönetici her sınıfa. Ödev verilince sınıftaki bütün öğrenciler otomatik sorumlu olur (homework_students).
-- Durum: bekliyor → yapti / yapmadi / eksik / gelmedi / izinli (+ öğretmen notu).
-- Veli ve öğrenci yalnız kendi ödevini görür; davranışlar Yönetim Merkezi → Ödev ayarları'ndan değişir.
-- Ek dosyalar Faz C'de (Storage) eklenecek.

-- ---------- Ayarlar (0011'deki listeye ödev ayarları eklenir) ----------
create or replace function setting_spec() returns jsonb language sql immutable as $$
  select '{
    "genel.okul_adi":            {"type":"text","max":120},
    "genel.telefon":             {"type":"text","max":40,  "default":""},
    "genel.eposta":              {"type":"text","max":120, "default":""},
    "genel.adres":               {"type":"text","max":300, "default":""},
    "modul.lgs":                 {"type":"bool","default":true},
    "modul.yoklama":             {"type":"bool","default":true},
    "modul.ders_programi":       {"type":"bool","default":true},
    "modul.yemek":               {"type":"bool","default":true},
    "modul.duyuru":              {"type":"bool","default":true},
    "modul.mesaj":               {"type":"bool","default":true},
    "modul.odev":                {"type":"bool","default":true},
    "modul.takvim":              {"type":"bool","default":true},
    "modul.bursluluk":           {"type":"bool","default":false},
    "yoklama.ogretmen_girebilir":{"type":"bool","default":false},
    "odev.son_tarih_zorunlu":    {"type":"bool","default":true},
    "odev.veli_durum_gorur":     {"type":"bool","default":true},
    "odev.geciken_kirmizi":      {"type":"bool","default":true},
    "odev.bildirim_yeni":        {"type":"bool","default":true},
    "odev.bildirim_kontrol":     {"type":"bool","default":true},
    "odev.hatirlatma_gun":       {"type":"int","min":0,"max":14,"default":1},
    "odev.ogretmen_dosya":       {"type":"bool","default":true},
    "odev.ogrenci_dosya":        {"type":"bool","default":false}
  }'::jsonb
$$;

-- Oturum olmadan (zamanlanmış iş, tetikleyici) belirli bir okulun ayarı.
create or replace function school_setting(p_school uuid, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from school_settings where school_id = p_school and key = p_key), setting_spec()->p_key->'default')
$$;
revoke all on function school_setting(uuid, text) from public, anon, authenticated;

-- ---------- Tablolar ----------
create table homework (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  class_id uuid not null references classes(id) on delete cascade,
  course_id uuid not null references courses(id) on delete restrict,
  teacher_id uuid references profiles(id) on delete set null default auth.uid(),
  title text not null check (length(btrim(title)) between 3 and 150),
  description text check (description is null or length(description) <= 4000),
  assigned_on date not null default (now() at time zone 'Europe/Istanbul')::date,
  due_on date,
  reminded_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_on is null or due_on >= assigned_on)
);
create index homework_class on homework (class_id, due_on);
create index homework_teacher on homework (teacher_id);
alter table homework enable row level security;

create table homework_students (
  homework_id uuid not null references homework(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status text not null default 'bekliyor' check (status in ('bekliyor', 'yapti', 'yapmadi', 'eksik', 'gelmedi', 'izinli')),
  note text check (note is null or length(note) <= 300),
  checked_by uuid references profiles(id) on delete set null,
  checked_at timestamptz,
  primary key (homework_id, student_id)
);
create index homework_students_student on homework_students (student_id);
alter table homework_students enable row level security;

-- ---------- Yetki yardımcıları ----------
-- Bu sınıf + derse ödev verebilir mi? (yönetici; ders ataması; ders programında o dersi veren; sınıf öğretmeni her derse)
create or replace function can_assign_homework(p_class uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (is_teacher() and (
       exists (select 1 from teaching_assignments a where a.class_id = p_class and a.course_id = p_course and a.teacher_id = auth.uid())
    or exists (select 1 from timetable t where t.class_id = p_class and t.course_id = p_course and t.teacher_id = auth.uid())
    or exists (select 1 from classes c where c.id = p_class and c.homeroom_teacher_id = auth.uid())))
$$;
grant execute on function can_assign_homework(uuid, uuid) to authenticated;

-- Ödevi görebilir mi? (öğretmen: kendi ödevi ya da o sınıfta ders veriyor; veli/öğrenci: sorumlu öğrencisi var)
create or replace function can_see_homework(p_hw uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from homework h where h.id = p_hw and h.school_id = my_school() and (
       is_staff()
    or h.teacher_id = auth.uid()
    or (is_teacher() and h.class_id in (select profile_classes(auth.uid())))
    or exists (select 1 from homework_students hs where hs.homework_id = h.id and (is_parent_of(hs.student_id) or is_student_self(hs.student_id)))))
$$;
grant execute on function can_see_homework(uuid) to authenticated;

-- Durum işaretleyebilir mi? (ödevi veren, o sınıf + derse ödev verebilen, yönetici)
create or replace function can_check_homework(p_hw uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from homework h where h.id = p_hw and h.school_id = my_school()
                 and (is_admin() or h.teacher_id = auth.uid() or can_assign_homework(h.class_id, h.course_id)))
$$;
grant execute on function can_check_homework(uuid) to authenticated;

-- ---------- RLS ----------
-- Satırın kendi sütunlarıyla (insert … returning'de yeni satır başka sorguda henüz görünmez).
create or replace function homework_family_visible(p_hw uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from homework_students hs where hs.homework_id = p_hw and (is_parent_of(hs.student_id) or is_student_self(hs.student_id)))
$$;
grant execute on function homework_family_visible(uuid) to authenticated;
create policy hw_read on homework for select using (
  school_id = my_school() and (is_staff() or teacher_id = auth.uid()
    or (is_teacher() and class_id in (select my_classes())) or homework_family_visible(id)));
create policy hw_insert on homework for insert with check (school_id = my_school() and teacher_id = auth.uid() and can_assign_homework(class_id, course_id));
create policy hw_update on homework for update using (school_id = my_school() and (is_admin() or teacher_id = auth.uid()))
  with check (school_id = my_school() and (is_admin() or can_assign_homework(class_id, course_id)));
create policy hw_delete on homework for delete using (school_id = my_school() and (is_admin() or teacher_id = auth.uid()));

-- Öğrenci satırları: öğretmen/yönetici görür; öğrenci kendi satırını; veli ayar açıksa çocuğunun satırını.
create policy hws_read on homework_students for select using (
  can_check_homework(homework_id)
  or (is_teacher() and can_see_homework(homework_id))
  or is_student_self(student_id)
  or (is_parent_of(student_id) and (setting('odev.veli_durum_gorur'))::text::boolean));
-- Satırlar tetikleyiciyle oluşur; durum yalnız set_homework_statuses() ile değişir.

create policy mod_odev on homework as restrictive for all using (is_admin() or module_enabled('odev'));
create policy mod_odev_s on homework_students as restrictive for all using (is_admin() or module_enabled('odev'));
create trigger mod_guard before insert or update on homework for each row execute function module_guard('odev');
create trigger audit_homework after insert or update or delete on homework for each row execute function audit_row();

-- ---------- Tetikleyiciler ----------
create or replace function homework_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.title := btrim(new.title);
  new.updated_at := now();
  if not exists (select 1 from classes where id = new.class_id and school_id = new.school_id)
     or not exists (select 1 from courses where id = new.course_id and school_id = new.school_id) then
    raise exception 'Sınıf ya da ders bulunamadı.' using errcode = '23503';
  end if;
  if new.due_on is null and (school_setting(new.school_id, 'odev.son_tarih_zorunlu'))::text::boolean then
    raise exception 'Son teslim tarihi zorunlu (Ödev ayarları).' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.class_id <> old.class_id then
    raise exception 'Ödevin sınıfı değiştirilemez; yeni ödev ver.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger homework_before before insert or update on homework for each row execute function homework_before();

-- Ödev verilince sınıftaki bütün öğrenciler sorumlu olur; ayar açıksa öğrenci ve velilere bildirim.
create or replace function homework_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare c courses;
begin
  insert into homework_students (homework_id, student_id)
  select new.id, s.id from students s where s.class_id = new.class_id and s.archived_at is null
  on conflict do nothing;
  if (school_setting(new.school_id, 'odev.bildirim_yeni'))::text::boolean then
    select * into c from courses where id = new.course_id;
    perform notify_many(
      array(select student_accounts(s.id) from students s where s.class_id = new.class_id and s.archived_at is null)
      || array(select parent_accounts(s.id) from students s where s.class_id = new.class_id and s.archived_at is null),
      'Yeni ödev · ' || c.name || ': ' || new.title || coalesce(' (son gün ' || to_char(new.due_on, 'DD.MM') || ')', ''),
      jsonb_build_object('page', 'odevler', 'homework', new.id));
  end if;
  return null;
end $$;
create trigger homework_after_insert after insert on homework for each row execute function homework_after_insert();

-- Sınıfa sonradan katılan öğrenci, o sınıfın süresi dolmamış ödevlerinden sorumlu olur.
create or replace function students_join_homework() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null and (tg_op = 'INSERT' or new.class_id is distinct from old.class_id) then
    insert into homework_students (homework_id, student_id)
    select h.id, new.id from homework h
    where h.class_id = new.class_id and (h.due_on is null or h.due_on >= (now() at time zone 'Europe/Istanbul')::date)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger students_join_homework after insert or update of class_id on students for each row execute function students_join_homework();

-- ---------- Durum işaretleme (toplu) ----------
-- p_items: [{"student_id": "...", "status": "yapti", "note": "..."}]
create or replace function set_homework_statuses(p_homework uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare h homework; c courses; it jsonb; n int := 0; cur homework_students; v_status text; v_note text;
begin
  if not can_check_homework(p_homework) then raise exception 'Bu ödevi kontrol etme yetkin yok.' using errcode = '42501'; end if;
  if not is_admin() and not module_enabled('odev') then raise exception 'Bu modül okul yönetimi tarafından kapatıldı.' using errcode = '42501'; end if;
  select * into h from homework where id = p_homework;
  select * into c from courses where id = h.course_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    v_status := it->>'status';
    v_note := nullif(btrim(coalesce(it->>'note', '')), '');
    if v_status not in ('bekliyor', 'yapti', 'yapmadi', 'eksik', 'gelmedi', 'izinli') then
      raise exception 'Geçersiz durum: %', v_status using errcode = '22023';
    end if;
    if length(v_note) > 300 then raise exception 'Not en fazla 300 karakter olabilir.' using errcode = '22023'; end if;
    select * into cur from homework_students where homework_id = h.id and student_id = (it->>'student_id')::uuid for update;
    if cur.homework_id is null then raise exception 'Öğrenci bu ödevden sorumlu değil.' using errcode = 'P0002'; end if;
    if cur.status is distinct from v_status or cur.note is distinct from v_note then
      update homework_students set status = v_status, note = v_note, checked_by = auth.uid(), checked_at = now()
      where homework_id = h.id and student_id = cur.student_id;
      n := n + 1;
      if cur.status is distinct from v_status and v_status <> 'bekliyor' and (school_setting(h.school_id, 'odev.bildirim_kontrol'))::text::boolean then
        perform notify_many(
          array(select student_accounts(cur.student_id))
          || case when (school_setting(h.school_id, 'odev.veli_durum_gorur'))::text::boolean then array(select parent_accounts(cur.student_id)) else '{}'::uuid[] end,
          'Ödev kontrol edildi · ' || c.name || ': ' || h.title || ' — ' ||
            case v_status when 'yapti' then 'Yaptı' when 'yapmadi' then 'Yapmadı' when 'eksik' then 'Eksik' when 'gelmedi' then 'Gelmedi' else 'İzinli' end,
          jsonb_build_object('page', 'odevler', 'homework', h.id));
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function set_homework_statuses(uuid, jsonb) from public, anon;
grant execute on function set_homework_statuses(uuid, jsonb) to authenticated;

-- ---------- Hatırlatma (her sabah 08.00) ----------
-- Son teslime X gün (ayar) kalan ve hâlâ "bekliyor" durumundaki öğrencilere ve velilerine bir kez bildirim.
create or replace function odev_hatirlatma() returns int
language plpgsql security definer set search_path = public as $$
declare h record; n int := 0; today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  for h in
    select hw.*, c.name course_name, (school_setting(hw.school_id, 'odev.hatirlatma_gun'))::text::int days
    from homework hw join courses c on c.id = hw.course_id
    where hw.due_on is not null and hw.due_on >= today and hw.reminded_on is null
      and (school_setting(hw.school_id, 'modul.odev'))::text::boolean
  loop
    if h.days > 0 and h.due_on - today <= h.days then
      perform notify_many(
        array(select student_accounts(hs.student_id) from homework_students hs where hs.homework_id = h.id and hs.status = 'bekliyor')
        || array(select parent_accounts(hs.student_id) from homework_students hs where hs.homework_id = h.id and hs.status = 'bekliyor'),
        'Ödev hatırlatma · ' || h.course_name || ': ' || h.title || ' — son gün ' || to_char(h.due_on, 'DD.MM'),
        jsonb_build_object('page', 'odevler', 'homework', h.id));
      update homework set reminded_on = today where id = h.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function odev_hatirlatma() from public, anon, authenticated;
grant execute on function odev_hatirlatma() to service_role;
select cron.schedule('odev-hatirlatma', '0 5 * * *', $$select public.odev_hatirlatma()$$);
