-- 0021_bursluluk_seans GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir, db push bunu uygulamaz).
-- Başvuru fonksiyonlarını 0018 hallerine döndürür, kontenjan tetikleyicisini ve herkese açık takip/düzenleme fonksiyonlarını kaldırır.
-- Seans, kontenjan tabloları ve başvurulardaki seans/takip kodu sütunları SİLİNMEZ (veri kaybı olmasın).
-- "iptal" durumundaki başvurular varsa durum denetimi eski haline döndürülmez (aşağıdaki not).
-- Ön yüz de 0021 öncesi sürüme döndürülmelidir.
begin;

drop trigger if exists sch_app_capacity on scholarship_applications;
drop function if exists track_scholarship(text, text);
drop function if exists edit_scholarship(text, text, jsonb);
drop function if exists admin_add_application(uuid, uuid, uuid);

create or replace function public_scholarship_exams(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'exam_date', e.exam_date, 'starts_at', e.starts_at,
           'ends_at', e.ends_at, 'grades', e.grades, 'location', e.location, 'description', e.description, 'apply_until', e.apply_until,
           'full', e.quota is not null and (select count(*) from scholarship_applications a where a.exam_id = e.id and a.status <> 'reddedildi') >= e.quota)
         order by e.exam_date), '[]'::jsonb)
  from scholarship_exams e join schools s on s.id = e.school_id
  where s.slug = p_slug and e.active and e.applications_open
    and (school_setting(s.id, 'modul.bursluluk'))::text::boolean and (school_setting(s.id, 'bursluluk.basvuru_acik'))::text::boolean
    and (now() at time zone 'Europe/Istanbul')::date between e.apply_from and e.apply_until
$$;

