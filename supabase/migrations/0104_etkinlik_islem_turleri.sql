-- Etkinlik günlüğü metinleri (0101'in devamı). Yalnız okuma fonksiyonları değişir; hiçbir veri yazılmaz/silinmez.
--  * İşlem kaydındaki (audit_log) işler artık tek "yönetim işlemi" olarak değil, türüyle döner: 'y:<action>/<entity>'.
--    Arayüz bunları "Ders programını düzenledi", "Açık rıza metnini onayladı" gibi metne çevirir. İçerik dönmez.
--  * Ek rolü yönetici olan kişi (profile_roles) günlükte "Yönetici" görünür.
--  * Aynı dakikada oturum yenilemesi, o dakikadaki işlerden önce sıralanır (uygulama önce açılır).
-- Gövdeler 0101'den alındı. Geri alma: supabase/geri-alma/0104_etkinlik_islem_turleri_geri_al.sql

create or replace function etkinlik_islemler(p_school uuid, p_bas timestamptz, p_son timestamptz, p_user uuid default null)
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
    select user_id, basladi, 'oyun' from oda_oyun where basladi >= p_bas and basladi < p_son and user_id in (select id from kisi)
    union all
    select created_by, created_at, 'calisma' from study_sessions where created_at >= p_bas and created_at < p_son and created_by in (select id from kisi)
    union all
    -- Yönetim işlemleri (işlem kaydı). Öğrenci sayfası görüntülemesi sayfa kaydında zaten görünür.
    select a.user_id, a.created_at,
           case when a.action = 'view' and a.entity = 'rehber_notlari' then 'gor_rehber_notu'
                when a.action = 'view' and a.entity = 'rapor' then 'gor_rapor'
                when a.action = 'etkinlik_gunlugu' then 'etkinlik_gunlugu'
                else 'y:' || left(a.action, 40) || '/' || left(a.entity, 40) end
      from audit_log a
      where a.created_at >= p_bas and a.created_at < p_son and a.user_id in (select id from kisi)
        and not (a.action = 'view' and a.entity = 'ogrenci')
  )
  select h.user_id, date_trunc('minute', min(h.at)) as at, h.tur, count(*)::int as adet
  from ham h where h.user_id is not null
  group by h.user_id, h.tur, date_trunc('minute', h.at)
$$;

