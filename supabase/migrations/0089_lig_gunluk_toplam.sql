-- 0089: Haftalık lig günlük toplamla hesaplanır. Her gün her oyun ayrı sıralanır (1. 10, 2. 8, 3. 6, 4. 5, 5. 4, oynayan herkes 2);
-- günlük puanlar haftaya eklenir. Günlük en fazla 10 × açık oyun sayısı; yeni oyun açıldıkça haftalık tavan kendiliğinden 70 artar.
-- Yürürlük: içinde bulunulan hafta (pazartesi). Önceki haftalar ve yazılmış kürsüler eski kuralla kalır. Oyun kayıtlarına dokunulmaz.
-- Aynı gün herkes aynı bulmacayı (aynı boyutta) çözdüğü için günlük sıralamada büyük bulmaca da sayılır.

insert into oda_icerik_surum (ad, baslangic) values ('lig_gunluk', oda_hafta_basi()) on conflict (ad) do nothing;

create or replace function oda_lig_gunluk_mu(p_hafta date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_hafta >= (select baslangic from oda_icerik_surum where ad = 'lig_gunluk'), false)
$$;
revoke all on function oda_lig_gunluk_mu(date) from public, anon, authenticated;

-- Dönüş tipine "bugun" eklendiği için yeniden oluşturulur
drop function if exists oda_lig(date);
create function oda_lig(p_hafta_basi date default null)
returns table (sira int, user_id uuid, ad text, puan int, oyun_sayisi int, ben boolean, bugun int)
language sql stable security definer set search_path = public as $$
  with h as (select coalesce(p_hafta_basi, oda_hafta_basi()) b, oda_lig_gunluk_mu(coalesce(p_hafta_basi, oda_hafta_basi())) gunluk),
  en as (
    select case when h.gunluk then o.gun else h.b end kova, o.oyun, o.user_id,
           case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o, h
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and (h.gunluk or o.oyun <> 'bulmaca' or o.boyut is null)
      and oda_oyun_acik(o.oyun)
      and o.gun between h.b and h.b + 6 and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by 1, o.oyun, o.user_id
  ),
  s as (select kova, user_id, case rank() over (partition by kova, oyun order by k) when 1 then 10 when 2 then 8 when 3 then 6 when 4 then 5 when 5 then 4 else 2 end p
        from en),
  t as (select s.user_id, sum(s.p)::int p, count(*)::int n,
               coalesce(sum(s.p) filter (where h.gunluk and s.kova = tr_today()), 0)::int bg
        from s, h group by s.user_id)
  select (rank() over (order by t.p desc))::int, t.user_id, pr.full_name, t.p, t.n, t.user_id = auth.uid(), t.bg
  from t join profiles pr on pr.id = t.user_id
  order by 1, 3
  limit 50
$$;
revoke all on function oda_lig(date) from public, anon;
grant execute on function oda_lig(date) to authenticated;

-- Kürsü: oda_lig ile aynı kural (0086'daki gövde + günlük kova)
create or replace function oda_lig_kursu_yaz(p_hafta date, p_bildir boolean default true) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int; g boolean;
begin
  if p_hafta is null or extract(isodow from p_hafta) <> 1 then raise exception 'Hafta pazartesi olmalı.'; end if;
  g := oda_lig_gunluk_mu(p_hafta);
  with en as (
    select o.school_id, case when g then o.gun else p_hafta end kova, o.oyun, o.user_id,
           case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o
    where o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and (g or o.oyun <> 'bulmaca' or o.boyut is null)
      and o.gun between p_hafta and p_hafta + 6
      and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and coalesce((school_setting(o.school_id, 'oda.oyun.' || o.oyun))::text::boolean, true)
      and not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false)
    group by o.school_id, 2, o.oyun, o.user_id
  ),
  s as (select school_id, user_id, rank() over (partition by school_id, kova, oyun order by k) r from en),
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
