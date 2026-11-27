-- 0103 geri alma: veli davet kodu kaldırılır, kayıt denetimi 0052 hâline döner.
drop trigger if exists on_auth_user_zzz_davet on auth.users;
drop function if exists veli_davet_kayit();
create or replace function handle_new_user_kayit() returns trigger
language plpgsql security definer set search_path = public as $$
declare sch uuid; invited boolean;
begin
  if session_user <> 'supabase_auth_admin' then return new; end if;
  invited := exists (select 1 from invite_intents i where i.email = lower(new.email) and i.created_at > now() - interval '10 minutes');
  if invited then return new; end if;
  select id into sch from schools where slug = new.raw_user_meta_data->>'school';
  if sch is null then return new; end if;
  if not coalesce((school_setting(sch, 'kayit.acik'))::text::boolean, true)
     or coalesce((school_setting(sch, 'kayit.davet_zorunlu'))::text::boolean, false) then
    raise exception 'Okul şu an yeni kayıt almıyor.' using errcode = '42501';
  end if;
  return new;
end $$;

drop function if exists veli_davet_ozet();
drop function if exists veli_davet_sinif(uuid);
drop function if exists veli_davet_hazirla(uuid[], boolean);
drop function if exists veli_davet_isaretle(uuid[], text);
drop function if exists veli_davet_yetki();
drop function if exists veli_davet_bilgi(text);
drop function if exists veli_davet_gecerli(text);
drop function if exists veli_davet_kod_uret();
drop table if exists veli_davet;
