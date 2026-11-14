-- Öğretmenler Odası Pano: "okudum" onayı, etkinlik ve katılım listesi, değişimde idare onayı, anonim öneri kutusu.
-- 1) Okudum onayı: yönetici/rehber bir pano notunu "herkes okusun" diye işaretler; öğretmenler tek dokunuşla onaylar.
--    Kimin onaylamadığını notu yazan ve yönetim görür.
-- 2) Etkinlik: başlık, tarih, isteğe bağlı kontenjan; öğretmenler katılır/vazgeçer, katılanların adı görünür.
-- 3) Değişimde idare onayı (oda.degisim_onay, varsayılan kapalı): açıkken üstlenilen talep yönetici onaylayana kadar
--    "onay bekliyor" kalır; reddedilirse yeniden açılır.
-- 4) Öneri kutusu (oda.oneri, varsayılan açık): öğretmen yönetime adsız öneri bırakır. Öneride yazan TUTULMAZ; günlük sınır
--    için ayrı tabloda yalnız "bu kişi bugün kaç öneri bıraktı" sayısı durur ve iki gün sonra silinir. Önerileri yalnız yönetici okur.
-- Geri alma: supabase/geri-alma/0075_oda_pano_onay_etkinlik_oneri_geri_al.sql

alter function setting_spec() rename to setting_spec_before_0075;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0075() || '{
    "oda.degisim_onay":{"type":"bool","default":false},
    "oda.oneri":{"type":"bool","default":true}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

-- Okulun öğretmeni mi (herhangi bir kişi için): öğretmen ya da yönetici rolü, onaylı
create function oda_ogretmen_mi(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = uid and p.status = 'approved' and (has_role(p.id, 'ogretmen') or has_role(p.id, 'admin')))
$$;
revoke all on function oda_ogretmen_mi(uuid) from public, anon, authenticated;

-- ---------- 1) Okudum onayı ----------
alter table oda_pano add column onay_iste boolean not null default false;
create or replace function oda_pano_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.yazan := auth.uid(); new.school_id := my_school(); new.created_at := now(); new.metin := btrim(new.metin);
  new.bitis := least(greatest(coalesce(new.bitis, tr_today() + 7), tr_today()), tr_today() + 30);
  -- "Okudum" onayını yalnız yönetici ve rehber öğretmen isteyebilir
  new.onay_iste := coalesce(new.onay_iste, false) and is_staff();
  return new;
end $$;

create table oda_pano_onay (
  pano_id uuid not null references oda_pano(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pano_id, user_id)
);
alter table oda_pano_onay enable row level security;
create policy oda_pano_onay_oku on oda_pano_onay for select to authenticated using (user_id = auth.uid());
create policy oda_pano_onay_yaz on oda_pano_onay for insert to authenticated
  with check (user_id = auth.uid() and is_teacher() and exists (select 1 from oda_pano p where p.id = pano_id and p.onay_iste));
create policy oda_bolum on oda_pano_onay as restrictive for all to authenticated using (oda_bolum_acik('pano'));
revoke all on oda_pano_onay from anon, authenticated;
grant select, insert on oda_pano_onay to authenticated;

-- Onay durumu: notu yazan ve yönetim görür (kaç kişi onayladı, kim onaylamadı)
create function oda_pano_onay_durum(p_ids uuid[]) returns table (pano_id uuid, okuyan int, toplam int, okumayanlar text[])
language sql stable security definer set search_path = public as $$
  select n.id,
         (select count(*) from oda_pano_onay o join profiles p on p.id = o.user_id
           where o.pano_id = n.id and p.id is distinct from n.yazan and p.school_id = n.school_id and oda_ogretmen_mi(p.id))::int,
         (select count(*) from profiles p where p.school_id = n.school_id and p.id is distinct from n.yazan and oda_ogretmen_mi(p.id))::int,
         array(select p.full_name from profiles p
                where p.school_id = n.school_id and p.id is distinct from n.yazan and oda_ogretmen_mi(p.id)
                  and not exists (select 1 from oda_pano_onay o where o.pano_id = n.id and o.user_id = p.id)
                order by p.full_name)
  from oda_pano n
  where n.id = any(p_ids) and n.school_id = my_school() and n.onay_iste and oda_ogretmen('pano') and (n.yazan = auth.uid() or is_staff())
