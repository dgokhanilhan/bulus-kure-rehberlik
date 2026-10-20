-- Hata kayıtları: kullanıcıların karşılaştığı uygulama hataları (sayfa çökmesi, veri yüklenememesi, zaman aşımı) sunucuda
-- toplanır; yönetici Yönetim → Hata kayıtları'nda görür. Dış servis (Sentry) gerektirmez.
-- Kişisel veri tutulmaz: yalnız teknik mesaj (kısaltılmış), sayfa yolu (sorgu dizesi ve kimlikler maskeli), rol, tarayıcı
-- özeti ve sürüm. Kayıt yalnız hata_kaydet ile (oturum gerekli, kişi başı saatte en çok 30); 90 günden eski kayıt silinir.
-- Geri alma: supabase/geri-alma/0058_hata_kayitlari_geri_al.sql

create table hata_kayitlari (
  id bigint generated always as identity primary key,
  school_id uuid references schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rol text check (char_length(rol) <= 20),
  tur text not null check (tur in ('cokme', 'veri', 'js', 'promise')),
  sayfa text check (char_length(sayfa) <= 200),
  mesaj text not null check (char_length(mesaj) <= 500),
  ayrinti text check (char_length(ayrinti) <= 2000),
  tarayici text check (char_length(tarayici) <= 200),
  surum text check (char_length(surum) <= 40),
  created_at timestamptz not null default now()
);
create index hata_kayitlari_zaman on hata_kayitlari (school_id, created_at desc);

alter table hata_kayitlari enable row level security;
create policy hata_kayitlari_yonetici on hata_kayitlari for select to authenticated using (is_admin() and school_id = my_school());
revoke all on hata_kayitlari from anon;
grant select on hata_kayitlari to authenticated;

create function hata_kaydet(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if (select count(*) from hata_kayitlari where user_id = uid and created_at > now() - interval '1 hour') >= 30 then return; end if;
  insert into hata_kayitlari (school_id, user_id, rol, tur, sayfa, mesaj, ayrinti, tarayici, surum)
  values (
    (select school_id from profiles where id = uid),
    uid,
    left(p->>'rol', 20),
    case when p->>'tur' in ('cokme', 'veri', 'js', 'promise') then p->>'tur' else 'js' end,
    -- kimlik (uuid) ve sorgu dizesi maskelenir
    left(regexp_replace(split_part(coalesce(p->>'sayfa', ''), '?', 1), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi'), 200),
    left(coalesce(nullif(btrim(p->>'mesaj'), ''), '(mesaj yok)'), 500),
    left(p->>'ayrinti', 2000),
    left(p->>'tarayici', 200),
    left(p->>'surum', 40)
  );
  delete from hata_kayitlari where created_at < now() - interval '90 days';
end $$;
revoke all on function hata_kaydet(jsonb) from public, anon;
grant execute on function hata_kaydet(jsonb) to authenticated;
