-- 0096 Açılış penceresi (duyuru / yenilik): giriş yapınca bir kez açılan pencere. Yönetici Duyurular sayfasından hazırlar.
-- tur: 'onemli' → "Okudum" denmeden tekrar açılır; 'yenilik' → bir kez görülünce kapanır, bitişe kadar Yenilikler'de kalır.
-- Hedef kitle: roller (veli, ogrenci, ogretmen, rehber, yonetim; rehber = Rehberlik branşındaki öğretmenler) + isteğe bağlı sınıf düzeyleri (veli/öğrenci için) + isteğe bağlı modül.
-- Taslak yalnız yöneticide görünür. Metin yalnız düz metindir (arayüz HTML olarak işlemez). Kişisel veri tutulmaz.

create table acilis_pencereleri (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default my_school() references schools(id) on delete cascade,
  tur text not null default 'yenilik' check (tur in ('onemli', 'yenilik')),
  baslik text not null check (char_length(btrim(baslik)) between 3 and 90),
  metin text not null check (char_length(btrim(metin)) between 3 and 1200),
  gorsel text check (gorsel is null or gorsel ~ '^(/duyuru/[a-z0-9-]+\.(png|webp|jpg)|acilis/[0-9a-f-]+\.(png|webp|jpg))$'),
  gorsel_alt text check (gorsel_alt is null or char_length(gorsel_alt) <= 200),
  dugme_metin text check (dugme_metin is null or char_length(btrim(dugme_metin)) between 2 and 30),
  dugme_rota text check (dugme_rota is null or dugme_rota ~ '^/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$'),
  roller text[] not null check (cardinality(roller) > 0 and roller <@ array['veli', 'ogrenci', 'ogretmen', 'rehber', 'yonetim']),
  siniflar smallint[] check (siniflar is null or (cardinality(siniflar) > 0 and siniflar <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])),
  modul text check (modul is null or modul in ('lgs','yoklama','ders_programi','yemek','duyuru','mesaj','odev','takvim','bursluluk','galeri','etut','oda')),
  durum text not null default 'taslak' check (durum in ('taslak', 'yayinda', 'arsiv')),
  yayin_at timestamptz,
  bitis_at timestamptz,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((dugme_metin is null) = (dugme_rota is null))
);
create index acilis_pencereleri_okul on acilis_pencereleri (school_id, durum, yayin_at desc);
alter table acilis_pencereleri enable row level security;
create policy acilis_yonetici on acilis_pencereleri for all to authenticated
  using (school_id = my_school() and is_admin()) with check (school_id = my_school() and is_admin());
revoke all on acilis_pencereleri from anon;
grant select, insert, update, delete on acilis_pencereleri to authenticated;
create trigger audit_acilis_pencereleri after insert or update or delete on acilis_pencereleri for each row execute function audit_row();

-- Yayınlanınca tarih konur; yenilik için bitiş verilmediyse 30 gün
create function acilis_damga() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.durum = 'yayinda' and (tg_op = 'INSERT' or old.durum <> 'yayinda') then
    new.yayin_at := now();
    if new.bitis_at is null and new.tur = 'yenilik' then new.bitis_at := now() + interval '30 days'; end if;
  end if;
  return new;
end $$;
create trigger acilis_damga before insert or update on acilis_pencereleri for each row execute function acilis_damga();

create table acilis_goruldu (
  pencere_id uuid not null references acilis_pencereleri(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  goruldu_at timestamptz not null default now(),
  okudum_at timestamptz,
  primary key (pencere_id, user_id)
);
alter table acilis_goruldu enable row level security;
-- Doğrudan erişim yok; yalnız aşağıdaki fonksiyonlar
revoke all on acilis_goruldu from anon, authenticated;

-- Çağıran bu pencerenin hedef kitlesinde mi? (p_rol: arayüzdeki etkin rol; sunucuda doğrulanır)
create function acilis_hedefte(p acilis_pencereleri, p_rol text) returns boolean
language sql stable security definer set search_path = public as $$
  select p.school_id = my_school()
    and (p_rol = any(p.roller) or (p_rol = 'ogretmen' and 'rehber' = any(p.roller)
         and exists (select 1 from profiles r where r.id = auth.uid() and r.branch = 'Rehberlik')))
    and exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'approved')
    and case p_rol
          when 'yonetim' then has_role(auth.uid(), 'admin')
          when 'ogretmen' then has_role(auth.uid(), 'ogretmen')
          when 'veli' then has_role(auth.uid(), 'veli')
          when 'ogrenci' then has_role(auth.uid(), 'ogrenci')
          else false end
    and (p.modul is null or module_enabled(p.modul))
    and (p.siniflar is null or p_rol in ('ogretmen', 'yonetim') or exists (
          select 1 from students s join classes c on c.id = s.class_id
          where s.archived_at is null and c.grade = any(p.siniflar)
            and ((p_rol = 'ogrenci' and s.id = (select student_id from profiles where id = auth.uid()))
                 or (p_rol = 'veli' and exists (select 1 from parent_links pl where pl.parent_id = auth.uid() and pl.student_id = s.id)))))
$$;
revoke all on function acilis_hedefte(acilis_pencereleri, text) from public, anon, authenticated;

