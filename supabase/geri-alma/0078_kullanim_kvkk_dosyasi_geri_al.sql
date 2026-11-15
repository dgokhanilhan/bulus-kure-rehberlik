-- 0078 geri alma: kullanım panosu, KVKK dosyası ve başvuruları kalkar; log_view eski haline döner.
-- Not: öğrenci sayfası görüntüleme kayıtları (audit_log, entity='ogrenci') işlem kaydı olduğu için silinmez.
select cron.unschedule('kvkk-talep-temizlik');
drop function if exists kvkk_talep_temizlik();
drop function if exists kvkk_ogrenci_dosyasi(uuid);
drop function if exists kvkk_talep_yanitla(uuid, text, text);
drop table if exists kvkk_talep;
drop function if exists kvkk_talep_bildir();
drop function if exists kvkk_talep_damga();
drop function if exists kullanim_ozeti();
drop index if exists audit_log_goruntuleme;
create or replace function log_view(p_entity text, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_entity not in ('rehber_notlari','rapor') then raise exception 'Geçersiz kayıt türü' using errcode = '22023'; end if;
  if not (is_staff() and can_see_student(p_student)) then return; end if;
  insert into audit_log (user_id, action, entity, entity_id) values (auth.uid(), 'view', p_entity, p_student);
end $$;
