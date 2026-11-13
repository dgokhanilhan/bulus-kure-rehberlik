-- Yönetici ayarları: Öğretmenler Odası ve Günlük kontrol (son eklenen özelliklerin ayarları).
-- 1) Öğretmenler Odası modülü (modul.oda) ve bölümleri (Öğrenci Takip, Sohbet, Pano, Oyunlar, doğum günleri) açılıp kapatılır;
--    kapalı bölümün verisi yönetici dışında veritabanında da okunamaz/yazılamaz. Sohbet saklama süresi (gün) ayarlanır.
-- 2) Sohbet kanalları yönetilir (oda_kanal): hazır kanallar (genel, kademe, zümre) yeniden adlandırılır, açıklanır, sıralanır,
--    gizlenir; okula özel kanal açılır (bütün öğretmenler ya da seçilen öğretmenler). Özel kanal silinince mesajları da silinir.
-- 3) Günlük kontrol maddeleri okulca düzenlenir (gunluk_kontrol_madde): ad, veliye görünen cümle, sıra, açık/kapalı; yeni madde.
--    Kullanılmış madde silinmez (kapatılır, geçmiş kayıtlar adıyla görünür). Veli uyarı aralığı ayardır (0 = uyarı yok).
-- 4) Bildirim türleri: "oda" (anma, teşekkür, değişim) ve "gunluk_kontrol" (veli uyarısı) Bildirim ayarlarından kapatılabilir.
-- Mevcut veri değişmez; varsayılanlar bugünkü davranışla aynıdır. Geri alma: supabase/geri-alma/0071_ayarlar_oda_gunluk_geri_al.sql

-- ---------- Ayar tanımları ----------
alter function setting_spec() rename to setting_spec_before_0071;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0071() || '{
    "modul.oda":{"type":"bool","default":true},
    "oda.takip":{"type":"bool","default":true},
    "oda.sohbet":{"type":"bool","default":true},
    "oda.pano":{"type":"bool","default":true},
    "oda.oyunlar":{"type":"bool","default":true},
    "oda.dogum_gunu":{"type":"bool","default":true},
    "oda.saklama_gun":{"type":"int","min":7,"max":365,"default":30},
    "bildirim.oda":{"type":"bool","default":true},
    "bildirim.gunluk_kontrol":{"type":"bool","default":true},
    "gunluk_kontrol.uyari_araligi":{"type":"int","min":0,"max":10,"default":3},
    "menu.ad.ogretmenler_odasi":{"type":"text","max":30,"default":""}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

