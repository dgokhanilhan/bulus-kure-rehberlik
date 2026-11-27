-- Etkinlik günlüğü: seçilen günde kimin girdiği, hangi sayfaları açtığı ve ne yaptığı.
-- 1) Görme yetkisi (etkinlik_yetki): yalnız bu tabloya eklenmiş yönetici görür (diğer yöneticiler dahil kimse görmez).
--    Tabloya API'den yazılamaz ve okunamaz; yetki yalnız veritabanından (SQL) verilir. Repo'da kişi bilgisi tutulmaz.
-- 2) Kayıt (etkinlik_kaydi): uygulama açılışı ("giriş") ve açılan sayfanın yolu, cihaz türü (telefon/tablet/bilgisayar).
--    İçerik yok: mesaj, not, görüşme metni ya da IP adresi tutulmaz. 90 gün sonra her gece silinir.
-- 3) Yapılan işler kayıt tablosundan değil mevcut tablolardan türetilir (ödev, görev, yoklama, duyuru, mesaj…): yalnız
--    işin türü ve sayısı döner, içerik dönmez. Bu yüzden özellik yayına girmeden önceki günlerin işleri de görünür.
-- 4) Günlüğü açmak da işlem kaydına (audit_log) yazılır.
-- Geri alma: supabase/geri-alma/0100_etkinlik_gunlugu_geri_al.sql

-- ---------- 1) Yetki ----------
create table etkinlik_yetki (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table etkinlik_yetki enable row level security; -- politika yok: API'den hiç kimse okuyamaz/yazamaz
revoke all on etkinlik_yetki from anon, authenticated;

create function etkinlik_yetkili() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin() and exists (select 1 from etkinlik_yetki y where y.user_id = auth.uid()), false)
$$;
revoke all on function etkinlik_yetkili() from public, anon;
grant execute on function etkinlik_yetkili() to authenticated;

-- ---------- 2) Kayıt ----------
create table etkinlik_kaydi (
  id bigint generated always as identity primary key,
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rol text not null check (rol in ('admin', 'rehber', 'brans', 'veli', 'ogrenci')),
  tur text not null check (tur in ('giris', 'sayfa')),
  sayfa text check (sayfa ~ '^/[a-z0-9/-]{0,79}$'),
  cihaz text check (cihaz in ('telefon', 'tablet', 'bilgisayar')),
  at timestamptz not null default now()
);
create index etkinlik_kaydi_okul_zaman on etkinlik_kaydi (school_id, at);
create index etkinlik_kaydi_kisi_zaman on etkinlik_kaydi (user_id, at);
-- Yarım kalan gönderim tekrarlanınca aynı olay iki kez yazılmaz
create unique index etkinlik_kaydi_tekil on etkinlik_kaydi (user_id, tur, coalesce(sayfa, ''), at);
alter table etkinlik_kaydi enable row level security; -- politika yok: yazma etkinlik_yaz, okuma etkinlik_gun/etkinlik_kisi ile
revoke all on etkinlik_kaydi from anon, authenticated;

