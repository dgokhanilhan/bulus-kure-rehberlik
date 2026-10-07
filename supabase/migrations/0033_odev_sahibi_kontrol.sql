-- Öğretmen yalnız kendi verdiği ödevin durumlarını değiştirebilir.
-- Yönetici yetkisi ve diğer öğretmenlerin sınıf kapsamındaki okuma yetkisi korunur.
create or replace function can_check_homework(p_hw uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from homework h where h.id = p_hw and h.school_id = my_school()
    and (is_admin() or (is_teacher() and h.teacher_id = auth.uid())))
$$;

-- Yeni dersler + program tek işlemde kaydedilir. Hata olursa tamamı geri alınır.
create or replace function import_timetable_image(p_class uuid, p_cells jsonb, p_courses jsonb default '[]', p_replace boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare school uuid := my_school(); level text; item jsonb; course uuid; ids jsonb := '{}'; n int := 0; changed int;
begin
  if not is_admin() then raise exception 'Ders programını yalnız yönetici yükleyebilir.' using errcode = '42501'; end if;
  select c.level into level from classes c where c.id = p_class and c.school_id = school and c.active;
  if level is null then raise exception 'Aktif sınıf bulunamadı.' using errcode = '22023'; end if;
  if p_cells is null or p_courses is null or jsonb_typeof(p_cells) <> 'array' or jsonb_typeof(p_courses) <> 'array' then
    raise exception 'Program verisi geçersiz.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cells) not between 1 and 120 or jsonb_array_length(p_courses) > 120 then
    raise exception 'Program verisi geçersiz.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_cells) c group by c->>'weekday', c->>'period' having count(*) > 1) then
    raise exception 'Aynı ders saati iki kez gönderilemez.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_courses) c group by c->>'key' having count(*) > 1) then
    raise exception 'Aynı yeni ders kısaltması iki kez gönderilemez.' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_courses) loop
    if coalesce(length(btrim(item->>'name')), 0) not between 2 and 60 or coalesce(item->>'key', '') = '' then
      raise exception 'Yeni dersin adı ve kısaltması gerekli.' using errcode = '22023';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_cells) c where c->>'new_key' = item->>'key') then
      raise exception 'Programda kullanılmayan yeni ders gönderilemez.' using errcode = '22023';
    end if;
    select c.id into course from courses c where c.school_id = school and lower(c.name) = lower(btrim(item->>'name')) and c.active;
    if course is null then
      insert into courses (school_id, name, short_name, levels)
      values (school, btrim(item->>'name'), left(item->>'key', 8), array[level]) returning id into course;
    end if;
    ids := ids || jsonb_build_object(item->>'key', course);
  end loop;
  for item in select * from jsonb_array_elements(p_cells) loop
    if (item->>'weekday')::int not between 1 and 6 or (item->>'period')::int not between 1 and 20 then
      raise exception 'Gün ya da ders saati geçersiz.' using errcode = '22023';
    end if;
    course := coalesce((item->>'course_id')::uuid, (ids->>(item->>'new_key'))::uuid);
    if not exists (select 1 from courses c where c.id = course and c.school_id = school and c.active
                   and (cardinality(c.levels) = 0 or level = any(c.levels))) then
      raise exception 'Ders seçilen sınıfın kademesine uygun değil.' using errcode = '22023';
    end if;
    if p_replace then
      insert into timetable (school_id, class_id, weekday, period, subject, course_id, teacher_id)
      values (school, p_class, (item->>'weekday')::int, (item->>'period')::int, '', course, (item->>'teacher_id')::uuid)
      on conflict (class_id, weekday, period) do update set course_id = excluded.course_id, teacher_id = excluded.teacher_id;
    else
      insert into timetable (school_id, class_id, weekday, period, subject, course_id, teacher_id)
      values (school, p_class, (item->>'weekday')::int, (item->>'period')::int, '', course, (item->>'teacher_id')::uuid)
      on conflict (class_id, weekday, period) do nothing;
    end if;
    get diagnostics changed = row_count; n := n + changed;
  end loop;
  return n;
end $$;
revoke all on function import_timetable_image(uuid, jsonb, jsonb, boolean) from public;
grant execute on function import_timetable_image(uuid, jsonb, jsonb, boolean) to authenticated;
