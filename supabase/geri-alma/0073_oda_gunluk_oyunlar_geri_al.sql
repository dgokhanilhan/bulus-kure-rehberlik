-- 0073 geri alma: üç yeni günlük oyun kalkar (skorlarıyla birlikte); skor tablosu, lig ve istatistik önceki haline döner.
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
      and oda_oyun_acik(o.oyun)
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

drop function if exists oda_sehir_ac(), oda_sehir_tahmin(int), oda_soru_ac(), oda_soru_cevap(int), oda_bulmaca_ac(), oda_bulmaca_bitir(text[]);
drop function if exists oda_sehir_durum_of(oda_oyun), oda_soru_durum_of(oda_oyun), oda_sehir_gunun(date), oda_soru_gunun(date);
drop function if exists oda_bulmaca_satirlar(oda_bulmaca), oda_bulmaca_gunun(date), oda_gun_no(date);
drop table if exists oda_sehir, oda_soru, oda_bulmaca;
delete from oda_oyun where oyun in ('sehir', 'soru', 'bulmaca');
drop index if exists oda_oyun_gunluk2;
alter table oda_oyun drop constraint oda_oyun_oyun_check;
alter table oda_oyun add constraint oda_oyun_oyun_check check (oyun in ('sudoku', 'kelime', 'yilan', 'sprint', 'mayin', 'hafiza'));
delete from school_settings where key in ('oda.oyun.sehir', 'oda.oyun.soru', 'oda.oyun.bulmaca');
drop function setting_spec();
alter function setting_spec_before_0073() rename to setting_spec;
select ayar_varsayilan_yenile();