-- İstemci olayları toplu gönderir (en çok 30). Onaylı hesap; dakikada en çok 120 olay; zaman son 15 dakikayla sınırlı.
create function etkinlik_yaz(p_olaylar jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sid uuid; son_dk int;
begin
  if uid is null or jsonb_typeof(p_olaylar) is distinct from 'array' then return; end if;
  select p.school_id into sid from profiles p where p.id = uid and p.status = 'approved';
  if sid is null then return; end if;
  select count(*) into son_dk from etkinlik_kaydi k where k.user_id = uid and k.at > now() - interval '1 minute';
  if son_dk >= 120 then return; end if;
  insert into etkinlik_kaydi (school_id, user_id, rol, tur, sayfa, cihaz, at)
  select sid, uid, e->>'rol', e->>'tur',
         case when e->>'tur' = 'sayfa' then e->>'sayfa' end,
         case when e->>'cihaz' in ('telefon', 'tablet', 'bilgisayar') then e->>'cihaz' end,
         case when (e->>'at') ~ '^\d{4}-\d\d-\d\dT[0-9:.]+Z$'
                   and (e->>'at')::timestamptz between now() - interval '15 minutes' and now() + interval '1 minute'
              then least((e->>'at')::timestamptz, now()) else now() end
  from (select e from jsonb_array_elements(p_olaylar) e limit 30) x
  where e->>'rol' in ('admin', 'rehber', 'brans', 'veli', 'ogrenci')
    and e->>'tur' in ('giris', 'sayfa')
    and (e->>'tur' = 'giris' or coalesce(e->>'sayfa', '') ~ '^/[a-z0-9/-]{0,79}$')
  on conflict do nothing;
end $$;
revoke all on function etkinlik_yaz(jsonb) from public, anon;
grant execute on function etkinlik_yaz(jsonb) to authenticated;

-- ---------- 3) Yapılan işler (mevcut tablolardan; içerik yok) ----------
-- Aynı dakikadaki aynı tür işler tek satır (adet) olur: ör. 24 öğrencilik yoklama tek satır.
create function etkinlik_islemler(p_school uuid, p_bas timestamptz, p_son timestamptz, p_user uuid default null)
returns table (user_id uuid, at timestamptz, tur text, adet int)
language sql stable security definer set search_path = public as $$
  with kisi as (
    select p.id from profiles p where p.school_id = p_school and (p_user is null or p.id = p_user)
  ),
  ham(user_id, at, tur) as (
    select created_by, created_at, 'gorev_verdi' from tasks where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    select p.id, t.completed_at, 'gorev_tamamladi' from tasks t join profiles p on p.student_id = t.student_id and p.role = 'ogrenci'
      where t.completed_at >= p_bas and t.completed_at < p_son and p.id in (select id from kisi)
    union all
    select created_by, created_at, 'gorusme' from meetings where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    select author_id, created_at, 'not' from notes where created_at >= p_bas and created_at < p_son and author_id in (select id from kisi)
    union all
    select created_by, sent_at, 'rapor_gonderdi' from reports where sent_at >= p_bas and sent_at < p_son and created_by in (select id from kisi)
    union all
    select teacher_id, created_at, 'odev_verdi' from homework where created_at >= p_bas and created_at < p_son and teacher_id in (select id from kisi)
    union all
    select checked_by, checked_at, 'odev_kontrol' from homework_students where checked_at >= p_bas and checked_at < p_son and checked_by in (select id from kisi)
    union all
    select created_by, created_at, 'duyuru' from announcements where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    select sender_id, created_at, 'mesaj' from messages where created_at >= p_bas and created_at < p_son and sender_id in (select id from kisi)
    union all
    select created_by, created_at, 'yoklama' from attendance where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    select created_by, created_at, 'takvim' from calendar_events where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    select published_by, published_at, 'deneme_yayin' from exams where published_at >= p_bas and published_at < p_son and published_by in (select id from kisi)
    union all
    select teacher_id, created_at, 'gunluk_kontrol' from gunluk_kontrol where created_at >= p_bas and created_at < p_son and teacher_id in (select id from kisi)
    union all
    select created_by, created_at, 'soru_sordu' from soru_talep where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    select yanitlayan, yanit_at, 'soru_yanit' from soru_talep where yanit_at >= p_bas and yanit_at < p_son and yanitlayan in (select id from kisi)
    union all
    select uploaded_by, created_at, 'galeri' from gallery_media where created_at >= p_bas and created_at < p_son and uploaded_by in (select id from kisi)
    union all
    select yazan, created_at, 'oda_mesaj' from oda_mesaj where created_at >= p_bas and created_at < p_son and yazan in (select id from kisi)
    union all
    select created_by, created_at, 'calisma' from study_sessions where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    -- Yönetim işlemleri (işlem kaydı). Öğrenci sayfası görüntülemesi sayfa kaydında zaten görünür.
    select a.user_id, a.created_at,
           case when a.action = 'view' and a.entity = 'rehber_notlari' then 'gor_rehber_notu'
                when a.action = 'view' and a.entity = 'rapor' then 'gor_rapor'
                when a.action = 'etkinlik_gunlugu' then 'etkinlik_gunlugu'
                else 'yonetim' end
      from audit_log a
      where a.created_at >= p_bas and a.created_at < p_son and a.user_id in (select id from kisi)
        and not (a.action = 'view' and a.entity = 'ogrenci')
  )
  select h.user_id, date_trunc('minute', min(h.at)) as at, h.tur, count(*)::int as adet
  from ham h where h.user_id is not null
  group by h.user_id, h.tur, date_trunc('minute', h.at)