-- ---------- Öğretmenler Odası: modül ve bölüm kapısı ----------
-- Yönetici her zaman geçer (ayarlayabilsin); diğerleri için modül açık ve bölüm açık olmalı.
create function oda_bolum_acik(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (module_enabled('oda') and coalesce((setting('oda.' || b))::text::boolean, true))
$$;
revoke all on function oda_bolum_acik(text) from public, anon;
grant execute on function oda_bolum_acik(text) to authenticated;

create function oda_ogretmen(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_teacher() and oda_bolum_acik(b)
$$;
revoke all on function oda_ogretmen(text) from public, anon;
grant execute on function oda_ogretmen(text) to authenticated;

-- Tablolarda kısıtlayıcı kural: bölüm kapalıysa (yönetici dışında) satır okunmaz/yazılmaz
create policy oda_bolum on oda_oyun as restrictive for all to authenticated using (oda_bolum_acik('oyunlar'));
create policy oda_bolum on oda_oyun_tercih as restrictive for all to authenticated using (oda_bolum_acik('oyunlar'));
create policy oda_bolum on oda_pano as restrictive for all to authenticated using (oda_bolum_acik('pano'));
create policy oda_bolum on oda_anket as restrictive for all to authenticated using (oda_bolum_acik('pano'));
create policy oda_bolum on oda_anket_oy as restrictive for all to authenticated using (oda_bolum_acik('pano'));
create policy oda_bolum on oda_tesekkur as restrictive for all to authenticated using (oda_bolum_acik('pano'));
create policy oda_bolum on oda_tesekkur_alkis as restrictive for all to authenticated using (oda_bolum_acik('pano'));
create policy oda_bolum on oda_degisim as restrictive for all to authenticated using (oda_bolum_acik('pano'));
create policy oda_bolum on oda_dogum_gunu as restrictive for all to authenticated using (oda_bolum_acik('dogum_gunu'));

-- Fonksiyonlar (kuralları atlar): aynı kapı

create or replace function oda_sudoku_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun) values (my_school(), auth.uid(), 'sudoku', g)
    on conflict (user_id, oyun, gun) where oyun in ('sudoku', 'kelime') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g;
  select * into u from oda_sudoku_uret(g);
  return jsonb_build_object('gun', g, 'ipucu', to_jsonb(u.ipucu), 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
                            'cozum', case when s.bitti is not null then to_jsonb(u.cozum) end);
end $$;

create or replace function oda_sudoku_bitir(p int[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record; sn int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then return jsonb_build_object('dogru', true, 'puan', s.puan); end if;
  select * into u from oda_sudoku_uret(g);
  if not oda_sudoku_gecerli(p, u.ipucu) then return jsonb_build_object('dogru', false); end if;
  sn := greatest(1, extract(epoch from now() - s.basladi)::int);
  update oda_oyun set bitti = now(), puan = sn where id = s.id;
  return jsonb_build_object('dogru', true, 'puan', sn);
end $$;

create or replace function oda_kelime_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, durum) values (my_school(), auth.uid(), 'kelime', g, '{"tahminler":[]}')
    on conflict (user_id, oyun, gun) where oyun in ('sudoku', 'kelime') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and gun = g;
  return oda_kelime_durum_of(s);
end $$;

create or replace function oda_kelime_tahmin(p text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; c text; n int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  if p is null or char_length(p) <> 5 or p !~ '^[abcçdefgğhıijklmnoöprsştuüvyz]{5}$' then raise exception 'Beş harfli bir kelime yaz'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and gun = g for update;
  if s.id is null then raise exception 'Önce oyunu aç'; end if;
  if s.bitti is not null then return oda_kelime_durum_of(s); end if;
  c := oda_kelime_gunun(g);
  s.durum := jsonb_set(coalesce(s.durum, '{}'), '{tahminler}', coalesce(s.durum->'tahminler', '[]') || to_jsonb(p));
  n := jsonb_array_length(s.durum->'tahminler');
  if p = c then s.bitti := now(); s.puan := n;
  elsif n >= 6 then s.bitti := now(); s.puan := 7;
  end if;
  update oda_oyun set durum = s.durum, bitti = s.bitti, puan = s.puan where id = s.id;
  return oda_kelime_durum_of(s);
end $$;

create or replace function oda_skor_kaydet(p_oyun text, p_puan int, p_sure_ms int) returns void
language plpgsql volatile security definer set search_path = public as $$
declare ust int; alt_sure int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  case p_oyun
    when 'yilan' then ust := 2000; alt_sure := coalesce(p_puan, 0) * 60;
    when 'sprint' then ust := 150; alt_sure := 59000;
    when 'mayin' then ust := 3600; alt_sure := coalesce(p_puan, 0) * 1000 - 1500;
    when 'hafiza' then ust := 3600; alt_sure := coalesce(p_puan, 0) * 1000 - 1500;
    else raise exception 'Bilinmeyen oyun';
  end case;
  if p_puan is null or p_puan < 0 or p_puan > ust or p_sure_ms is null or p_sure_ms < alt_sure or p_sure_ms > 3600000 then
    raise exception 'Skor kaydedilemedi';
  end if;
  if p_oyun in ('mayin', 'hafiza') and p_puan < 5 then raise exception 'Skor kaydedilemedi'; end if;
  if (select count(*) from oda_oyun where user_id = auth.uid() and oyun = p_oyun and gun = tr_today()) >= 40 then
    raise exception 'Bugünlük bu kadar, yarın yine gel';
  end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, puan, basladi, bitti)
  values (my_school(), auth.uid(), p_oyun, tr_today(), p_puan, now() - make_interval(secs => p_sure_ms / 1000.0), now());
end $$;

create or replace function oda_skor_tablosu(p_oyun text, p_donem text default 'gun')
returns table (sira int, user_id uuid, ad text, puan int, ben boolean)
language sql stable security definer set search_path = public as $$
  with b as (
    select o.user_id, case when p_oyun in ('yilan', 'sprint') then max(o.puan) else min(o.puan) end p
    from oda_oyun o
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.oyun = p_oyun and o.bitti is not null and o.puan is not null
      and o.gun between (case when p_donem = 'hafta' then oda_hafta_basi() else tr_today() end) and tr_today()
      and (o.oyun <> 'kelime' or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.user_id
  )
  select (rank() over (order by case when p_oyun in ('yilan', 'sprint') then -b.p else b.p end))::int, b.user_id, pr.full_name, b.p, b.user_id = auth.uid()
  from b join profiles pr on pr.id = b.user_id
  order by 1, 3
  limit 50
$$;

create or replace function oda_lig(p_hafta_basi date default null)
returns table (sira int, user_id uuid, ad text, puan int, oyun_sayisi int, ben boolean)
language sql stable security definer set search_path = public as $$
  with h as (select coalesce(p_hafta_basi, oda_hafta_basi()) b),
  en as (
    select o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o, h
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.bitti is not null and o.puan is not null
      and o.gun between h.b and h.b + 6 and (o.oyun <> 'kelime' or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.oyun, o.user_id
  ),
  s as (select oyun, user_id, rank() over (partition by oyun order by k) r from en),
  t as (select user_id, sum(case r when 1 then 10 when 2 then 8 when 3 then 6 when 4 then 5 when 5 then 4 else 2 end)::int p, count(*)::int n
        from s group by user_id)
  select (rank() over (order by t.p desc))::int, t.user_id, pr.full_name, t.p, t.n, t.user_id = auth.uid()
  from t join profiles pr on pr.id = t.user_id
  order by 1, 3
  limit 50
$$;

create or replace function oda_oyun_istatistik() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'toplam', (select count(*) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'sudoku', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'sudoku_en_iyi', (select min(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'kelime_bulunan', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 6),
    'kelime_ikide', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 2),
    'yilan_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'yilan'),
    'sprint_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sprint'),
    'oyun_turu', (select count(distinct oyun) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'gunler', (select coalesce(jsonb_agg(g order by g desc), '[]') from (select distinct gun g from oda_oyun
               where user_id = auth.uid() and bitti is not null and gun > tr_today() - 60) d))
  where oda_ogretmen('oyunlar')
$$;

create or replace function oda_anket_oyla(p_anket uuid, p_secim int) returns void language plpgsql volatile security definer set search_path = public as $$
declare a oda_anket;
begin
  if not oda_ogretmen('pano') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into a from oda_anket where id = p_anket and school_id = my_school();
  if a.id is null then raise exception 'Anket bulunamadı'; end if;
  if a.bitis < now() then raise exception 'Anket kapandı'; end if;
  if p_secim is null then delete from oda_anket_oy where anket_id = p_anket and user_id = auth.uid(); return; end if;
  if p_secim < 0 or p_secim >= array_length(a.secenekler, 1) then raise exception 'Geçersiz seçenek'; end if;
  insert into oda_anket_oy (anket_id, user_id, secim) values (p_anket, auth.uid(), p_secim)
    on conflict (anket_id, user_id) do update set secim = excluded.secim;
end $$;

create or replace function oda_anket_sonuc(p_anketler uuid[]) returns table (anket_id uuid, secim int, sayi int)
language sql stable security definer set search_path = public as $$
  select o.anket_id, o.secim, count(*)::int from oda_anket_oy o join oda_anket a on a.id = o.anket_id
  where oda_ogretmen('pano') and a.school_id = my_school() and o.anket_id = any(p_anketler[1:100])
  group by 1, 2
$$;

create or replace function oda_degisim_al(p_id uuid) returns void language plpgsql volatile security definer set search_path = public as $$
declare d oda_degisim; ad text; ozet text;
begin
  if not oda_ogretmen('pano') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into d from oda_degisim where id = p_id and school_id = my_school() for update;
  if d.id is null then raise exception 'Talep bulunamadı'; end if;
  if d.isteyen = auth.uid() then raise exception 'Kendi talebini üstlenemezsin'; end if;
  if d.durum <> 'acik' then raise exception 'Bu talep artık açık değil'; end if;
  if d.tarih < tr_today() then raise exception 'Talebin tarihi geçti'; end if;
  update oda_degisim set durum = 'alindi', alan = auth.uid() where id = p_id;
  select full_name into ad from profiles where id = auth.uid();
  ozet := to_char(d.tarih, 'DD.MM.YYYY') || ' ' || d.saat || coalesce(' · ' || d.sinif, '') || ' (' || case d.tur when 'ders' then 'ders' else 'nöbet' end || ')';
  insert into notifications (user_id, text, link, type)
  select u, coalesce(ad, 'Bir öğretmen') || ' değişim talebini üstlendi: ' || ozet, jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'pano'), 'oda'
  from (select d.isteyen u union select p.id from profiles p where p.school_id = d.school_id and p.status = 'approved' and has_role(p.id, 'admin')) x
  where u is not null and u <> auth.uid();
end $$;

create or replace function oda_degisim_iptal(p_id uuid) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not oda_ogretmen('pano') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  update oda_degisim set durum = 'iptal' where id = p_id and school_id = my_school() and (isteyen = auth.uid() or is_staff()) and durum <> 'iptal';
  if not found then raise exception 'Talep iptal edilemedi'; end if;
end $$;

create or replace function oda_devamsizlik(p_ogrenciler uuid[]) returns table (student_id uuid, level text, used numeric, lim int, label text)
language sql stable security definer set search_path = public as $$
  select s, r->>'level', (w->>'used')::numeric, (w->>'limit')::int, w->>'label'
  from (select s, attendance_limits_of(s) r from unnest(p_ogrenciler[1:300]) s
        where oda_ogretmen('takip') and (is_admin() or module_enabled('yoklama')) and can_see_student(s)) x
  cross join lateral (
    select i w from jsonb_array_elements(x.r->'items') i
    where (i->>'current')::boolean
    order by case when (i->>'limit')::int > 0 then (i->>'used')::numeric / (i->>'limit')::int else -1 end desc,
             (i->>'key') = 'yillik' desc
    limit 1) m
  where x.r is not null
$$;


-- ---------- Sohbet kanalları ----------
create table oda_kanal (
  school_id uuid not null references schools(id) on delete cascade,
  kanal text not null check (kanal ~ '^(genel|ilkokul|ortaokul|lise|zumre:.{1,60}|ozel:[a-z0-9]{6,12})$'),
  ad text check (ad is null or char_length(btrim(ad)) between 2 and 40),
  aciklama text check (aciklama is null or char_length(aciklama) <= 120),
  gizli boolean not null default false,
  sira int check (sira is null or sira between 0 and 999),
  -- Yalnız özel kanal: null = bütün öğretmenler, dolu = yalnız bu öğretmenler (yönetici her zaman görür)
  uyeler uuid[] check (uyeler is null or cardinality(uyeler) <= 300),
  created_at timestamptz not null default now(),
  primary key (school_id, kanal),
  check (kanal like 'ozel:%' or uyeler is null),
  check (kanal not like 'ozel:%' or ad is not null)
);
create function oda_kanal_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.school_id := my_school(); new.created_at := now();
  else new.school_id := old.school_id; new.kanal := old.kanal; new.created_at := old.created_at; end if;
  new.ad := nullif(btrim(new.ad), '');
  new.aciklama := nullif(btrim(new.aciklama), '');
  if new.uyeler is not null then
    new.uyeler := array(select distinct u from unnest(new.uyeler) u join profiles p on p.id = u
                        where p.school_id = new.school_id and p.status = 'approved' and has_role(u, 'ogretmen'));
  end if;
  return new;
end $$;
create trigger oda_kanal_damga before insert or update on oda_kanal for each row execute function oda_kanal_damga();
-- Özel kanal silinince mesajları da silinir
create function oda_kanal_sil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.kanal like 'ozel:%' then delete from oda_mesaj where school_id = old.school_id and kanal = old.kanal; end if;
  delete from oda_okundu o where o.kanal = old.kanal and o.user_id in (select id from profiles where school_id = old.school_id);
  return null;
end $$;
create trigger oda_kanal_sil after delete on oda_kanal for each row when (old.kanal like 'ozel:%') execute function oda_kanal_sil();
revoke all on function oda_kanal_damga(), oda_kanal_sil() from public, anon, authenticated;

alter table oda_kanal enable row level security;
create policy oda_kanal_oku on oda_kanal for select to authenticated using (school_id = my_school() and is_teacher());
create policy oda_kanal_yaz on oda_kanal for all to authenticated
  using (school_id = my_school() and is_admin()) with check (school_id = my_school() and is_admin());
revoke all on oda_kanal from anon, authenticated;
grant select, insert, update, delete on oda_kanal to authenticated;

alter table oda_mesaj drop constraint oda_mesaj_kanal_check;
alter table oda_mesaj add constraint oda_mesaj_kanal_check check (kanal ~ '^(genel|ilkokul|ortaokul|lise|zumre:.{1,60}|ozel:[a-z0-9]{6,12})$');

-- Hazır kanallar (gizleme uygulanmadan): eski hesap
alter function oda_kanallari_of(uuid) rename to oda_kanallari_temel;
-- Erişilebilen kanallar: gizlenmemiş hazır kanallar + üyesi olunan özel kanallar
create function oda_kanallari_of(uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  with p as (select pr.school_id, has_role(pr.id, 'admin') as yon, oda_kanallari_temel(pr.id) as temel
             from profiles pr where pr.id = uid and pr.status = 'approved')
  select array(
    select k from unnest(p.temel) k
     where not exists (select 1 from oda_kanal o where o.school_id = p.school_id and o.kanal = k and o.gizli)
    union
    select o.kanal from oda_kanal o
     where o.school_id = p.school_id and o.kanal like 'ozel:%' and not o.gizli and cardinality(p.temel) > 0
       and (o.uyeler is null or uid = any(o.uyeler) or p.yon)
  )
  from p
$$;
revoke all on function oda_kanallari_of(uuid) from public, anon, authenticated;

-- Yönetici için bütün kanallar (gizliler dahil), Yönetim → Öğretmenler Odası ekranı
create function oda_kanallar_yonetim() returns text[]
language sql stable security definer set search_path = public as $$
  select case when is_admin() then array(
    select unnest(oda_kanallari_temel(auth.uid()))
    union select kanal from oda_kanal where school_id = my_school()) else '{}'::text[] end
$$;
revoke all on function oda_kanallar_yonetim() from public, anon;
grant execute on function oda_kanallar_yonetim() to authenticated;

create or replace function oda_kanallari() returns text[]
language sql stable security definer set search_path = public as $$
  select case when my_school() is not null and is_teacher() and oda_bolum_acik('sohbet') then oda_kanallari_of(auth.uid()) else '{}'::text[] end
$$;

create or replace function oda_mesaj_anma() returns trigger language plpgsql security definer set search_path = public as $$
declare ad text; kanal_ad text;
begin
  if coalesce(array_length(new.anilan, 1), 0) = 0 then return null; end if;
  select full_name into ad from profiles where id = new.yazan;
  kanal_ad := coalesce((select o.ad from oda_kanal o where o.school_id = new.school_id and o.kanal = new.kanal),
                case when new.kanal like 'zumre:%' then substr(new.kanal, 7) || ' zümresi'
                     when new.kanal = 'genel' then 'Genel' else initcap(new.kanal) end);
  insert into notifications (user_id, text, link, type)
  select u, coalesce(ad, 'Bir öğretmen') || ' seni Öğretmenler Odası sohbetinde andı (' || kanal_ad || '): '
            || left(new.metin, 120) || case when char_length(new.metin) > 120 then '…' else '' end,
         jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'sohbet', 'kanal', new.kanal), 'oda'
  from unnest(new.anilan) u
  join profiles p on p.id = u and p.school_id = new.school_id and p.status = 'approved'
  where new.kanal = any(oda_kanallari_of(u));
  return null;
end $$;

-- Saklama süresi okulun ayarından (7–365 gün, varsayılan 30)
create or replace function oda_temizlik() returns void language sql security definer set search_path = public as $$
  delete from oda_mesaj m
  where m.created_at < now() - make_interval(days => greatest(7, least(365, coalesce((school_setting(m.school_id, 'oda.saklama_gun'))::text::int, 30))));
$$;

-- ---------- Günlük kontrol maddeleri ----------
create table gunluk_kontrol_madde (
  school_id uuid not null references schools(id) on delete cascade,
  kod text not null check (kod ~ '^[a-z][a-z0-9_]{1,30}$'),
  ad text not null check (char_length(btrim(ad)) between 2 and 30),
  -- Veli ve öğrencinin gördüğü cümle (ör. "Ders kitabı / defteri yanında değildi"); veli uyarısında da kullanılır
  cumle text not null check (char_length(btrim(cumle)) between 3 and 120),
  sira int not null default 0 check (sira between 0 and 999),
  aktif boolean not null default true,
  primary key (school_id, kod)
);
create function gunluk_kontrol_madde_varsayilan(p_school uuid) returns void
language sql security definer set search_path = public as $$
  insert into gunluk_kontrol_madde (school_id, kod, ad, cumle, sira) values
    (p_school, 'kiyafet', 'Kıyafet', 'Okul kıyafetinde eksik görüldü', 1),
    (p_school, 'kitap_defter', 'Kitap / defter', 'Ders kitabı / defteri yanında değildi', 2),
    (p_school, 'ajanda', 'Ajanda imzası', 'Ajanda imzası eksikti', 3),
    (p_school, 'beden_kiyafeti', 'Beden kıyafeti', 'Beden eğitimi kıyafeti yanında değildi', 4),
    (p_school, 'telefon', 'Telefon teslim', 'Telefon teslim edilmedi', 5)
  on conflict do nothing
$$;
revoke all on function gunluk_kontrol_madde_varsayilan(uuid) from public, anon, authenticated;
select gunluk_kontrol_madde_varsayilan(id) from schools;
create function gunluk_kontrol_okul_yeni() returns trigger language plpgsql security definer set search_path = public as $$
begin perform gunluk_kontrol_madde_varsayilan(new.id); return null; end $$;
create trigger gunluk_kontrol_okul_yeni after insert on schools for each row execute function gunluk_kontrol_okul_yeni();
revoke all on function gunluk_kontrol_okul_yeni() from public, anon, authenticated;

create function gunluk_kontrol_madde_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from gunluk_kontrol g where g.school_id = old.school_id and g.madde = old.kod) then
      raise exception 'Bu madde kullanılmış; silinemez, kapatabilirsin.' using errcode = '23503';
    end if;
    return old;
  end if;
  -- Kullanıcı kendi okuluna yazar (RLS de bunu ister); yeni okul tohumlaması (oturumsuz) verilen okulu korur
  if tg_op = 'INSERT' then new.school_id := coalesce(my_school(), new.school_id);
  else new.school_id := old.school_id; new.kod := old.kod; end if;
  new.ad := btrim(new.ad);
  new.cumle := btrim(new.cumle);
  return new;
end $$;
create trigger gunluk_kontrol_madde_damga before insert or update or delete on gunluk_kontrol_madde
  for each row execute function gunluk_kontrol_madde_damga();
revoke all on function gunluk_kontrol_madde_damga() from public, anon, authenticated;

alter table gunluk_kontrol_madde enable row level security;
-- Okulun bütün onaylı kullanıcıları okur (veli/öğrenci de maddenin adını ve cümlesini görür)
create policy gunluk_kontrol_madde_oku on gunluk_kontrol_madde for select to authenticated using (school_id = my_school());
create policy gunluk_kontrol_madde_yaz on gunluk_kontrol_madde for all to authenticated
  using (school_id = my_school() and is_admin()) with check (school_id = my_school() and is_admin());
revoke all on gunluk_kontrol_madde from anon, authenticated;
grant select, insert, update, delete on gunluk_kontrol_madde to authenticated;

-- Madde artık okulun listesinden (sabit liste yerine); yeni kayıtta açık bir madde olmalı
alter table gunluk_kontrol drop constraint gunluk_kontrol_madde_check;
alter table gunluk_kontrol add constraint gunluk_kontrol_madde_bicim check (madde ~ '^[a-z][a-z0-9_]{1,30}$');

-- Yazan, okul, sıra: önceki gibi; madde okulun açık maddelerinden olmalı; uyarı aralığı ayardan
create or replace function gunluk_kontrol_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.teacher_id := auth.uid();
    new.school_id := my_school();
    if not exists (select 1 from gunluk_kontrol_madde k where k.school_id = new.school_id and k.kod = new.madde and k.aktif) then
      raise exception 'Bu kontrol maddesi okulda tanımlı değil ya da kapalı.' using errcode = '23514';
    end if;
    new.created_at := now();
    new.sira := 1 + (select count(*) from gunluk_kontrol g
                     where g.student_id = new.student_id and g.madde = new.madde
                       and date_trunc('month', g.tarih) = date_trunc('month', new.tarih));
    -- Uyarı bildirimi bu kayıtla gider (gunluk_kontrol_uyar); onaylı velisi yoksa bildirim de yok
    -- Uyarı aralığı okulun ayarından (0 = veliye uyarı gitmez)
    new.veli_uyarildi := coalesce((setting('gunluk_kontrol.uyari_araligi'))::text::int, 3) > 0
      and new.sira % coalesce((setting('gunluk_kontrol.uyari_araligi'))::text::int, 3) = 0
      and exists (select 1 from parent_accounts(new.student_id));
  else
    new.id := old.id;
    new.teacher_id := old.teacher_id;
    new.school_id := old.school_id;
    new.student_id := old.student_id;
    new.tarih := old.tarih;
    new.madde := old.madde;
    new.sira := old.sira;
    new.veli_uyarildi := old.veli_uyarildi;
    new.created_at := old.created_at;
  end if;
  new.detay := nullif(btrim(new.detay), '');
  new.updated_at := now();
  return new;
end $$;

-- Veli uyarısı: maddenin okulda tanımlı cümlesiyle
create or replace function gunluk_kontrol_uyar() returns trigger language plpgsql security definer set search_path = public as $$
declare ad text; ifade text; metin text;
begin
  if not new.veli_uyarildi then return null; end if;
  select s.full_name into ad from students s where s.id = new.student_id;
  -- Maddenin okulda tanımlı cümlesi, ilk harfi küçük (Türkçe)
  select translate(left(k.cumle, 1), 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ', 'abcçdefgğhıijklmnoöprsştuüvyz') || substr(k.cumle, 2)
    into ifade from gunluk_kontrol_madde k where k.school_id = new.school_id and k.kod = new.madde;
  ifade := coalesce(ifade, 'günlük kontrolde eksik görüldü');
  metin := 'Günlük kontrol: ' || coalesce(ad, 'Öğrenci') || ' bu ay ' || new.sira || '. kez ' || ifade
           || ' (' || to_char(new.tarih, 'DD.MM.YYYY') || '). Ayrıntılar Okul sayfasında.';
  insert into notifications (user_id, text, link, type)
  select distinct u, metin, '{"page":"okul"}'::jsonb, 'gunluk_kontrol' from parent_accounts(new.student_id) u where u is not null;
  return null;
end $$;
