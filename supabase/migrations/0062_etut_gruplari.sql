-- Etüt öğrenci grupları (seviye grupları): "8'ler 1. Grup" gibi farklı sınıflardan öğrencilerden oluşan adlı gruplar.
-- Rehber öğretmen / yönetici Etüt sayfasında oluşturur; içe aktarmada hücredeki grup adı tanınır ("Sekizler birinci grup",
-- "8. sınıf 1. grup"), hücre düzenlemede "Gruptan ekle" ile öğrenciler eklenir. Yalnız rehber / yönetici okur ve yazar.
-- Öğrenci listesi sunucuda süzülür: yalnız okulun arşivlenmemiş öğrencileri, tekrar yok.
-- Geri alma: supabase/geri-alma/0062_etut_gruplari_geri_al.sql

create table etut_gruplari (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  kademe text not null check (kademe in ('ortaokul', 'lise')),
  ad text not null check (length(btrim(ad)) between 2 and 60),
  ogrenciler uuid[] not null default '{}' check (cardinality(ogrenciler) <= 80),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index etut_gruplari_ad on etut_gruplari (school_id, kademe, lower(btrim(ad)));

create function etut_grup_denetle() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.ad := btrim(regexp_replace(new.ad, '\s+', ' ', 'g'));
  new.ogrenciler := coalesce((
    select array_agg(s.id order by s.full_name)
    from students s
    where s.id = any(new.ogrenciler) and s.school_id = new.school_id and s.archived_at is null
  ), '{}');
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now(); end if;
  return new;
end $$;
revoke all on function etut_grup_denetle() from public, anon, authenticated;
create trigger etut_grup_denetle before insert or update on etut_gruplari for each row execute function etut_grup_denetle();

alter table etut_gruplari enable row level security;
create policy etut_gruplari_rehber on etut_gruplari for all to authenticated
  using (school_id = my_school() and is_staff())
  with check (school_id = my_school() and is_staff());
create policy mod_etut_gruplari on etut_gruplari as restrictive for all using (is_admin() or module_enabled('etut'));
revoke all on etut_gruplari from anon;
grant select, insert, update, delete on etut_gruplari to authenticated;
