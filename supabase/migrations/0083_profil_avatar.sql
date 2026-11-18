-- Profil avatarı: kişi hazır avatarlardan birini seçer (Profil menüsü › Avatar). Yalnız görünüm; boş = baş harfler.
-- Avatarlar uygulamanın kendi listesidir (hayvan/nesne simgeleri; telifli karakter yok). Kişi yalnız kendi satırını değiştirir.
-- Geri alma: supabase/geri-alma/0083_profil_avatar_geri_al.sql
alter table profiles add column if not exists avatar text;
alter table profiles add constraint profiles_avatar_bicim check (avatar is null or avatar ~ '^[a-z]{2,20}$');

create function avatar_kaydet(p_avatar text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_avatar is not null and p_avatar !~ '^[a-z]{2,20}$' then raise exception 'Geçersiz avatar.' using errcode = '22023'; end if;
  update profiles set avatar = p_avatar where id = auth.uid() and avatar is distinct from p_avatar;
end $$;
revoke all on function avatar_kaydet(text) from public, anon;
grant execute on function avatar_kaydet(text) to authenticated;
