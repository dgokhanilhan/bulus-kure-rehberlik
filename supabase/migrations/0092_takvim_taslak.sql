-- 0092 Takvim taslakları: taslak etkinliği yalnız yönetim/rehberlik ve ekleyen görür, kimseye bildirim gitmez.
-- Toplu yayınlamada her kişiye tek özet bildirim gider. Yayındaki etkinliğin tarihi değişince hedefe bildirilir
-- ve hatırlatma yeniden kurulur. Mevcut etkinlikler yayında kalır (taslak = false).

alter table calendar_events add column if not exists taslak boolean not null default false;

-- Görünürlük: 0038'deki gövde + taslak koşulu.
create or replace function event_visible(e calendar_events) returns boolean
language sql stable security definer set search_path=public as $$
  select e.school_id = my_school()
    and (not e.taslak or e.created_by = auth.uid() or is_staff())
    and (
      event_reaches(auth.uid(), e, true)
      or (e.type = 'deneme' and exists(
        select 1 from profiles p where p.id=auth.uid() and p.status='approved'
          and p.school_id=e.school_id and has_role(p.id, 'ogretmen')
      ))
    )
$$;
revoke all on function event_visible(calendar_events) from public,anon;
grant execute on function event_visible(calendar_events) to authenticated;

-- Ekleme bildirimi: 0015'teki gövde; taslakta bildirim yok.
create or replace function calendar_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.taslak then return null; end if;
  perform notify_many(
    array(select p.id from profiles p where p.school_id = new.school_id and p.status = 'approved'
            and p.id is distinct from new.created_by and event_reaches(p.id, new, false)),
    event_label(new.type) || ': ' || new.title || ' · ' || to_char(new.starts_on, 'DD.MM.YYYY'),
    jsonb_build_object('page', 'takvim', 'event', new.id,
                       'kind', case when new.type in ('yazili', 'deneme', 'bursluluk') then 'sinav' else 'etkinlik' end));
  return null;
end $$;

-- Tarih değişince hatırlatma yeniden kurulsun (öncesinde, satır yazılmadan).
create or replace function calendar_tarih_sifirla() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.starts_on is distinct from old.starts_on then new.reminded_on := null; end if;
  return new;
end $$;
drop trigger if exists calendar_tarih_sifirla on calendar_events;
create trigger calendar_tarih_sifirla before update on calendar_events for each row execute function calendar_tarih_sifirla();

-- Güncelleme bildirimi: taslaktan tek tek yayına geçen etkinlik eklenmiş gibi bildirilir;
-- yayındaki etkinliğin tarihi değişirse hedefe "tarih değişti" gider. Toplu yayınlama (bk.takvim_toplu) kendi özetini yollar.
create or replace function calendar_notify_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare alicilar uuid[];
begin
  if new.taslak or coalesce(current_setting('bk.takvim_toplu', true), '') = 'on' then return null; end if;
  alicilar := array(select p.id from profiles p where p.school_id = new.school_id and p.status = 'approved'
                      and p.id is distinct from auth.uid() and event_reaches(p.id, new, false));
  if old.taslak then
    perform notify_many(alicilar,
      event_label(new.type) || ': ' || new.title || ' · ' || to_char(new.starts_on, 'DD.MM.YYYY'),
      jsonb_build_object('page', 'takvim', 'event', new.id,
                         'kind', case when new.type in ('yazili', 'deneme', 'bursluluk') then 'sinav' else 'etkinlik' end));
  elsif new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on then
    perform notify_many(alicilar,
      'Tarih değişti: ' || new.title || ' · ' || to_char(old.starts_on, 'DD.MM.YYYY') || ' → ' || to_char(new.starts_on, 'DD.MM.YYYY')
        || case when new.ends_on <> new.starts_on then ' – ' || to_char(new.ends_on, 'DD.MM.YYYY') else '' end,
      jsonb_build_object('page', 'takvim', 'event', new.id,
                         'kind', case when new.type in ('yazili', 'deneme', 'bursluluk') then 'sinav' else 'etkinlik' end));
  end if;
  return null;