create or replace function apply_scholarship(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e scholarship_exams; s schools; v_code text; n int; today date := (now() at time zone 'Europe/Istanbul')::date;
  v_name text := btrim(regexp_replace(coalesce(p->>'student_name', ''), '\s+', ' ', 'g'));
  v_parent text := btrim(regexp_replace(coalesce(p->>'parent_name', ''), '\s+', ' ', 'g'));
  v_phone text := btrim(coalesce(p->>'phone', ''));
  v_digits text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_grade int;
begin
  select * into s from schools where slug = p_slug;
  select * into e from scholarship_exams where id = (p->>'exam_id')::uuid and school_id = s.id;
  if s.id is null or e.id is null or not e.active or not e.applications_open
     or not (school_setting(s.id, 'modul.bursluluk'))::text::boolean or not (school_setting(s.id, 'bursluluk.basvuru_acik'))::text::boolean then
    raise exception 'Bu sınav için başvuru alınmıyor.' using errcode = '22023';
  end if;
  if today < e.apply_from or today > e.apply_until then raise exception 'Başvuru tarihleri dışında.' using errcode = '22023'; end if;
  if coalesce(p->>'consent_version', '') = '' then raise exception 'Aydınlatma metni onaylanmalı.' using errcode = '22023'; end if;
  begin v_grade := (p->>'grade')::int; exception when others then v_grade := null; end;
  if v_grade is null or not (v_grade = any(e.grades)) then raise exception 'Bu sınav seçilen sınıf seviyesi için değil.' using errcode = '22023'; end if;
  if length(v_name) < 3 or length(v_parent) < 3 then raise exception 'Öğrenci ve veli adını yaz.' using errcode = '22023'; end if;
  if length(v_digits) < 10 or length(v_digits) > 13 then raise exception 'Telefon numarası geçersiz.' using errcode = '22023'; end if;
  -- Kötüye kullanım: aynı telefondan son 1 saatte en fazla 5 başvuru; sınav başına dakikada en fazla 30
  select count(*) into n from scholarship_applications where regexp_replace(phone, '\D', '', 'g') = v_digits and created_at > now() - interval '1 hour';
  if n >= 5 then raise exception 'Çok fazla başvuru yapıldı; biraz sonra tekrar dene.' using errcode = '54000'; end if;
  select count(*) into n from scholarship_applications where exam_id = e.id and created_at > now() - interval '1 minute';
  if n >= 30 then raise exception 'Şu an çok yoğun; birkaç dakika sonra tekrar dene.' using errcode = '54000'; end if;
  -- Aynı öğrenci (ad + telefon) aynı sınava bir kez
  if exists (select 1 from scholarship_applications a where a.exam_id = e.id and lower(a.student_name) = lower(v_name)
             and regexp_replace(a.phone, '\D', '', 'g') = v_digits) then
    raise exception 'Bu öğrenci için bu sınava zaten başvuru yapılmış.' using errcode = '23505';
  end if;
  if e.quota is not null and (select count(*) from scholarship_applications a where a.exam_id = e.id and a.status <> 'reddedildi') >= e.quota then
    raise exception 'Kontenjan doldu.' using errcode = '22023';
  end if;
  insert into scholarship_applications (exam_id, school_id, student_name, grade, current_school, parent_name, phone, email, consent_version, source)
  values (e.id, s.id, v_name, v_grade, nullif(btrim(coalesce(p->>'current_school', '')), ''), v_parent, v_phone, v_email, left(p->>'consent_version', 40), 'form')
  returning code into v_code;
  perform notify_many(array(select admin_accounts(s.id)), 'Bursluluk başvurusu: ' || v_name || ' (' || v_grade || '. sınıf) · ' || e.name,
                      jsonb_build_object('page', 'yonetim', 'tab', 'bursluluk'));
  return jsonb_build_object('code', v_code, 'exam', e.name, 'exam_date', e.exam_date);
end $$;

create or replace function admin_add_application(p_exam uuid, p_student uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e scholarship_exams; st students; par profiles; v_id uuid; g int;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select * into e from scholarship_exams where id = p_exam and school_id = my_school();
  select * into st from students where id = p_student and school_id = my_school();
  if e.id is null or st.id is null then raise exception 'Sınav ya da öğrenci bulunamadı.' using errcode = 'P0002'; end if;
  g := split_part(st.class_name, '/', 1)::int;
  if exists (select 1 from scholarship_applications where exam_id = e.id and student_id = st.id) then
    raise exception 'Bu öğrenci için bu sınava zaten başvuru var.' using errcode = '23505';
  end if;
  select p.* into par from parent_links pl join profiles p on p.id = pl.parent_id where pl.student_id = st.id and p.status = 'approved' order by p.created_at limit 1;
  insert into scholarship_applications (exam_id, school_id, student_id, student_name, grade, current_school, parent_name, phone, email, source, status)
  values (e.id, e.school_id, st.id, st.full_name, g, (select name from schools where id = e.school_id),
          coalesce(par.full_name, 'Veli bilgisi yok'), coalesce(par.phone, '0000000000'), par.email, 'okul', 'onaylandi')
  returning id into v_id;
  return v_id;
end $$;

create or replace function sch_app_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare e scholarship_exams;
begin
  if new.student_id is null then return null; end if;
  if (new.status, new.hall, new.session_time) is not distinct from (old.status, old.hall, old.session_time) then return null; end if;
  select * into e from scholarship_exams where id = new.exam_id;
  if new.status = 'onaylandi' and (new.hall is not null or new.session_time is not null) then
    perform notify_many(array(select parent_accounts(new.student_id)) || array(select student_accounts(new.student_id)),
      'Bursluluk sınavı: ' || e.name || ' · ' || to_char(e.exam_date, 'DD.MM.YYYY') || coalesce(' · ' || to_char(new.session_time, 'HH24:MI'), '') ||
      coalesce(' · Salon ' || new.hall, ''), jsonb_build_object('page', 'okul'));
  end if;
  return null;
end $$;
revoke all on function public_scholarship_exams(text) from public;
grant execute on function public_scholarship_exams(text) to anon, authenticated;
revoke all on function apply_scholarship(text, jsonb) from public;
grant execute on function apply_scholarship(text, jsonb) to anon, authenticated;
revoke all on function admin_add_application(uuid, uuid) from public, anon;
grant execute on function admin_add_application(uuid, uuid) to authenticated;

-- Not: "iptal" durumunda başvuru yoksa eski durum denetimi de geri getirilebilir:
-- alter table scholarship_applications drop constraint scholarship_applications_status_check;
-- alter table scholarship_applications add constraint scholarship_applications_status_check check (status in ('bekliyor', 'onaylandi', 'reddedildi'));

commit;