$$;
revoke all on function oda_pano_onay_durum(uuid[]) from public, anon;
grant execute on function oda_pano_onay_durum(uuid[]) to authenticated;

-- ---------- 2) Etkinlik ve katılım ----------
create table oda_etkinlik (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  acan uuid references profiles(id) on delete cascade,
  baslik text not null check (char_length(btrim(baslik)) between 3 and 120),
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  tarih date not null,
  saat text check (saat is null or char_length(saat) <= 20),
  kontenjan int check (kontenjan is null or kontenjan between 1 and 500),
  created_at timestamptz not null default now()
);
create index oda_etkinlik_tarih on oda_etkinlik (school_id, tarih);
create function oda_etkinlik_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.acan := auth.uid(); new.school_id := my_school(); new.created_at := now();
  new.baslik := btrim(new.baslik); new.aciklama := nullif(btrim(coalesce(new.aciklama, '')), ''); new.saat := nullif(btrim(coalesce(new.saat, '')), '');
  if new.tarih < tr_today() or new.tarih > tr_today() + 365 then raise exception 'Etkinlik tarihi bugün ya da sonrası olmalı.'; end if;
  return new;
end $$;
create trigger oda_etkinlik_damga before insert on oda_etkinlik for each row execute function oda_etkinlik_damga();
revoke all on function oda_etkinlik_damga() from public, anon, authenticated;
alter table oda_etkinlik enable row level security;
create policy oda_etkinlik_oku on oda_etkinlik for select to authenticated using (school_id = my_school() and is_teacher());
create policy oda_etkinlik_yaz on oda_etkinlik for insert to authenticated with check (school_id = my_school() and is_teacher() and acan = auth.uid());
create policy oda_etkinlik_sil on oda_etkinlik for delete to authenticated using (school_id = my_school() and is_teacher() and (acan = auth.uid() or is_staff()));
create policy oda_bolum on oda_etkinlik as restrictive for all to authenticated using (oda_bolum_acik('pano'));
revoke all on oda_etkinlik from anon, authenticated;
grant select, insert, delete on oda_etkinlik to authenticated;

