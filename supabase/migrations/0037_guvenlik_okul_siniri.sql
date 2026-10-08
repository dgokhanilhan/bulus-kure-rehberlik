-- İç bildirim yardımcıları API değildir; SECURITY DEFINER tetikleyicileri
-- sahibi olarak çağırmaya devam eder. Anonim ve kullanıcı RPC erişimi kapanır.
revoke all on function student_accounts(uuid), parent_accounts(uuid),
  admin_accounts(uuid), staff_accounts(uuid), class_accounts(uuid,text),
  meeting_recipients(uuid,meeting_with) from public, anon, authenticated;

-- Görünümdeki RLS, doğrudan RPC çağrısını korumaz. Notun her görünürlük
-- türünde aynı erişim koşullarını fonksiyon içinde de uygula.
create or replace function note_body(p_note uuid) returns text
language plpgsql stable security definer set search_path=public,extensions as $$
declare n notes;
begin
  select * into n from notes where id=p_note;
  if n.id is null or not can_see_student(n.student_id) then return null; end if;
  if not (is_staff()
    or (is_teacher() and n.visibility in ('ogretmen','veli'))
    or (n.visibility='veli' and is_parent_of(n.student_id))) then return null; end if;
  if n.visibility='rehber' then
    return extensions.pgp_sym_decrypt(n.body_enc,notes_key());
  end if;
  return n.body;
end $$;
revoke all on function note_body(uuid) from public,anon;
grant execute on function note_body(uuid) to authenticated;

-- Eski izin verici politikalarla OR yapılmasını önleyen kısıtlayıcı okul sınırı.
create policy security_school on exam_questions as restrictive for all to authenticated
using (exists(select 1 from exams e where e.id=exam_id and e.school_id=my_school()))
with check (exists(select 1 from exams e where e.id=exam_id and e.school_id=my_school()));
create policy security_school on exam_results as restrictive for all to authenticated
using (can_see_student(student_id) and exists(select 1 from exams e where e.id=exam_id and e.school_id=my_school()))
with check (can_see_student(student_id) and exists(select 1 from exams e where e.id=exam_id and e.school_id=my_school()));
create policy security_school on meetings as restrictive for all to authenticated
using (can_see_student(student_id)) with check (can_see_student(student_id));
create policy security_school on tasks as restrictive for all to authenticated
using (can_see_student(student_id)) with check (can_see_student(student_id));
create policy security_school on reports as restrictive for all to authenticated
using (can_see_student(student_id) and exists(select 1 from exams e where e.id=exam_id and e.school_id=my_school()))
with check (can_see_student(student_id) and exists(select 1 from exams e where e.id=exam_id and e.school_id=my_school()));
create policy security_school on parent_links as restrictive for all to authenticated
using (exists(select 1 from profiles p where p.id=parent_id and p.school_id=my_school())
  and exists(select 1 from students s where s.id=student_id and s.school_id=my_school()))
with check (exists(select 1 from profiles p where p.id=parent_id and p.school_id=my_school())
  and exists(select 1 from students s where s.id=student_id and s.school_id=my_school()));
-- reports_teacher politikası alıcı tablosunu okur; döngülü RLS sorgusu oluşturma.
create function report_school_visible(p_report uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from reports r join exams e on e.id=r.exam_id
    where r.id=p_report and e.school_id=my_school() and can_see_student(r.student_id))
$$;
revoke all on function report_school_visible(uuid) from public,anon;
grant execute on function report_school_visible(uuid) to authenticated;
create policy security_school on report_recipients as restrictive for all to authenticated
using (report_school_visible(report_id)
  and exists(select 1 from profiles p where p.id=user_id and p.school_id=my_school()))
with check (report_school_visible(report_id)
  and exists(select 1 from profiles p where p.id=user_id and p.school_id=my_school()));
create policy security_school on ai_usage as restrictive for select to authenticated
using (exists(select 1 from profiles p where p.id=user_id and p.school_id=my_school()));
create policy security_school on audit_log as restrictive for select to authenticated
using (exists(select 1 from profiles p where p.id=user_id and p.school_id=my_school()));
