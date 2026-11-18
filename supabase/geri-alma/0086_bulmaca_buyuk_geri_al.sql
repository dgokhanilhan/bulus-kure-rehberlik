-- 0086 geri alma: bulmaca açma/bitirme ve skor/lig/kürsü işlevleri önceki gövdelerine döner; büyük bulmacalar kaldırılır.
-- 5×5 bulmacalar ve skorlar etkilenmez (büyük bulmaca günlerinin satırları boyut sütunuyla birlikte işaretsiz kalır).
create or replace function oda_bulmaca_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; b oda_bulmaca;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun) values (my_school(), auth.uid(), 'bulmaca', g)
    on conflict (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and gun = g;
  b := oda_bulmaca_gunun(g);
  return jsonb_build_object('gun', g, 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
    'yatay', to_jsonb(b.yatay_ipucu), 'dusey', to_jsonb(b.dusey_ipucu),
    'cozum', case when s.bitti is not null then to_jsonb(oda_bulmaca_satirlar(b)) end);
end $$;

-- p: beş satır, her biri beş karakter (kara kareler nokta). Yanlışsa kaç kutunun yanlış olduğu döner.
create or replace function oda_bulmaca_bitir(p text[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; c text[]; yanlis int; sn int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then return jsonb_build_object('dogru', true, 'puan', s.puan); end if;
  if p is null or array_length(p, 1) is distinct from 5 or exists (select 1 from unnest(p) x where x is null or char_length(x) <> 5) then
    raise exception 'Bulmaca eksik';
  end if;
  c := oda_bulmaca_satirlar(oda_bulmaca_gunun(g));
  select count(*) into yanlis from generate_series(1, 5) i, generate_series(1, 5) j
    where substr(c[i], j, 1) <> '.' and substr(c[i], j, 1) <> substr(p[i], j, 1);
  if yanlis > 0 then return jsonb_build_object('dogru', false, 'yanlis', yanlis); end if;
  sn := greatest(1, extract(epoch from now() - s.basladi)::int);
  update oda_oyun set bitti = now(), puan = sn where id = s.id;
  return jsonb_build_object('dogru', true, 'puan', sn);
end $$;

-- Skor tablosu: lig dışı Sudoku çözümü sayılmaz; en iyi satırın ipucu sayısı döner (0073'teki gövde + bu iki fark)
create or replace function oda_skor_tablosu(p_oyun text, p_donem text default 'gun')
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

drop function if exists oda_bulmaca_buyuk_gunun(date);
drop function if exists oda_bulmaca_boyut(date);
drop function if exists oda_bulmaca_kafes(int, int[], int[], text[], text[]);
alter table oda_oyun drop column if exists boyut;
drop table if exists oda_bulmaca_buyuk;
delete from oda_icerik_surum where ad = 'bulmaca2';
