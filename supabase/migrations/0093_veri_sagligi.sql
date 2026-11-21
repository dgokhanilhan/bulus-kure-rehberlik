-- Veri sağlığı merkezi (Yönetim → Kişiler → Veri sağlığı).
-- 1) "Farklı kişiler" işareti: aynı adlı iki öğrenci bir daha tekrar adayı olarak gösterilmez.
-- 2) Öğrenci başına bağlı veri sayısı (birleştirme kararı için; yalnız okuma).
-- 3) Boş tekrar kaydını asıl kayda birleştirme: yalnız düşen kayıtta deneme, yoklama, görev vb. veri YOKSA çalışır.
--    Böylece hiçbir sonuç ya da yoklama satırı yer değiştirmez, bildirim tetikleyicileri çalışmaz, veri kaybolmaz.
-- 4) Toplu ad düzeltme: yalnız büyük/küçük harf değişikliğine izin verir (harfler aynı kalmalı).
-- Hepsi yalnız yönetici (is_admin: rol + iki adımlı doğrulama) ve kendi okulu için.

create table veri_farkli_kisi (
  a uuid not null references students(id) on delete cascade,
  b uuid not null references students(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index veri_farkli_kisi_school on veri_farkli_kisi (school_id);
alter table veri_farkli_kisi enable row level security;
create policy vfk_read on veri_farkli_kisi for select using (is_admin() and school_id = my_school());

create or replace function ogrenci_farkli_kisi(p_a uuid, p_b uuid, p_farkli boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare x uuid := least(p_a, p_b); y uuid := greatest(p_a, p_b);
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if x = y then raise exception 'Aynı kayıt seçildi.' using errcode = '22023'; end if;
  if (select count(*) from students where id in (x, y) and school_id = my_school()) <> 2 then
    raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002';
  end if;
  if p_farkli then
    insert into veri_farkli_kisi (a, b, school_id, created_by) values (x, y, my_school(), auth.uid()) on conflict do nothing;
  else
    delete from veri_farkli_kisi where a = x and b = y;
  end if;
end $$;

-- Öğrenciye bağlı satır sayıları (öğrenciye yabancı anahtarla bağlı tüm tablolar). Veli bağlantısı ve hesap ayrı sayılır.
create or replace function ogrenci_veri_sayilari(p_ids uuid[])
returns table (student_id uuid, tablo text, adet bigint) language plpgsql security definer stable set search_path = public as $$
declare r record; ids uuid[];
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select array_agg(id) into ids from students where id = any(p_ids) and school_id = my_school();
  if ids is null then return; end if;
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.students'::regclass and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.veri_farkli_kisi'::regclass
  loop
    return query execute format('select %I, %L::text, count(*) from %s where %I = any($1) group by 1', r.col, r.tbl, r.tbl, r.col) using ids;
  end loop;
end $$;

-- Boş tekrar kaydını (p_drop) asıl kayda (p_keep) birleştirir: veli bağlantıları, öğrenci hesabı, etüt/galeri listeleri
-- ve okul no taşınır; sonra boş kayıt silinir. Düşen kayıtta başka veri varsa hiçbir şey yapmadan durur.
create or replace function ogrenci_birlestir(p_keep uuid, p_drop uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k students; d students; r record; n bigint; veri text[] := '{}'; veli int; hesap int;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if p_keep = p_drop then raise exception 'Aynı kayıt seçildi.' using errcode = '22023'; end if;
  select * into k from students where id = p_keep and school_id = my_school() for update;
  select * into d from students where id = p_drop and school_id = my_school() for update;
  if k.id is null or d.id is null then raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002'; end if;

  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.students'::regclass and array_length(c.conkey, 1) = 1
      and c.conrelid not in ('public.parent_links'::regclass, 'public.profiles'::regclass, 'public.veri_farkli_kisi'::regclass)
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using d.id;
    if n > 0 then veri := veri || r.tbl; end if;
  end loop;
  if cardinality(veri) > 0 then
    raise exception 'Bu kayıtta da veri var (%). Otomatik birleştirme yalnız boş kayıtta yapılır.', array_to_string(veri, ', ') using errcode = '22023';
  end if;

  insert into parent_links (parent_id, student_id, relation)
    select parent_id, k.id, relation from parent_links pl
    where pl.student_id = d.id and not exists (select 1 from parent_links x where x.student_id = k.id and x.parent_id = pl.parent_id);
  get diagnostics veli = row_count;
  delete from parent_links where student_id = d.id;
  update profiles set student_id = k.id where student_id = d.id;
  get diagnostics hesap = row_count;

  update etut_gruplari set ogrenciler = array(select distinct unnest(array_replace(ogrenciler, d.id, k.id))) where d.id = any(ogrenciler);
  update etut_talepler set ogrenciler = array(select distinct unnest(array_replace(ogrenciler, d.id, k.id))) where d.id = any(ogrenciler);
  update gallery_albums set student_ids = array(select distinct unnest(array_replace(student_ids, d.id, k.id))) where d.id = any(student_ids);
  update exams set created_students = array_remove(created_students, d.id) where d.id = any(created_students);

  if k.school_no is null and d.school_no is not null then
    update students set school_no = null where id = d.id;
    update students set school_no = d.school_no where id = k.id;
  end if;
  delete from students where id = d.id;

  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'merge', 'students', k.id, jsonb_build_object('silinen', d.id, 'ad', d.full_name, 'sinif', d.class_name, 'veli', veli, 'hesap', hesap));
  return jsonb_build_object('veli', veli, 'hesap', hesap);
end $$;

-- Toplu ad düzeltme. p_ogrenciler / p_kisiler: [{"id": "...", "ad": "Deniz Kara"}]
-- Yalnız harf büyüklüğü değişebilir; harfleri farklı olan satır atlanır (yanlışlıkla yeniden adlandırma olmaz).
create or replace function ad_kurali(t text) returns text language sql immutable as $$
  select lower(translate(btrim(t), 'İIı', 'iii'))
$$;

create or replace function toplu_ad_duzelt(p_ogrenciler jsonb default '[]', p_kisiler jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare e jsonb; v text; o int := 0; p int := 0; atla int := 0; n int;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if jsonb_array_length(coalesce(p_ogrenciler, '[]')) + jsonb_array_length(coalesce(p_kisiler, '[]')) > 2000 then
    raise exception 'Tek seferde en fazla 2000 ad düzeltilebilir.' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_ogrenciler, '[]')) loop
    v := btrim(e->>'ad');
    update students set full_name = v
      where id = (e->>'id')::uuid and school_id = my_school() and full_name is distinct from v
        and length(v) between 2 and 80 and ad_kurali(full_name) = ad_kurali(v);
    get diagnostics n = row_count; if n = 0 then atla := atla + 1; else o := o + 1; end if;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p_kisiler, '[]')) loop
    v := btrim(e->>'ad');
    update profiles set full_name = v
      where id = (e->>'id')::uuid and school_id = my_school() and full_name is distinct from v
        and length(v) between 2 and 80 and ad_kurali(full_name) = ad_kurali(v);
    get diagnostics n = row_count; if n = 0 then atla := atla + 1; else p := p + 1; end if;
  end loop;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'update', 'ad_duzeltme', null, jsonb_build_object('ogrenci', o, 'kisi', p, 'atlanan', atla));
  return jsonb_build_object('ogrenci', o, 'kisi', p, 'atlanan', atla);
end $$;

revoke all on function ogrenci_farkli_kisi(uuid, uuid, boolean) from public, anon;
revoke all on function ogrenci_veri_sayilari(uuid[]) from public, anon;
revoke all on function ogrenci_birlestir(uuid, uuid) from public, anon;
revoke all on function toplu_ad_duzelt(jsonb, jsonb) from public, anon;
grant execute on function ogrenci_farkli_kisi(uuid, uuid, boolean) to authenticated;
grant execute on function ogrenci_veri_sayilari(uuid[]) to authenticated;
grant execute on function ogrenci_birlestir(uuid, uuid) to authenticated;
grant execute on function toplu_ad_duzelt(jsonb, jsonb) to authenticated;
