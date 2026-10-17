-- 0051_etut GERİ ALMA (yalnız gerekirse; migration değildir).
-- Cumartesi etüt modülünün tabloları ve fonksiyonları kaldırılır; setting_spec 0051 öncesine döner.
-- Mevcut tablolara (students, profiles, study_sessions, notifications) dokunulmaz.
-- DİKKAT: Etüt programları, talepler ve yoklamalar silinir. Gerekirse önce Etüt ekranından PDF al.
-- Ön yüz: src/pages/EtutPage.tsx, src/pages/Etut.css, src/lib/etut.ts, src/lib/etut.test.ts, src/lib/etutPdf.tsx
-- dosyalarını sil; src/lib/roles.ts, src/App.tsx, src/lib/notifications.ts, src/pages/YonetimMerkezi.tsx ve
-- src/pages/FamilyPages.tsx içindeki 'etut' satırlarını kaldır.
drop function if exists etut_kaydet(uuid, jsonb);
drop function if exists etut_yayinla(uuid);
drop function if exists etut_sil(uuid);
drop function if exists etut_yoklama(uuid, uuid, text);
drop function if exists etut_talep_ekle(jsonb);
drop function if exists etut_talep_iptal(uuid);
drop function if exists etut_talep_reddet(uuid, text);
drop function if exists etut_imza(uuid, uuid);
drop function if exists etut_bildir_ogrenci(uuid, text);
drop function if exists etut_modul_acik();
drop table if exists etut_ogrenciler;
alter table if exists etut_talepler drop constraint if exists etut_talepler_hucre_fk;
drop table if exists etut_hucreler;
drop table if exists etut_talepler;
drop table if exists etut_gunler;
drop function if exists etut_gun_yayinda(uuid);
drop function if exists etut_bana_ait(uuid, uuid);
drop function if exists etut_hucre_benim(uuid);
drop function if exists setting_spec();
alter function setting_spec_before_0051() rename to setting_spec;
delete from school_settings where key in ('modul.etut', 'bildirim.etut');
