-- 0095 Aile hedef seçimi: veli (bağlı olduğu öğrenci için) ve öğrenci (kendisi için) hedef okul / bölüm ekleyip çıkarabilir.
-- Tablolar aileye açılmaz; her şey aşağıdaki security definer fonksiyonlarla ve aynı yetki koşuluyla (aile_erisimi) yapılır.
-- Kurallar: ailenin eklediği en çok 5 hedef (toplam sınır 10, 0054 tetikleyicisi); öğretmenin eklediği hedefi yalnız personel
-- çıkarır; aile hedef ekleyince okulun rehberlik öğretmenlerine bildirim gider. Öğretmen ekranı ve 0060 aile_hedefleri değişmez.

-- Çağıran bu öğrencinin onaylı öğrenci hesabı ya da bağlı onaylı velisi mi?
create function aile_erisimi(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles me join students s on s.id = p_student and s.school_id = me.school_id and s.archived_at is null
    where me.id = auth.uid() and me.status = 'approved'
      and ((me.role = 'ogrenci' and me.student_id = p_student)
           or (me.role = 'veli' and exists (select 1 from parent_links pl where pl.parent_id = me.id and pl.student_id = p_student))))
$$;
revoke all on function aile_erisimi(uuid) from public, anon;

-- Hedefler + kimin eklediği (ogretmen | veli | ogrenci) + aile çıkarabilir mi
create function aile_hedef_listesi(p_student uuid)
returns table (id uuid, sinav text, yil int, kurum text, il text, ilce text, birim text, program text, puan_turu text,
               taban_puan numeric, yuzdelik numeric, kontenjan int, ekleyen text, silinebilir boolean)
language sql stable security definer set search_path = public as $$
  select h.id, p.sinav, p.yil::int, p.kurum, p.il, p.ilce, p.birim, p.program, p.puan_turu, p.taban_puan::numeric, p.yuzdelik::numeric, p.kontenjan,
         case when pr.role in ('veli', 'ogrenci') then pr.role::text else 'ogretmen' end,
         coalesce(pr.role in ('veli', 'ogrenci'), false)
  from ogrenci_hedefleri h
  join hedef_programlar p on p.id = h.program_id
  left join profiles pr on pr.id = h.created_by
  where h.student_id = p_student and aile_erisimi(p_student)
  order by h.created_at
$$;
revoke all on function aile_hedef_listesi(uuid) from public, anon;
grant execute on function aile_hedef_listesi(uuid) to authenticated;

-- Arama için Türkçe harfleri sadeleştir (İ/I/ı → i, ğ → g …), büyük-küçük harf farkı yok
create function hedef_ara_norm(t text) returns text language sql immutable as $$
  select lower(translate(t, 'İIıĞğÜüŞşÖöÇç', 'iiigguussoocc'))
$$;

-- Seçilebilir liste: o sınavın en güncel yılı (okulun yüklediği ya da yerleşik). İl ya da ad araması gerekir.
create function aile_hedef_secenekleri(p_student uuid, p_sinav text, p_il text, p_ara text)
returns table (id uuid, yil int, kurum text, il text, ilce text, birim text, program text, puan_turu text, taban_puan numeric, yuzdelik numeric)
language sql stable security definer set search_path = public as $$
  with gorunur as (
    select p.* from hedef_programlar p
    where p.sinav = p_sinav and (p.school_id is null or p.school_id = (select school_id from students where id = p_student))
  ), son as (select max(yil) y from gorunur)
  select g.id, g.yil::int, g.kurum, g.il, g.ilce, g.birim, g.program, g.puan_turu, g.taban_puan::numeric, g.yuzdelik::numeric
  from gorunur g, son
  where aile_erisimi(p_student) and g.yil = son.y
    and (nullif(btrim(coalesce(p_il, '')), '') is null or g.il = p_il)
    and (nullif(btrim(coalesce(p_ara, '')), '') is null
         or hedef_ara_norm(g.kurum || ' ' || coalesce(g.program, '') || ' ' || coalesce(g.ilce, '')) like '%' || hedef_ara_norm(btrim(p_ara)) || '%')
    and (nullif(btrim(coalesce(p_il, '')), '') is not null or char_length(btrim(coalesce(p_ara, ''))) >= 3)
  order by g.taban_puan desc nulls last
  limit 1500