create or replace function etkinlik_gun(p_gun date) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare sid uuid := my_school(); v_bas timestamptz; v_son timestamptz; r jsonb;
begin
  if not etkinlik_yetkili() then raise exception 'Bu sayfa yalnız yetkili hesaba açıktır.' using errcode = '42501'; end if;
  if p_gun is null or p_gun > (now() at time zone 'Europe/Istanbul')::date or p_gun < (now() at time zone 'Europe/Istanbul')::date - 400 then
    raise exception 'Geçersiz gün.' using errcode = '22023';
  end if;
  v_bas := p_gun::timestamp at time zone 'Europe/Istanbul';
  v_son := (p_gun + 1)::timestamp at time zone 'Europe/Istanbul';
  with p as (
    select pr.id, pr.full_name,
           case when exists (select 1 from profile_roles r where r.profile_id = pr.id and r.role = 'admin') then 'admin' else pr.role::text end as rol,
           pr.branch, u.last_sign_in_at
    from profiles pr join auth.users u on u.id = pr.id
    where pr.school_id = sid and pr.status = 'approved'
  ),
  k as (
    select user_id, min(at) as ilk, max(at) as son, count(*) filter (where tur = 'sayfa')::int as sayfa,
           count(*) filter (where tur = 'giris')::int as giris, mode() within group (order by cihaz) as cihaz
    from etkinlik_kaydi where school_id = sid and at >= v_bas and at < v_son group by user_id
  ),
  i as (
    select user_id, min(at) as ilk, max(at) as son, sum(adet)::int as islem
    from etkinlik_islemler(sid, v_bas, v_son) where tur <> 'etkinlik_gunlugu' group by user_id
  ),
  o as (
    select x.user_id, min(x.at) as ilk, max(x.at) as son from (
      select s.user_id, s.created_at as at from auth.sessions s where s.created_at >= v_bas and s.created_at < v_son
      union all
      select s.user_id, s.refreshed_at at time zone 'UTC' from auth.sessions s
        where s.refreshed_at is not null and s.refreshed_at at time zone 'UTC' >= v_bas and s.refreshed_at at time zone 'UTC' < v_son
      union all
      select rt.user_id::uuid, rt.created_at from auth.refresh_tokens rt
        where rt.created_at >= v_bas and rt.created_at < v_son and rt.user_id ~ '^[0-9a-f-]{36}$'
    ) x where x.user_id in (select id from p) group by x.user_id
  ),
  g as (
    select y.id, min(y.ilk) as ilk, max(y.son) as son from (
      select k.user_id as id, k.ilk, k.son from k union all select i.user_id, i.ilk, i.son from i union all select o.user_id, o.ilk, o.son from o
    ) y group by y.id
  )
  select jsonb_build_object(
    'gun', p_gun,
    'girenler', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ad', p.full_name, 'rol', p.rol, 'brans', p.branch,
                        'ilk', g.ilk, 'son', g.son, 'sayfa', coalesce(k.sayfa, 0), 'giris', coalesce(k.giris, 0), 'islem', coalesce(i.islem, 0),
                        'cihaz', k.cihaz, 'kayitli', k.user_id is not null)
                        order by g.ilk)
                      from g join p on p.id = g.id left join k on k.user_id = g.id left join i on i.user_id = g.id), '[]'::jsonb),
    'girmeyenler', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ad', p.full_name, 'rol', p.rol, 'brans', p.branch,
                        'son_gorulme', nullif(greatest(
                            coalesce(p.last_sign_in_at, '-infinity'::timestamptz),
                            coalesce((select max(coalesce(s.refreshed_at at time zone 'UTC', s.updated_at)) from auth.sessions s where s.user_id = p.id), '-infinity'::timestamptz),
                            coalesce((select max(rt.created_at) from auth.refresh_tokens rt where rt.user_id = p.id::text), '-infinity'::timestamptz),
                            coalesce((select max(ek.at) from etkinlik_kaydi ek where ek.user_id = p.id), '-infinity'::timestamptz)), '-infinity'::timestamptz))
                        order by p.full_name)
                      from p where not exists (select 1 from g where g.id = p.id)), '[]'::jsonb),
    'kayit_basi', (select min(at) from etkinlik_kaydi where school_id = sid)
  ) into r;
  perform etkinlik_gunlugu_acildi(p_gun);
  return r;
end $$;

create or replace function etkinlik_kisi(p_user uuid, p_gun date) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare sid uuid := my_school(); v_bas timestamptz; v_son timestamptz; r jsonb;
begin
  if not etkinlik_yetkili() then raise exception 'Bu sayfa yalnız yetkili hesaba açıktır.' using errcode = '42501'; end if;
  if not exists (select 1 from profiles p where p.id = p_user and p.school_id = sid) then
    raise exception 'Kişi bulunamadı.' using errcode = '22023';
  end if;
  v_bas := p_gun::timestamp at time zone 'Europe/Istanbul';
  v_son := (p_gun + 1)::timestamp at time zone 'Europe/Istanbul';
  select jsonb_build_object(
    'olaylar', coalesce((select jsonb_agg(x order by x.at, x.sira) from (
      select k.at, case when k.tur = 'giris' then -1 else 0 end as sira, k.tur, k.sayfa, k.cihaz, 1 as adet,
             (select s.full_name from students s
               where s.school_id = sid and k.sayfa ~ '^/ogrenciler/[0-9a-f-]{36}$' and s.id = substring(k.sayfa from 13)::uuid) as ogrenci
      from etkinlik_kaydi k where k.user_id = p_user and k.school_id = sid and k.at >= v_bas and k.at < v_son
      union all
      select e.at, 1, e.tur, null, null, e.adet, null from etkinlik_islemler(sid, v_bas, v_son, p_user) e
      union all
      -- Şifreyle giriş (yeni oturum) ve oturum yenilemesi (uygulama açıkken yaklaşık saatte bir)
      select s.created_at, -2, 'sifre_giris', null, null, 1, null from auth.sessions s
        where s.user_id = p_user and s.created_at >= v_bas and s.created_at < v_son
      union all
      select date_trunc('minute', rt.created_at), -1, 'oturum', null, null, 1, null from auth.refresh_tokens rt
        where rt.user_id = p_user::text and rt.parent is not null and rt.created_at >= v_bas and rt.created_at < v_son
    ) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
