-- 0085 geri alma: Şehir ve 5 Soru eski içerik/seçime döner (skorlar etkilenmez).
create or replace function oda_sehir_durum_of(s oda_oyun) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare h oda_sehir; x oda_sehir; t jsonb := '[]'; p int; km int; aci float8; n int;
  e1 float8; e2 float8; db float8;
begin
  select * into h from oda_sehir where plaka = oda_sehir_gunun(s.gun);
  for p in select v::int from jsonb_array_elements_text(coalesce(s.durum->'tahminler', '[]')) with ordinality a(v, o) order by o loop
    select * into x from oda_sehir where plaka = p;
    if p = h.plaka then
      t := t || jsonb_build_object('plaka', p, 'ad', x.ad, 'km', 0, 'yon', null);
    else
      e1 := radians(x.enlem::float8); e2 := radians(h.enlem::float8); db := radians((h.boylam - x.boylam)::float8);
      km := greatest(5, (round(6371 * 2 * asin(sqrt(power(sin((e2 - e1) / 2), 2) + cos(e1) * cos(e2) * power(sin(db / 2), 2))) / 5) * 5)::int);
      -- Hedef, tahmin edilen ilin hangi yönünde: 0° kuzey, 90° doğu
      aci := degrees(atan2(db * cos((e1 + e2) / 2), e2 - e1));
      t := t || jsonb_build_object('plaka', p, 'ad', x.ad, 'km', km,
        'yon', (array['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'])[1 + (floor((aci + 360 + 22.5) / 45)::int % 8)]);
    end if;
  end loop;
  n := jsonb_array_length(t);
  return jsonb_build_object('gun', s.gun, 'bitti', s.bitti, 'puan', s.puan, 'tahminler', t,
    'ipuclari', to_jsonb(h.ipuclari[1:case when s.bitti is not null then 3 else least(3, 1 + n / 2) end]),
    'cevap', case when s.bitti is not null then h.ad end,
    'iller', (select jsonb_agg(jsonb_build_object('plaka', i.plaka, 'ad', i.ad) order by i.plaka) from oda_sehir i));
end $$;

create or replace function oda_soru_gunun(g date) returns int[] language sql stable security definer set search_path = public as $$
  with ozel as (select id from oda_soru where ay = extract(month from g)::int and gun = extract(day from g)::int order by id limit 1),
  genel as (select id, (row_number() over (order by md5('soru:' || id)) - 1)::int rn, (count(*) over ())::int n from oda_soru where ay is null),
  sirali as (select id, (((rn - oda_gun_no(g) * 5) % n) + n) % n poz from genel)
  select coalesce((select array_agg(id) from ozel), '{}')
      || (select array_agg(id order by poz) from sirali where poz < 5 - (select count(*) from ozel))
$$;
delete from oda_soru where havuz = 2;
alter table oda_soru drop column havuz;
alter table oda_sehir drop column ipuclari6;
drop table oda_icerik_surum;
