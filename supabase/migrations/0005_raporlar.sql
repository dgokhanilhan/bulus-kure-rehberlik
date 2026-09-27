-- Aşama 4 · Raporlar (veli / öğretmen), gönderme, rehber yorumu şifreleme, yapay zekâ kotası

-- Öğrenci + deneme + tür başına tek rapor (taslak düzenlenir, gönderilir; yeniden gönderilebilir).
create unique index reports_one on reports (type, student_id, exam_id);
alter table reports add column rehber_enc bytea;

-- Oluşturan/güncelleyen oturumdaki kişidir; rehber yorumu gövdeden ayrılıp şifrelenir (0003'teki Vault anahtarı).
create or replace function reports_before_write() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare r text := nullif(btrim(new.body->>'rehber'), '');
begin
  if tg_op = 'INSERT' and auth.uid() is not null then new.created_by := auth.uid(); end if;
  new.updated_at := now();
  if new.body ? 'rehber' then
    new.rehber_enc := case when r is null then null else extensions.pgp_sym_encrypt(r, notes_key()) end;
    new.body := new.body - 'rehber';
  end if;
  if length(new.body::text) > 20000 then raise exception 'Rapor çok uzun.' using errcode = '22023'; end if;
  return new;
end $$;
create trigger reports_before_write before insert or update on reports
  for each row execute function reports_before_write();

-- Rehber yorumunu yalnız yetkili okur: rehberlik/yönetim ya da raporu almış veli/öğrenci.
create or replace function report_rehber(p_report uuid) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare r reports;
begin
  select * into r from reports where id = p_report;
  if r.id is null or r.rehber_enc is null then return null; end if;
  if (is_staff() and can_see_student(r.student_id))
     or (r.type = 'veli' and r.status = 'sent' and ((r.sent_to_parent and is_parent_of(r.student_id)) or (r.sent_to_student and is_student_self(r.student_id)))) then
    return extensions.pgp_sym_decrypt(r.rehber_enc, notes_key());
  end if;
  return null;
end $$;

create view reports_view with (security_invoker = true) as
  select r.id, r.type, r.student_id, r.exam_id, r.body, r.ai_generated, r.status, r.sent_to_parent, r.sent_to_student,
         r.created_by, r.updated_at, r.sent_at, report_rehber(r.id) as rehber
  from reports r;
grant select on reports_view to authenticated;

-- 0001'deki öğretmen raporu politikası: alıcı kontrolü açıkça rapor kimliğine bağlanır.
drop policy reports_teacher on reports;
create policy reports_teacher on reports for select using (
  type = 'ogretmen' and status = 'sent'
  and exists (select 1 from report_recipients rr where rr.report_id = reports.id and rr.user_id = auth.uid()));

-- ---------- Gönder ----------
create or replace function send_report(p_report uuid, p_parent boolean default false, p_student boolean default false, p_users uuid[] default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare
  r reports;
  s students;
  e exams;
  me profiles;
  to_ids uuid[] := '{}';
begin
  if not is_staff() then raise exception 'Rapor göndermek için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  select * into r from reports where id = p_report for update;
  if r.id is null or not can_see_student(r.student_id) then raise exception 'Rapor bulunamadı.' using errcode = 'P0002'; end if;
  select * into s from students where id = r.student_id;
  select * into e from exams where id = r.exam_id;
  select * into me from profiles where id = auth.uid();

  if r.type = 'veli' then
    if not (p_parent or p_student) then raise exception 'En az bir alıcı seç.' using errcode = '22023'; end if;
    update reports set status = 'sent', sent_at = now(), sent_to_parent = p_parent, sent_to_student = p_student where id = r.id;
    to_ids := case when p_parent then array(select parent_accounts(s.id)) else '{}' end
           || case when p_student then array(select student_accounts(s.id)) else '{}' end;
    perform notify_many(to_ids, e.name || ' gelişim raporu geldi: ' || s.full_name, jsonb_build_object('report', r.id));
  else
    if coalesce(array_length(p_users, 1), 0) = 0 then raise exception 'En az bir öğretmen seç.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(p_users) u where not exists (
        select 1 from profiles p where p.id = u and p.school_id = s.school_id and p.status = 'approved' and p.role in ('ogretmen','admin'))) then
      raise exception 'Alıcı yalnız okulun onaylı öğretmenleri olabilir.' using errcode = '22023';
    end if;
    update reports set status = 'sent', sent_at = now() where id = r.id;
    delete from report_recipients where report_id = r.id;
    insert into report_recipients (report_id, user_id) select r.id, u from unnest(p_users) u on conflict do nothing;
    to_ids := p_users;
    perform notify_many(to_ids, coalesce(me.full_name, 'Rehberlik') || ' öğretmen raporu paylaştı: ' || s.full_name || ' · ' || e.name, jsonb_build_object('report', r.id));
  end if;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'send_report', 'reports', r.id, jsonb_build_object('type', r.type, 'recipients', coalesce(array_length(to_ids, 1), 0)));
  return coalesce(array_length(to_ids, 1), 0);
