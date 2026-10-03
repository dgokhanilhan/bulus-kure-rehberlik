-- 0023_ogretmen_kapsami GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir, db push bunu uygulamaz).
-- can_see_student ve attendance_watchlist 0022 öncesi hallerine döner (öğretmen yeniden bütün öğrencileri görür).
-- Veli bağlantısı işlem kaydı tetikleyicisi kaldırılır; audit_log'daki kayıtlar SİLİNMEZ.
begin;

create or replace function can_see_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from students s where s.id = sid and s.school_id = my_school()) and (
     is_teacher()
     or exists(select 1 from parent_links pl join profiles p on p.id = pl.parent_id where pl.parent_id = auth.uid() and pl.student_id = sid and p.status='approved')
     or exists(select 1 from profiles p where p.id = auth.uid() and p.status='approved' and p.role='ogrenci' and p.student_id = sid)
   )
$$;

create or replace function attendance_watchlist()
returns table (student_id uuid, full_name text, class_name text, level text, ratio numeric, label text, used numeric, lim integer)
language sql stable security definer set search_path = public as $$
  select x.id, x.full_name, x.class_name, x.r->>'level', (x.r->>'ratio')::numeric, w->>'label', (w->>'used')::numeric, (w->>'limit')::int
  from (select s.id, s.full_name, s.class_name, attendance_limits_of(s.id) r
        from students s where s.school_id = my_school() and s.archived_at is null and exists (select 1 from attendance a where a.student_id = s.id)) x
  cross join lateral (
    select i w from jsonb_array_elements(x.r->'items') i
    where (i->>'current')::boolean and (i->>'limit')::int > 0
    order by (i->>'used')::numeric / (i->>'limit')::int desc limit 1) m
  where is_teacher() and (is_admin() or module_enabled('yoklama')) and x.r->>'level' <> 'normal'
  order by (x.r->>'ratio')::numeric desc, x.full_name
$$;

drop trigger if exists parent_links_audit on parent_links;

commit;
