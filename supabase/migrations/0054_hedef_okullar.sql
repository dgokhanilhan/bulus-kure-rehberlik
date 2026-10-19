-- Hedef ve öneri: LGS liseleri ve YKS lisans programlarının taban puanları; öğrencinin hedef okulları/bölümleri.
-- Veri resmî kaynaktan: YKS = ÖSYM "Tablo-4 En Küçük ve En Büyük Puanlar" (yerleşik satırlar, school_id boş; 0055);
-- LGS = okulun e-Okul'daki MEB yerleştirme ekranından şablonla yüklediği liste (okula ait satırlar). Yönetici her yıl
-- yeni listeyi Excel ile yükler (hedef_yukle). Tahmin yok: okunamayan satır atlanır.
-- Kim: okuma öğretmenler (onaylı); liste yükleme yönetici; öğrencinin hedefi öğretmen (yalnız görebildiği öğrenci).
-- Veli ve öğrenci şimdilik erişemez (yalnız öğretmen ekranı). Yalnız ekleme: mevcut tablo ve veriler değişmez.
-- Geri alma: supabase/geri-alma/0054_hedef_okullar_geri_al.sql

-- ---------- Ayar: listelenecek iller ----------
alter function setting_spec() rename to setting_spec_before_0054;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0054() || '{"hedef.iller":{"type":"text","max":300,"default":"Bartın,İstanbul,Ankara,İzmir"}}'::jsonb
$$;

-- ---------- Tablolar ----------
create table hedef_programlar (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade, -- boş = yerleşik (ÖSYM), dolu = okulun yüklediği
  sinav text not null check (sinav in ('LGS', 'YKS')),
  yil smallint not null check (yil between 2015 and 2100),
  kod text not null check (char_length(kod) between 1 and 200),
  kurum text not null check (char_length(kurum) between 1 and 300),
  il text check (char_length(il) <= 60),
  ilce text check (char_length(ilce) <= 80),
  birim text check (char_length(birim) <= 300),
  program text check (char_length(program) <= 300),
  puan_turu text check (puan_turu in ('SAY', 'EA', 'SOZ', 'DIL')),
  taban_puan numeric(8, 5) check (taban_puan between 0 and 600),
  tavan_puan numeric(8, 5) check (tavan_puan between 0 and 600),
  yuzdelik numeric(7, 4) check (yuzdelik between 0 and 100),
  kontenjan integer check (kontenjan >= 0),
  yerlesen integer check (yerlesen >= 0),
  kaynak text check (char_length(kaynak) <= 300),
  created_at timestamptz not null default now(),
  check (sinav = 'LGS' or puan_turu is not null)
);
create unique index hedef_programlar_tekil on hedef_programlar (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), sinav, yil, kod);
create index hedef_programlar_arama on hedef_programlar (sinav, yil, il);

create table ogrenci_hedefleri (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  program_id uuid not null references hedef_programlar(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, program_id)
);

-- Ekleyen sunucuda konur; bir öğrencinin en çok 10 hedefi olur
create function ogrenci_hedefi_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  if (select count(*) from ogrenci_hedefleri where student_id = new.student_id) >= 10 then
    raise exception 'Bir öğrencinin en çok 10 hedefi olabilir.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger ogrenci_hedefi_damga before insert on ogrenci_hedefleri for each row execute function ogrenci_hedefi_damga();

alter table hedef_programlar enable row level security;
create policy hedef_programlar_oku on hedef_programlar for select to authenticated
  using (is_teacher() and (school_id is null or school_id = my_school()));
-- Doğrudan yazma yok: okulun listesi yalnız hedef_yukle ile (yönetici); yerleşik satırlar yalnız migration ile.
revoke all on hedef_programlar from anon;
grant select on hedef_programlar to authenticated;

alter table ogrenci_hedefleri enable row level security;
create policy ogrenci_hedefleri_ogretmen on ogrenci_hedefleri for all to authenticated
  using (school_id = my_school() and is_teacher() and can_see_student(student_id))
  with check (school_id = my_school() and is_teacher() and can_see_student(student_id)
              and exists (select 1 from hedef_programlar p where p.id = program_id and (p.school_id is null or p.school_id = my_school())));
create policy security_school on ogrenci_hedefleri as restrictive for all to authenticated
  using (school_id = my_school() and can_see_student(student_id))
  with check (school_id = my_school() and can_see_student(student_id));
