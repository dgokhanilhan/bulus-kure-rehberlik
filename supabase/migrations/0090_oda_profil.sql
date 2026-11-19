-- 0090: Oyunlar › Haftalık lig'de isme tıklanınca açılan profil kartı. Yalnız aynı okuldaki öğretmenler görür; skor tablolarında
-- adını gizleyen öğretmenin profili başkasına açılmaz. Yalnız okur; hiçbir kayıt değişmez.
-- Günlük puanlar oda_lig (0089) ile aynı kuralla hesaplanır; testler toplamın lig puanına eşitliğini kilitler.

create or replace function oda_lig_gun_puanlari(p_hafta date)
returns table (gun date, user_id uuid, puan int)
language sql stable security definer set search_path = public as $$
  with en as (
    select o.gun, o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and oda_lig_gunluk_mu(p_hafta)
      and oda_oyun_acik(o.oyun)
      and o.gun between p_hafta and p_hafta + 6 and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.gun, o.oyun, o.user_id
  ),
  s as (select gun, user_id, case rank() over (partition by gun, oyun order by k) when 1 then 10 when 2 then 8 when 3 then 6 when 4 then 5 when 5 then 4 else 2 end p
        from en)
  select gun, user_id, sum(p)::int from s group by gun, user_id
$$;
revoke all on function oda_lig_gun_puanlari(date) from public, anon, authenticated;

create or replace function oda_profil(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pr profiles%rowtype;
  h date := oda_hafta_basi();
begin
  if not oda_ogretmen('oyunlar') then return null; end if;
  select * into pr from profiles p
  where p.id = p_user and p.school_id = my_school() and p.status = 'approved' and p.role in ('admin', 'ogretmen');
  if not found then return null; end if;
  if p_user <> auth.uid() and coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = p_user), false) then return null; end if;

  return jsonb_build_object(
    'user_id', pr.id,
    'ad', pr.full_name,
    'avatar', pr.avatar,
    'rol', pr.role,
    'brans', pr.branch,
    'ben', p_user = auth.uid(),
    'hafta', h,
    'bugun_gun', tr_today(),
    'lig', (select jsonb_build_object('sira', l.sira, 'puan', l.puan, 'bugun', l.bugun) from oda_lig() l where l.user_id = p_user),
    'gunler', (select coalesce(jsonb_agg(jsonb_build_object('gun', g.gun, 'puan', g.puan) order by g.gun), '[]')
               from oda_lig_gun_puanlari(h) g where g.user_id = p_user),
    'tavan', 10 * (select count(*) from unnest(array['sudoku', 'kelime', 'sehir', 'soru', 'bulmaca']) x where oda_oyun_acik(x)),
    'bugun', (select coalesce(jsonb_agg(jsonb_build_object('oyun', o.oyun, 'puan', o.puan) order by o.oyun), '[]')
              from oda_oyun o
              where o.user_id = p_user and o.gun = tr_today() and o.bitti is not null and o.puan is not null and not o.lig_disi
                and o.oyun in ('sudoku', 'kelime', 'sehir', 'soru', 'bulmaca') and oda_oyun_acik(o.oyun)),
    'kursu', (select jsonb_build_object('sayi', count(*), 'en_iyi', min(k.sira)) from oda_lig_kursu k where k.user_id = p_user),
    -- Rozetler için kişisel istatistik (oda_oyun_istatistik, 0084 ile aynı alanlar)
    'ist', jsonb_build_object(
      'toplam', (select count(*) from oda_oyun where user_id = p_user and bitti is not null),
      'sudoku', (select count(*) from oda_oyun where user_id = p_user and oyun = 'sudoku' and bitti is not null),
      'sudoku_en_iyi', (select min(puan) from oda_oyun where user_id = p_user and oyun = 'sudoku' and bitti is not null and not lig_disi),
      'kelime_bulunan', (select count(*) from oda_oyun where user_id = p_user and oyun = 'kelime' and puan <= 6),
      'kelime_ikide', (select count(*) from oda_oyun where user_id = p_user and oyun = 'kelime' and puan <= 2),
      'yilan_en_iyi', (select max(puan) from oda_oyun where user_id = p_user and oyun = 'yilan'),
      'sprint_en_iyi', (select max(puan) from oda_oyun where user_id = p_user and oyun = 'sprint'),
      'sehir_ikide', (select count(*) from oda_oyun where user_id = p_user and oyun = 'sehir' and puan <= 2),
      'soru_tam', (select count(*) from oda_oyun where user_id = p_user and oyun = 'soru' and puan = 5),
      'bulmaca', (select count(*) from oda_oyun where user_id = p_user and oyun = 'bulmaca' and bitti is not null),
      'oyun_turu', (select count(distinct oyun) from oda_oyun where user_id = p_user and bitti is not null),
      'gunler', (select coalesce(jsonb_agg(g order by g desc), '[]') from (select distinct gun g from oda_oyun
                 where user_id = p_user and bitti is not null and gun > tr_today() - 60) d))
  );
end $$;
revoke all on function oda_profil(uuid) from public, anon;
grant execute on function oda_profil(uuid) to authenticated;
