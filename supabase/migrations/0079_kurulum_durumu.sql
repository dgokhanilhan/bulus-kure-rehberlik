-- Kurulum sihirbazı (Yönetim › Kurulum sihirbazı): yeni bir okulun kurulum adımlarının durumu tek çağrıda.
-- Yalnız yönetici; yalnız sayılar döner (kişi/öğrenci verisi yok). Veri yazmaz.
-- Geri alma: supabase/geri-alma/0079_kurulum_durumu_geri_al.sql

create function kurulum_durumu() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid := my_school();
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  return jsonb_build_object(
    'yil', (select count(*) from academic_years where school_id = sid),
    'modul', (select count(*) from school_settings where school_id = sid and key like 'modul.%'),
    'sinif', (select count(*) from classes where school_id = sid),
    'ders', (select count(*) from courses where school_id = sid),
    'saat', (select count(*) from bell_times where school_id = sid),
    'ogretmen', (select count(*) from profiles where school_id = sid and status = 'approved' and role = 'ogretmen'),
    'ogrenci', (select count(*) from students where school_id = sid and archived_at is null),
    'sinifsiz', (select count(*) from students where school_id = sid and archived_at is null and class_id is null),
    'atama', (select count(*) from teaching_assignments where school_id = sid),
    'program', (select count(*) from timetable where school_id = sid),
    'veli_bagli', (select count(distinct pl.student_id) from parent_links pl join students s on s.id = pl.student_id
                   where s.school_id = sid and s.archived_at is null),
    'yonetici_mfa', (select count(*) from profiles p where p.school_id = sid and p.status = 'approved' and p.role = 'admin'
                     and exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
  );
end $$;
revoke all on function kurulum_durumu() from public, anon;
grant execute on function kurulum_durumu() to authenticated;