end $$;
drop trigger if exists calendar_notify_update on calendar_events;
create trigger calendar_notify_update after update on calendar_events for each row execute function calendar_notify_update();

-- Toplu yayınlama: seçilen taslakları yayına alır; her kişiye tek bildirim (1 etkinlikse adıyla, fazlaysa özet).
create or replace function takvim_yayinla(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); okul uuid := my_school(); n int; r record; ilk date; son date; ilk_id uuid;
begin
  if uid is null or okul is null then raise exception 'Oturum gerekli.' using errcode = '42501'; end if;
  if exists (select 1 from calendar_events e where e.id = any(p_ids)
               and (e.school_id <> okul or not (is_admin() or e.created_by = uid))) then
    raise exception 'Bu etkinlikleri yayınlama yetkin yok.' using errcode = '42501';
  end if;
  perform set_config('bk.takvim_toplu', 'on', true);
  update calendar_events set taslak = false where id = any(p_ids) and taslak;
  get diagnostics n = row_count;
  perform set_config('bk.takvim_toplu', '', true);
  if n = 0 then return 0; end if;
  select min(starts_on), max(starts_on) into ilk, son from calendar_events where id = any(p_ids);
  select id into ilk_id from calendar_events where id = any(p_ids) order by starts_on, id limit 1;
  for r in
    select p.id as kisi, count(*) as adet, min(e.id::text) as tek, min(e.title) as baslik, min(e.type) as tur, min(e.starts_on) as gun
    from calendar_events e
    join profiles p on p.school_id = e.school_id and p.status = 'approved' and p.id <> uid and event_reaches(p.id, e, false)
    where e.id = any(p_ids)
    group by p.id
  loop
    if r.adet = 1 then
      perform notify_many(array[r.kisi], event_label(r.tur) || ': ' || r.baslik || ' · ' || to_char(r.gun, 'DD.MM.YYYY'),
        jsonb_build_object('page', 'takvim', 'event', r.tek::uuid,
                           'kind', case when r.tur in ('yazili', 'deneme', 'bursluluk') then 'sinav' else 'etkinlik' end));
    else
      perform notify_many(array[r.kisi],
        'Takvime ' || r.adet || ' yeni etkinlik eklendi · ' || to_char(ilk, 'DD.MM.YYYY') || ' – ' || to_char(son, 'DD.MM.YYYY'),
        jsonb_build_object('page', 'takvim', 'event', ilk_id, 'kind', 'etkinlik'));
    end if;
  end loop;
  return n;
end $$;
revoke all on function takvim_yayinla(uuid[]) from public, anon;
grant execute on function takvim_yayinla(uuid[]) to authenticated;

-- Hatırlatma: 0015'teki gövde; taslaklar hatırlatılmaz.
create or replace function takvim_hatirlatma() returns int
language plpgsql security definer set search_path = public as $$
declare e calendar_events; n int := 0; today date := (now() at time zone 'Europe/Istanbul')::date; days int;
begin
  for e in select * from calendar_events where type in ('yazili', 'deneme', 'bursluluk') and starts_on >= today and reminded_on is null and not taslak loop
    days := (school_setting(e.school_id, 'takvim.hatirlatma_gun'))::text::int;
    if days > 0 and e.starts_on - today <= days and (school_setting(e.school_id, 'modul.takvim'))::text::boolean then
      perform notify_many(
        array(select p.id from profiles p where p.school_id = e.school_id and p.status = 'approved' and event_reaches(p.id, e, false)),
        'Yaklaşan ' || lower(event_label(e.type)) || ': ' || e.title || ' · ' || to_char(e.starts_on, 'DD.MM.YYYY'),
        jsonb_build_object('page', 'takvim', 'event', e.id, 'kind', 'sinav_hatirlatma'));
      update calendar_events set reminded_on = today where id = e.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function takvim_hatirlatma() from public, anon, authenticated;
grant execute on function takvim_hatirlatma() to service_role;
