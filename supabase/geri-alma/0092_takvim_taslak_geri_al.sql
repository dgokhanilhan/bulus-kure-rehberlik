-- 0092 geri alma: taslak sütunu, toplu yayınlama ve güncelleme bildirimi kaldırılır; fonksiyonlar 0015/0038 hâline döner.
-- Önce taslak etkinlik kalmamalı (yayınla ya da sil); yoksa sütun kalkınca taslaklar herkese görünür olurdu.
do $$ begin
  if exists (select 1 from calendar_events where taslak) then
    raise exception 'Taslak etkinlik var; önce yayınla ya da sil.';
  end if;
end $$;

drop trigger if exists calendar_notify_update on calendar_events;
drop function if exists calendar_notify_update();
drop trigger if exists calendar_tarih_sifirla on calendar_events;
drop function if exists calendar_tarih_sifirla();
drop function if exists takvim_yayinla(uuid[]);

create or replace function event_visible(e calendar_events) returns boolean
language sql stable security definer set search_path=public as $$
  select e.school_id = my_school() and (
    event_reaches(auth.uid(), e, true)
    or (e.type = 'deneme' and exists(
      select 1 from profiles p where p.id=auth.uid() and p.status='approved'
        and p.school_id=e.school_id and has_role(p.id, 'ogretmen')
    ))
  )
$$;

create or replace function calendar_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_many(
    array(select p.id from profiles p where p.school_id = new.school_id and p.status = 'approved'
            and p.id is distinct from new.created_by and event_reaches(p.id, new, false)),
    event_label(new.type) || ': ' || new.title || ' · ' || to_char(new.starts_on, 'DD.MM.YYYY'),
    jsonb_build_object('page', 'takvim', 'event', new.id,
                       'kind', case when new.type in ('yazili', 'deneme', 'bursluluk') then 'sinav' else 'etkinlik' end));
  return null;
end $$;

create or replace function takvim_hatirlatma() returns int
language plpgsql security definer set search_path = public as $$
declare e calendar_events; n int := 0; today date := (now() at time zone 'Europe/Istanbul')::date; days int;
begin
  for e in select * from calendar_events where type in ('yazili', 'deneme', 'bursluluk') and starts_on >= today and reminded_on is null loop
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

alter table calendar_events drop column if exists taslak;
