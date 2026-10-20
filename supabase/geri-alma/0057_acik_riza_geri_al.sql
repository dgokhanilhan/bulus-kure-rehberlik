-- 0057_acik_riza geri alma: kayıt tetikleyicisi 0017 tanımına döner, açık rıza alanları ve fonksiyonu kaldırılır.
create or replace function handle_new_user_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := new.raw_user_meta_data->>'consent_version';
  invited boolean := exists (select 1 from invite_intents i where i.email = lower(new.email) and i.created_at > now() - interval '10 minutes');
begin
  if session_user = 'supabase_auth_admin' and not invited and (v is null or length(v) > 40) then
    raise exception 'Aydınlatma metni onaylanmalı.' using errcode = '22023';
  end if;
  if v is not null and length(v) > 40 then v := null; end if;
  update profiles set consent_version = case when not invited then v end,
                      consent_at = case when not invited and v is not null then now() end
  where id = new.id;
  delete from invite_intents where email = lower(new.email);
  return new;
end $$;
drop function if exists accept_acik_riza(text);
alter table profiles drop column if exists acik_riza_at;
alter table profiles drop column if exists acik_riza_version;
