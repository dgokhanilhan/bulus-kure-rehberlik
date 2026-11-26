-- 0098 Açılış penceresi: şablon kart, kaldırma, arşiv = geri çekme.
-- Şablon kart (kart_*): görsel dosyası yerine sayfada çizilir; renkleri kullanıcının temasından gelir, yazıları elle değiştirilir.
-- Arşivlenen pencere artık Yenilikler listesinde de görünmez (geri çekilmiş sayılır); yeniden yayınlanabilir.
-- 'kaldirildi': yayınlanmış pencere de kaldırılabilir; kayıt ve görenler silinmez, yönetim listesinden ve her yerden kalkar.

alter table acilis_pencereleri drop constraint acilis_pencereleri_durum_check;
alter table acilis_pencereleri add constraint acilis_pencereleri_durum_check check (durum in ('taslak', 'yayinda', 'arsiv', 'kaldirildi'));

alter table acilis_pencereleri
  add column kart_etiket text check (kart_etiket is null or char_length(btrim(kart_etiket)) between 2 and 24),
  add column kart_baslik text check (kart_baslik is null or char_length(btrim(kart_baslik)) between 3 and 60),
  add column kart_aciklama text check (kart_aciklama is null or char_length(btrim(kart_aciklama)) <= 140),
  add column kart_cizim text check (kart_cizim is null or kart_cizim in ('hedef', 'oda', 'duyuru'));
-- Kart ile yüklenen görsel birlikte olmaz
alter table acilis_pencereleri add constraint acilis_kart_ya_gorsel check (kart_baslik is null or gorsel is null);

drop function acilis_bekleyenler(text);
create function acilis_bekleyenler(p_rol text)
returns table (id uuid, tur text, baslik text, metin text, gorsel text, gorsel_alt text, dugme_metin text, dugme_rota text, yayin_at timestamptz,
               kart_etiket text, kart_baslik text, kart_aciklama text, kart_cizim text)
language sql stable security definer set search_path = public as $$
  select p.id, p.tur, p.baslik, p.metin, p.gorsel, p.gorsel_alt, p.dugme_metin, p.dugme_rota, p.yayin_at,
         p.kart_etiket, p.kart_baslik, p.kart_aciklama, p.kart_cizim
  from acilis_pencereleri p
  left join acilis_goruldu g on g.pencere_id = p.id and g.user_id = auth.uid()
  where p.durum = 'yayinda' and p.yayin_at <= now() and (p.bitis_at is null or p.bitis_at > now())
    and acilis_hedefte(p, p_rol)
    and (case when p.tur = 'onemli' then g.okudum_at is null else g.pencere_id is null end)
  order by (p.tur = 'onemli') desc, p.yayin_at desc
  limit 3
$$;
revoke all on function acilis_bekleyenler(text) from public, anon;
grant execute on function acilis_bekleyenler(text) to authenticated;

-- Yenilikler: yalnız yayındakiler (arşivlenen ve kaldırılan görünmez)
drop function acilis_yenilikler(text);
create function acilis_yenilikler(p_rol text)
returns table (id uuid, tur text, baslik text, metin text, gorsel text, gorsel_alt text, dugme_metin text, dugme_rota text, yayin_at timestamptz,
               kart_etiket text, kart_baslik text, kart_aciklama text, kart_cizim text)
language sql stable security definer set search_path = public as $$
  select p.id, p.tur, p.baslik, p.metin, p.gorsel, p.gorsel_alt, p.dugme_metin, p.dugme_rota, p.yayin_at,
         p.kart_etiket, p.kart_baslik, p.kart_aciklama, p.kart_cizim
  from acilis_pencereleri p
  where p.durum = 'yayinda' and p.yayin_at <= now() and acilis_hedefte(p, p_rol)
  order by p.yayin_at desc limit 50
$$;
revoke all on function acilis_yenilikler(text) from public, anon;
grant execute on function acilis_yenilikler(text) to authenticated;
