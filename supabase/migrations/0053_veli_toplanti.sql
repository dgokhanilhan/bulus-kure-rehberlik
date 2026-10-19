-- Veli toplantısı görüşme formu: toplantıda öğretmenin öğrenci için işaretlediği gözlemler ve aldığı notlar.
-- Öğrencinin deneme, ödev, devamsızlık ve görüşme özeti mevcut tablolardan okunur (bu tablo yalnız formu tutar).
-- Kim: rehber/yönetici bütün öğrenciler; öğretmen yalnız erişebildiği (atandığı) sınıfların öğrencileri. Veli ve öğrenci
-- erişemez (öğretmen içi form). Onaylanmamış kullanıcı hiçbir satır görmez (is_teacher → my_school onaylı ister).
-- Yalnız ekleme: mevcut tablo ve veriler değişmez. Geri alma: supabase/geri-alma/0053_veli_toplanti_geri_al.sql

create table veli_toplanti_formlari (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  toplanti_tarihi date not null,
  -- madde anahtarı → 'evet' | 'kismen' | 'hayir' (anahtarlar ön yüzde tanımlı; yalnız bu üç değer kabul edilir)
  gozlemler jsonb not null default '{}'::jsonb check (jsonb_typeof(gozlemler) = 'object'),
  katilan text check (char_length(katilan) <= 200),
  veli_gorusu text check (char_length(veli_gorusu) <= 4000),
  kararlar text check (char_length(kararlar) <= 4000),
  notlar text check (char_length(notlar) <= 4000),
  takip_tarihi date,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, toplanti_tarihi)
);
create index veli_toplanti_formlari_okul on veli_toplanti_formlari (school_id, toplanti_tarihi);

create function veli_toplanti_gozlem_gecerli(g jsonb) returns boolean language sql immutable as $$
  select not exists (select 1 from jsonb_each(g) e where jsonb_typeof(e.value) <> 'string' or e.value #>> '{}' not in ('evet', 'kismen', 'hayir') or char_length(e.key) > 40)
     and (select count(*) from jsonb_object_keys(g)) <= 40
$$;
alter table veli_toplanti_formlari add constraint veli_toplanti_gozlem_degerleri check (veli_toplanti_gozlem_gecerli(gozlemler));

-- Yazan ve zaman damgası sunucuda konur (istemciden gelen değer yok sayılır)
create function veli_toplanti_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.student_id := old.student_id;
    new.school_id := old.school_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger veli_toplanti_damga before insert or update on veli_toplanti_formlari for each row execute function veli_toplanti_damga();

alter table veli_toplanti_formlari enable row level security;
create policy veli_toplanti_ogretmen on veli_toplanti_formlari for all to authenticated
  using (school_id = my_school() and is_teacher() and can_see_student(student_id))
  with check (school_id = my_school() and is_teacher() and can_see_student(student_id));
-- Okul sınırı (0037 deseni): eski/izin verici bir politika eklense bile başka okulun ya da görülemeyen öğrencinin satırı açılmaz
create policy security_school on veli_toplanti_formlari as restrictive for all to authenticated
  using (school_id = my_school() and can_see_student(student_id))
  with check (school_id = my_school() and can_see_student(student_id));
revoke all on veli_toplanti_formlari from anon;
grant select, insert, update, delete on veli_toplanti_formlari to authenticated;
