-- Faz C · Dosyalar: mesaj, duyuru ve ödev ekleri (+ öğrenci ödev teslimi), okul logosu; duyuru ve dosya ayarları.
-- Dosyalar özel (private) Storage bucket'larında durur. Her dosyanın bir kaydı (attachments) vardır; dosyayı yalnız
-- o kaydın bağlı olduğu mesajı/duyuruyu/ödevi görebilenler indirebilir (storage.objects RLS).
-- Yükleme iki adımlı: prepare_upload() izin/tür/boyut ayarlarını denetleyip yol verir → istemci o yola yükler →
-- confirm_upload() dosyanın gerçekten geldiğini ve gerçek boyutunu doğrular. Onaylanmamış dosya kimseye listelenmez.

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
    "yoklama.ogretmen_girebilir":{"type":"bool","default":false},
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
    "duyuru.gosterim_gun":       {"type":"int","min":1,"max":365,"default":14}
  }'::jsonb
$$;

-- set_settings: "enum" türü eklenir (0011 gövdesi korunur).
do $$
declare src text;
begin
  select pg_get_functiondef('set_settings(jsonb)'::regprocedure) into src;
  src := replace(src, '      else raise exception ''Ayar türü tanımsız: %'', k;',
'      when ''enum'' then
        if jsonb_typeof(v) <> ''string'' or not (s->''values'' ? (v#>>''{}'')) then
          raise exception ''% için geçersiz seçim.'', k using errcode = ''22023'';
        end if;
      else raise exception ''Ayar türü tanımsız: %'', k;');
  if position('when ''enum''' in src) = 0 then raise exception 'set_settings güncellenemedi'; end if;
  execute src;
end $$;

-- Öğretmenin duyuru yetkisi ayara bağlanır: yazabilir mi, hangi kapsamda (yalnız kendi sınıfı / kendi kademeleri / tüm okul).
drop policy ann_insert on announcements;
create policy ann_insert on announcements for insert with check (
  school_id = my_school() and created_by = auth.uid()
  and (is_staff() or (is_teacher() and (setting('duyuru.ogretmen_yazabilir'))::text::boolean and (
        (scope = 'sinif' and class_id in (select my_classes()))
     or (scope = 'kademe' and (setting('duyuru.ogretmen_kapsam'))#>>'{}' in ('kademe', 'okul')
         and exists (select 1 from classes c where c.id in (select my_classes()) and c.level = announcements.level))
     or (scope = 'okul' and (setting('duyuru.ogretmen_kapsam'))#>>'{}' = 'okul')))));

-- Dosyalı mesajda metin boş olabilir.
alter table messages drop constraint messages_body_check;
alter table messages add constraint messages_body_check check (length(body) <= 2000);

create or replace function send_message(p_conversation uuid, p_body text, p_with_files boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare c conversations; v_id uuid; other uuid; s students; me profiles; body text := btrim(coalesce(p_body, ''));
begin
  select * into me from profiles where id = auth.uid() and status = 'approved';
  select * into c from conversations where id = p_conversation for update;
  if me.id is null or c.id is null or me.id not in (c.parent_id, c.teacher_id) then
    raise exception 'Yazışma bulunamadı.' using errcode = 'P0002';
  end if;
  other := case when me.id = c.parent_id then c.teacher_id else c.parent_id end;
  if not exists (select 1 from profiles where id = other and status = 'approved') then
    raise exception 'Karşı tarafın hesabı kapalı; mesaj gönderilemez.' using errcode = '22023';
  end if;
  if length(body) = 0 and not p_with_files then raise exception 'Mesaj boş olamaz.' using errcode = '22023'; end if;
  if p_with_files and not (setting('mesaj.dosya'))::text::boolean then raise exception 'Mesajlarda dosya gönderimi kapalı.' using errcode = '42501'; end if;
  insert into messages (conversation_id, sender_id, body) values (c.id, me.id, body) returning id into v_id;
  update conversations set last_at = now() where id = c.id;
  select * into s from students where id = c.student_id;
  perform notify_many(array[other], me.full_name || ' mesaj gönderdi (' || s.full_name || ')',
    jsonb_build_object('page', 'iletisim', 'conversation', c.id));
  return v_id;
end $$;
drop function if exists send_message(uuid, text);
revoke all on function send_message(uuid, text, boolean) from public, anon;
grant execute on function send_message(uuid, text, boolean) to authenticated;

-- ---------- Bucket'lar ----------
-- Özel: ekler (25 MB üst sınır; okul ayarı bundan küçük olabilir). Herkese açık: yalnız okul logosu (giriş ekranında görünür).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('ekler', 'ekler', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('okul', 'okul', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------- Ek kayıtları ----------
create table attachments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  path text not null unique,                          -- ekler bucket'ındaki yol: okul/tür/üst/uuid-ad
  kind text not null check (kind in ('message', 'announcement', 'homework', 'submission')),
  message_id uuid references messages(id) on delete cascade,
  announcement_id uuid references announcements(id) on delete cascade,
  homework_id uuid references homework(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,       -- yalnız öğrenci teslimi (submission)
  is_cover boolean not null default false,                          -- duyuru kapak görseli
  file_name text not null check (length(file_name) between 1 and 200),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size int not null check (size > 0),
  uploaded boolean not null default false,
  uploaded_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((kind = 'message' and message_id is not null and announcement_id is null and homework_id is null)
      or (kind = 'announcement' and announcement_id is not null and message_id is null and homework_id is null)
      or (kind = 'homework' and homework_id is not null and student_id is null and message_id is null and announcement_id is null)
      or (kind = 'submission' and homework_id is not null and student_id is not null and message_id is null and announcement_id is null)),
  check (not is_cover or (kind = 'announcement' and mime like 'image/%'))
);
create index attachments_message on attachments (message_id);
create index attachments_announcement on attachments (announcement_id);
create index attachments_homework on attachments (homework_id);
alter table attachments enable row level security;

-- Eki görebilir mi? (bağlı olduğu kaydı görebilen)
create or replace function can_see_attachment(a attachments) returns boolean
language sql stable security definer set search_path = public as $$
  select a.school_id = my_school() and case a.kind
    when 'message' then exists (select 1 from messages m join conversations c on c.id = m.conversation_id
                                where m.id = a.message_id and (c.parent_id = auth.uid() or c.teacher_id = auth.uid() or is_admin())
                                  and (is_admin() or module_enabled('mesaj')))
    when 'announcement' then exists (select 1 from announcements n where n.id = a.announcement_id
                                     and (is_staff() or n.created_by = auth.uid() or announcement_reaches(auth.uid(), n))
                                     and (is_admin() or module_enabled('duyuru')))
    when 'homework' then can_see_homework(a.homework_id) and (is_admin() or module_enabled('odev'))
    when 'submission' then (is_student_self(a.student_id) or is_parent_of(a.student_id) or can_check_homework(a.homework_id))
                           and (is_admin() or module_enabled('odev'))
    else false end
$$;
grant execute on function can_see_attachment(attachments) to authenticated;

create policy att_read on attachments for select using (uploaded and can_see_attachment(attachments) or uploaded_by = auth.uid());
-- Ekleme yalnız prepare_upload() ile. Silme: yükleyen ya da yönetici (dosyası da silinir, aşağıdaki storage politikası).
create policy att_delete on attachments for delete using (school_id = my_school() and (uploaded_by = auth.uid() or is_admin()));

-- ---------- Yükleme ----------
create or replace function prepare_upload(p_kind text, p_parent uuid, p_file_name text, p_mime text, p_size int,
                                          p_cover boolean default false, p_student uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  school uuid := my_school(); max_b int := (setting('dosya.max_mb'))::text::int * 1048576;
  ok boolean := false; v_id uuid := gen_random_uuid(); v_path text; safe text; n int;
begin
  if school is null then raise exception 'Oturum bulunamadı.' using errcode = '42501'; end if;
  if p_mime like 'image/%' and not (setting('dosya.gorsel'))::text::boolean then raise exception 'Görsel yükleme kapalı.' using errcode = '42501'; end if;
  if p_mime = 'application/pdf' and not (setting('dosya.pdf'))::text::boolean then raise exception 'PDF yükleme kapalı.' using errcode = '42501'; end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'Yalnız JPG, PNG, WEBP ve PDF yüklenebilir.' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 or p_size > max_b then
    raise exception 'Dosya en fazla % MB olabilir.', max_b / 1048576 using errcode = '22023';
  end if;

  if p_kind = 'message' then
    select exists (select 1 from messages m join conversations c on c.id = m.conversation_id
                   where m.id = p_parent and m.sender_id = auth.uid() and c.school_id = school
                     and m.created_at > now() - interval '10 minutes')
      and (setting('mesaj.dosya'))::text::boolean and module_enabled('mesaj') into ok;
  elsif p_kind = 'announcement' then
    select exists (select 1 from announcements where id = p_parent and school_id = school and (created_by = auth.uid() or is_admin()))
      and (setting('duyuru.dosya'))::text::boolean and (is_admin() or module_enabled('duyuru')) into ok;
  elsif p_kind = 'homework' then
    select exists (select 1 from homework where id = p_parent and school_id = school and (teacher_id = auth.uid() or is_admin()))
      and (is_admin() or ((setting('odev.ogretmen_dosya'))::text::boolean and module_enabled('odev'))) into ok;
  elsif p_kind = 'submission' then
    select exists (select 1 from homework_students hs join homework h on h.id = hs.homework_id
                   where hs.homework_id = p_parent and hs.student_id = p_student and h.school_id = school and is_student_self(p_student))
      and (setting('odev.ogrenci_dosya'))::text::boolean and module_enabled('odev') into ok;
  end if;
  if not coalesce(ok, false) then raise exception 'Bu kayda dosya ekleme yetkin yok.' using errcode = '42501'; end if;
  if p_cover and (p_kind <> 'announcement' or p_mime not like 'image/%') then
    raise exception 'Kapak görseli yalnız duyurularda ve görsel olabilir.' using errcode = '22023';
  end if;
  select count(*) into n from attachments where uploaded_by = auth.uid() and created_at > now() - interval '1 hour';
  if n >= 60 then raise exception 'Bir saatte en fazla 60 dosya yüklenebilir.' using errcode = '54000'; end if;

  safe := lower(regexp_replace(translate(btrim(p_file_name), 'çğıöşüÇĞİÖŞÜ ', 'cgiosuCGIOSU-'), '[^A-Za-z0-9._-]', '', 'g'));
  if safe = '' then safe := 'dosya'; end if;
  v_path := school || '/' || p_kind || '/' || p_parent || '/' || v_id || '-' || right(safe, 80);
  insert into attachments (id, school_id, path, kind, message_id, announcement_id, homework_id, student_id, is_cover, file_name, mime, size)
  values (v_id, school, v_path, p_kind,
          case when p_kind = 'message' then p_parent end, case when p_kind = 'announcement' then p_parent end,
          case when p_kind in ('homework', 'submission') then p_parent end, case when p_kind = 'submission' then p_student end,
          coalesce(p_cover, false), left(btrim(p_file_name), 200), p_mime, p_size);
  return jsonb_build_object('id', v_id, 'path', v_path, 'bucket', 'ekler');
end $$;

-- Yükleme bitti: dosya gerçekten orada mı, gerçek boyutu sınırın içinde mi?
create or replace function confirm_upload(p_id uuid) returns void
language plpgsql security definer set search_path = public, storage as $$
declare a attachments; real_size bigint; real_mime text;
begin
  select * into a from attachments where id = p_id and uploaded_by = auth.uid() for update;
  if a.id is null then raise exception 'Dosya kaydı bulunamadı.' using errcode = 'P0002'; end if;
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into real_size, real_mime
  from storage.objects o where o.bucket_id = 'ekler' and o.name = a.path;
  if real_size is null then raise exception 'Dosya yüklenmemiş.' using errcode = 'P0002'; end if;
  if real_size > (setting('dosya.max_mb'))::text::int * 1048576 or real_mime is distinct from a.mime then
    raise exception 'Dosya boyutu ya da türü bildirilenle uyuşmuyor.' using errcode = '22023';
  end if;
  update attachments set uploaded = true, size = real_size where id = a.id;
end $$;
revoke all on function prepare_upload(text, uuid, text, text, int, boolean, uuid) from public, anon;
revoke all on function confirm_upload(uuid) from public, anon;
grant execute on function prepare_upload(text, uuid, text, text, int, boolean, uuid) to authenticated;
grant execute on function confirm_upload(uuid) to authenticated;

-- ---------- storage.objects politikaları ----------
-- Yükleme: yalnız prepare_upload'ın açtığı, henüz yüklenmemiş, kendi kaydının yoluna.
create policy ekler_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ekler' and exists (select 1 from public.attachments a where a.path = name and a.uploaded_by = auth.uid() and not a.uploaded));
-- İndirme: eki görebilen.
create policy ekler_read on storage.objects for select to authenticated using (
  bucket_id = 'ekler' and exists (select 1 from public.attachments a where a.path = name
                                  and (a.uploaded_by = auth.uid() or (a.uploaded and public.can_see_attachment(a)))));
-- Silme: yükleyen ya da yönetici.
create policy ekler_delete on storage.objects for delete to authenticated using (
  bucket_id = 'ekler' and exists (select 1 from public.attachments a where a.path = name and (a.uploaded_by = auth.uid() or public.is_admin())));

-- Okul logosu: herkes görür (giriş ekranı), yalnız yönetici yükler/siler. Yol: okul/logo-*.
create policy okul_admin_write on storage.objects for insert to authenticated with check (bucket_id = 'okul' and public.is_admin() and name like public.my_school()::text || '/%');
create policy okul_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'okul' and public.is_admin() and name like public.my_school()::text || '/%');

-- Giriş ekranı için okul adı ve logo yolu (başka bilgi yok).
create or replace function public_school_info(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name,
    'logo', nullif((select value#>>'{}' from school_settings where school_id = s.id and key = 'genel.logo'), ''))
  from schools s where s.slug = p_slug
$$;
revoke all on function public_school_info(text) from public;
grant execute on function public_school_info(text) to anon, authenticated;

create trigger audit_attachments after insert or delete on attachments for each row execute function audit_row();
