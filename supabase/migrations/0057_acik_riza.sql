-- Açık rıza: aydınlatma metninden AYRI metin ve ayrı onay (KVKK Kurulu 18.02.2026 tarih ve 2026/347 sayılı ilke kararı:
-- aydınlatma ve açık rıza ayrı düzenlenir). Kendi kendine kayıtta açık rıza kutusu işaretlenmeden kayıt açılmaz; davetle
-- açılan ve mevcut hesaplar ilk girişte bir kez onaylar (ön yüz kapısı: AuthProvider gateOf → 'consent').
-- Onay sürümü ve zamanı profilde; her onay işlem kaydına (audit_log) yazılır. Geri alma: supabase/geri-alma/0057_acik_riza_geri_al.sql

alter table profiles add column if not exists acik_riza_version text check (char_length(acik_riza_version) <= 40);
alter table profiles add column if not exists acik_riza_at timestamptz;

-- Kayıt: aydınlatma (consent_version) ve açık rıza (acik_riza_version) ayrı ayrı aranır ve kaydedilir.
create or replace function handle_new_user_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := new.raw_user_meta_data->>'consent_version';
  r text := new.raw_user_meta_data->>'acik_riza_version';
  invited boolean := exists (select 1 from invite_intents i where i.email = lower(new.email) and i.created_at > now() - interval '10 minutes');
begin
  if session_user = 'supabase_auth_admin' and not invited and (v is null or length(v) > 40) then
    raise exception 'Aydınlatma metni onaylanmalı.' using errcode = '22023';
  end if;
  if session_user = 'supabase_auth_admin' and not invited and (r is null or length(r) > 40) then
    raise exception 'Açık rıza metni onaylanmalı.' using errcode = '22023';
  end if;
  if v is not null and length(v) > 40 then v := null; end if;
  if r is not null and length(r) > 40 then r := null; end if;
  update profiles set consent_version = case when not invited then v end,
                      consent_at = case when not invited and v is not null then now() end,
                      acik_riza_version = case when not invited then r end,
                      acik_riza_at = case when not invited and r is not null then now() end
  where id = new.id;
  if not invited and r is not null then
    insert into audit_log (user_id, action, entity, entity_id, meta) values (new.id, 'acik_riza', 'profiles', new.id, jsonb_build_object('version', r, 'kanal', 'kayit'));
  end if;
  delete from invite_intents where email = lower(new.email);
  return new;
end $$;

-- İlk girişte (davetli / mevcut hesap) açık rıza onayı
create function accept_acik_riza(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.' using errcode = '42501'; end if;
  if p_version is null or length(p_version) > 40 then raise exception 'Sürüm geçersiz.' using errcode = '22023'; end if;
  update profiles set acik_riza_version = p_version, acik_riza_at = now() where id = auth.uid();
  insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'acik_riza', 'profiles', auth.uid(), jsonb_build_object('version', p_version, 'kanal', 'giris'));
end $$;
revoke all on function accept_acik_riza(text) from public, anon;
grant execute on function accept_acik_riza(text) to authenticated;