$$;
revoke all on function aile_hedef_secenekleri(uuid, text, text, text) from public, anon;
grant execute on function aile_hedef_secenekleri(uuid, text, text, text) to authenticated;

-- İllere göre kayıt sayısı (il seçici ve "listede N okul" satırı için)
create function aile_hedef_iller(p_student uuid, p_sinav text)
returns table (il text, adet int, yil int)
language sql stable security definer set search_path = public as $$
  with gorunur as (
    select p.il, p.yil from hedef_programlar p
    where p.sinav = p_sinav and p.il is not null and (p.school_id is null or p.school_id = (select school_id from students where id = p_student))
  ), son as (select max(yil) y from gorunur)
  select g.il, count(*)::int, max(g.yil)::int from gorunur g, son
  where aile_erisimi(p_student) and g.yil = son.y
  group by g.il order by g.il
$$;
revoke all on function aile_hedef_iller(uuid, text) from public, anon;
grant execute on function aile_hedef_iller(uuid, text) to authenticated;

create function aile_hedef_ekle(p_student uuid, p_program uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s students; p hedef_programlar; v_id uuid; n int; kim text;
begin
  if not aile_erisimi(p_student) then raise exception 'Bu öğrenci için hedef eklenemez.' using errcode = '42501'; end if;
  select * into s from students where id = p_student;
  select * into p from hedef_programlar where id = p_program and (school_id is null or school_id = s.school_id);
  if p.id is null then raise exception 'Okul / bölüm bulunamadı.' using errcode = '22023'; end if;
  if exists (select 1 from ogrenci_hedefleri where student_id = p_student and program_id = p_program) then
    raise exception 'Bu hedef zaten listede.' using errcode = '23505';
  end if;
  select count(*) into n from ogrenci_hedefleri h join profiles pr on pr.id = h.created_by
  where h.student_id = p_student and pr.role in ('veli', 'ogrenci');
  if n >= 5 then raise exception 'Aile en çok 5 hedef ekleyebilir. Yeni hedef için önce birini çıkarın.' using errcode = '22023'; end if;
  insert into ogrenci_hedefleri (school_id, student_id, program_id) values (s.school_id, p_student, p_program) returning id into v_id;
  select case role when 'veli' then 'Velisi' else 'Öğrenci' end into kim from profiles where id = auth.uid();
  perform notify_many(
    array(select id from profiles where school_id = s.school_id and role = 'ogretmen' and branch = 'Rehberlik' and status = 'approved'),
    s.full_name || ' · ' || kim || ' hedef ekledi: ' || p.kurum || coalesce(' · ' || p.program, ''),
    jsonb_build_object('page', 'ogrenci', 'sid', s.id, 'tab', 'hedef'));
  return v_id;
end $$;
revoke all on function aile_hedef_ekle(uuid, uuid) from public, anon;
grant execute on function aile_hedef_ekle(uuid, uuid) to authenticated;

create function aile_hedef_sil(p_student uuid, p_hedef uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not aile_erisimi(p_student) then raise exception 'Bu öğrenci için hedef çıkarılamaz.' using errcode = '42501'; end if;
  delete from ogrenci_hedefleri h using profiles pr
  where h.id = p_hedef and h.student_id = p_student and pr.id = h.created_by and pr.role in ('veli', 'ogrenci');
  if not found then raise exception 'Öğretmenin eklediği hedefi yalnız öğretmen çıkarabilir.' using errcode = '42501'; end if;
end $$;
revoke all on function aile_hedef_sil(uuid, uuid) from public, anon;
grant execute on function aile_hedef_sil(uuid, uuid) to authenticated;
