-- Günün Sudokusu: ipucu hakkı ve hile önlemleri.
-- 1) İpucu: kişi başı günde 3; her ipucu sunucudan tek hücre olarak gelir (çözüm tarayıcıya gitmez) ve bitiş süresine
--    30 sn eklenir. Sayaç oyun sırasında cezasız akar; puan = çözüm süresi + 30 × ipucu (sıralama bununla).
-- 2) Hile önlemleri — tutmayan çözüm kaydedilir ama YALNIZ o günün Sudoku sonucu skor tablosuna, haftalık lige ve
--    kürsüye girmez (lig_disi); diğer oyunlardaki puanlar aynen sayılır. Kimse "hileci" diye işaretlenmez.
--    a) Alt süre: çözüm süresi (ceza hariç) oda.sudoku_alt_sure saniyeden kısaysa (varsayılan 240 = 4 dk; 0 = kapalı)
--    b) Hamle ritmi: kişinin kendi girdiği hücrelerin %oda.sudoku_ritim'inden fazlası son 60 saniyede girildiyse
--       (varsayılan %50; 100 = kapalı). Ritim bilgisi tarayıcıdan gelir: caydırıcıdır, kesin engel değildir.
--    c) Sekmeden ayrılma sayısı yalnız bilgi olarak saklanır; tek başına ceza değildir.
-- MEVCUT SKORLAR DEĞİŞMEZ: eski satırlar ipucu = 0, lig_disi = false alır; tablo/lig/kürsü sonuçları birebir aynı kalır.
-- Eski sürümle açık kalan sayfalar oda_sudoku_bitir(p) ile bitirmeye devam eder (ritim denetimi olmadan).
-- Geri alma: supabase/geri-alma/0084_sudoku_ipucu_hile_geri_al.sql

alter function setting_spec() rename to setting_spec_before_0084;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0084() || '{
    "oda.sudoku_alt_sure":{"type":"int","min":0,"max":1800,"default":240},
    "oda.sudoku_ritim":{"type":"int","min":30,"max":100,"default":50}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

alter table oda_oyun add column ipucu smallint not null default 0 check (ipucu between 0 and 3);
alter table oda_oyun add column lig_disi boolean not null default false;
grant select (ipucu, lig_disi) on oda_oyun to authenticated;

-- Ayar okuması (cron/servis bağlamında da çalışsın diye okulu açıkça alır)
create function oda_sudoku_ayar(sid uuid, k text, varsayilan int) returns int language sql stable security definer set search_path = public as $$
  select coalesce((school_setting(sid, k))::text::int, varsayilan)
$$;
revoke all on function oda_sudoku_ayar(uuid, text, int) from public, anon, authenticated;

-- Durum: ipucu listesi ve kalan hak eklendi (diğer alanlar aynı)
create or replace function oda_sudoku_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun) values (my_school(), auth.uid(), 'sudoku', g)
    on conflict (user_id, oyun, gun) where oyun in ('sudoku', 'kelime') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g;
  select * into u from oda_sudoku_uret(g);
  return jsonb_build_object('gun', g, 'ipucu', to_jsonb(u.ipucu), 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
                            'cozum', case when s.bitti is not null then to_jsonb(u.cozum) end,
                            'ipuclari', coalesce(s.durum->'ipuclari', '[]'), 'ipucu_hak', 3 - s.ipucu, 'lig_disi', s.lig_disi, 'neden', s.durum->>'neden');
end $$;

