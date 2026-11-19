-- 0087'yi geri alır: 7×7 takvime döner (0086), 5 Soruda Bugün süresiz olur (0073 gövdeleri). Oyun kayıtlarına dokunmaz.
select cron.unschedule('oda-soru-sure-kapat');

create or replace function oda_bulmaca_boyut(g date) returns int language sql stable security definer set search_path = public as $$
  select case
    when g < coalesce((select baslangic from oda_icerik_surum where ad = 'bulmaca2'), 'infinity'::date) then 5
    when extract(isodow from g) = 5 and extract(month from g + 7) <> extract(month from g)
         and exists (select 1 from oda_bulmaca_buyuk where boyut = 7) then 7
    when extract(isodow from g) = 3 and exists (select 1 from oda_bulmaca_buyuk where boyut = 6) then 6
    else 5 end
$$;

create or replace function oda_soru_durum_of(s oda_oyun) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ids int[] := oda_soru_gunun(s.gun); c jsonb := coalesce(s.durum->'cevaplar', '[]'); t jsonb := '[]'; q oda_soru; i int; n int;
begin
  n := jsonb_array_length(c);
  for i in 1..array_length(ids, 1) loop
    select * into q from oda_soru where id = ids[i];
    t := t || jsonb_build_object('soru', q.soru, 'secenekler', to_jsonb(q.secenekler),
      'cevap', case when i <= n then (c->>(i - 1))::int end,
      'dogru', case when i <= n then q.dogru end);
  end loop;
  return jsonb_build_object('gun', s.gun, 'bitti', s.bitti, 'puan', s.puan, 'sorular', t);
end $$;

create or replace function oda_soru_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, durum) values (my_school(), auth.uid(), 'soru', g, '{"cevaplar":[]}')
    on conflict (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'soru' and gun = g;
  return oda_soru_durum_of(s);
end $$;

create or replace function oda_soru_cevap(p int) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; ids int[]; n int; d int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  if p is null or p < 1 or p > 4 then raise exception 'Bir seçenek seç'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'soru' and gun = g for update;
  if s.id is null then raise exception 'Önce oyunu aç'; end if;
  if s.bitti is not null then return oda_soru_durum_of(s); end if;
  ids := oda_soru_gunun(g);
  s.durum := jsonb_set(coalesce(s.durum, '{}'), '{cevaplar}', coalesce(s.durum->'cevaplar', '[]') || to_jsonb(p));
  n := jsonb_array_length(s.durum->'cevaplar');
  if n >= array_length(ids, 1) then
    select count(*) into d from generate_series(1, array_length(ids, 1)) i join oda_soru q on q.id = ids[i]
      where q.dogru = (s.durum->'cevaplar'->>(i - 1))::int;
    s.bitti := now(); s.puan := d;
  end if;
  update oda_oyun set durum = s.durum, bitti = s.bitti, puan = s.puan where id = s.id;
  return oda_soru_durum_of(s);
end $$;

drop function oda_soru_sure_kapat();
drop function oda_soru_bak();
drop function oda_soru_kapat(oda_oyun);
drop function oda_soru_sure(date);
delete from oda_icerik_surum where ad = 'soru_sure';
