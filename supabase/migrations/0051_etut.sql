-- Cumartesi etütleri (bağımsız modül): rehber öğretmen / yönetici öğretmen × 5 ders saati planı yapar, öğretmenler etüt
-- talebi oluşturur, yayınlanan program veli ve öğrenciye görünür, etüt öğretmeni yoklama alır.
-- Yalnız ekleme: mevcut tablo ve veriler değişmez (şube bazlı eski etütler, study_sessions, olduğu gibi kalır).
-- Yazma yalnız aşağıdaki SECURITY DEFINER fonksiyonlarla (içeride yetki denetimi); tablolarda doğrudan yazma politikası yok.
-- Öğrenci silinirse etüt satırı da silinir; öğretmen silinirse bağlantı boşalır (ad kopyası kalır) — silme engellenmez.
-- Geri alma: supabase/geri-alma/0051_etut_geri_al.sql

-- ---------- Ayarlar: modül ve bildirim ----------
alter function setting_spec() rename to setting_spec_before_0051;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0051() || '{"modul.etut":{"type":"bool","default":true},"bildirim.etut":{"type":"bool","default":true}}'::jsonb
$$;

-- ---------- Tablolar ----------
create table etut_gunler (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  tarih date not null check (extract(isodow from tarih) = 6),
  kademe text not null check (kademe in ('ortaokul', 'lise')),
  saatler jsonb not null check (jsonb_typeof(saatler) = 'array' and jsonb_array_length(saatler) = 5),
  durum text not null default 'taslak' check (durum in ('taslak', 'yayinda')),
  yayin_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, tarih, kademe)
);

create table etut_talepler (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete set null,
  teacher_name text not null check (length(teacher_name) between 1 and 120),
  konu text not null check (length(btrim(konu)) between 2 and 120),
  aciklama text check (aciklama is null or length(aciklama) <= 500),
  ogrenciler uuid[] not null check (cardinality(ogrenciler) between 1 and 40),
  istenen_tarih date check (istenen_tarih is null or extract(isodow from istenen_tarih) = 6),
  istenen_ders smallint check (istenen_ders is null or istenen_ders between 1 and 5),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'planlandi', 'reddedildi', 'iptal')),
  karar_notu text check (karar_notu is null or length(karar_notu) <= 300),
  karar_by uuid references profiles(id) on delete set null,
  karar_at timestamptz,
  hucre_id uuid,
  plan_tarih date,
  plan_ders smallint,
  created_at timestamptz not null default now()
);
create index etut_talepler_school on etut_talepler (school_id, durum, created_at desc);
create index etut_talepler_teacher on etut_talepler (teacher_id);

