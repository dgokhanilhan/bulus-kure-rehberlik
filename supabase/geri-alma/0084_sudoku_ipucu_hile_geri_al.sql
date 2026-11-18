-- 0084 geri alma: ipucu ve hile önlemleri kaldırılır; fonksiyonlar 0071/0073/0082'deki haline döner.
-- Skorlar silinmez (lig dışı işaretli Sudoku çözümleri yeniden sayılır).

drop function if exists oda_sudoku_tamamla(int[], int[], int);

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

drop function if exists oda_sudoku_bitis(int[], int[], int);
drop function if exists oda_sudoku_ipucu(int, int[]);

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

drop function oda_skor_tablosu(text, text);

create function oda_skor_tablosu(p_oyun text, p_donem text default 'gun')
returns table (sira int, user_id uuid, ad text, puan int, ben boolean)
language sql stable security definer set search_path = public as $$
  with b as (
    select o.user_id, case when p_oyun in ('yilan', 'sprint', 'soru') then max(o.puan) else min(o.puan) end p
    from oda_oyun o
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.oyun = p_oyun and o.bitti is not null and o.puan is not null
      and o.gun between (case when p_donem = 'hafta' then oda_hafta_basi() else tr_today() end) and tr_today()
      and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.user_id
  )
  select (rank() over (order by case when p_oyun in ('yilan', 'sprint', 'soru') then -b.p else b.p end))::int, b.user_id, pr.full_name, b.p, b.user_id = auth.uid()
  from b join profiles pr on pr.id = b.user_id
  order by 1, 3
  limit 50
$$;

revoke all on function oda_skor_tablosu(text, text) from public, anon;
grant execute on function oda_skor_tablosu(text, text) to authenticated;

create or replace function oda_lig(p_hafta_basi date default null)
returns table (sira int, user_id uuid, ad text, puan int, oyun_sayisi int, ben boolean)
language sql stable security definer set search_path = public as $$
  with h as (select coalesce(p_hafta_basi, oda_hafta_basi()) b),
  en as (
    select o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o, h
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.bitti is not null and o.puan is not null
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

create or replace function oda_lig_kursu_yaz(p_hafta date, p_bildir boolean default true) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if p_hafta is null or extract(isodow from p_hafta) <> 1 then raise exception 'Hafta pazartesi olmalı.'; end if;
  with en as (
    select o.school_id, o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o
    where o.bitti is not null and o.puan is not null
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

create or replace function oda_oyun_istatistik() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'toplam', (select count(*) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'sudoku', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'sudoku_en_iyi', (select min(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
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

drop function if exists oda_sudoku_ayar(uuid, text, int);
alter table oda_oyun drop column if exists lig_disi;
alter table oda_oyun drop column if exists ipucu;
drop function setting_spec();
alter function setting_spec_before_0084() rename to setting_spec;
select ayar_varsayilan_yenile();