create table oda_etkinlik_katilim (
  etkinlik_id uuid not null references oda_etkinlik(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (etkinlik_id, user_id)
);
alter table oda_etkinlik_katilim enable row level security;
-- Katılanları okulun öğretmenleri görür; yazma yalnız oda_etkinlik_katil ile (kontenjan denetimi)
create policy oda_katilim_oku on oda_etkinlik_katilim for select to authenticated using (exists (select 1 from oda_etkinlik e where e.id = etkinlik_id));
create policy oda_bolum on oda_etkinlik_katilim as restrictive for all to authenticated using (oda_bolum_acik('pano'));
revoke all on oda_etkinlik_katilim from anon, authenticated;
grant select on oda_etkinlik_katilim to authenticated;

create function oda_etkinlik_katil(p_id uuid, p_katil boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare e oda_etkinlik;
begin
  if not oda_ogretmen('pano') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into e from oda_etkinlik where id = p_id and school_id = my_school() for update;
  if e.id is null then raise exception 'Etkinlik bulunamadı.'; end if;
  if not coalesce(p_katil, false) then
    delete from oda_etkinlik_katilim where etkinlik_id = p_id and user_id = auth.uid();
    return;
  end if;
  if e.tarih < tr_today() then raise exception 'Etkinliğin tarihi geçti.'; end if;
  if exists (select 1 from oda_etkinlik_katilim where etkinlik_id = p_id and user_id = auth.uid()) then return; end if;
  if e.kontenjan is not null and (select count(*) from oda_etkinlik_katilim where etkinlik_id = p_id) >= e.kontenjan then
    raise exception 'Kontenjan doldu.';
  end if;
  insert into oda_etkinlik_katilim (etkinlik_id, user_id) values (p_id, auth.uid());
end $$;
revoke all on function oda_etkinlik_katil(uuid, boolean) from public, anon;
grant execute on function oda_etkinlik_katil(uuid, boolean) to authenticated;

-- ---------- 3) Değişimde idare onayı ----------
alter table oda_degisim drop constraint oda_degisim_durum_check;
alter table oda_degisim add constraint oda_degisim_durum_check check (durum in ('acik', 'onay', 'alindi', 'iptal'));
alter table oda_degisim add column onaylayan uuid references profiles(id) on delete set null;

create or replace function oda_degisim_al(p_id uuid) returns void language plpgsql volatile security definer set search_path = public as $$
declare d oda_degisim; ad text; ozet text; onayli boolean := coalesce((setting('oda.degisim_onay'))::text::boolean, false);
begin
  if not oda_ogretmen('pano') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into d from oda_degisim where id = p_id and school_id = my_school() for update;
  if d.id is null then raise exception 'Talep bulunamadı'; end if;
  if d.isteyen = auth.uid() then raise exception 'Kendi talebini üstlenemezsin'; end if;
  if d.durum <> 'acik' then raise exception 'Bu talep artık açık değil'; end if;
  if d.tarih < tr_today() then raise exception 'Talebin tarihi geçti'; end if;
  -- İdare onayı açıksa talep "onay bekliyor" olur; yönetici onaylayınca kesinleşir (oda_degisim_onayla)
  update oda_degisim set durum = case when onayli then 'onay' else 'alindi' end, alan = auth.uid() where id = p_id;
  select full_name into ad from profiles where id = auth.uid();
  ozet := to_char(d.tarih, 'DD.MM.YYYY') || ' ' || d.saat || coalesce(' · ' || d.sinif, '') || ' (' || case d.tur when 'ders' then 'ders' else 'nöbet' end || ')';
  insert into notifications (user_id, text, link, type)
  select u, coalesce(ad, 'Bir öğretmen') || case when onayli then ' değişim talebini üstlenmek istiyor (idare onayı bekliyor): ' else ' değişim talebini üstlendi: ' end || ozet, jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'pano'), 'oda'
  from (select d.isteyen u union select p.id from profiles p where p.school_id = d.school_id and p.status = 'approved' and has_role(p.id, 'admin')) x
  where u is not null and u <> auth.uid();
end $$;

-- Yönetici onaylar (kesinleşir) ya da reddeder (talep yeniden açılır); iki tarafa bildirim gider
create function oda_degisim_onayla(p_id uuid, p_onay boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare d oda_degisim; ozet text;
begin
  if not (is_admin() and oda_bolum_acik('pano')) then raise exception 'Değişimi yalnız yönetici onaylayabilir.' using errcode = '42501'; end if;
  select * into d from oda_degisim where id = p_id and school_id = my_school() for update;
  if d.id is null then raise exception 'Talep bulunamadı'; end if;
  if d.durum <> 'onay' then raise exception 'Bu talep onay beklemiyor'; end if;
  ozet := to_char(d.tarih, 'DD.MM.YYYY') || ' ' || d.saat || coalesce(' · ' || d.sinif, '') || ' (' || case d.tur when 'ders' then 'ders' else 'nöbet' end || ')';
  if coalesce(p_onay, false) then
    update oda_degisim set durum = 'alindi', onaylayan = auth.uid() where id = p_id;
  else
    update oda_degisim set durum = 'acik', alan = null, onaylayan = null where id = p_id;
  end if;
  insert into notifications (user_id, text, link, type)
  select u, case when coalesce(p_onay, false) then 'Değişim onaylandı: ' else 'Değişim onaylanmadı, talep yeniden açık: ' end || ozet,
         jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'pano'), 'oda'
  from (select d.isteyen u union select d.alan) x where u is not null and u <> auth.uid();
