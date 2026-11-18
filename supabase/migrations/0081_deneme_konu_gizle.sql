-- Denemenin konu analizini gizle (Denemeler › Yüklenen denemeler › "Konuları gizle").
-- Bazı yayınların PDF'inde kazanım yerine yalnız ünite adı (ör. "ÇARPANLAR VE KATLAR") bulunur. Bu üst başlıklar alt
-- kazanımlarla (EBOB-EKOK, aralarında asal…) çakışıp sınıf analizini ve etüt önerilerini karıştırır. Gizlenen denemenin
-- konu bilgisi Konular, sınıf ısı haritası, deneme ayrıntısı, raporlar ve öneriler için okunmaz; puan, net ve D/Y/B aynen
-- kalır (sonuç ve kazanım ayrı). Veri silinmez; anahtar geri açılınca konu bilgisi yeniden görünür.
-- Geri alma: supabase/geri-alma/0081_deneme_konu_gizle_geri_al.sql

alter table exams add column topics_hidden boolean not null default false;

create function set_exam_topics_hidden(p_exam uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e exams;
begin
  if not is_staff() then raise exception 'Bu işlem için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  if p_hidden is null then raise exception 'Geçersiz değer.' using errcode = '22023'; end if;
  select * into e from exams where id = p_exam and school_id = my_school() for update;
  if e.id is null then raise exception 'Deneme bulunamadı.' using errcode = 'P0002'; end if;
  if e.topics_hidden = p_hidden then return; end if;
  update exams set topics_hidden = p_hidden where id = e.id;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), case when p_hidden then 'hide_topics' else 'show_topics' end, 'exams', e.id, jsonb_build_object('name', e.name));
end $$;
revoke all on function set_exam_topics_hidden(uuid, boolean) from public, anon;
grant execute on function set_exam_topics_hidden(uuid, boolean) to authenticated;

-- ---------- Veli haftalık özeti kaldırıldı (okul geri bildirimi: gereksiz bulundu) ----------
-- Ekranlardan kalktı; ayar listeden çıkar ve gönderme işlevi kapatılır. Önceden gönderilmiş özetler silinmez (0077'deki
-- bir yıllık temizlik sürer); tablo ve okuma kuralı yerinde kalır, geri alma dosyası her şeyi eski haline getirir.
alter function setting_spec() rename to setting_spec_before_0081;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0081() - 'aile.haftalik_ozet'
$$;
select ayar_varsayilan_yenile();
delete from school_settings where key = 'aile.haftalik_ozet';
revoke execute on function veli_ozet_gonder(uuid, jsonb, text) from authenticated;
