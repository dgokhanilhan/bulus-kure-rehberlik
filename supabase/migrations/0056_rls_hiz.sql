-- Yetki kurallarının (RLS) hızı: yönetici olmayan hesaplarda (rehber, öğretmen) sorgular "statement timeout" ile kesiliyordu.
-- Neden: satır başına çalışan kurallar my_school() → requires_mfa() (rol, MFA ve ayar sorguları) ile ayar okumalarında
-- setting_spec() (her migration'da bir katman eklenen büyük JSON) her satırda yeniden hesaplanıyordu. Yönetici kısa devre
-- yaptığı için görünmüyordu. Yetki MANTIĞI DEĞİŞMEZ; yalnız aynı sonuç daha ucuz hesaplanır:
--  1) Ayar varsayılanları indeksli tabloda (ayar_varsayilan); setting() / school_setting() oradan okur. Tabloda olmayan
--     (sonradan eklenen) anahtar eski yoldan (setting_spec) okunur: doğruluk korunur. Yeni ayar ekleyen migration sonunda
--     `select ayar_varsayilan_yenile();` çağırır.
--  2) my_school() sonucu aynı işlem (= bir API isteği) içinde kullanıcı + güvence seviyesi anahtarıyla saklanır.
-- Fonksiyonlar tam tanımla değiştirilir. Geri alma: supabase/geri-alma/0056_rls_hiz_geri_al.sql

-- ---------- 1) Ayar varsayılanları ----------
create table ayar_varsayilan (
  key text primary key,
  value jsonb -- spec'teki varsayılan; varsayılanı olmayan ayar için SQL null (satır yine vardır)
);
alter table ayar_varsayilan enable row level security; -- doğrudan erişim yok; yalnız aşağıdaki fonksiyonlar okur
revoke all on ayar_varsayilan from public, anon, authenticated;

create function ayar_varsayilan_yenile() returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from ayar_varsayilan;
  insert into ayar_varsayilan (key, value) select k, v -> 'default' from jsonb_each(setting_spec()) as e(k, v);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function ayar_varsayilan_yenile() from public, anon, authenticated;
select ayar_varsayilan_yenile();

create function ayar_varsayilani(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from ayar_varsayilan where key = p_key)
              then (select value from ayar_varsayilan where key = p_key)
              else setting_spec() -> p_key -> 'default' end
$$;
revoke all on function ayar_varsayilani(text) from public, anon, authenticated;

create or replace function setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from school_settings where school_id = my_school() and key = p_key),
    ayar_varsayilani(p_key))
$$;

create or replace function school_setting(p_school uuid, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from school_settings where school_id = p_school and key = p_key), ayar_varsayilani(p_key))
$$;

-- ---------- 2) my_school(): işlem içinde bir kez ----------
-- Anahtar: kullanıcı + güvence seviyesi (aal). PostgREST her isteği tek işlemde çalıştırır; değer işlem sonunda silinir
-- (set_config(..., true)). Aynı işlemde kimlik değişirse anahtar tutmaz ve yeniden hesaplanır.
create or replace function my_school() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  k text := coalesce(auth.uid()::text, '-') || '|' || coalesce(auth.jwt() ->> 'aal', 'aal1');
  c text := current_setting('bk.my_school', true);
  v uuid;
begin
  if c is not null and c <> '' and split_part(c, '#', 1) = k then
    return nullif(split_part(c, '#', 2), '')::uuid;
  end if;
  select p.school_id into v from profiles p
  where p.id = auth.uid() and p.status = 'approved' and (not requires_mfa() or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
  perform set_config('bk.my_school', k || '#' || coalesce(v::text, ''), true);
  return v;
end $$;

-- ---------- 3) Kimlik ve ayar kontrolleri: işlem içinde bir kez ----------
-- Kurallar satır başına is_admin() / is_staff() / is_teacher() / module_enabled() çağırır; sonuç aynı istekte değişmez.
-- Ayar önbelleği, school_settings'e yazılınca (aynı işlemde) sürüm artırılarak geçersiz olur.
create function bk_anahtar() returns text language sql stable as $$
  select coalesce(auth.uid()::text, '-') || '|' || coalesce(auth.jwt() ->> 'aal', 'aal1')
$$;

create or replace function is_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare k text := bk_anahtar(); c text := current_setting('bk.is_admin', true); v boolean;
begin
  if c is not null and c <> '' and split_part(c, '#', 1) = k then return split_part(c, '#', 2) = 't'; end if;
  v := has_role(auth.uid(), 'admin') and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
  perform set_config('bk.is_admin', k || '#' || case when v then 't' else 'f' end, true);
  return v;
end $$;

create or replace function is_staff() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare k text := bk_anahtar(); c text := current_setting('bk.is_staff', true); v boolean;
begin
  if c is not null and c <> '' and split_part(c, '#', 1) = k then return split_part(c, '#', 2) = 't'; end if;
  v := my_school() is not null and (is_admin() or (has_role(auth.uid(), 'ogretmen') and exists (select 1 from profiles where id = auth.uid() and branch = 'Rehberlik')));
  perform set_config('bk.is_staff', k || '#' || case when v then 't' else 'f' end, true);
  return v;
end $$;

create or replace function is_teacher() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare k text := bk_anahtar(); c text := current_setting('bk.is_teacher', true); v boolean;
begin
  if c is not null and c <> '' and split_part(c, '#', 1) = k then return split_part(c, '#', 2) = 't'; end if;
  v := my_school() is not null and (is_staff() or has_role(auth.uid(), 'ogretmen'));
  perform set_config('bk.is_teacher', k || '#' || case when v then 't' else 'f' end, true);
  return v;
end $$;

-- setting(): okulun ayarı / varsayılan; anahtar başına işlem içinde bir kez (yazınca sürüm artar → yeniden okunur)
create or replace function setting(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  k text := bk_anahtar() || '|' || coalesce(current_setting('bk.ayar_surum', true), '0');
  c text := current_setting('bk.ayar', true);
  m jsonb := '{}'::jsonb;
  v jsonb;
begin
  if c is not null and c <> '' and split_part(c, '#', 1) = k then
    m := substr(c, length(k) + 2)::jsonb;
    if m ? p_key then return m -> p_key; end if;
  end if;
  v := coalesce((select value from school_settings where school_id = my_school() and key = p_key), ayar_varsayilani(p_key));
  perform set_config('bk.ayar', k || '#' || (m || jsonb_build_object(p_key, v))::text, true);
  return v;
end $$;

create function ayar_onbellek_sifirla() returns trigger language plpgsql as $$
begin
  perform set_config('bk.ayar_surum', (coalesce(nullif(current_setting('bk.ayar_surum', true), ''), '0')::int + 1)::text, true);
  return null;
end $$;
create trigger ayar_onbellek_sifirla after insert or update or delete on school_settings for each statement execute function ayar_onbellek_sifirla();

-- Kimlik/onay değişiklikleri aynı işlemde yeniden hesaplansın (ör. onay, rol ekleme RPC'lerinden sonra okuma)
create function kimlik_onbellek_sifirla() returns trigger language plpgsql as $$
begin
  perform set_config('bk.my_school', '', true);
  perform set_config('bk.is_admin', '', true);
  perform set_config('bk.is_staff', '', true);
  perform set_config('bk.is_teacher', '', true);
  perform set_config('bk.ayar', '', true);
  return null;
end $$;
create trigger kimlik_onbellek_sifirla after insert or update or delete on profiles for each statement execute function kimlik_onbellek_sifirla();
create trigger kimlik_onbellek_sifirla after insert or update or delete on profile_roles for each statement execute function kimlik_onbellek_sifirla();
