-- 0087: (1) Mini Bulmaca'da 7×7 takvimden çıkar; ayın son cuması da 5×5 olur (6×6 çarşambaları sürer).
--       7×7 satırları tabloda kalır ama hiçbir gün seçilmez. Mevcut oyun kayıtlarına dokunulmaz.
--       (2) 5 Soruda Bugün'e 1 dakika süre: yürürlük ertesi gün ('soru_sure'). Süre "Başla"ya basınca (oda_soru_ac) başlar,
--       sunucuda ölçülür. Süre dolunca yeni cevap alınmaz; o ana kadarki doğru sayısı puan olarak kaydedilir.
--       Geçmiş ve bugünkü oyunlar eski kuralla kalır; skorlar ve istatistikler değişmez.

-- ---------- (1) 7×7 yok ----------
create or replace function oda_bulmaca_boyut(g date) returns int language sql stable security definer set search_path = public as $$
  select case
    when g < coalesce((select baslangic from oda_icerik_surum where ad = 'bulmaca2'), 'infinity'::date) then 5
    when extract(isodow from g) = 3 and exists (select 1 from oda_bulmaca_buyuk where boyut = 6) then 6
    else 5 end
$$;

-- ---------- (2) 5 Soruda Bugün süresi ----------
insert into oda_icerik_surum (ad, baslangic) values ('soru_sure', tr_today() + 1);

-- O günün süresi (saniye); yürürlükten önceki günlerde süre yok (null)
create function oda_soru_sure(g date) returns int language sql stable security definer set search_path = public as $$
  select case when g >= coalesce((select baslangic from oda_icerik_surum where ad = 'soru_sure'), 'infinity'::date) then 60 end
$$;

-- Süresi dolmuş, bitmemiş oyunu kapatır: puan o ana kadarki doğru sayısı, bitiş anı süre sonu
create function oda_soru_kapat(s oda_oyun) returns oda_oyun language plpgsql volatile security definer set search_path = public as $$
declare sure int := oda_soru_sure(s.gun); ids int[]; d int;
begin
  if s.id is null or s.bitti is not null or sure is null or now() < s.basladi + make_interval(secs => sure) then return s; end if;
  ids := oda_soru_gunun(s.gun);
  select count(*) into d from generate_series(1, least(jsonb_array_length(coalesce(s.durum->'cevaplar', '[]')), array_length(ids, 1))) i
    join oda_soru q on q.id = ids[i]
    where q.dogru = (s.durum->'cevaplar'->>(i - 1))::int;
  s.bitti := s.basladi + make_interval(secs => sure);
  s.puan := d;
  update oda_oyun set bitti = s.bitti, puan = s.puan where id = s.id and bitti is null;
  return s;
end $$;

-- Durum: süreli günlerde 'sure' ve 'kalan' (sn) eklenir; oyun bitince cevaplanmayan soruların doğrusu da gösterilir
create or replace function oda_soru_durum_of(s oda_oyun) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ids int[] := oda_soru_gunun(s.gun); c jsonb := coalesce(s.durum->'cevaplar', '[]'); t jsonb := '[]'; q oda_soru; i int; n int;
        sure int := oda_soru_sure(s.gun);
begin
  n := jsonb_array_length(c);
  for i in 1..array_length(ids, 1) loop
    select * into q from oda_soru where id = ids[i];
    t := t || jsonb_build_object('soru', q.soru, 'secenekler', to_jsonb(q.secenekler),
      'cevap', case when i <= n then (c->>(i - 1))::int end,
      'dogru', case when i <= n or s.bitti is not null then q.dogru end);
  end loop;
  return jsonb_build_object('gun', s.gun, 'bitti', s.bitti, 'puan', s.puan, 'sorular', t)
    || case when sure is null then '{}'::jsonb else jsonb_build_object('sure', sure,
         'kalan', case when s.bitti is null then greatest(0, ceil(extract(epoch from s.basladi + make_interval(secs => sure) - now())))::int end) end;
end $$;

-- Oyunu başlatmadan bakar: başlamamışsa yalnız gün ve süre döner (süreli günlerde istemci "Başla" düğmesini gösterir)
create function oda_soru_bak() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'soru' and gun = g for update;
  if s.id is null then return jsonb_build_object('gun', g, 'baslamadi', true, 'sure', oda_soru_sure(g)); end if;
  return oda_soru_durum_of(oda_soru_kapat(s));
end $$;

create or replace function oda_soru_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, durum) values (my_school(), auth.uid(), 'soru', g, '{"cevaplar":[]}')
    on conflict (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'soru' and gun = g for update;
  return oda_soru_durum_of(oda_soru_kapat(s));
end $$;

-- Sıradaki soruyu cevaplar (1–4). Süre dolduysa cevap alınmaz, oyun o ana kadarki doğrularla biter ('sure_doldu').
create or replace function oda_soru_cevap(p int) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; ids int[]; n int; d int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  if p is null or p < 1 or p > 4 then raise exception 'Bir seçenek seç'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'soru' and gun = g for update;
  if s.id is null then raise exception 'Önce oyunu aç'; end if;
  if s.bitti is not null then return oda_soru_durum_of(s); end if;
  s := oda_soru_kapat(s);
  if s.bitti is not null then return oda_soru_durum_of(s) || '{"sure_doldu": true}'::jsonb; end if;
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

-- Sayfayı kapatıp dönmeyenlerin süresi dolmuş oyunları da kapanır (skor tablosuna o ana kadarki doğrularla girer)
create function oda_soru_sure_kapat() returns int language plpgsql volatile security definer set search_path = public as $$
declare s oda_oyun; n int := 0;
begin
  for s in select * from oda_oyun o
           where o.oyun = 'soru' and o.bitti is null and oda_soru_sure(o.gun) is not null
             and now() >= o.basladi + make_interval(secs => oda_soru_sure(o.gun))
           for update skip locked loop
    perform oda_soru_kapat(s);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function oda_soru_sure(date) from public, anon, authenticated;
revoke all on function oda_soru_kapat(oda_oyun) from public, anon, authenticated;
revoke all on function oda_soru_sure_kapat() from public, anon, authenticated;
grant execute on function oda_soru_sure_kapat() to service_role;
revoke all on function oda_soru_bak() from public, anon;
grant execute on function oda_soru_bak() to authenticated;

select cron.schedule('oda-soru-sure-kapat', '*/5 * * * *', $$select public.oda_soru_sure_kapat()$$);
