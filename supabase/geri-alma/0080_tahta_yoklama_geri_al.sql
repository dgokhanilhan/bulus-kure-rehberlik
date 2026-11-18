-- 0080 geri alma: tahta yoklaması ve pilot bildirim bekletmesi kalkar (tahtalar, PIN'ler, kuyruk verileriyle birlikte).
-- Yoklama kayıtları (attendance) kalır; yalnız kaynak sütunu düşer. Bildirim tetikleyicisi 0009'daki hâline döner.
select cron.unschedule('yoklama-bildirim');
drop function if exists tahta_listesi();
drop function if exists tahta_ekle(uuid, text);
drop function if exists tahta_kod_yenile(uuid);
drop function if exists tahta_kaldir(uuid);
drop function if exists tahta_kilit_ac(uuid);
drop function if exists tahta_pin_yenile();
drop function if exists tahta_pin_durum();
drop function if exists tahta_yoklama_gonder(text, text, uuid, jsonb);
drop function if exists tahta_liste(text, uuid);
drop function if exists tahta_durum(text);
drop function if exists tahta_eslestir(text);
drop function if exists tahta_sinif_listesi(uuid, date);
drop function if exists tahta_kilit(uuid);
drop function if exists tahta_bul(text);
drop function if exists tahta_kod_norm(text);
drop function if exists tahta_kod_uret();
drop function if exists tahta_pin_ozet(uuid, text);
drop function if exists tahta_ozet(text);
drop function if exists tahta_bugun();
drop function if exists yoklama_bildirim_gonder(timestamptz);

drop trigger attendance_notify on attendance;
create or replace function attendance_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare s students; label text;
begin
  if new.status not in ('devamsiz', 'gec') or (tg_op = 'UPDATE' and old.status = new.status and old.day = new.day) then
    return null;
  end if;
  select * into s from students where id = new.student_id;
  label := case new.status when 'devamsiz' then 'okula gelmedi' else 'okula geç geldi' end;
  perform notify_many(array(select parent_accounts(s.id)) || array(select student_accounts(s.id)),
    s.full_name || ' ' || to_char(new.day, 'DD.MM.YYYY') || ' günü ' || label || '.',
    jsonb_build_object('page', 'okul'));
  return null;
end $$;
create trigger attendance_notify after insert or update on attendance
  for each row execute function attendance_notify();

drop function if exists yoklama_degisti(uuid, date);
drop function if exists yoklama_bildir(uuid, date);
drop function if exists yoklama_bildirim_ani(uuid, date);
drop function if exists yoklama_pilot(uuid);
drop trigger if exists attendance_kaynak on attendance;
drop function if exists attendance_kaynak();
alter table attendance drop column if exists kaynak;
drop table if exists yoklama_bildirim;
drop table if exists yoklama_oturum;
drop table if exists tahta_deneme;
drop table if exists tahta_pin;
drop table if exists tahta;
delete from vault.secrets where name = 'tahta_pin_key';
delete from school_settings where key in ('yoklama.bildirim_saati');
drop function setting_spec();
alter function setting_spec_before_0080() rename to setting_spec;
select ayar_varsayilan_yenile();
