-- 0074 geri alma: yanıt, sabitleme ve okundu bilgisi kalkar (yanıt bağlantıları ve sabitler silinir, mesajlar kalır).
drop function if exists oda_okundu_bilgisi(uuid);
drop function if exists oda_mesaj_sabitle(uuid, boolean);
create or replace function oda_mesaj_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.yazan := auth.uid();
  new.school_id := my_school();
  new.created_at := now();
  new.metin := btrim(new.metin);
  new.anilan := coalesce(array(select distinct x from unnest(new.anilan) x where x is not null and x <> auth.uid() limit 20), '{}');
  return new;
end $$;
create or replace function oda_temizlik() returns void language sql security definer set search_path = public as $$
  delete from oda_mesaj m
  where m.created_at < now() - make_interval(days => greatest(7, least(365, coalesce((school_setting(m.school_id, 'oda.saklama_gun'))::text::int, 30))));
$$;
drop index if exists oda_mesaj_sabit;
drop index if exists oda_mesaj_yanit;
alter table oda_mesaj drop column if exists yanit_id, drop column if exists sabit_at, drop column if exists sabitleyen;
