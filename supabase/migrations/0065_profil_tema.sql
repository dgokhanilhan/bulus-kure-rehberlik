-- Görünüm teması: kişinin kendi seçimi (yalnız görünüm). Boş = varsayılan "Buluş Küre".
-- Kişi yalnız kendi satırındaki temayı değiştirir; profilin başka alanına bu yoldan dokunulamaz.
alter table profiles add column if not exists tema text;
alter table profiles drop constraint if exists profiles_tema_bicim;
alter table profiles add constraint profiles_tema_bicim check (tema is null or tema ~ '^[a-z]{2,20}$');

create or replace function tema_kaydet(p_tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.' using errcode = '42501'; end if;
  if p_tema is not null and p_tema !~ '^[a-z]{2,20}$' then raise exception 'Geçersiz tema.' using errcode = '22023'; end if;
  update profiles set tema = nullif(p_tema, 'buluskure') where id = auth.uid() and tema is distinct from nullif(p_tema, 'buluskure');
end $$;
revoke all on function tema_kaydet(text) from public, anon;
grant execute on function tema_kaydet(text) to authenticated;