-- Girişte açılacaklar: en çok 3, önce önemli. Önemli: "Okudum" denmemişse; yenilik: hiç görülmemişse.
create function acilis_bekleyenler(p_rol text)
returns table (id uuid, tur text, baslik text, metin text, gorsel text, gorsel_alt text, dugme_metin text, dugme_rota text, yayin_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.tur, p.baslik, p.metin, p.gorsel, p.gorsel_alt, p.dugme_metin, p.dugme_rota, p.yayin_at
  from acilis_pencereleri p
  left join acilis_goruldu g on g.pencere_id = p.id and g.user_id = auth.uid()
  where p.durum = 'yayinda' and p.yayin_at <= now() and (p.bitis_at is null or p.bitis_at > now())
    and acilis_hedefte(p, p_rol)
    and (case when p.tur = 'onemli' then g.okudum_at is null else g.pencere_id is null end)
  order by (p.tur = 'onemli') desc, p.yayin_at desc
  limit 3
$$;
revoke all on function acilis_bekleyenler(text) from public, anon;
grant execute on function acilis_bekleyenler(text) to authenticated;

-- Yenilikler listesi: kişinin hedefinde olan, yayınlanmış son 50 pencere (bitmiş olanlar dahil)
create function acilis_yenilikler(p_rol text)
returns table (id uuid, tur text, baslik text, metin text, gorsel text, gorsel_alt text, dugme_metin text, dugme_rota text, yayin_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.tur, p.baslik, p.metin, p.gorsel, p.gorsel_alt, p.dugme_metin, p.dugme_rota, p.yayin_at
  from acilis_pencereleri p
  where p.durum in ('yayinda', 'arsiv') and p.yayin_at <= now() and acilis_hedefte(p, p_rol)
  order by p.yayin_at desc limit 50
$$;
revoke all on function acilis_yenilikler(text) from public, anon;
grant execute on function acilis_yenilikler(text) to authenticated;

create function acilis_isaretle(p_id uuid, p_okudum boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from acilis_pencereleri p where p.id = p_id and p.durum = 'yayinda' and p.school_id = my_school()) then
    raise exception 'Duyuru bulunamadı.' using errcode = '22023';
  end if;
  insert into acilis_goruldu (pencere_id, user_id, okudum_at) values (p_id, auth.uid(), case when p_okudum then now() end)
  on conflict (pencere_id, user_id) do update set okudum_at = coalesce(acilis_goruldu.okudum_at, excluded.okudum_at);
end $$;
revoke all on function acilis_isaretle(uuid, boolean) from public, anon;
grant execute on function acilis_isaretle(uuid, boolean) to authenticated;

-- Yönetici: kaç kişi gördü / hedef kitle kaç kişi (onaylı hesap; sınıf ve rol koşuluyla)
create function acilis_istatistik(p_id uuid) returns table (hedef int, goren int, okuyan int)
language sql stable security definer set search_path = public as $$
  with p as (select * from acilis_pencereleri where id = p_id and school_id = my_school() and is_admin()),
  kitle as (
    select distinct pr.id from p, profiles pr
    where pr.school_id = p.school_id and pr.status = 'approved'
      and ((('yonetim' = any(p.roller)) and has_role(pr.id, 'admin'))
        or (('ogretmen' = any(p.roller)) and has_role(pr.id, 'ogretmen'))
        or (('rehber' = any(p.roller)) and has_role(pr.id, 'ogretmen') and pr.branch = 'Rehberlik')
        or (('ogrenci' = any(p.roller)) and has_role(pr.id, 'ogrenci')
            and (p.siniflar is null or exists (select 1 from students s join classes c on c.id = s.class_id where s.id = pr.student_id and s.archived_at is null and c.grade = any(p.siniflar))))
        or (('veli' = any(p.roller)) and has_role(pr.id, 'veli')
            and (p.siniflar is null or exists (select 1 from parent_links pl join students s on s.id = pl.student_id join classes c on c.id = s.class_id
                                                where pl.parent_id = pr.id and s.archived_at is null and c.grade = any(p.siniflar)))))
  )
  select (select count(*) from kitle)::int,
         (select count(*) from acilis_goruldu g join kitle k on k.id = g.user_id where g.pencere_id = p_id)::int,
         (select count(*) from acilis_goruldu g join kitle k on k.id = g.user_id where g.pencere_id = p_id and g.okudum_at is not null)::int
  from p
$$;
revoke all on function acilis_istatistik(uuid) from public, anon;
grant execute on function acilis_istatistik(uuid) to authenticated;

-- Görseller: herkese açık olmayan kova; okulun onaylı kullanıcıları okur, yalnız yönetici yükler / siler
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('acilis', 'acilis', false, 2097152, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do nothing;
drop policy if exists acilis_gorsel_oku on storage.objects;
create policy acilis_gorsel_oku on storage.objects for select to authenticated
  using (bucket_id = 'acilis' and exists (select 1 from public.profiles me where me.id = auth.uid() and me.status = 'approved'));
drop policy if exists acilis_gorsel_yaz on storage.objects;
create policy acilis_gorsel_yaz on storage.objects for insert to authenticated with check (bucket_id = 'acilis' and public.is_admin());
drop policy if exists acilis_gorsel_sil on storage.objects;
create policy acilis_gorsel_sil on storage.objects for delete to authenticated using (bucket_id = 'acilis' and public.is_admin());