revoke all on ogrenci_hedefleri from anon;
grant select, insert, delete on ogrenci_hedefleri to authenticated;

-- ---------- Liste yükleme (yönetici): okulun o sınav + yıl listesi değiştirilir ----------
-- p_bastan = true: okulun o sınav/yıl satırları önce silinir (ilk parça). Büyük liste parça parça gönderilir.
-- Silinen satıra bağlı öğrenci hedefi de silinir (aynı okul/kod yeniden yüklenince hedef yeniden seçilir).
create function hedef_yukle(p_sinav text, p_yil smallint, p_kaynak text, p_satirlar jsonb, p_bastan boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare v_school uuid := my_school(); n integer;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir.' using errcode = '42501'; end if;
  if p_sinav not in ('LGS', 'YKS') then raise exception 'Sınav LGS ya da YKS olmalı.' using errcode = '22023'; end if;
  if jsonb_typeof(p_satirlar) is distinct from 'array' or jsonb_array_length(p_satirlar) not between 1 and 3000 then
    raise exception 'Bir parçada 1–3000 satır gönderilir.' using errcode = '22023';
  end if;
  if p_bastan then delete from hedef_programlar where school_id = v_school and sinav = p_sinav and yil = p_yil; end if;
  insert into hedef_programlar (school_id, sinav, yil, kod, kurum, il, ilce, birim, program, puan_turu, taban_puan, tavan_puan, yuzdelik, kontenjan, yerlesen, kaynak)
  select v_school, p_sinav, p_yil, btrim(r->>'kod'), btrim(r->>'kurum'), nullif(btrim(r->>'il'), ''), nullif(btrim(r->>'ilce'), ''), nullif(btrim(r->>'birim'), ''),
         nullif(btrim(r->>'program'), ''), nullif(r->>'puan_turu', ''), (r->>'taban_puan')::numeric, (r->>'tavan_puan')::numeric, (r->>'yuzdelik')::numeric,
         (r->>'kontenjan')::integer, (r->>'yerlesen')::integer, left(p_kaynak, 300)
  from jsonb_array_elements(p_satirlar) r
  on conflict (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), sinav, yil, kod) do update
    set kurum = excluded.kurum, il = excluded.il, ilce = excluded.ilce, birim = excluded.birim, program = excluded.program, puan_turu = excluded.puan_turu,
        taban_puan = excluded.taban_puan, tavan_puan = excluded.tavan_puan, yuzdelik = excluded.yuzdelik, kontenjan = excluded.kontenjan,
        yerlesen = excluded.yerlesen, kaynak = excluded.kaynak;
  get diagnostics n = row_count;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'hedef_yukle', 'hedef_programlar', null, jsonb_build_object('sinav', p_sinav, 'yil', p_yil, 'satir', n, 'bastan', p_bastan, 'kaynak', left(p_kaynak, 300)));
  return n;
end $$;
revoke all on function hedef_yukle(text, smallint, text, jsonb, boolean) from public, anon;
grant execute on function hedef_yukle(text, smallint, text, jsonb, boolean) to authenticated;

-- Okulun yüklediği bir listeyi kaldır (yönetici)
create function hedef_sil(p_sinav text, p_yil smallint) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir.' using errcode = '42501'; end if;
  delete from hedef_programlar where school_id = my_school() and sinav = p_sinav and yil = p_yil;
  get diagnostics n = row_count;
  insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'hedef_sil', 'hedef_programlar', null, jsonb_build_object('sinav', p_sinav, 'yil', p_yil, 'satir', n));
  return n;
end $$;
revoke all on function hedef_sil(text, smallint) from public, anon;
grant execute on function hedef_sil(text, smallint) to authenticated;

-- Yönetim ekranı özeti: yüklü listeler (sınav, yıl, yerleşik/okul, satır sayısı, kaynak)
create function hedef_ozet() returns table (sinav text, yil smallint, yerlesik boolean, satir bigint, tabanli bigint, kaynak text)
language sql stable security definer set search_path = public as $$
  select p.sinav, p.yil, p.school_id is null, count(*), count(p.taban_puan), max(p.kaynak)
  from hedef_programlar p
  where is_teacher() and (p.school_id is null or p.school_id = my_school())
  group by 1, 2, 3 order by 1, 2 desc, 3
$$;
revoke all on function hedef_ozet() from public, anon;
grant execute on function hedef_ozet() to authenticated;