-- İpucu: seçili hücre (boş ya da yanlış dolu, ipucu olmayan) varsa onun doğru rakamı; yoksa en çok dolu komşusu olan
-- boş hücre. p_giris yalnız hangi hücrenin boş olduğunu anlamak için kullanılır.
create function oda_sudoku_ipucu(p_hucre int default null, p_giris int[] default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record; a int[]; alinan int[]; h int; v int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then raise exception 'Bulmaca bitti'; end if;
  if s.ipucu >= 3 then raise exception 'İpucu hakkın bitti'; end if;
  select * into u from oda_sudoku_uret(g);
  alinan := array(select (x->>'i')::int from jsonb_array_elements(coalesce(s.durum->'ipuclari', '[]')) x);
  -- Tahta: ipuçları + alınan ipuçları + kişinin girdileri (geçersiz giriş yok sayılır)
  a := u.ipucu;
  foreach h in array alinan loop a[h + 1] := u.cozum[h + 1]; end loop;
  if p_giris is not null and array_length(p_giris, 1) = 81 then
    for h in 1..81 loop
      if a[h] = 0 and p_giris[h] between 1 and 9 then a[h] := p_giris[h]; end if;
    end loop;
  end if;
  if p_hucre between 0 and 80 and u.ipucu[p_hucre + 1] = 0 and not (p_hucre = any(alinan))
     and (a[p_hucre + 1] = 0 or a[p_hucre + 1] <> u.cozum[p_hucre + 1]) then
    h := p_hucre;
  else
    select i into h from generate_series(0, 80) i
    where a[i + 1] = 0
    order by (select count(*) from generate_series(0, 80) k
              where k <> i and a[k + 1] > 0 and (k / 9 = i / 9 or k % 9 = i % 9 or (k / 27 = i / 27 and (k % 9) / 3 = (i % 9) / 3))) desc, i
    limit 1;
  end if;
  if h is null then raise exception 'İpucu verilecek boş hücre yok'; end if;
  v := u.cozum[h + 1];
  update oda_oyun set ipucu = ipucu + 1,
    durum = jsonb_set(coalesce(durum, '{}'), '{ipuclari}', coalesce(durum->'ipuclari', '[]') || jsonb_build_object('i', h, 'v', v))
  where id = s.id;
  return jsonb_build_object('hucre', h, 'deger', v, 'ipucu_hak', 2 - s.ipucu);
end $$;
revoke all on function oda_sudoku_ipucu(int, int[]) from public, anon;
grant execute on function oda_sudoku_ipucu(int, int[]) to authenticated;

-- Bitiş (ortak): doğruluk, süre + ipucu cezası, hile önlemleri
create function oda_sudoku_bitis(p int[], p_hamle int[], p_sekme int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record; ham int; v_puan int; alt int; ritim int; neden text;
  kendi int; son int; enson int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then
    return jsonb_build_object('dogru', true, 'puan', s.puan, 'ipucu', s.ipucu, 'ham', s.puan - 30 * s.ipucu, 'lig_disi', s.lig_disi);
  end if;
  select * into u from oda_sudoku_uret(g);
  if not oda_sudoku_gecerli(p, u.ipucu) then return jsonb_build_object('dogru', false); end if;
  ham := greatest(1, extract(epoch from now() - s.basladi)::int);
  v_puan := ham + 30 * s.ipucu;
  alt := oda_sudoku_ayar(s.school_id, 'oda.sudoku_alt_sure', 240);
  ritim := oda_sudoku_ayar(s.school_id, 'oda.sudoku_ritim', 50);
  if alt > 0 and ham < alt then
    neden := 'sure';
  elsif ritim < 100 and p_hamle is not null and array_length(p_hamle, 1) = 81 then
    -- Kişinin kendi girdiği hücreler: bulmaca ipucu ve alınan ipucu olmayanlar
    select count(*), max(p_hamle[i]) into kendi, enson from generate_series(1, 81) i
    where u.ipucu[i] = 0 and p_hamle[i] > 0
      and not ((i - 1) = any(array(select (x->>'i')::int from jsonb_array_elements(coalesce(s.durum->'ipuclari', '[]')) x)));
    select count(*) into son from generate_series(1, 81) i
    where u.ipucu[i] = 0 and p_hamle[i] > 0 and p_hamle[i] >= enson - 60000
      and not ((i - 1) = any(array(select (x->>'i')::int from jsonb_array_elements(coalesce(s.durum->'ipuclari', '[]')) x)));
    if kendi >= 20 and son * 100 > kendi * ritim then neden := 'ritim'; end if;
  end if;
  update oda_oyun set bitti = now(), puan = v_puan, lig_disi = neden is not null,
    durum = coalesce(durum, '{}') || jsonb_build_object('ham', ham, 'sekme', greatest(0, coalesce(p_sekme, 0)))
              || case when neden is not null then jsonb_build_object('neden', neden) else '{}'::jsonb end
  where id = s.id;
  return jsonb_build_object('dogru', true, 'puan', v_puan, 'ham', ham, 'ipucu', s.ipucu, 'lig_disi', neden is not null, 'neden', neden);
end $$;
revoke all on function oda_sudoku_bitis(int[], int[], int) from public, anon, authenticated;

create function oda_sudoku_tamamla(p int[], p_hamle int[] default null, p_sekme int default 0) returns jsonb
language sql volatile security definer set search_path = public as $$ select oda_sudoku_bitis(p, p_hamle, p_sekme) $$;
revoke all on function oda_sudoku_tamamla(int[], int[], int) from public, anon;
grant execute on function oda_sudoku_tamamla(int[], int[], int) to authenticated;

-- Eski istemciler: aynı kurallar, ritim bilgisi olmadan
create or replace function oda_sudoku_bitir(p int[]) returns jsonb language sql volatile security definer set search_path = public as $$
  select oda_sudoku_bitis(p, null, 0)
$$;

-- Skor tablosu: lig dışı Sudoku çözümü sayılmaz; en iyi satırın ipucu sayısı döner (0073'teki gövde + bu iki fark)
drop function oda_skor_tablosu(text, text);
create function oda_skor_tablosu(p_oyun text, p_donem text default 'gun')
returns table (sira int, user_id uuid, ad text, puan int, ben boolean, ipucu int)
language sql stable security definer set search_path = public as $$
  with b as (
    select o.user_id, case when p_oyun in ('yilan', 'sprint', 'soru') then max(o.puan) else min(o.puan) end p,
           (array_agg(o.ipucu order by case when p_oyun in ('yilan', 'sprint', 'soru') then -o.puan else o.puan end))[1] i
    from oda_oyun o
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.oyun = p_oyun and o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and o.gun between (case when p_donem = 'hafta' then oda_hafta_basi() else tr_today() end) and tr_today()
      and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.user_id
  )
  select (rank() over (order by case when p_oyun in ('yilan', 'sprint', 'soru') then -b.p else b.p end))::int, b.user_id, pr.full_name, b.p, b.user_id = auth.uid(), b.i::int
  from b join profiles pr on pr.id = b.user_id
  order by 1, 3
  limit 50
$$;
revoke all on function oda_skor_tablosu(text, text) from public, anon;
grant execute on function oda_skor_tablosu(text, text) to authenticated;

-- Haftalık lig: lig dışı Sudoku çözümü sayılmaz (0073'teki gövde + tek fark)
create or replace function oda_lig(p_hafta_basi date default null)
returns table (sira int, user_id uuid, ad text, puan int, oyun_sayisi int, ben boolean)
language sql stable security definer set search_path = public as $$
  with h as (select coalesce(p_hafta_basi, oda_hafta_basi()) b),
  en as (
    select o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o, h
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and oda_oyun_acik(o.oyun)
      and o.gun between h.b and h.b + 6 and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
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

-- Kürsü: lig dışı Sudoku çözümü sayılmaz (0082'deki gövde + tek fark)
create or replace function oda_lig_kursu_yaz(p_hafta date, p_bildir boolean default true) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if p_hafta is null or extract(isodow from p_hafta) <> 1 then raise exception 'Hafta pazartesi olmalı.'; end if;
  with en as (
    select o.school_id, o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o
    where o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and o.gun between p_hafta and p_hafta + 6
      and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and coalesce((school_setting(o.school_id, 'oda.oyun.' || o.oyun))::text::boolean, true)
      and not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false)
    group by o.school_id, o.oyun, o.user_id
  ),
  s as (select school_id, oyun, user_id, rank() over (partition by school_id, oyun order by k) r from en),
  t as (select school_id, user_id, sum(case r when 1 then 10 when 2 then 8 when 3 then 6 when 4 then 5 when 5 then 4 else 2 end)::int p
        from s group by school_id, user_id),
  r as (select t.*, (rank() over (partition by t.school_id order by t.p desc))::int sira from t),
  ekle as (
    insert into oda_lig_kursu (school_id, hafta, user_id, sira, ad, puan)
    select r.school_id, p_hafta, r.user_id, r.sira, pr.full_name, r.p
    from r join profiles pr on pr.id = r.user_id and pr.status = 'approved' and pr.school_id = r.school_id
    where r.sira <= 3
    on conflict do nothing
    returning user_id, sira
  ),
  bil as (
    insert into notifications (user_id, text, link, type)
    select e.user_id, 'Tebrikler! Haftalık ligi ' || e.sira || '. bitirdin; adın panoda kürsüde 🏆',
           jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'pano'), 'oda'
    from ekle e where p_bildir
    returning 1
  )
  select count(*) into n from ekle;
  return n;
end $$;

-- Kişisel istatistik: en iyi Sudoku süresi lig dışı çözümleri saymaz (0073'teki gövde + tek fark)
create or replace function oda_oyun_istatistik() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'toplam', (select count(*) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'sudoku', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'sudoku_en_iyi', (select min(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null and not lig_disi),
    'kelime_bulunan', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 6),
    'kelime_ikide', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 2),
    'yilan_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'yilan'),
    'sprint_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sprint'),
    'sehir_ikide', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'sehir' and puan <= 2),
    'soru_tam', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'soru' and puan = 5),
    'bulmaca', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and bitti is not null),
    'oyun_turu', (select count(distinct oyun) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'gunler', (select coalesce(jsonb_agg(g order by g desc), '[]') from (select distinct gun g from oda_oyun
               where user_id = auth.uid() and bitti is not null and gun > tr_today() - 60) d))
  where oda_ogretmen('oyunlar')
$$;