$$;
revoke all on function etkinlik_islemler(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- Günlüğü açma kaydı: kişi/gün başına bir kez (her gün değiştirmede değil)
create function etkinlik_gunlugu_acildi(p_gun date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from audit_log a where a.user_id = auth.uid() and a.action = 'etkinlik_gunlugu'
                   and a.created_at >= date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul') then
    insert into audit_log (user_id, action, entity, entity_id, meta)
    values (auth.uid(), 'etkinlik_gunlugu', 'etkinlik_kaydi', null, jsonb_build_object('gun', p_gun));
  end if;
end $$;
revoke all on function etkinlik_gunlugu_acildi(date) from public, anon, authenticated;

-- ---------- 4) Okuma: gün listesi ----------
create function etkinlik_gun(p_gun date) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare sid uuid := my_school(); bas timestamptz; son timestamptz; r jsonb;
begin
  if not etkinlik_yetkili() then raise exception 'Bu sayfa yalnız yetkili hesaba açıktır.' using errcode = '42501'; end if;
  if p_gun is null or p_gun > (now() at time zone 'Europe/Istanbul')::date or p_gun < (now() at time zone 'Europe/Istanbul')::date - 400 then
    raise exception 'Geçersiz gün.' using errcode = '22023';
  end if;
  bas := p_gun::timestamp at time zone 'Europe/Istanbul';
  son := (p_gun + 1)::timestamp at time zone 'Europe/Istanbul';
  with k as (
    select user_id, min(at) as ilk, max(at) as son, count(*) filter (where tur = 'sayfa')::int as sayfa,
           mode() within group (order by cihaz) as cihaz
    from etkinlik_kaydi where school_id = sid and at >= bas and at < son group by user_id
  ),
  i as (
    select user_id, min(at) as ilk, max(at) as son, sum(adet)::int as islem
    from etkinlik_islemler(sid, bas, son) where tur <> 'etkinlik_gunlugu' group by user_id
  ),
  g as (
    select coalesce(k.user_id, i.user_id) as id, least(k.ilk, i.ilk) as ilk, greatest(k.son, i.son) as son,
           coalesce(k.sayfa, 0) as sayfa, coalesce(i.islem, 0) as islem, k.cihaz, k.user_id is not null as kayitli
    from k full join i on i.user_id = k.user_id
  ),
  p as (
    select pr.id, pr.full_name, pr.role::text as rol, pr.branch, u.last_sign_in_at
    from profiles pr join auth.users u on u.id = pr.id
    where pr.school_id = sid and pr.status = 'approved'
  )
  select jsonb_build_object(
    'gun', p_gun,
    'girenler', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ad', p.full_name, 'rol', p.rol, 'brans', p.branch,
                        'ilk', g.ilk, 'son', g.son, 'sayfa', g.sayfa, 'islem', g.islem, 'cihaz', g.cihaz, 'kayitli', g.kayitli)
                        order by g.ilk)
                      from g join p on p.id = g.id), '[]'::jsonb),
    'girmeyenler', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ad', p.full_name, 'rol', p.rol, 'brans', p.branch,
                        'son_giris', p.last_sign_in_at) order by p.full_name)
                      from p where not exists (select 1 from g where g.id = p.id)), '[]'::jsonb),
    'kayit_basi', (select min(at) from etkinlik_kaydi where school_id = sid)
  ) into r;
  perform etkinlik_gunlugu_acildi(p_gun);
  return r;
end $$;
revoke all on function etkinlik_gun(date) from public, anon;
grant execute on function etkinlik_gun(date) to authenticated;

-- ---------- 5) Okuma: kişinin günü ----------
create function etkinlik_kisi(p_user uuid, p_gun date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid := my_school(); bas timestamptz; son timestamptz; r jsonb;
begin
  if not etkinlik_yetkili() then raise exception 'Bu sayfa yalnız yetkili hesaba açıktır.' using errcode = '42501'; end if;
  if not exists (select 1 from profiles p where p.id = p_user and p.school_id = sid) then
    raise exception 'Kişi bulunamadı.' using errcode = '22023';
  end if;
  bas := p_gun::timestamp at time zone 'Europe/Istanbul';
  son := (p_gun + 1)::timestamp at time zone 'Europe/Istanbul';
  select jsonb_build_object(
    'olaylar', coalesce((select jsonb_agg(x order by x.at, x.sira) from (
      select k.at, case when k.tur = 'giris' then -1 else 0 end as sira, k.tur, k.sayfa, k.cihaz, 1 as adet,
             (select s.full_name from students s
               where s.school_id = sid and k.sayfa ~ '^/ogrenciler/[0-9a-f-]{36}$' and s.id = substring(k.sayfa from 13)::uuid) as ogrenci
      from etkinlik_kaydi k where k.user_id = p_user and k.school_id = sid and k.at >= bas and k.at < son
      union all
      select e.at, 1, e.tur, null, null, e.adet, null from etkinlik_islemler(sid, bas, son, p_user) e
    ) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function etkinlik_kisi(uuid, date) from public, anon;
grant execute on function etkinlik_kisi(uuid, date) to authenticated;

-- ---------- 6) 90 günden eski kayıtları sil (her gece) ----------
create function etkinlik_temizlik() returns void language sql security definer set search_path = public as $$
  delete from etkinlik_kaydi where at < now() - interval '90 days';
$$;
revoke all on function etkinlik_temizlik() from public, anon, authenticated;
select cron.schedule('etkinlik-temizlik', '35 3 * * *', $$select public.etkinlik_temizlik()$$);
