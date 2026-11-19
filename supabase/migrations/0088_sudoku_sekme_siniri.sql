-- 0088: Günün Sudokusu — sayfadan ayrılma sınırı ve tek seferlik kurallar penceresi.
-- 1) Oyun sırasında sayfadan (başka sekme/uygulama, ekran kilidi) en fazla 5 kez ayrılınabilir; 6. ayrılışta o günün
--    Sudokusu sona erer: çözüm kabul edilmez, ipucu alınamaz. Sona eren oyun "bitmiş" sayılmaz (bitti boş kalır), bu yüzden
--    skor tablosu, lig, kürsü, istatistik, seri ve rozet hesapları hiç değişmez. Ayrılma sayısı sunucuda en yüksek değeriyle
--    tutulur (sayfayı yenilemek ya da tarayıcı verisini silmek sıfırlamaz). Yürürlük ertesi gün ('sudoku_sekme').
-- 2) Kurallar penceresi: kişi "Tamam" deyince hesabına yazılır (oda_oyun_tercih.sudoku_kural), hiçbir cihazda yeniden
--    çıkmaz. Pencere oyun açılmadan gösterilir; süre "Tamam"dan sonra oyun açılınca başlar.
-- Bugünkü ve geçmiş oyunlar, mevcut puanlar değişmez. Geri alma: supabase/geri-alma/0088_sudoku_sekme_siniri_geri_al.sql

insert into oda_icerik_surum (ad, baslangic) values ('sudoku_sekme', tr_today() + 1);
alter table oda_oyun_tercih add column sudoku_kural timestamptz;

-- O günün ayrılma sınırı; yürürlükten önce sınır yok (null)
create function oda_sudoku_sekme_sinir(g date) returns int language sql stable security definer set search_path = public as $$
  select case when g >= coalesce((select baslangic from oda_icerik_surum where ad = 'sudoku_sekme'), 'infinity'::date) then 5 end
$$;
revoke all on function oda_sudoku_sekme_sinir(date) from public, anon, authenticated;

-- Oyunu başlatmadan: kurallar onaylandı mı, bugün sınır var mı; kural metni için okulun alt süre ve ritim ayarı
create function oda_sudoku_kural() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'onay', exists (select 1 from oda_oyun_tercih where user_id = auth.uid() and sudoku_kural is not null),
    'sinir', oda_sudoku_sekme_sinir(tr_today()),
    'alt_sure', oda_sudoku_ayar(my_school(), 'oda.sudoku_alt_sure', 240),
    'ritim', oda_sudoku_ayar(my_school(), 'oda.sudoku_ritim', 50))
  where oda_ogretmen('oyunlar')
$$;
revoke all on function oda_sudoku_kural() from public, anon;
grant execute on function oda_sudoku_kural() to authenticated;

create function oda_sudoku_kural_onayla() returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun_tercih (user_id, sudoku_kural) values (auth.uid(), now())
    on conflict (user_id) do update set sudoku_kural = coalesce(oda_oyun_tercih.sudoku_kural, now());
end $$;
revoke all on function oda_sudoku_kural_onayla() from public, anon;
grant execute on function oda_sudoku_kural_onayla() to authenticated;

-- Durum: ayrılma sayısı, sınır ve sona erme eklendi (0084'teki gövde + üç alan)
create or replace function oda_sudoku_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun) values (my_school(), auth.uid(), 'sudoku', g)
    on conflict (user_id, oyun, gun) where oyun in ('sudoku', 'kelime') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g;
  select * into u from oda_sudoku_uret(g);
  return jsonb_build_object('gun', g, 'ipucu', to_jsonb(u.ipucu), 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
                            'cozum', case when s.bitti is not null then to_jsonb(u.cozum) end,
                            'ipuclari', coalesce(s.durum->'ipuclari', '[]'), 'ipucu_hak', 3 - s.ipucu, 'lig_disi', s.lig_disi, 'neden', s.durum->>'neden',
                            'sekme', coalesce((s.durum->>'sekme_say')::int, 0), 'sinir', oda_sudoku_sekme_sinir(g),
                            'sona_erdi', coalesce(s.durum->>'neden' = 'sekme' and s.bitti is null, false));
end $$;

-- Ayrılma bildirimi: tarayıcı o günkü toplam ayrılma sayısını gönderir; sunucu en yüksek değeri tutar.
-- Sınır aşılınca oyun sona erer (bitti boş, lig_disi, neden 'sekme').
create function oda_sudoku_sekme(p_sayi int) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; sinir int := oda_sudoku_sekme_sinir(tr_today()); yeni int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g for update;
  if s.id is null or s.bitti is not null or sinir is null or s.durum->>'neden' = 'sekme' then
    return jsonb_build_object('sekme', coalesce((s.durum->>'sekme_say')::int, 0), 'sinir', sinir,
                              'sona_erdi', coalesce(s.durum->>'neden' = 'sekme' and s.bitti is null, false));
  end if;
  yeni := greatest(coalesce((s.durum->>'sekme_say')::int, 0), least(greatest(coalesce(p_sayi, 0), 0), 1000));
  if yeni > sinir then
    update oda_oyun set lig_disi = true,
      durum = durum || jsonb_build_object('sekme_say', yeni, 'neden', 'sekme', 'sona_erdi_an', now())
    where id = s.id;
    return jsonb_build_object('sekme', yeni, 'sinir', sinir, 'sona_erdi', true);
  end if;
  update oda_oyun set durum = durum || jsonb_build_object('sekme_say', yeni) where id = s.id;
  return jsonb_build_object('sekme', yeni, 'sinir', sinir, 'sona_erdi', false);
end $$;
revoke all on function oda_sudoku_sekme(int) from public, anon;
grant execute on function oda_sudoku_sekme(int) to authenticated;