end $$;
revoke all on function send_report(uuid, boolean, boolean, uuid[]) from public, anon;
grant execute on function send_report(uuid, boolean, boolean, uuid[]) to authenticated;

-- ---------- Yapay zekâ kotası ----------
-- Okul ayarı (schools.settings.ai): {"dailyPerUser":60,"monthlyUsd":10,"dailyAlarmUsd":1}
create or replace function ai_quota_check(p_user uuid, p_fn text) returns text
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  school uuid;
  per_user int;
  monthly numeric;
  used_today int;
  spent_month numeric;
begin
  select p.school_id, coalesce(sc.settings->'ai', '{}') into school, s from profiles p join schools sc on sc.id = p.school_id where p.id = p_user;
  per_user := coalesce((s->>'dailyPerUser')::int, 60);
  monthly := coalesce((s->>'monthlyUsd')::numeric, 10);
  select count(*) into used_today from ai_usage where user_id = p_user and fn = p_fn and created_at > now() - interval '1 day';
  if used_today >= per_user then return 'daily'; end if;
  select coalesce(sum(u.cost_usd), 0) into spent_month from ai_usage u join profiles p on p.id = u.user_id
    where p.school_id = school and u.created_at >= date_trunc('month', now());
  if spent_month >= monthly then return 'monthly'; end if;
  return null;
end $$;

-- Günlük harcama eşiği aşılınca adminlere günde bir bildirim.
create or replace function ai_usage_alarm() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  school uuid;
  limit_usd numeric;
  today numeric;
begin
  select p.school_id, coalesce((sc.settings->'ai'->>'dailyAlarmUsd')::numeric, 1) into school, limit_usd
    from profiles p join schools sc on sc.id = p.school_id where p.id = new.user_id;
  if school is null then return new; end if;
  select coalesce(sum(u.cost_usd), 0) into today from ai_usage u join profiles p on p.id = u.user_id
    where p.school_id = school and u.created_at >= date_trunc('day', now());
  if today >= limit_usd and not exists (
      select 1 from notifications n join profiles p on p.id = n.user_id
      where p.school_id = school and n.link->>'alarm' = 'ai' and n.created_at >= date_trunc('day', now())) then
    perform notify_many(array(select admin_accounts(school)),
      'Yapay zekâ harcaması bugün ' || to_char(today, 'FM990D00') || ' $ oldu (eşik ' || to_char(limit_usd, 'FM990D00') || ' $).',
      '{"alarm":"ai","page":"bugun"}');
  end if;
  return new;
end $$;
create trigger ai_usage_alarm after insert on ai_usage for each row execute function ai_usage_alarm();

revoke all on function ai_quota_check(uuid, text) from public, anon, authenticated;
grant execute on function ai_quota_check(uuid, text) to service_role;
