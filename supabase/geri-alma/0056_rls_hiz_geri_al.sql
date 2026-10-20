-- 0056_rls_hiz geri alma: fonksiyonlar 0044/0011/0013'teki tanımlarına döner, varsayılan tablosu kaldırılır.
create or replace function my_school() returns uuid language sql stable security definer set search_path=public as $$
  select p.school_id from profiles p where p.id=auth.uid() and p.status='approved' and (not requires_mfa() or coalesce(auth.jwt()->>'aal','aal1')='aal2')
$$;
create or replace function setting(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from school_settings where school_id = my_school() and key = p_key), setting_spec()->p_key->'default')
$$;
create or replace function school_setting(p_school uuid, p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from school_settings where school_id = p_school and key = p_key), setting_spec()->p_key->'default')
$$;
drop function if exists ayar_varsayilani(text);
drop function if exists ayar_varsayilan_yenile();
drop table if exists ayar_varsayilan;
drop trigger if exists kimlik_onbellek_sifirla on profiles;
drop trigger if exists kimlik_onbellek_sifirla on profile_roles;
drop trigger if exists ayar_onbellek_sifirla on school_settings;
drop function if exists kimlik_onbellek_sifirla();
drop function if exists ayar_onbellek_sifirla();
create or replace function is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select has_role(auth.uid(),'admin') and coalesce(auth.jwt()->>'aal','aal1')='aal2'
$$;
create or replace function is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select my_school() is not null and (is_admin() or (has_role(auth.uid(),'ogretmen') and exists(select 1 from profiles where id=auth.uid() and branch='Rehberlik')))
$$;
create or replace function is_teacher() returns boolean language sql stable security definer set search_path=public as $$
  select my_school() is not null and (is_staff() or has_role(auth.uid(),'ogretmen'))
$$;
drop function if exists bk_anahtar();