create table etut_hucreler (
  id uuid primary key default gen_random_uuid(),
  gun_id uuid not null references etut_gunler(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  ders smallint not null check (ders between 1 and 5),
  teacher_id uuid references profiles(id) on delete set null,
  teacher_name text not null check (length(btrim(teacher_name)) between 1 and 120),
  tur text not null check (tur in ('etut', 'mesgul')),
  konu text check (konu is null or length(konu) <= 120),
  salon text check (salon is null or length(salon) <= 40),
  aciklama text check (aciklama is null or length(aciklama) <= 200),
  talep_id uuid references etut_talepler(id) on delete set null,
  check (tur = 'mesgul' or length(btrim(coalesce(konu, ''))) > 0)
);
create unique index etut_hucreler_ogretmen_ders on etut_hucreler (gun_id, lower(btrim(teacher_name)), ders);
create index etut_hucreler_teacher on etut_hucreler (teacher_id);
alter table etut_talepler add constraint etut_talepler_hucre_fk foreign key (hucre_id) references etut_hucreler(id) on delete set null;

create table etut_ogrenciler (
  id uuid primary key default gen_random_uuid(),
  hucre_id uuid not null references etut_hucreler(id) on delete cascade,
  gun_id uuid not null references etut_gunler(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  ders smallint not null check (ders between 1 and 5),
  student_id uuid not null references students(id) on delete cascade,
  student_name text not null,
  class_name text,
  yoklama text check (yoklama in ('geldi', 'gelmedi')),
  yoklama_by uuid references profiles(id) on delete set null,
  yoklama_at timestamptz,
  unique (gun_id, ders, student_id)
);
create index etut_ogrenciler_student on etut_ogrenciler (student_id);
create index etut_ogrenciler_hucre on etut_ogrenciler (hucre_id);

-- ---------- Okuma yetkisi (yardımcılar özyinelemeli politikayı önler) ----------
create or replace function etut_gun_yayinda(p_gun uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from etut_gunler where id = p_gun and durum = 'yayinda' and school_id = my_school())
$$;
-- Veli/öğrenci: o gün (ya da hücre) için kendi/çocuğunun etüt satırı var mı
create or replace function etut_bana_ait(p_gun uuid, p_hucre uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from etut_ogrenciler o
                 where (p_gun is null or o.gun_id = p_gun) and (p_hucre is null or o.hucre_id = p_hucre)
                   and (is_parent_of(o.student_id) or is_student_self(o.student_id)))
$$;
create or replace function etut_hucre_benim(p_hucre uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from etut_hucreler where id = p_hucre and teacher_id = auth.uid())
$$;
revoke all on function etut_gun_yayinda(uuid), etut_bana_ait(uuid, uuid), etut_hucre_benim(uuid) from public, anon;
grant execute on function etut_gun_yayinda(uuid), etut_bana_ait(uuid, uuid), etut_hucre_benim(uuid) to authenticated;

alter table etut_gunler enable row level security;
alter table etut_hucreler enable row level security;
alter table etut_ogrenciler enable row level security;
alter table etut_talepler enable row level security;

-- Rehber/yönetici her şeyi; öğretmen yayındaki programı; veli/öğrenci yalnız yayındaki kendi etüdünün günü, hücresi ve kendi satırı.
create policy etut_gunler_read on etut_gunler for select to authenticated using (
  school_id = my_school() and (is_staff() or (durum = 'yayinda' and (is_teacher() or etut_bana_ait(id, null)))));
create policy etut_hucreler_read on etut_hucreler for select to authenticated using (
  school_id = my_school() and (is_staff() or (etut_gun_yayinda(gun_id) and (is_teacher() or etut_bana_ait(null, id)))));
create policy etut_ogrenciler_read on etut_ogrenciler for select to authenticated using (
  school_id = my_school() and (is_staff() or (etut_gun_yayinda(gun_id) and (
    (is_teacher() and (can_see_student(student_id) or etut_hucre_benim(hucre_id)))
    or is_parent_of(student_id) or is_student_self(student_id)))));
create policy etut_talepler_read on etut_talepler for select to authenticated using (
  school_id = my_school() and (is_staff() or teacher_id = auth.uid()));

-- Modül kapalıyken yönetici dışında kimse okuyamaz (0011'deki gibi kısıtlayıcı politika)
create policy mod_etut_gunler on etut_gunler as restrictive for all using (is_admin() or module_enabled('etut'));
create policy mod_etut_hucreler on etut_hucreler as restrictive for all using (is_admin() or module_enabled('etut'));
create policy mod_etut_ogrenciler on etut_ogrenciler as restrictive for all using (is_admin() or module_enabled('etut'));
create policy mod_etut_talepler on etut_talepler as restrictive for all using (is_admin() or module_enabled('etut'));

-- ---------- Yardımcılar ----------
create or replace function etut_modul_acik() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() and not module_enabled('etut') then raise exception 'Etüt modülü okul yönetimi tarafından kapatıldı.' using errcode = '42501'; end if;
end $$;

-- Öğrenci ve velilerine etüt bildirimi (tür 'etut': bildirim.etut ayarıyla süzülür)
create or replace function etut_bildir_ogrenci(p_student uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, text, link, type)
  select distinct u, p_text, '{"page":"etut"}'::jsonb, 'etut'
  from (select student_accounts(p_student) u union select parent_accounts(p_student)) x where u is not null
$$;
revoke all on function etut_bildir_ogrenci(uuid, text), etut_modul_acik() from public, anon, authenticated;

-- Öğrencinin o günkü etüt "imzası": değişince (saat, öğretmen, konu, salon) bildirim gider
create or replace function etut_imza(p_gun uuid, p_student uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(o.ders || '|' || (g.saatler->(o.ders - 1)->>'bas') || '|' || (g.saatler->(o.ders - 1)->>'bit') || '|'
                             || lower(h.teacher_name) || '|' || coalesce(h.konu, '') || '|' || coalesce(h.salon, ''), ';' order by o.ders), '')
  from etut_ogrenciler o join etut_hucreler h on h.id = o.hucre_id join etut_gunler g on g.id = o.gun_id
  where o.gun_id = p_gun and o.student_id = p_student
$$;
revoke all on function etut_imza(uuid, uuid) from public, anon, authenticated;

-- ---------- Programı kaydet (rehber / yönetici) ----------
-- p_data: {tarih, kademe, saatler:[{bas,bit}×5],
--          hucreler:[{ders, teacher_id, teacher_name, tur, konu, salon, aciklama, talep_id, ogrenciler:[student_id]}]}
-- Günü tek işlemde yeniden yazar; aynı öğretmen-ders-öğrencinin yoklaması korunur; talepler bağlanır/çözülür.
-- Program yayındaysa yalnız etüdü değişen öğrencilere/velilere bildirim gider.
create or replace function etut_kaydet(p_gun uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := my_school();
  v_id uuid := p_gun;
  v_gun etut_gunler;
  v_tarih date := (p_data->>'tarih')::date;
  v_kademe text := p_data->>'kademe';
  v_saat jsonb := p_data->'saatler';
  h jsonb; s jsonb; hid uuid; st students; tp profiles; t etut_talepler;
  i int; v_name text;
  eski_imza jsonb := '{}'; eski_yoklama jsonb := '{}'; eski_talep uuid[] := '{}';
  k text; n_student uuid;
begin
  if not is_staff() then raise exception 'Etüt programını rehber öğretmen ya da yönetici hazırlar.' using errcode = '42501'; end if;
  perform etut_modul_acik();
  if v_tarih is null or extract(isodow from v_tarih) <> 6 then raise exception 'Etüt günü Cumartesi olmalı.' using errcode = '22023'; end if;
  if v_kademe not in ('ortaokul', 'lise') then raise exception 'Kademe ortaokul ya da lise olmalı.' using errcode = '22023'; end if;
  if jsonb_typeof(v_saat) <> 'array' or jsonb_array_length(v_saat) <> 5 then raise exception '5 ders saati gerekli.' using errcode = '22023'; end if;
  for i in 0..4 loop
    if coalesce(v_saat->i->>'bas', '') !~ '^\d{2}:\d{2}$' or coalesce(v_saat->i->>'bit', '') !~ '^\d{2}:\d{2}$'
       or (v_saat->i->>'bas')::time >= (v_saat->i->>'bit')::time then
      raise exception '%. ders saati geçersiz (başlangıç bitişten önce olmalı).', i + 1 using errcode = '22023';
    end if;
    if i > 0 and (v_saat->i->>'bas')::time < (v_saat->(i - 1)->>'bit')::time then
      raise exception '%. ders, bir önceki ders bitmeden başlıyor.', i + 1 using errcode = '22023';
    end if;
  end loop;
  v_saat := (select jsonb_agg(jsonb_build_object('bas', x->>'bas', 'bit', x->>'bit')) from jsonb_array_elements(v_saat) x);

  if v_id is null then
    if exists (select 1 from etut_gunler where school_id = v_school and tarih = v_tarih and kademe = v_kademe) then
      raise exception 'Bu Cumartesi için % programı zaten var; onu aç ve düzenle.', v_kademe using errcode = '23505';
    end if;
    insert into etut_gunler (school_id, tarih, kademe, saatler, created_by) values (v_school, v_tarih, v_kademe, v_saat, auth.uid())
    returning * into v_gun;
    v_id := v_gun.id;
  else
    select * into v_gun from etut_gunler where id = v_id and school_id = v_school for update;
    if v_gun.id is null then raise exception 'Etüt programı bulunamadı.' using errcode = '23503'; end if;
    if (v_gun.tarih, v_gun.kademe) is distinct from (v_tarih, v_kademe)
       and exists (select 1 from etut_gunler where school_id = v_school and tarih = v_tarih and kademe = v_kademe and id <> v_id) then
      raise exception 'Bu Cumartesi için % programı zaten var.', v_kademe using errcode = '23505';
    end if;
    -- Eski durum: öğrenci imzaları (bildirim için), yoklamalar (korunur), bağlı talepler
    select coalesce(jsonb_object_agg(x.student_id, etut_imza(v_id, x.student_id)), '{}') into eski_imza
      from (select distinct student_id from etut_ogrenciler where gun_id = v_id) x;
    select coalesce(jsonb_object_agg(o.ders || '|' || o.student_id || '|' || lower(btrim(h2.teacher_name)),
                                     jsonb_build_object('y', o.yoklama, 'by', o.yoklama_by, 'at', o.yoklama_at)), '{}')
      into eski_yoklama
      from etut_ogrenciler o join etut_hucreler h2 on h2.id = o.hucre_id where o.gun_id = v_id and o.yoklama is not null;
    select coalesce(array_agg(tl.id), '{}') into eski_talep from etut_talepler tl join etut_hucreler h3 on h3.id = tl.hucre_id where h3.gun_id = v_id;
    delete from etut_hucreler where gun_id = v_id;
    update etut_gunler set tarih = v_tarih, kademe = v_kademe, saatler = v_saat, updated_at = now() where id = v_id;
  end if;

  for h in select * from jsonb_array_elements(coalesce(p_data->'hucreler', '[]')) loop
    tp := null;
    if nullif(h->>'teacher_id', '') is not null then
      select * into tp from profiles where id = (h->>'teacher_id')::uuid and school_id = v_school;
      if tp.id is null then raise exception 'Öğretmen bulunamadı.' using errcode = '23503'; end if;
    end if;
    v_name := coalesce(tp.full_name, nullif(btrim(h->>'teacher_name'), ''));
    if v_name is null then raise exception 'Her satırda öğretmen adı gerekli.' using errcode = '22023'; end if;
    if coalesce((h->>'ders')::int, 0) not between 1 and 5 then raise exception 'Ders saati 1–5 olmalı.' using errcode = '22023'; end if;
    if exists (select 1 from etut_hucreler where gun_id = v_id and lower(btrim(teacher_name)) = lower(v_name) and ders = (h->>'ders')::int) then
      raise exception '% için %. derste iki kayıt var; bir öğretmen bir derste tek etüt/meşguliyet alır.', v_name, h->>'ders' using errcode = '23505';
    end if;
    if h->>'tur' = 'etut' and length(btrim(coalesce(h->>'konu', ''))) = 0 then
      raise exception '% · %. ders: etüt konusu gerekli.', v_name, h->>'ders' using errcode = '22023';
    end if;
    insert into etut_hucreler (gun_id, school_id, ders, teacher_id, teacher_name, tur, konu, salon, aciklama, talep_id)
    values (v_id, v_school, (h->>'ders')::int, tp.id, v_name, h->>'tur', nullif(btrim(h->>'konu'), ''), nullif(btrim(h->>'salon'), ''),
            nullif(btrim(h->>'aciklama'), ''), null)
    returning id into hid;

    if h->>'tur' = 'etut' then
      for s in select * from jsonb_array_elements(coalesce(h->'ogrenciler', '[]')) loop
        select * into st from students where id = (s#>>'{}')::uuid and school_id = v_school;
        if st.id is null then raise exception 'Öğrenci bulunamadı.' using errcode = '23503'; end if;
        if exists (select 1 from etut_ogrenciler where gun_id = v_id and ders = (h->>'ders')::int and student_id = st.id) then
          raise exception '% aynı ders saatinde (%. ders) iki etüde yazılamaz.', st.full_name, h->>'ders' using errcode = '23505';
        end if;
        k := (h->>'ders') || '|' || st.id || '|' || lower(v_name);
        insert into etut_ogrenciler (hucre_id, gun_id, school_id, ders, student_id, student_name, class_name, yoklama, yoklama_by, yoklama_at)
        values (hid, v_id, v_school, (h->>'ders')::int, st.id, st.full_name, st.class_name,
                eski_yoklama->k->>'y', nullif(eski_yoklama->k->>'by', '')::uuid, nullif(eski_yoklama->k->>'at', '')::timestamptz);
      end loop;
    elsif jsonb_array_length(coalesce(h->'ogrenciler', '[]')) > 0 then
      raise exception '% · %. ders meşgul olarak işaretli; öğrenci eklenemez.', v_name, h->>'ders' using errcode = '22023';
    end if;

    -- Talep bağlama: talep bu hücreye yerleşir (yeni yerleşimde talep sahibine bildirim)
    if nullif(h->>'talep_id', '') is not null then
      select * into t from etut_talepler where id = (h->>'talep_id')::uuid and school_id = v_school for update;
      if t.id is null then raise exception 'Etüt talebi bulunamadı.' using errcode = '23503'; end if;
      if t.durum in ('reddedildi', 'iptal') then raise exception '"%" talebi % durumunda; programa yerleştirilemez.', t.konu, t.durum using errcode = '22023'; end if;
      update etut_hucreler set talep_id = t.id where id = hid;
      update etut_talepler set durum = 'planlandi', hucre_id = hid, plan_tarih = v_tarih, plan_ders = (h->>'ders')::int,
             karar_by = auth.uid(), karar_at = now() where id = t.id;
      if t.durum <> 'planlandi' and t.teacher_id is not null then
        insert into notifications (user_id, text, link, type)
        values (t.teacher_id, 'Etüt talebin programa yerleştirildi: ' || t.konu || ' · ' || tr_dw(v_tarih) || ' ' || (h->>'ders') || '. ders',
                '{"page":"etut"}', 'etut');
      end if;
    end if;
  end loop;

  -- Bu günden çıkarılan talepler yeniden beklemeye döner
  update etut_talepler set durum = 'bekliyor', hucre_id = null, plan_tarih = null, plan_ders = null, karar_by = null, karar_at = null
   where id = any(eski_talep) and hucre_id is null and durum = 'planlandi';

  -- Yayındaki program değiştiyse yalnız etüdü değişen öğrenciler (ve velileri) bildirim alır
  if v_gun.durum = 'yayinda' then
    for n_student in
      select x.sid from (
        select (jsonb_object_keys(eski_imza))::uuid sid union select distinct student_id from etut_ogrenciler where gun_id = v_id) x
    loop
      if coalesce(eski_imza->>n_student::text, '') is distinct from etut_imza(v_id, n_student) then
        perform etut_bildir_ogrenci(n_student,
          case when etut_imza(v_id, n_student) = '' then 'Etüt iptal edildi: ' || tr_dw(v_tarih)
               else 'Etüt programı güncellendi: ' || tr_dw(v_tarih) end);
      end if;
    end loop;
  end if;
  return v_id;
end $$;

-- ---------- Yayınla / sil ----------
create or replace function etut_yayinla(p_gun uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g etut_gunler; sid uuid;
begin
  if not is_staff() then raise exception 'Programı rehber öğretmen ya da yönetici yayınlar.' using errcode = '42501'; end if;
  perform etut_modul_acik();
  select * into g from etut_gunler where id = p_gun and school_id = my_school() for update;
  if g.id is null then raise exception 'Etüt programı bulunamadı.' using errcode = '23503'; end if;
  if g.durum = 'yayinda' then return; end if;
  update etut_gunler set durum = 'yayinda', yayin_at = now() where id = g.id;
  for sid in select distinct student_id from etut_ogrenciler where gun_id = g.id loop
    perform etut_bildir_ogrenci(sid, 'Cumartesi etüt programı yayınlandı: ' || tr_dw(g.tarih));
  end loop;
end $$;

create or replace function etut_sil(p_gun uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g etut_gunler; sid uuid;
begin
  if not is_staff() then raise exception 'Programı rehber öğretmen ya da yönetici siler.' using errcode = '42501'; end if;
  perform etut_modul_acik();
  select * into g from etut_gunler where id = p_gun and school_id = my_school() for update;
  if g.id is null then raise exception 'Etüt programı bulunamadı.' using errcode = '23503'; end if;
  if g.durum = 'yayinda' then
    for sid in select distinct student_id from etut_ogrenciler where gun_id = g.id loop
      perform etut_bildir_ogrenci(sid, 'Etüt iptal edildi: ' || tr_dw(g.tarih));
    end loop;
  end if;
  update etut_talepler set durum = 'bekliyor', hucre_id = null, plan_tarih = null, plan_ders = null, karar_by = null, karar_at = null
   where hucre_id in (select id from etut_hucreler where gun_id = g.id) and durum = 'planlandi';
  delete from etut_gunler where id = g.id;
end $$;

-- ---------- Yoklama (etüt öğretmeni ya da rehber/yönetici; gün geldiğinde ya da geçtiğinde) ----------
create or replace function etut_yoklama(p_hucre uuid, p_ogrenci uuid, p_durum text) returns void
language plpgsql security definer set search_path = public as $$
declare h etut_hucreler; g etut_gunler;
begin
  perform etut_modul_acik();
  select * into h from etut_hucreler where id = p_hucre and school_id = my_school();
  if h.id is null then raise exception 'Etüt bulunamadı.' using errcode = '23503'; end if;
  if not (is_staff() or (h.teacher_id = auth.uid() and is_teacher())) then
    raise exception 'Yoklamayı etüdün öğretmeni ya da rehber öğretmen girer.' using errcode = '42501';
  end if;
  select * into g from etut_gunler where id = h.gun_id;
  if g.durum <> 'yayinda' then raise exception 'Program yayınlanmadan yoklama alınmaz.' using errcode = '22023'; end if;
  if g.tarih > tr_today() then raise exception 'Yoklama etüt günü ya da sonrasında alınır.' using errcode = '22023'; end if;
  if p_durum is not null and p_durum not in ('geldi', 'gelmedi') then raise exception 'Yoklama geldi ya da gelmedi olmalı.' using errcode = '22023'; end if;
  update etut_ogrenciler set yoklama = p_durum, yoklama_by = case when p_durum is null then null else auth.uid() end,
         yoklama_at = case when p_durum is null then null else now() end
   where hucre_id = h.id and student_id = p_ogrenci;
  if not found then raise exception 'Öğrenci bu etütte değil.' using errcode = '23503'; end if;
end $$;

-- ---------- Talepler ----------
-- p: {konu, aciklama, ogrenciler:[student_id], istenen_tarih, istenen_ders}
create or replace function etut_talep_ekle(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ogr uuid[]; x uuid; me profiles;
begin
  if not is_teacher() then raise exception 'Etüt talebini öğretmenler oluşturur.' using errcode = '42501'; end if;
  perform etut_modul_acik();
  select * into me from profiles where id = auth.uid();
  v_ogr := array(select distinct (e#>>'{}')::uuid from jsonb_array_elements(coalesce(p->'ogrenciler', '[]')) e);
  if cardinality(v_ogr) = 0 then raise exception 'En az bir öğrenci seç.' using errcode = '22023'; end if;
  foreach x in array v_ogr loop
    if not exists (select 1 from students where id = x and school_id = my_school()) or not can_see_student(x) then
      raise exception 'Seçilen öğrencilerden biri için yetkin yok.' using errcode = '42501';
    end if;
  end loop;
  insert into etut_talepler (school_id, teacher_id, teacher_name, konu, aciklama, ogrenciler, istenen_tarih, istenen_ders)
  values (my_school(), auth.uid(), me.full_name, btrim(p->>'konu'), nullif(btrim(p->>'aciklama'), ''), v_ogr,
          nullif(p->>'istenen_tarih', '')::date, nullif(p->>'istenen_ders', '')::smallint)
  returning id into v_id;
  insert into notifications (user_id, text, link, type)
  select u, 'Yeni etüt talebi: ' || me.full_name || ' · ' || btrim(p->>'konu'), '{"page":"etut"}', 'etut'
  from staff_accounts(my_school()) u where u <> auth.uid();
  return v_id;
end $$;

create or replace function etut_talep_iptal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform etut_modul_acik();
  update etut_talepler set durum = 'iptal', karar_at = now() where id = p_id and teacher_id = auth.uid() and durum = 'bekliyor';
  if not found then raise exception 'Yalnız kendi bekleyen talebini iptal edebilirsin.' using errcode = '42501'; end if;
end $$;

create or replace function etut_talep_reddet(p_id uuid, p_not text) returns void
language plpgsql security definer set search_path = public as $$
declare t etut_talepler;
begin
  if not is_staff() then raise exception 'Talepleri rehber öğretmen ya da yönetici yanıtlar.' using errcode = '42501'; end if;
  perform etut_modul_acik();
  if length(btrim(coalesce(p_not, ''))) < 3 then raise exception 'Reddetme gerekçesini yaz.' using errcode = '22023'; end if;
  select * into t from etut_talepler where id = p_id and school_id = my_school() for update;
  if t.id is null then raise exception 'Etüt talebi bulunamadı.' using errcode = '23503'; end if;
  if t.durum <> 'bekliyor' then raise exception 'Yalnız bekleyen talep reddedilebilir.' using errcode = '22023'; end if;
  update etut_talepler set durum = 'reddedildi', karar_notu = btrim(p_not), karar_by = auth.uid(), karar_at = now() where id = t.id;
  if t.teacher_id is not null then
    insert into notifications (user_id, text, link, type)
    values (t.teacher_id, 'Etüt talebin yanıtlandı: ' || t.konu || ' — ' || btrim(p_not), '{"page":"etut"}', 'etut');
  end if;
end $$;

revoke all on function etut_kaydet(uuid, jsonb), etut_yayinla(uuid), etut_sil(uuid), etut_yoklama(uuid, uuid, text),
  etut_talep_ekle(jsonb), etut_talep_iptal(uuid), etut_talep_reddet(uuid, text) from public, anon;
grant execute on function etut_kaydet(uuid, jsonb), etut_yayinla(uuid), etut_sil(uuid), etut_yoklama(uuid, uuid, text),
  etut_talep_ekle(jsonb), etut_talep_iptal(uuid), etut_talep_reddet(uuid, text) to authenticated;
