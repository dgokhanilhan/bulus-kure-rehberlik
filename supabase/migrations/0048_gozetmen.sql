-- Gözetmen Bul (bağımsız modül): deneme sınavı oturumları, sınıflar ve gözetmen / dinlendirici öğretmen görevleri.
-- Mevcut tablolar DEĞİŞMEZ: öğretmen (profiles), sınıf (classes) ve ders programı (timetable, bell_times) yalnız okunur.
-- Bütün veriler gozetmen_* tablolarındadır; kaldırmak için supabase/geri-alma/0048_gozetmen_geri_al.sql yeterlidir.
-- Mevcut tablolara yapılan dış anahtarlar silmeyi ENGELLEMEZ (sınıf/öğretmen silinirse bağlantı boşalır, ad kopyası kalır),
-- böylece yeni dönem arşivi ve sınıf/öğretmen silme işlemleri bu modülden etkilenmez.
-- Yetki: yalnız iki adımlı doğrulamalı okul yöneticisi (is_admin) okur ve yazar.

create table gozetmen_sinavlar (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 120),
  exam_type text not null check (exam_type in ('ortaokul', 'tyt', 'ayt', 'diger')),
  exam_date date not null,
  note text check (note is null or length(note) <= 1000),
  status text not null default 'taslak' check (status in ('taslak', 'atandi')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gozetmen_sinavlar_school on gozetmen_sinavlar (school_id, exam_date desc);

create table gozetmen_oturumlar (
  id uuid primary key default gen_random_uuid(),
  sinav_id uuid not null references gozetmen_sinavlar(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  starts time not null,
  ends time not null check (ends > starts),
  sort smallint not null default 0
);
create index gozetmen_oturumlar_sinav on gozetmen_oturumlar (sinav_id, sort);

create table gozetmen_siniflar (
  id uuid primary key default gen_random_uuid(),
  sinav_id uuid not null references gozetmen_sinavlar(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  class_name text not null check (length(class_name) between 1 and 20),
  room text check (room is null or length(room) <= 40),
  unique (sinav_id, class_id)
);
create index gozetmen_siniflar_sinav on gozetmen_siniflar (sinav_id);

create table gozetmen_gorevler (
  id uuid primary key default gen_random_uuid(),
  sinav_id uuid not null references gozetmen_sinavlar(id) on delete cascade,
  oturum_id uuid not null references gozetmen_oturumlar(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  role text not null check (role in ('gozetmen', 'dinlendirici')),
  -- Gözetmende sınıf zorunlu; dinlendirici sınıfa bağlı değildir (kapsam serbest metin: "2. kat", "8/A–8/D").
  class_id uuid references classes(id) on delete set null,
  class_name text check (class_name is null or length(class_name) <= 20),
  scope text check (scope is null or length(scope) <= 80),
  teacher_id uuid references profiles(id) on delete set null,
  teacher_name text not null check (length(teacher_name) between 1 and 120),
  check (role = 'dinlendirici' or class_name is not null)
);
create index gozetmen_gorevler_sinav on gozetmen_gorevler (sinav_id);
create index gozetmen_gorevler_teacher on gozetmen_gorevler (school_id, teacher_id);

alter table gozetmen_sinavlar enable row level security;
alter table gozetmen_oturumlar enable row level security;
alter table gozetmen_siniflar enable row level security;
alter table gozetmen_gorevler enable row level security;
create policy gozetmen_sinavlar_admin on gozetmen_sinavlar for all to authenticated
  using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create policy gozetmen_oturumlar_admin on gozetmen_oturumlar for all to authenticated
  using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create policy gozetmen_siniflar_admin on gozetmen_siniflar for all to authenticated
  using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create policy gozetmen_gorevler_admin on gozetmen_gorevler for all to authenticated
  using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());

-- Sınavı (oturumlar, sınıflar ve görevlerle) tek işlemde kaydeder. p_sinav null ise yeni sınav açılır.
-- p_atama true ise durum 'atandi' olur ("ATAMAYI YAP"). Çağıranın yetkisi RLS ile de denetlenir (security invoker).
-- p_data: {title, exam_type, exam_date, note,
--          oturumlar: [{key, name, starts, ends}], siniflar: [{class_id, class_name, room}],
--          gorevler: [{oturum_key, role, class_id, class_name, scope, teacher_id, teacher_name}]}
create or replace function gozetmen_kaydet(p_sinav uuid, p_data jsonb, p_atama boolean default false) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_school uuid := my_school();
  v_id uuid := p_sinav;
  o jsonb;
  g jsonb;
  keys jsonb := '{}'::jsonb;
  oid uuid;
  i int := 0;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if jsonb_array_length(coalesce(p_data->'oturumlar', '[]')) = 0 then raise exception 'En az bir oturum gerekir.' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_data->'oturumlar', '[]')) > 6 then raise exception 'En fazla 6 oturum tanımlanabilir.' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_data->'siniflar', '[]')) = 0 then raise exception 'En az bir sınıf seçilmeli.' using errcode = '22023'; end if;

  if v_id is null then
    insert into gozetmen_sinavlar (school_id, title, exam_type, exam_date, note, status, created_by)
    values (v_school, btrim(p_data->>'title'), p_data->>'exam_type', (p_data->>'exam_date')::date, nullif(btrim(p_data->>'note'), ''),
            case when p_atama then 'atandi' else 'taslak' end, auth.uid())
    returning id into v_id;
  else
    update gozetmen_sinavlar set title = btrim(p_data->>'title'), exam_type = p_data->>'exam_type', exam_date = (p_data->>'exam_date')::date,
      note = nullif(btrim(p_data->>'note'), ''), status = case when p_atama then 'atandi' else status end, updated_at = now()
    where id = v_id and school_id = v_school;
    if not found then raise exception 'Sınav bulunamadı.' using errcode = '23503'; end if;
    delete from gozetmen_oturumlar where sinav_id = v_id;   -- görevler de silinir (cascade)
    delete from gozetmen_siniflar where sinav_id = v_id;
  end if;

  for o in select * from jsonb_array_elements(p_data->'oturumlar') loop
    insert into gozetmen_oturumlar (sinav_id, school_id, name, starts, ends, sort)
    values (v_id, v_school, btrim(o->>'name'), (o->>'starts')::time, (o->>'ends')::time, i)
    returning id into oid;
    keys := keys || jsonb_build_object(o->>'key', oid);
    i := i + 1;
  end loop;

  insert into gozetmen_siniflar (sinav_id, school_id, class_id, class_name, room)
  select v_id, v_school, c.id, x->>'class_name', nullif(btrim(x->>'room'), '')
  from jsonb_array_elements(p_data->'siniflar') x
  left join classes c on c.id = (x->>'class_id')::uuid and c.school_id = v_school;

  for g in select * from jsonb_array_elements(coalesce(p_data->'gorevler', '[]')) loop
    if not keys ? (g->>'oturum_key') then raise exception 'Görev bilinmeyen bir oturuma bağlı.' using errcode = '22023'; end if;
    insert into gozetmen_gorevler (sinav_id, oturum_id, school_id, role, class_id, class_name, scope, teacher_id, teacher_name)
    select v_id, (keys->>(g->>'oturum_key'))::uuid, v_school, g->>'role',
           c.id, nullif(g->>'class_name', ''), nullif(btrim(g->>'scope'), ''), p.id, coalesce(p.full_name, g->>'teacher_name')
    from (select 1) one
    left join classes c on c.id = nullif(g->>'class_id', '')::uuid and c.school_id = v_school
    left join profiles p on p.id = nullif(g->>'teacher_id', '')::uuid and p.school_id = v_school;
  end loop;
  return v_id;
end $$;
revoke all on function gozetmen_kaydet(uuid, jsonb, boolean) from public, anon;
grant execute on function gozetmen_kaydet(uuid, jsonb, boolean) to authenticated;
