-- Öğretmenler Odası oyunları tek tek açılıp kapatılır (oda.oyun.<oyun>). Okul Günün Sudokusu ve Günün Kelimesi ile başlar;
-- Yılan, Hesap Sprinti, Mayın Tarlası ve Hafıza Kartları kapalı gelir (Yönetim → Öğretmenler Odası'ndan açılabilir).
-- Kapalı oyunda yeni oyun/skor veritabanında da reddedilir ve haftalık lige sayılmaz; eski skorlar silinmez.
-- Geri alma: supabase/geri-alma/0072_oda_oyun_ayar_geri_al.sql

alter function setting_spec() rename to setting_spec_before_0072;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0072() || '{
    "oda.oyun.sudoku":{"type":"bool","default":true},
    "oda.oyun.kelime":{"type":"bool","default":true},
    "oda.oyun.yilan":{"type":"bool","default":false},
    "oda.oyun.sprint":{"type":"bool","default":false},
    "oda.oyun.mayin":{"type":"bool","default":false},
    "oda.oyun.hafiza":{"type":"bool","default":false}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

create function oda_oyun_acik(o text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((setting('oda.oyun.' || o))::text::boolean, true)
$$;
revoke all on function oda_oyun_acik(text) from public, anon;
grant execute on function oda_oyun_acik(text) to authenticated;

-- Bütün yazma yolları (günün bulmacasını açma, skor kaydı) bu tabloya ekler: kapalı oyunda ekleme reddedilir
create function oda_oyun_kapali_mi() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not oda_oyun_acik(new.oyun) then
    raise exception 'Bu oyun okulda kapalı.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger oda_oyun_kapali_mi before insert on oda_oyun for each row execute function oda_oyun_kapali_mi();
revoke all on function oda_oyun_kapali_mi() from public, anon, authenticated;

-- Haftalık lig: kapalı oyunların skorları sayılmaz
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
