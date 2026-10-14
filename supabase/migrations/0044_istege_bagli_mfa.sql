-- 0044: Yönetici için zorunlu, diğer üyeler için doğrulanmış Authenticator varsa zorunlu MFA.
create function requires_mfa() returns boolean language sql stable security definer set search_path=public as $$
 select has_role(auth.uid(),'admin') or exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified' and factor_type='totp')
$$;
revoke all on function requires_mfa() from public,anon;
grant execute on function requires_mfa() to authenticated;
create or replace function my_school() returns uuid language sql stable security definer set search_path=public as $$
 select p.school_id from profiles p where p.id=auth.uid() and p.status='approved'
 and (not requires_mfa() or coalesce(auth.jwt()->>'aal','aal1')='aal2')
$$;
do $$
declare sig text; def text;
begin
 foreach sig in array array['gallery_sees(uuid,gallery_albums)','event_reaches(uuid,calendar_events,boolean)','announcement_reaches(uuid,announcements)'] loop
  def:=pg_get_functiondef(sig::regprocedure);
  if position('not has_role(uid,''admin'')' in def)=0 then raise exception 'MFA koruması beklenen biçimde değil: %',sig; end if;
  execute replace(def,'not has_role(uid,''admin'')','not requires_mfa()');
 end loop;
end $$;
-- Auth doğrulaması tamamlandıktan sonra yönetim kişi listesindeki e-posta da güncellenir.
create function sync_confirmed_profile_email() returns trigger language plpgsql security definer set search_path=public as $$
begin
 update profiles set email=new.email where id=new.id;
 return new;
end $$;
revoke all on function sync_confirmed_profile_email() from public,anon,authenticated;
create trigger sync_confirmed_profile_email after update of email on auth.users for each row when(old.email is distinct from new.email) execute function sync_confirmed_profile_email();
