-- Öğretmen yalnız kendi öğrencilerini görür; veli–öğrenci bağlantılarına işlem kaydı.
-- Önceden can_see_student her öğretmene okulun bütün öğrencilerini açıyordu. Artık öğretmen (branş ya da sınıf öğretmeni)
-- yalnız gerçek atamalarından türeyen sınıfların öğrencilerini görür: sınıf öğretmenliği + ders programı + ders atamaları
-- (teacher_classes, 0020). Yeni ilişki tablosu yok. Yönetici (aal2) ve rehberlik servisi (is_staff) bütün öğrencileri görmeye devam eder.
-- Öğrenci verisinin tamamı (öğrenci, yoklama, deneme sonucu, not, görev, rapor, görüşme, devamsızlık uyarısı) can_see_student'a
-- bağlı olduğundan kural tek yerde değişir. Veli (parent_links) ve öğrenci (kendisi) kuralları aynen kalır.
-- Yalnız ekleme / fonksiyon yeniden tanımı: veri silmez, tablo/sütun düşürmez.

-- Öğretmen bu öğrenciye erişebilir mi: öğretmen rolü (rol listesi, 0020) + öğrenci öğretmenin atandığı bir sınıfta.
create or replace function can_teacher_access_student(uid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(uid, 'ogretmen') and teaches_student(uid, sid)
$$;
revoke all on function can_teacher_access_student(uuid, uuid) from public, anon;
grant execute on function can_teacher_access_student(uuid, uuid) to authenticated;

create or replace function can_see_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s where s.id = sid and s.school_id = my_school()) and (
       is_staff()                                         -- yönetici (aal2) ve rehberlik: tümü
    or can_teacher_access_student(auth.uid(), sid)        -- öğretmen: yalnız atandığı sınıflar
    or exists (select 1 from parent_links pl join profiles p on p.id = pl.parent_id
               where pl.parent_id = auth.uid() and pl.student_id = sid and p.status = 'approved')
    or exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved' and p.role = 'ogrenci' and p.student_id = sid))
$$;

-- Devamsızlık sınırına yaklaşanlar: kişi yalnız görebildiği öğrencileri görür (öğretmen kendi sınıfları, yönetim tümü)
create or replace function attendance_watchlist()
returns table (student_id uuid, full_name text, class_name text, level text, ratio numeric, label text, used numeric, lim integer)
language sql stable security definer set search_path = public as $$
  select x.id, x.full_name, x.class_name, x.r->>'level', (x.r->>'ratio')::numeric, w->>'label', (w->>'used')::numeric, (w->>'limit')::int
  from (select s.id, s.full_name, s.class_name, attendance_limits_of(s.id) r
        from students s where s.school_id = my_school() and s.archived_at is null and can_see_student(s.id)
          and exists (select 1 from attendance a where a.student_id = s.id)) x
  cross join lateral (
    select i w from jsonb_array_elements(x.r->'items') i
    where (i->>'current')::boolean and (i->>'limit')::int > 0
    order by (i->>'used')::numeric / (i->>'limit')::int desc limit 1) m
  where is_teacher() and (is_admin() or module_enabled('yoklama')) and x.r->>'level' <> 'normal'
  order by (x.r->>'ratio')::numeric desc, x.full_name
$$;

-- Veli–öğrenci bağlantısı ekleme/kaldırma işlem kaydı (yönetici doğrudan parent_links üzerinden yönetir)
create or replace function parent_link_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), case tg_op when 'INSERT' then 'parent_link_add' else 'parent_link_remove' end, 'parent_links',
          coalesce(new.parent_id, old.parent_id),
          jsonb_build_object('student', coalesce(new.student_id, old.student_id), 'relation', coalesce(new.relation, old.relation)));
  return null;
end $$;
drop trigger if exists parent_links_audit on parent_links;
create trigger parent_links_audit after insert or delete on parent_links for each row execute function parent_link_audit();
