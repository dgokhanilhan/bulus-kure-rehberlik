-- Galeri: okulun özel fotoğraf/video albümleri (gezi, etkinlik, kulüp, spor, tören...).
-- Gizlilik önce: dosyalar özel "galeri" bucket'ında; herkese açık kalıcı bağlantı yok, yalnız yetkilinin alabildiği kısa süreli imzalı bağlantı.
-- Kim neyi görür tek yerde (gallery_sees / can_view_gallery_album); Storage izni de aynı fonksiyona bağlı (yol tahminiyle dosya açılamaz).
-- Dosya yolu yalnız kimliklerden oluşur: okul/eğitim-yılı/albüm/medya/original.uzantı (+ view.webp, thumb.webp); ad, TC, telefon yok.
-- Öğretmen albüm açma / yükleme / kapsam / yönetici onayı Yönetim Merkezi'nden; varsayılan yalnız yönetici yönetir.
-- Arşivle (geri alınabilir) varsayılan; kalıcı silmede Storage dosyaları ön yüzden önce silinir, sonra kayıt.
-- Yalnız ekleme: veri silmez, tablo/sütun düşürmez.

-- ---------- Ayarlar ----------
create or replace function setting_spec() returns jsonb language sql immutable as $$
  select '{
    "genel.okul_adi":            {"type":"text","max":120},
    "genel.telefon":             {"type":"text","max":40,  "default":""},
    "genel.eposta":              {"type":"text","max":120, "default":""},
    "genel.adres":               {"type":"text","max":300, "default":""},
    "genel.logo":                {"type":"text","max":300, "default":""},
    "modul.lgs":                 {"type":"bool","default":true},
    "modul.yoklama":             {"type":"bool","default":true},
    "modul.ders_programi":       {"type":"bool","default":true},
    "modul.yemek":               {"type":"bool","default":true},
    "modul.duyuru":              {"type":"bool","default":true},
    "modul.mesaj":               {"type":"bool","default":true},
    "modul.odev":                {"type":"bool","default":true},
    "modul.takvim":              {"type":"bool","default":true},
    "modul.bursluluk":           {"type":"bool","default":false},
    "modul.galeri":              {"type":"bool","default":false},
    "yoklama.ogretmen_girebilir":{"type":"bool","default":false},
    "yoklama.limit_donem1":      {"type":"int","min":0,"max":180,"default":10},
    "yoklama.limit_donem2":      {"type":"int","min":0,"max":180,"default":10},
    "yoklama.limit_yillik":      {"type":"int","min":0,"max":180,"default":20},
    "yoklama.limit_toplam":      {"type":"int","min":0,"max":180,"default":0},
    "yoklama.uyari_sari":        {"type":"int","min":1,"max":99,"default":70},
    "yoklama.uyari_turuncu":     {"type":"int","min":1,"max":99,"default":90},
    "yoklama.gec_sayim":         {"type":"enum","values":["yok","yarim","tam"],"default":"yok"},
    "yoklama.veli_uyari":        {"type":"bool","default":true},
    "odev.son_tarih_zorunlu":    {"type":"bool","default":true},
    "odev.veli_durum_gorur":     {"type":"bool","default":true},
    "odev.geciken_kirmizi":      {"type":"bool","default":true},
    "odev.bildirim_yeni":        {"type":"bool","default":true},
    "odev.bildirim_kontrol":     {"type":"bool","default":true},
    "odev.hatirlatma_gun":       {"type":"int","min":0,"max":14,"default":1},
    "odev.ogretmen_dosya":       {"type":"bool","default":true},
    "odev.ogrenci_dosya":        {"type":"bool","default":false},
    "dosya.max_mb":              {"type":"int","min":1,"max":25,"default":10},
    "dosya.gorsel":              {"type":"bool","default":true},
    "dosya.pdf":                 {"type":"bool","default":true},
    "mesaj.dosya":               {"type":"bool","default":true},
    "duyuru.dosya":              {"type":"bool","default":true},
    "duyuru.ogretmen_yazabilir": {"type":"bool","default":true},
    "duyuru.ogretmen_kapsam":    {"type":"enum","values":["sinif","kademe","okul"],"default":"sinif"},
    "duyuru.gosterim_gun":       {"type":"int","min":1,"max":365,"default":14},
    "takvim.ogretmen_ekler":     {"type":"bool","default":true},
    "takvim.hatirlatma_gun":     {"type":"int","min":0,"max":14,"default":1},
    "bildirim.mesaj":            {"type":"bool","default":true},
    "bildirim.duyuru":           {"type":"bool","default":true},
    "bildirim.sinav":            {"type":"bool","default":true},
    "bildirim.etkinlik":         {"type":"bool","default":true},
    "bildirim.sinav_hatirlatma": {"type":"bool","default":true},
    "bildirim.devamsizlik":      {"type":"bool","default":true},
    "bildirim.rapor":            {"type":"bool","default":true},
    "bildirim.deneme":           {"type":"bool","default":true},
    "bildirim.gorev":            {"type":"bool","default":true},
    "bildirim.gorusme":          {"type":"bool","default":true},
    "bildirim.not":              {"type":"bool","default":true},
    "bildirim.bursluluk":        {"type":"bool","default":true},
    "bildirim.galeri":           {"type":"bool","default":true},
    "galeri.ogretmen_album":     {"type":"bool","default":false},
    "galeri.ogretmen_yukleme":   {"type":"bool","default":false},
    "galeri.ogretmen_kapsam":    {"type":"enum","values":["sinif","kademe","okul"],"default":"sinif"},
    "galeri.onay":               {"type":"bool","default":true},
    "galeri.indirme":            {"type":"bool","default":false},
    "galeri.max_foto_mb":        {"type":"int","min":1,"max":25,"default":15},
    "galeri.max_video_mb":       {"type":"int","min":1,"max":500,"default":50},
    "bursluluk.basvuru_acik":    {"type":"bool","default":true},
    "bursluluk.aciklama":        {"type":"text","max":1000,"default":""},
    "panel.veli":                {"type":"layout","ids":["duyuru","odev","yoklama","program","yemek","takvim","mesaj","lgs","bursluluk"],
                                  "default":[{"id":"duyuru","on":true},{"id":"odev","on":true},{"id":"program","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"takvim","on":true},{"id":"mesaj","on":true},{"id":"lgs","on":true},{"id":"bursluluk","on":false}]},
    "panel.ogrenci":             {"type":"layout","ids":["duyuru","odev","yoklama","program","yemek","takvim","lgs","bursluluk"],
                                  "default":[{"id":"program","on":true},{"id":"odev","on":true},{"id":"duyuru","on":true},{"id":"takvim","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"lgs","on":true},{"id":"bursluluk","on":false}]},
    "panel.ogretmen":            {"type":"layout","ids":["derslerim","odev_kontrol","duyuru","takvim","mesaj","devamsizlik","yemek"],
                                  "default":[{"id":"derslerim","on":true},{"id":"odev_kontrol","on":true},{"id":"duyuru","on":true},{"id":"takvim","on":true},{"id":"mesaj","on":true},{"id":"devamsizlik","on":true},{"id":"yemek","on":false}]}
  }'::jsonb
$$;

-- ---------- Storage: özel bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('galeri', 'galeri', false, null, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- ---------- Kategoriler ----------
create table if not exists gallery_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null check (length(btrim(name)) between 2 and 60),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
alter table gallery_categories enable row level security;
-- Varsayılan kategoriler: mevcut okullara şimdi, yeni okullara açılırken (yönetici sonra ekler/düzenler)
create or replace function gallery_default_categories(p_school uuid) returns void
language sql security definer set search_path = public as $$
  insert into gallery_categories (school_id, name, sort_order)
  select p_school, c.name, c.ord
  from (values ('Geziler', 1), ('Etkinlikler', 2), ('Kulüpler', 3), ('Spor', 4), ('Törenler', 5), ('Sınıf Çalışmaları', 6),
               ('Yarışmalar', 7), ('Sosyal Etkinlikler', 8), ('Diğer', 9)) as c(name, ord)
  on conflict (school_id, name) do nothing
$$;
revoke all on function gallery_default_categories(uuid) from public, anon, authenticated;
select gallery_default_categories(id) from schools;
create or replace function gallery_school_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform gallery_default_categories(new.id); return null; end $$;
drop trigger if exists gallery_school_defaults on schools;
create trigger gallery_school_defaults after insert on schools for each row execute function gallery_school_defaults();

-- ---------- Albümler ve medya ----------
create table if not exists gallery_albums (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  academic_year_id uuid references academic_years(id) on delete set null,
  category_id uuid references gallery_categories(id) on delete set null,
  title text not null check (length(btrim(title)) between 3 and 120),
  description text check (description is null or length(description) <= 2000),
  event_date date,
  status text not null default 'taslak' check (status in ('taslak', 'onay_bekliyor', 'yayinda', 'arsiv')),
  audience text not null default 'okul' check (audience in ('okul', 'kademe', 'sinif', 'ogrenci', 'ogretmen')),
  level text check (level is null or level in ('ilkokul', 'ortaokul', 'lise')),
  class_ids uuid[] not null default '{}',
  student_ids uuid[] not null default '{}',
  allow_download boolean not null default false,
  cover_media_id uuid,
  created_by uuid references profiles(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audience <> 'kademe' or level is not null),
  check (audience <> 'sinif' or cardinality(class_ids) between 1 and 60),
  check (audience <> 'ogrenci' or cardinality(student_ids) between 1 and 500)
);
create index if not exists gallery_albums_school on gallery_albums (school_id, status, event_date desc);
alter table gallery_albums enable row level security;

create table if not exists gallery_media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references gallery_albums(id) on delete cascade,
  school_id uuid not null references schools(id),
  kind text not null check (kind in ('foto', 'video')),
  mime text not null,
  size_bytes bigint,
  path text not null unique,
  view_path text unique,
  thumb_path text unique,
  width int,
  height int,
  duration_sec numeric,
  title text check (title is null or length(title) <= 120),
  description text check (description is null or length(description) <= 1000),
  sort_order int not null default 0,
  approved boolean not null default true,
  uploaded boolean not null default false,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists gallery_media_album on gallery_media (album_id, sort_order, created_at);
create index if not exists gallery_media_recent on gallery_media (school_id, created_at desc);
alter table gallery_media enable row level security;
do $$ begin
  alter table gallery_albums add constraint gallery_albums_cover_fk foreign key (cover_media_id) references gallery_media(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- Yetki yardımcıları ----------
-- Albümü yönetebilir mi: yönetici; ya da (ayar açıksa) albümü açan öğretmen.
create or replace function gallery_can_manage(p_album uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gallery_albums a where a.id = p_album and a.school_id = my_school() and (
    is_admin() or (a.created_by = auth.uid() and has_role(auth.uid(), 'ogretmen') and (setting('galeri.ogretmen_album'))::text::boolean)))
$$;

-- Hedef kitle: kişi (rollerinin toplamıyla) bu albümün kitlesinde mi. Durumdan bağımsız.
create or replace function gallery_sees(uid uuid, a gallery_albums) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = uid and p.status = 'approved' and p.school_id = a.school_id and (
      p.role = 'admin' or (has_role(uid, 'ogretmen') and p.branch = 'Rehberlik')
      or a.audience = 'okul'
      or (a.audience = 'ogretmen' and has_role(uid, 'ogretmen'))
      or (a.audience = 'kademe' and exists (select 1 from classes c where c.id in (select profile_classes(uid)) and c.level = a.level))
      or (a.audience = 'sinif' and a.class_ids && array(select profile_classes(uid)))
      or (a.audience = 'ogrenci' and (
            p.student_id = any(a.student_ids)
         or exists (select 1 from parent_links pl where pl.parent_id = uid and pl.student_id = any(a.student_ids))
         or (has_role(uid, 'ogretmen') and exists (select 1 from unnest(a.student_ids) x where teaches_student(uid, x)))))))
$$;

-- Satırın kendi sütunlarıyla (ekle-ve-döndür sırasında satır henüz sorgudan görünmez; politika satırı doğrudan alır)
create or replace function gallery_row_visible(a gallery_albums) returns boolean
language sql stable security definer set search_path = public as $$
  select a.school_id = my_school() and (
    is_admin()
    or (a.created_by = auth.uid() and has_role(auth.uid(), 'ogretmen') and (setting('galeri.ogretmen_album'))::text::boolean)
    or (a.status = 'yayinda' and module_enabled('galeri') and gallery_sees(auth.uid(), a)))
$$;
create or replace function can_view_gallery_album(p_album uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gallery_albums a where a.id = p_album and gallery_row_visible(a))
$$;

create or replace function can_view_gallery_media(p_media uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gallery_media m where m.id = p_media and m.uploaded and can_view_gallery_album(m.album_id)
                 and (m.approved or gallery_can_manage(m.album_id) or m.uploaded_by = auth.uid()))
$$;
revoke all on function gallery_can_manage(uuid) from public, anon;
revoke all on function gallery_sees(uuid, gallery_albums) from public, anon;
revoke all on function can_view_gallery_album(uuid) from public, anon;
revoke all on function gallery_row_visible(gallery_albums) from public, anon;
grant execute on function gallery_row_visible(gallery_albums) to authenticated;
revoke all on function can_view_gallery_media(uuid) from public, anon;
grant execute on function gallery_can_manage(uuid), can_view_gallery_album(uuid), can_view_gallery_media(uuid) to authenticated;

-- ---------- Albüm kuralları (tetikleyici) ----------
-- Okul, eğitim yılı, açan kişi otomatik. Öğretmen: yalnız ayar açıksa, ayardaki kapsamda (kendi sınıfları / kademesi / okul).
-- Yayınlama, onay ve arşiv yalnız aşağıdaki fonksiyonlarla (gallery_publish / gallery_approve / gallery_archive).
create or replace function gallery_album_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare kap text; via_rpc boolean := coalesce(current_setting('bk.galeri', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    new.school_id := my_school();
    new.created_by := auth.uid();
    if new.academic_year_id is null then select id into new.academic_year_id from academic_years where school_id = new.school_id and is_active; end if;
    if not is_admin() and not (has_role(auth.uid(), 'ogretmen') and (setting('galeri.ogretmen_album'))::text::boolean) then
      raise exception 'Albüm oluşturma yetkin yok.' using errcode = '42501';
    end if;
    new.status := 'taslak'; new.published_at := null; new.archived_at := null;
  else
    new.school_id := old.school_id; new.created_by := old.created_by;
    if (new.status, new.published_at, new.archived_at) is distinct from (old.status, old.published_at, old.archived_at) and not via_rpc then
      raise exception 'Durum yalnız Yayınla / Arşivle ile değişir.' using errcode = '42501';
    end if;
  end if;
  new.title := btrim(new.title);
  if new.audience <> 'kademe' then new.level := null; end if;
  if new.audience <> 'sinif' then new.class_ids := '{}'; end if;
  if new.audience <> 'ogrenci' then new.student_ids := '{}'; end if;
  if new.cover_media_id is not null and not exists (select 1 from gallery_media where id = new.cover_media_id and album_id = new.id and kind = 'foto') then
    raise exception 'Kapak bu albümün bir fotoğrafı olmalı.' using errcode = '22023';
  end if;
  if new.category_id is not null and not exists (select 1 from gallery_categories where id = new.category_id and school_id = new.school_id) then
    raise exception 'Kategori bulunamadı.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(new.class_ids) x where not exists (select 1 from classes c where c.id = x and c.school_id = new.school_id))
     or exists (select 1 from unnest(new.student_ids) x where not exists (select 1 from students s where s.id = x and s.school_id = new.school_id)) then
    raise exception 'Sınıf ya da öğrenci bulunamadı.' using errcode = '22023';
  end if;
  if not is_admin() then
    kap := (setting('galeri.ogretmen_kapsam'))#>>'{}';
    if (new.audience = 'okul' and kap <> 'okul')
       or (new.audience = 'kademe' and (kap = 'sinif' or not exists (select 1 from classes c where c.id in (select teacher_classes(auth.uid())) and c.level = new.level)))
       or (new.audience = 'sinif' and not (new.class_ids <@ array(select teacher_classes(auth.uid()))))
       or (new.audience = 'ogrenci' and exists (select 1 from unnest(new.student_ids) x where not teaches_student(auth.uid(), x))) then
      raise exception 'Bu kitle için albüm yetkin yok (yalnız ders verdiğin sınıflar ve izin verilen kapsam).' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists gallery_album_before on gallery_albums;
create trigger gallery_album_before before insert or update on gallery_albums for each row execute function gallery_album_before();

-- Medya: onay yalnız yönetici verir (onay açıksa); albüm/dosya alanları değişmez
create or replace function gallery_media_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.album_id, new.school_id, new.path, new.view_path, new.thumb_path, new.kind, new.mime, new.uploaded_by)
     is distinct from (old.album_id, old.school_id, old.path, old.view_path, old.thumb_path, old.kind, old.mime, old.uploaded_by)
     or (new.uploaded and not old.uploaded and coalesce(current_setting('bk.galeri', true), '') <> '1') then
    raise exception 'Bu alan değiştirilemez.' using errcode = '42501';
  end if;
  if new.approved and not old.approved and not is_admin() then raise exception 'Onayı yalnız yönetici verir.' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists gallery_media_before on gallery_media;
create trigger gallery_media_before before update on gallery_media for each row execute function gallery_media_before();

-- ---------- İşlem kaydı ----------
create or replace function gallery_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare act text; r jsonb;
begin
  if tg_table_name = 'gallery_albums' then
    act := case tg_op when 'INSERT' then 'album_create' when 'DELETE' then 'album_delete' else 'album_update' end;
    if tg_op = 'UPDATE' and new.status is distinct from old.status then return null; end if; -- yayın/arşiv fonksiyonlarda kaydedilir
    r := case when tg_op = 'DELETE' then jsonb_build_object('title', old.title, 'media', (select count(*) from gallery_media where album_id = old.id and uploaded))
              else jsonb_build_object('title', new.title, 'audience', new.audience) end;
    insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), act, 'gallery_albums', coalesce(new.id, old.id), r);
    if tg_when = 'BEFORE' then return old; end if; -- silme: medya sayısı silinmeden önce
  elsif tg_op = 'DELETE' and old.uploaded then
    insert into audit_log (user_id, action, entity, entity_id, meta)
    values (auth.uid(), 'media_delete', 'gallery_media', old.id, jsonb_build_object('album', old.album_id, 'kind', old.kind));
  end if;
  return null;
end $$;
drop trigger if exists gallery_albums_audit on gallery_albums;
create trigger gallery_albums_audit after insert or update on gallery_albums for each row execute function gallery_audit();
drop trigger if exists gallery_albums_audit_del on gallery_albums;
create trigger gallery_albums_audit_del before delete on gallery_albums for each row execute function gallery_audit();
drop trigger if exists gallery_media_audit on gallery_media;
create trigger gallery_media_audit after delete on gallery_media for each row execute function gallery_audit();

-- ---------- RLS ----------
drop policy if exists gal_cat_read on gallery_categories;
create policy gal_cat_read on gallery_categories for select using (school_id = my_school());
drop policy if exists gal_cat_admin on gallery_categories;
create policy gal_cat_admin on gallery_categories for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());

drop policy if exists gal_album_read on gallery_albums;
create policy gal_album_read on gallery_albums for select using (gallery_row_visible(gallery_albums));
drop policy if exists gal_album_insert on gallery_albums;
create policy gal_album_insert on gallery_albums for insert with check (
  is_admin() or (has_role(auth.uid(), 'ogretmen') and (setting('galeri.ogretmen_album'))::text::boolean));
drop policy if exists gal_album_update on gallery_albums;
create policy gal_album_update on gallery_albums for update using (gallery_can_manage(id)) with check (gallery_can_manage(id));
drop policy if exists gal_album_delete on gallery_albums;
create policy gal_album_delete on gallery_albums for delete using (gallery_can_manage(id));

drop policy if exists gal_media_read on gallery_media;
create policy gal_media_read on gallery_media for select using (can_view_gallery_media(id) or (uploaded_by = auth.uid() and gallery_can_manage(album_id)));
drop policy if exists gal_media_update on gallery_media;
create policy gal_media_update on gallery_media for update using (gallery_can_manage(album_id)) with check (gallery_can_manage(album_id));
drop policy if exists gal_media_delete on gallery_media;
create policy gal_media_delete on gallery_media for delete using (gallery_can_manage(album_id));
-- Medya kaydı yalnız gallery_prepare_upload ile eklenir (insert politikası yok).

drop policy if exists mod_galeri_a on gallery_albums;
create policy mod_galeri_a on gallery_albums as restrictive for all using (is_admin() or module_enabled('galeri'));
drop policy if exists mod_galeri_m on gallery_media;
create policy mod_galeri_m on gallery_media as restrictive for all using (is_admin() or module_enabled('galeri'));
drop policy if exists mod_galeri_c on gallery_categories;
create policy mod_galeri_c on gallery_categories as restrictive for all using (is_admin() or module_enabled('galeri'));

-- Storage: yükleme yalnız hazırlanmış (henüz onaylanmamış) kayda, yükleyen tarafından; görme medyayı görebilen; silme yöneten.
drop policy if exists galeri_insert on storage.objects;
create policy galeri_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'galeri' and exists (select 1 from public.gallery_media m where name in (m.path, m.view_path, m.thumb_path)
                                   and m.uploaded_by = auth.uid() and not m.uploaded));
drop policy if exists galeri_read on storage.objects;
create policy galeri_read on storage.objects for select to authenticated using (
  bucket_id = 'galeri' and exists (select 1 from public.gallery_media m where name in (m.path, m.view_path, m.thumb_path)
                                   and (public.can_view_gallery_media(m.id) or (m.uploaded_by = auth.uid() and not m.uploaded))));
drop policy if exists galeri_delete on storage.objects;
create policy galeri_delete on storage.objects for delete to authenticated using (
  bucket_id = 'galeri' and exists (select 1 from public.gallery_media m where name in (m.path, m.view_path, m.thumb_path)
                                   and (public.gallery_can_manage(m.album_id) or (m.uploaded_by = auth.uid() and not m.uploaded))));

-- ---------- Yükleme: hazırla → yükle → onayla ----------
create or replace function gallery_prepare_upload(p_album uuid, p_name text, p_mime text, p_size bigint, p_view boolean default false, p_thumb boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a gallery_albums; v_id uuid := gen_random_uuid(); ext text := lower(substring(coalesce(p_name, '') from '\.([A-Za-z0-9]+)$'));
        kind text; max_b bigint; base text; n int; ok boolean;
begin
  select * into a from gallery_albums where id = p_album and school_id = my_school();
  if a.id is null or not gallery_can_manage(a.id) then raise exception 'Bu albüme yükleme yetkin yok.' using errcode = '42501'; end if;
  if not is_admin() and not (setting('galeri.ogretmen_yukleme'))::text::boolean then raise exception 'Öğretmen yüklemesi kapalı.' using errcode = '42501'; end if;
  if a.status = 'arsiv' then raise exception 'Arşivdeki albüme yüklenemez.' using errcode = '22023'; end if;
  -- Uzantı ve tür birbirini tutmalı (sahte uzantı kabul edilmez)
  ok := (ext in ('jpg', 'jpeg') and p_mime = 'image/jpeg') or (ext = 'png' and p_mime = 'image/png') or (ext = 'webp' and p_mime = 'image/webp')
     or (ext = 'mp4' and p_mime = 'video/mp4') or (ext = 'mov' and p_mime = 'video/quicktime') or (ext = 'webm' and p_mime = 'video/webm');
  if not ok then raise exception 'Yalnız JPG, PNG, WEBP fotoğraf ve MP4, MOV, WEBM video yüklenebilir.' using errcode = '22023'; end if;
  kind := case when p_mime like 'image/%' then 'foto' else 'video' end;
  max_b := (setting(case kind when 'foto' then 'galeri.max_foto_mb' else 'galeri.max_video_mb' end))::text::bigint * 1048576;
  if p_size is null or p_size <= 0 or p_size > max_b then
    raise exception '% en çok % MB olabilir.', case kind when 'foto' then 'Fotoğraf' else 'Video' end, max_b / 1048576 using errcode = '22023';
  end if;
  select count(*) into n from gallery_media where uploaded_by = auth.uid() and created_at > now() - interval '1 hour';
  if n >= 500 then raise exception 'Bir saatte çok fazla dosya yüklendi; biraz sonra tekrar dene.' using errcode = '54000'; end if;
  base := a.school_id || '/' || coalesce(a.academic_year_id::text, 'yil') || '/' || a.id || '/' || v_id || '/';
  insert into gallery_media (id, album_id, school_id, kind, mime, size_bytes, path, view_path, thumb_path, sort_order, approved, uploaded_by)
  values (v_id, a.id, a.school_id, kind, p_mime, p_size, base || 'original.' || case ext when 'jpeg' then 'jpg' else ext end,
          case when p_view and kind = 'foto' then base || 'view.webp' end, case when p_thumb then base || 'thumb.webp' end,
          coalesce((select max(sort_order) + 1 from gallery_media where album_id = a.id), 0),
          is_admin() or not (setting('galeri.onay'))::text::boolean, auth.uid());
  return jsonb_build_object('id', v_id, 'path', base || 'original.' || case ext when 'jpeg' then 'jpg' else ext end,
    'view_path', case when p_view and kind = 'foto' then base || 'view.webp' end, 'thumb_path', case when p_thumb then base || 'thumb.webp' end, 'kind', kind);
end $$;

-- Gerçek boyut/tür Storage kaydından denetlenir; önizleme dosyaları webp ve küçük olmalı. Yüklenmeyen önizleme yolu boşaltılır.
create or replace function gallery_confirm_upload(p_id uuid, p_width int default null, p_height int default null, p_duration numeric default null)
returns void language plpgsql security definer set search_path = public, storage as $$
declare m gallery_media; sz bigint; mt text; vsz bigint; vmt text; tsz bigint; tmt text; max_b bigint;
begin
  select * into m from gallery_media where id = p_id and uploaded_by = auth.uid() and not uploaded for update;
  if m.id is null then raise exception 'Dosya kaydı bulunamadı.' using errcode = 'P0002'; end if;
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into sz, mt from storage.objects o where o.bucket_id = 'galeri' and o.name = m.path;
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into vsz, vmt from storage.objects o where o.bucket_id = 'galeri' and o.name = m.view_path;
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into tsz, tmt from storage.objects o where o.bucket_id = 'galeri' and o.name = m.thumb_path;
  max_b := (setting(case m.kind when 'foto' then 'galeri.max_foto_mb' else 'galeri.max_video_mb' end))::text::bigint * 1048576;
  if sz is null then raise exception 'Dosya yüklenmemiş.' using errcode = 'P0002'; end if;
  if sz > max_b or mt is distinct from m.mime or (vsz is not null and (vsz > 5242880 or vmt <> 'image/webp'))
     or (tsz is not null and (tsz > 1048576 or tmt <> 'image/webp')) then
    raise exception 'Dosya boyutu ya da türü bildirilenle uyuşmuyor.' using errcode = '22023';
  end if;
  perform set_config('bk.galeri', '1', true);
  update gallery_media set uploaded = true, size_bytes = sz,
         view_path = case when vsz is null then null else view_path end, thumb_path = case when tsz is null then null else thumb_path end,
         width = p_width, height = p_height, duration_sec = p_duration
   where id = m.id;
  perform set_config('bk.galeri', '', true);
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'media_upload', 'gallery_media', m.id, jsonb_build_object('album', m.album_id, 'kind', m.kind, 'size', sz, 'approved', m.approved));
end $$;
revoke all on function gallery_prepare_upload(uuid, text, text, bigint, boolean, boolean) from public, anon;
revoke all on function gallery_confirm_upload(uuid, int, int, numeric) from public, anon;
grant execute on function gallery_prepare_upload(uuid, text, text, bigint, boolean, boolean), gallery_confirm_upload(uuid, int, int, numeric) to authenticated;

-- ---------- Yayınlama, onay, arşiv, sıralama ----------
create or replace function gallery_notify(a gallery_albums) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (user_id, text, link, type)
  select p.id, 'Galeri: ' || a.title || ' albümü eklendi', jsonb_build_object('page', 'galeri', 'album', a.id), 'galeri'
  from profiles p where p.school_id = a.school_id and p.status = 'approved' and p.id <> auth.uid() and gallery_sees(p.id, a);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function gallery_notify(gallery_albums) from public, anon, authenticated;

-- Yayınla: yönetici doğrudan; öğretmen, onay açıksa "onay bekliyor"a gönderir (yöneticilere bildirim).
create or replace function gallery_publish(p_album uuid, p_notify boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare a gallery_albums; st text;
begin
  select * into a from gallery_albums where id = p_album and school_id = my_school() for update;
  if a.id is null or not gallery_can_manage(a.id) then raise exception 'Bu albümü yönetme yetkin yok.' using errcode = '42501'; end if;
  if a.status = 'arsiv' then raise exception 'Arşivdeki albüm önce geri alınmalı.' using errcode = '22023'; end if;
  st := case when is_admin() or not (setting('galeri.onay'))::text::boolean then 'yayinda' else 'onay_bekliyor' end;
  perform set_config('bk.galeri', '1', true);
  update gallery_albums set status = st, published_at = case when st = 'yayinda' then coalesce(published_at, now()) end where id = a.id returning * into a;
  if st = 'yayinda' then update gallery_media set approved = true where album_id = a.id and not approved and is_admin(); end if;
  perform set_config('bk.galeri', '', true);
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), case st when 'yayinda' then 'album_publish' else 'album_submit' end, 'gallery_albums', a.id, jsonb_build_object('title', a.title, 'notify', p_notify));
  if st = 'yayinda' and p_notify then perform gallery_notify(a);
  elsif st = 'onay_bekliyor' then
    insert into notifications (user_id, text, link, type)
    select x, 'Galeri: ' || a.title || ' albümü onay bekliyor', jsonb_build_object('page', 'galeri', 'album', a.id), 'galeri' from admin_accounts(a.school_id) x;
  end if;
  return st;
end $$;

-- Arşivle / geri al: arşivleyen yönetebilen; geri alma yalnız yönetici (yayınlanmışsa yayına, değilse taslağa döner).
create or replace function gallery_archive(p_album uuid, p_archive boolean) returns text
language plpgsql security definer set search_path = public as $$
declare a gallery_albums;
begin
  select * into a from gallery_albums where id = p_album and school_id = my_school() for update;
  if a.id is null or not gallery_can_manage(a.id) or (not p_archive and not is_admin()) then
    raise exception 'Bu işlem için yetkin yok.' using errcode = '42501';
  end if;
  perform set_config('bk.galeri', '1', true);
  update gallery_albums set status = case when p_archive then 'arsiv' when published_at is not null then 'yayinda' else 'taslak' end,
         archived_at = case when p_archive then now() end
   where id = a.id returning * into a;
  perform set_config('bk.galeri', '', true);
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), case when p_archive then 'album_archive' else 'album_restore' end, 'gallery_albums', a.id, jsonb_build_object('title', a.title));
  return a.status;
end $$;

-- Sıralama: verilen sırayla (yalnız bu albümün medyası)
create or replace function gallery_reorder(p_album uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not gallery_can_manage(p_album) then raise exception 'Bu albümü yönetme yetkin yok.' using errcode = '42501'; end if;
  update gallery_media m set sort_order = x.ord - 1
    from unnest(p_ids) with ordinality as x(id, ord) where m.id = x.id and m.album_id = p_album;
end $$;
revoke all on function gallery_publish(uuid, boolean), gallery_archive(uuid, boolean), gallery_reorder(uuid, uuid[]) from public, anon;
grant execute on function gallery_publish(uuid, boolean), gallery_archive(uuid, boolean), gallery_reorder(uuid, uuid[]) to authenticated;