end $$;
revoke all on function oda_degisim_onayla(uuid, boolean) from public, anon;
grant execute on function oda_degisim_onayla(uuid, boolean) to authenticated;

-- ---------- 4) Anonim öneri kutusu ----------
-- Yazan sütunu YOK: öneri kimin bıraktığı bilgisi olmadan saklanır. Saat de tutulmaz, yalnız gün.
create table oda_oneri (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  metin text not null check (char_length(btrim(metin)) between 5 and 1000),
  gun date not null default tr_today(),
  durum text not null default 'yeni' check (durum in ('yeni', 'okundu'))
);
create index oda_oneri_okul on oda_oneri (school_id, gun desc);
alter table oda_oneri enable row level security;
create policy oda_oneri_oku on oda_oneri for select to authenticated using (school_id = my_school() and is_admin());
create policy oda_oneri_guncelle on oda_oneri for update to authenticated using (school_id = my_school() and is_admin()) with check (school_id = my_school() and is_admin());
create policy oda_oneri_sil on oda_oneri for delete to authenticated using (school_id = my_school() and is_admin());
revoke all on oda_oneri from anon, authenticated;
grant select, delete on oda_oneri to authenticated;
grant update (durum) on oda_oneri to authenticated;

-- Günlük sınır sayacı: önerinin kendisiyle bağı yok; kural yok (yalnız fonksiyon okur), iki gün sonra silinir
create table oda_oneri_sayac (
  user_id uuid not null references profiles(id) on delete cascade,
  gun date not null,
  sayi int not null default 0,
  primary key (user_id, gun)
);
alter table oda_oneri_sayac enable row level security;
revoke all on oda_oneri_sayac from anon, authenticated;

create function oda_oneri_gonder(p_metin text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not (is_teacher() and module_enabled('oda') and coalesce((setting('oda.oneri'))::text::boolean, true)) then
    raise exception 'Öneri kutusu kapalı.' using errcode = '42501';
  end if;
  if p_metin is null or char_length(btrim(p_metin)) < 5 or char_length(btrim(p_metin)) > 1000 then
    raise exception 'Öneri 5 ile 1000 karakter arasında olmalı.';
  end if;
  insert into oda_oneri_sayac (user_id, gun, sayi) values (auth.uid(), tr_today(), 1)
    on conflict (user_id, gun) do update set sayi = oda_oneri_sayac.sayi + 1 returning sayi into n;
  if n > 3 then raise exception 'Bugün en çok 3 öneri bırakabilirsin.'; end if;
  insert into oda_oneri (school_id, metin) values (my_school(), btrim(p_metin));
  -- Bütün yöneticilere (öneriyi bırakan yöneticiyse ona da: kimin bıraktığı anlaşılmasın)
  insert into notifications (user_id, text, link, type)
  select p.id, 'Öneri kutusuna yeni bir öneri bırakıldı.', jsonb_build_object('page', 'yonetim', 'tab', 'oda'), 'oda'
  from profiles p where p.school_id = my_school() and p.status = 'approved' and has_role(p.id, 'admin');
end $$;
revoke all on function oda_oneri_gonder(text) from public, anon;
grant execute on function oda_oneri_gonder(text) to authenticated;

-- ---------- Gece temizliği ----------
create or replace function oda_pano_temizlik() returns void language sql security definer set search_path = public as $$
  delete from oda_pano where bitis < tr_today();
  delete from oda_anket where bitis < now() - interval '30 days';
  delete from oda_tesekkur where created_at < now() - interval '60 days';
  delete from oda_degisim where tarih < tr_today() - 30;
  delete from oda_etkinlik where tarih < tr_today() - 7;
  delete from oda_oneri_sayac where gun < tr_today() - 2;
$$;
