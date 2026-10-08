-- Öğretmen bütün okul denemelerini okuyabilir; bildirim hedefleri değişmez.
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
revoke all on function event_visible(calendar_events) from public,anon;
grant execute on function event_visible(calendar_events) to authenticated;