-- İpucu: sona eren oyunda alınamaz (0084'teki gövde + tek satır)
create or replace function oda_sudoku_ipucu(p_hucre int default null, p_giris int[] default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record; a int[]; alinan int[]; h int; v int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then raise exception 'Bulmaca bitti'; end if;
  if s.durum->>'neden' = 'sekme' then raise exception 'Bugünkü Sudoku sona erdi'; end if;
  if s.ipucu >= 3 then raise exception 'İpucu hakkın bitti'; end if;
  select * into u from oda_sudoku_uret(g);
  alinan := array(select (x->>'i')::int from jsonb_array_elements(coalesce(s.durum->'ipuclari', '[]')) x);
  -- Tahta: ipuçları + alınan ipuçları + kişinin girdileri (geçersiz giriş yok sayılır)
  a := u.ipucu;
  foreach h in array alinan loop a[h + 1] := u.cozum[h + 1]; end loop;
  if p_giris is not null and array_length(p_giris, 1) = 81 then
    for h in 1..81 loop
      if a[h] = 0 and p_giris[h] between 1 and 9 then a[h] := p_giris[h]; end if;
    end loop;
  end if;
  if p_hucre between 0 and 80 and u.ipucu[p_hucre + 1] = 0 and not (p_hucre = any(alinan))
     and (a[p_hucre + 1] = 0 or a[p_hucre + 1] <> u.cozum[p_hucre + 1]) then
    h := p_hucre;
  else
    select i into h from generate_series(0, 80) i
    where a[i + 1] = 0
    order by (select count(*) from generate_series(0, 80) k
              where k <> i and a[k + 1] > 0 and (k / 9 = i / 9 or k % 9 = i % 9 or (k / 27 = i / 27 and (k % 9) / 3 = (i % 9) / 3))) desc, i
    limit 1;
  end if;
  if h is null then raise exception 'İpucu verilecek boş hücre yok'; end if;
  v := u.cozum[h + 1];
  update oda_oyun set ipucu = ipucu + 1,
    durum = jsonb_set(coalesce(durum, '{}'), '{ipuclari}', coalesce(durum->'ipuclari', '[]') || jsonb_build_object('i', h, 'v', v))
  where id = s.id;
  return jsonb_build_object('hucre', h, 'deger', v, 'ipucu_hak', 2 - s.ipucu);
end $$;

-- Bitiş: sona eren oyun kabul edilmez; bitişte gelen ayrılma sayısı sınırı aşıyorsa oyun sona erer (0084'teki gövde + iki blok)
create or replace function oda_sudoku_bitis(p int[], p_hamle int[], p_sekme int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record; ham int; v_puan int; alt int; ritim int; neden text;
  kendi int; son int; enson int; sinir int := oda_sudoku_sekme_sinir(tr_today()); ayrilma int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then
    return jsonb_build_object('dogru', true, 'puan', s.puan, 'ipucu', s.ipucu, 'ham', s.puan - 30 * s.ipucu, 'lig_disi', s.lig_disi);
  end if;
  if s.durum->>'neden' = 'sekme' then return jsonb_build_object('dogru', false, 'sona_erdi', true); end if;
  ayrilma := greatest(coalesce((s.durum->>'sekme_say')::int, 0), least(greatest(coalesce(p_sekme, 0), 0), 1000));
  if sinir is not null and ayrilma > sinir then
    update oda_oyun set lig_disi = true,
      durum = durum || jsonb_build_object('sekme_say', ayrilma, 'neden', 'sekme', 'sona_erdi_an', now())
    where id = s.id;
    return jsonb_build_object('dogru', false, 'sona_erdi', true);
  end if;
  select * into u from oda_sudoku_uret(g);
  if not oda_sudoku_gecerli(p, u.ipucu) then return jsonb_build_object('dogru', false); end if;
  ham := greatest(1, extract(epoch from now() - s.basladi)::int);
  v_puan := ham + 30 * s.ipucu;
  alt := oda_sudoku_ayar(s.school_id, 'oda.sudoku_alt_sure', 240);
  ritim := oda_sudoku_ayar(s.school_id, 'oda.sudoku_ritim', 50);
  if alt > 0 and ham < alt then
    neden := 'sure';
  elsif ritim < 100 and p_hamle is not null and array_length(p_hamle, 1) = 81 then
    -- Kişinin kendi girdiği hücreler: bulmaca ipucu ve alınan ipucu olmayanlar
    select count(*), max(p_hamle[i]) into kendi, enson from generate_series(1, 81) i
    where u.ipucu[i] = 0 and p_hamle[i] > 0
      and not ((i - 1) = any(array(select (x->>'i')::int from jsonb_array_elements(coalesce(s.durum->'ipuclari', '[]')) x)));
    select count(*) into son from generate_series(1, 81) i
    where u.ipucu[i] = 0 and p_hamle[i] > 0 and p_hamle[i] >= enson - 60000
      and not ((i - 1) = any(array(select (x->>'i')::int from jsonb_array_elements(coalesce(s.durum->'ipuclari', '[]')) x)));
    if kendi >= 20 and son * 100 > kendi * ritim then neden := 'ritim'; end if;
  end if;
  update oda_oyun set bitti = now(), puan = v_puan, lig_disi = neden is not null,
    durum = coalesce(durum, '{}') || jsonb_build_object('ham', ham, 'sekme', greatest(0, coalesce(p_sekme, 0)))
              || case when neden is not null then jsonb_build_object('neden', neden) else '{}'::jsonb end
  where id = s.id;
  return jsonb_build_object('dogru', true, 'puan', v_puan, 'ham', ham, 'ipucu', s.ipucu, 'lig_disi', neden is not null, 'neden', neden);
end $$;
