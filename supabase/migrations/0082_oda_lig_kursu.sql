-- Haftalık lig kürsüsü: hafta bitince (Pazartesi 00:05, İstanbul) ligi ilk üç bitiren öğretmenler Pano › Teşekkür
-- kartları'nda kürsüde gösterilir ve kendilerine bildirim gider. Lig puanı oda_lig() ile aynı kuralla hesaplanır
-- (oyun başına sıralama puanı 10/8/6/5/4/2). Skor tablosundan çıkmayı seçen (oda_oyun_tercih.gizli) kürsüye yazılmaz.
-- Yalnız okur ve yeni tabloya ekler: oda_oyun skorlarına, skor tablosuna ve lige DOKUNMAZ.
-- Geri alma: supabase/geri-alma/0082_oda_lig_kursu_geri_al.sql

create table oda_lig_kursu (
  school_id uuid not null references schools(id) on delete cascade,
  hafta date not null check (extract(isodow from hafta) = 1),   -- haftanın pazartesisi
  user_id uuid not null references profiles(id) on delete cascade,
  sira int not null check (sira between 1 and 3),
  ad text not null,
  puan int not null,
  created_at timestamptz not null default now(),
  primary key (school_id, hafta, user_id)
);
create index oda_lig_kursu_son on oda_lig_kursu (school_id, hafta desc);
alter table oda_lig_kursu enable row level security;
create policy oda_lig_kursu_oku on oda_lig_kursu for select to authenticated using (school_id = my_school() and is_teacher());
create policy oda_bolum on oda_lig_kursu as restrictive for all to authenticated using (oda_bolum_acik('pano'));
revoke all on oda_lig_kursu from anon, authenticated;
grant select on oda_lig_kursu to authenticated;

-- Bir haftanın kürsüsü (bütün okullar). Aynı hafta ikinci kez çalışırsa bir şey değişmez.
create function oda_lig_kursu_yaz(p_hafta date, p_bildir boolean default true) returns int
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
revoke all on function oda_lig_kursu_yaz(date, boolean) from public, anon, authenticated;
grant execute on function oda_lig_kursu_yaz(date, boolean) to service_role;

-- Pazartesi 00:05 (İstanbul = UTC+3 → Pazar 21:05 UTC): biten haftanın kürsüsü
select cron.schedule('oda-lig-kursu', '5 21 * * 0', $$select public.oda_lig_kursu_yaz(public.oda_hafta_basi() - 7)$$);

-- Son biten hafta hemen panoda görünsün (bildirim gönderilmeden)
select oda_lig_kursu_yaz(oda_hafta_basi() - 7, false);
