-- 0099: Bildirim türü düzeltmesi. "Cumartesi etüdü…" ve "Öğretmen notu…" bildirimleri bağlantıları {page:'ozet'} olduğu için
-- 'deneme' (Deneme sonucu) sayılıyordu; artık 'etut' ve 'not'. Gövde 0018'deki son tanımdan alındı, yalnız iki satır eklendi.
create or replace function notification_type(p_text text, p_link jsonb) returns text language sql immutable as $$
  select case
    when p_text like 'Bursluluk%' then 'bursluluk'
    when p_text like 'Cumartesi etüdü%' then 'etut'
    when p_text like 'Öğretmen notu%' then 'not'
    when p_link ? 'event' then coalesce(p_link->>'kind', 'etkinlik')
    when p_link ? 'homework' then case when p_text like 'Yeni ödev%' then 'odev_yeni' when p_text like 'Ödev kontrol%' then 'odev_kontrol'
                                       when p_text like 'Ödev hatırlatma%' then 'odev_hatirlatma' else 'odev' end
    when p_link ? 'conversation' then 'mesaj'
    when p_link ? 'announcement' then 'duyuru'
    when p_link ? 'report' then 'rapor'
    when p_link ? 'meeting' or p_link->>'page' = 'gorusmeler' or p_link->>'tab' = 'gorusmeler' then 'gorusme'
    when p_link->>'page' = 'gorevler' or p_link->>'tab' = 'gorevler' then 'gorev'
    when p_link->>'tab' = 'notlar' then 'not'
    when p_link->>'page' = 'okul' then 'devamsizlik'
    when p_link->>'page' in ('ozet', 'denemeler') then 'deneme'
    when p_link->>'page' = 'onaylar' then 'kayit'
    when p_link ? 'alarm' then 'sistem'
    else 'diger' end
$$;

-- Var olan yanlış etiketli bildirimler (yalnız tür; metin, bağlantı ve okunma bilgisi değişmez).
-- Kullanıcı koruması (notifications_guard) türü kilitler; bu düzeltme için işlem içinde kısa süre kapatılır.
alter table notifications disable trigger notifications_guard;
update notifications set type = notification_type(text, link)
 where type = 'deneme' and (text like 'Cumartesi etüdü%' or text like 'Öğretmen notu%');
alter table notifications enable trigger notifications_guard;
