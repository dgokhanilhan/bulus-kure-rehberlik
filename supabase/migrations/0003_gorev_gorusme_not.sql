-- Aşama 2 · Görevler, görüşmeler, notlar, bildirimler, günlük iş
-- Bildirimler trigger'larla veritabanında üretilir: istemci bildirim yazamaz, atlayamaz.

-- ---------- Türkçe tarih yardımcıları ----------
create or replace function tr_d(d date) returns text language sql immutable as $$
  select extract(day from d)::int || ' ' ||
    (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[extract(month from d)::int]
$$;
create or replace function tr_dw(d date) returns text language sql immutable as $$
  select tr_d(d) || ' ' || (array['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'])[extract(isodow from d)::int]
$$;
-- Okulun saat dilimi: Türkiye
create or replace function tr_local(t timestamptz) returns timestamp language sql immutable as $$ select t at time zone 'Europe/Istanbul' $$;
create or replace function tr_today() returns date language sql stable as $$ select (now() at time zone 'Europe/Istanbul')::date $$;
create or replace function tr_hm(t timestamptz) returns text language sql immutable as $$ select to_char(tr_local(t), 'HH24:MI') $$;
create or replace function first_name(n text) returns text language sql immutable as $$ select split_part(btrim(n), ' ', 1) $$;

-- ---------- Alıcılar ----------
create or replace function student_accounts(sid uuid) returns setof uuid language sql stable security definer set search_path = public as
$$ select id from profiles where role = 'ogrenci' and status = 'approved' and student_id = sid $$;
create or replace function parent_accounts(sid uuid) returns setof uuid language sql stable security definer set search_path = public as
$$ select p.id from parent_links pl join profiles p on p.id = pl.parent_id where pl.student_id = sid and p.status = 'approved' $$;
create or replace function admin_accounts(school uuid) returns setof uuid language sql stable security definer set search_path = public as
$$ select id from profiles where school_id = school and role = 'admin' and status = 'approved' $$;
create or replace function staff_accounts(school uuid) returns setof uuid language sql stable security definer set search_path = public as
$$ select id from profiles where school_id = school and status = 'approved' and (role = 'admin' or (role = 'ogretmen' and branch = 'Rehberlik')) $$;

create or replace function notify_many(ids uuid[], msg text, lnk jsonb) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, text, link)
  select distinct u, msg, lnk from unnest(ids) u where u is not null
$$;
revoke all on function notify_many(uuid[], text, jsonb) from public, anon, authenticated;

-- ---------- Görevler ----------
-- Sütun kısıtı (0002) sistemin kendi işlemlerine uygulanmaz: zamanlanmış iş (oturum yok)
-- ve haftalık kopya gibi security definer fonksiyonların yaptığı güncellemeler.
create or replace function guard_task_student_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('bk.internal', true), '') = 'on' or is_staff() then return new; end if;
  if (new.id, new.student_id, new.subject, new.topic, new.outcome_code, new.question_count, new.due_date,
      new.weekly, new.parent_visible, new.note, new.created_by, new.created_at, new.overdue_notified_at, new.spawned_next)
     is distinct from
     (old.id, old.student_id, old.subject, old.topic, old.outcome_code, old.question_count, old.due_date,
      old.weekly, old.parent_visible, old.note, old.created_by, old.created_at, old.overdue_notified_at, old.spawned_next) then
    raise exception 'Görevde yalnız ilerleme güncellenebilir' using errcode = '42501';
  end if;
  return new;
end $$;

-- Oluşturan her zaman oturumdaki kullanıcıdır; son gün geçmiş olamaz.
create or replace function tasks_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.solved := least(greatest(new.solved, 0), new.question_count);
  end if;
  if (tg_op = 'INSERT' or new.due_date is distinct from old.due_date) and auth.uid() is not null and new.due_date < tr_today() then
    raise exception 'Son gün bugünden önce olamaz.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    if new.due_date is distinct from old.due_date then new.overdue_notified_at := null; end if;
    new.solved := least(greatest(new.solved, 0), new.question_count);
  end if;
  -- Tamamlanma, çözülen sayıdan türetilir.
  if new.solved >= new.question_count then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
-- 'tasks_zz_' öneki: 0002'deki öğrenci sütun kısıtından (tasks_student_guard) SONRA çalışır.
create trigger tasks_zz_before_write before insert or update on tasks
  for each row execute function tasks_before_write();

create or replace function tasks_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare s students;
begin
  if tg_op = 'DELETE' then
    perform notify_many(array(select student_accounts(old.student_id)), 'Görevin kaldırıldı: ' || old.topic, '{"page":"gorevler"}');
    return old;
  end if;
  select * into s from students where id = new.student_id;

  if tg_op = 'INSERT' then
    -- Haftalık kopya kendi "yenilendi" bildirimini gönderir (spawn_weekly_copy).
    if coalesce(current_setting('bk.skip_task_notify', true), '') = 'on' then return new; end if;
    perform notify_many(array(select student_accounts(s.id)),
      'Yeni görev: ' || new.topic || ' · ' || new.question_count || ' soru · son gün ' || tr_d(new.due_date) || case when new.weekly then ' · her hafta' else '' end,
      '{"page":"gorevler"}');
    if new.parent_visible then
      perform notify_many(array(select parent_accounts(s.id)),
        first_name(s.full_name) || ' için yeni görev: ' || new.topic || ' · ' || new.question_count || ' soru', '{"page":"gorevler"}');
    end if;
    return new;
  end if;

  -- Görev tanımı değiştiyse (öğretmen düzenlemesi) öğrenciye haber ver.
  if (new.subject, new.topic, new.question_count, new.due_date, new.weekly, new.parent_visible, new.note)
     is distinct from (old.subject, old.topic, old.question_count, old.due_date, old.weekly, old.parent_visible, old.note) then
    perform notify_many(array(select student_accounts(s.id)),
      'Görevin güncellendi: ' || new.topic || ' · son gün ' || tr_d(new.due_date), '{"page":"gorevler"}');
  end if;

  -- Tamamlandı: görevi verene ve (veli görüyorsa) veliye bildirim; haftalıksa yeni kopya.
  if new.completed_at is not null and old.completed_at is null then
    perform notify_many(array[new.created_by] || case when new.parent_visible then array(select parent_accounts(s.id)) else '{}'::uuid[] end,
      s.full_name || ' görevini tamamladı: ' || new.topic,
      jsonb_build_object('page', 'ogrenci', 'sid', s.id, 'tab', 'gorevler'));
    if new.weekly and not new.spawned_next then
      perform spawn_weekly_copy(new.id);
    end if;
  end if;
  return new;
end $$;

-- Haftalık görevin 7 gün sonrasına kopyası (bir kez).
create or replace function spawn_weekly_copy(p_task uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t tasks;
  nd date;
  new_id uuid;
begin
  perform set_config('bk.internal', 'on', true);
  update tasks set spawned_next = true where id = p_task and weekly and not spawned_next returning * into t;
  perform set_config('bk.internal', 'off', true);
  if t.id is null then return null; end if;
  nd := greatest(t.due_date, tr_today()) + 7;
  perform set_config('bk.skip_task_notify', 'on', true);
  insert into tasks (student_id, subject, topic, outcome_code, question_count, due_date, weekly, parent_visible, note, created_by)
  values (t.student_id, t.subject, t.topic, t.outcome_code, t.question_count, nd, true, t.parent_visible, t.note, t.created_by)
  returning id into new_id;
  perform set_config('bk.skip_task_notify', 'off', true);
  perform notify_many(array(select student_accounts(t.student_id)),
    'Haftalık görevin yenilendi: ' || t.topic || ' · ' || t.question_count || ' soru · son gün ' || tr_d(nd), '{"page":"gorevler"}');
  return new_id;
end $$;
revoke all on function spawn_weekly_copy(uuid) from public, anon, authenticated;

create trigger tasks_after_write after insert or update or delete on tasks
  for each row execute function tasks_after_write();

-- ---------- Görüşmeler ----------
create or replace function meetings_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then new.created_by := auth.uid(); end if;
  if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at) and auth.uid() is not null
     and tr_local(new.starts_at)::date < tr_today() then
    raise exception 'Geçmiş bir gün seçilemez.' using errcode = '22023';
  end if;
  -- Zaman ya da katılımcı değişirse önceki yanıt geçersiz olur.
  if tg_op = 'UPDATE' and (new.starts_at, new.with_whom) is distinct from (old.starts_at, old.with_whom) then
    new.reply := null; new.replied_by := null;
  end if;
  return new;
end $$;
create trigger meetings_zz_before_write before insert or update on meetings
  for each row execute function meetings_before_write();

create or replace function meeting_recipients(sid uuid, w meeting_with) returns uuid[] language sql stable security definer set search_path = public as $$
  select array(select parent_accounts(sid) where w <> 'ogrenci') || array(select student_accounts(sid) where w <> 'veli')
$$;

create or replace function meetings_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s students;
  who text;
  lnk jsonb := jsonb_build_object('page', 'gorusmeler', 'meeting', new.id);
begin
  select * into s from students where id = new.student_id;
  if tg_op = 'INSERT' then
    perform notify_many(meeting_recipients(s.id, new.with_whom),
      'Görüşme planlandı: ' || tr_dw(tr_local(new.starts_at)::date) || ' ' || tr_hm(new.starts_at) || coalesce(' · ' || nullif(new.note, ''), ''), lnk);
    return new;
  end if;
  if new.canceled_at is not null and old.canceled_at is null then
    perform notify_many(meeting_recipients(s.id, old.with_whom),
      'Görüşme iptal edildi: ' || tr_d(tr_local(old.starts_at)::date) || ' ' || tr_hm(old.starts_at), '{"page":"gorusmeler"}');
    return new;
  end if;
  if (new.starts_at, new.with_whom, new.note) is distinct from (old.starts_at, old.with_whom, old.note) then
    perform notify_many(meeting_recipients(s.id, new.with_whom) || meeting_recipients(s.id, old.with_whom),
      case when new.starts_at is distinct from old.starts_at
        then 'Görüşme saati değişti: ' || tr_d(tr_local(old.starts_at)::date) || ' ' || tr_hm(old.starts_at) || ' → ' || tr_dw(tr_local(new.starts_at)::date) || ' ' || tr_hm(new.starts_at)
        else 'Görüşme güncellendi: ' || tr_dw(tr_local(new.starts_at)::date) || ' ' || tr_hm(new.starts_at) end,
      lnk);
  end if;
  if new.reply is not null and new.reply is distinct from old.reply then
    select full_name into who from profiles where id = new.replied_by;
    perform notify_many(array[new.created_by],
      coalesce(who, 'Veli/öğrenci') || case when new.reply = 'ok' then ' görüşmeye katılacağını bildirdi: ' else ' başka bir zaman istedi: ' end
        || s.full_name || ' · ' || tr_d(tr_local(new.starts_at)::date) || ' ' || tr_hm(new.starts_at),
      jsonb_build_object('page', 'ogrenci', 'sid', s.id, 'tab', 'gorusmeler'));
  end if;
  return new;
end $$;
create trigger meetings_after_write after insert or update on meetings
  for each row execute function meetings_after_write();

-- Görüşmeler silinmez, iptal edilir (canceled_at). İptal edilmiş görüşmeye yanıt verilemez.
drop policy meetings_reply on meetings;
create policy meetings_reply on meetings for update using (
  canceled_at is null and (
    (is_parent_of(student_id) and with_whom in ('veli','ikisi')) or (is_student_self(student_id) and with_whom in ('ogrenci','ikisi'))));

-- ---------- Notlar: rehber notu şifreli ----------
-- Anahtar Vault'ta, her ortamda ayrı ve rastgele üretilir; repoda yoktur.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notes_key', 'Rehberlik notu şifreleme anahtarı')
where not exists (select 1 from vault.secrets where name = 'notes_key');

create or replace function notes_key() returns text language sql stable security definer set search_path = public as
$$ select decrypted_secret from vault.decrypted_secrets where name = 'notes_key' $$;
revoke all on function notes_key() from public, anon, authenticated;

create or replace function notes_before_write() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  new.body := nullif(btrim(new.body), '');
  if new.visibility = 'rehber' then
    if new.body is null then raise exception 'Not boş olamaz.' using errcode = '22023'; end if;
    new.body_enc := extensions.pgp_sym_encrypt(new.body, notes_key());
    new.body := null;
  elsif new.body is null then
    raise exception 'Not boş olamaz.' using errcode = '22023';
  end if;
  if length(coalesce(new.body, '')) > 4000 then raise exception 'Not çok uzun.' using errcode = '22023'; end if;
  return new;
end $$;
create trigger notes_before_write before insert on notes
  for each row execute function notes_before_write();

-- Şifreli metni yalnız rehber/yönetim çözer; başkası için NULL.
create or replace function note_body(p_note uuid) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare n notes;
begin
  select * into n from notes where id = p_note;
  if n.id is null then return null; end if;
  if n.visibility <> 'rehber' then return n.body; end if;
  if not (is_staff() and can_see_student(n.student_id)) then return null; end if;
  return extensions.pgp_sym_decrypt(n.body_enc, notes_key());
end $$;

-- Arayüz notları bu görünümden okur: satırlar çağıranın RLS'iyle süzülür (security_invoker).
create view notes_view with (security_invoker = true) as
  select n.id, n.student_id, n.author_id, n.visibility, n.created_at,
         case when n.visibility = 'rehber' then note_body(n.id) else n.body end as body
  from notes n;
grant select on notes_view to authenticated;

create or replace function notes_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare s students; a profiles;
begin
  select * into s from students where id = new.student_id;
  select * into a from profiles where id = new.author_id;
  if new.visibility = 'veli' then
    perform notify_many(array(select parent_accounts(s.id)), 'Öğretmen notu: ' || left(new.body, 80), '{"page":"ozet"}');
  end if;
  if a.role = 'ogretmen' and coalesce(a.branch, '') <> 'Rehberlik' then
    perform notify_many(array(select staff_accounts(s.school_id)), a.full_name || ' not ekledi: ' || s.full_name,
      jsonb_build_object('page', 'ogrenci', 'sid', s.id, 'tab', 'notlar'));
  end if;
  return new;
end $$;
create trigger notes_after_insert after insert on notes
  for each row execute function notes_after_insert();

-- ---------- Günlük iş (pg_cron) ----------
-- 1) Son günü geçmiş, tamamlanmamış görev → adminlere "Görev aksadı" (bir kez)
-- 2) Süresi dolan haftalık görev → 7 gün sonrasına kopya
create or replace function gunluk_isler() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t record;
  n_over int := 0;
  n_spawn int := 0;
begin
  for t in
    select tk.*, s.full_name, s.school_id from tasks tk join students s on s.id = tk.student_id
    where tk.completed_at is null and tk.due_date < tr_today() and tk.overdue_notified_at is null
    for update of tk
  loop
    update tasks set overdue_notified_at = now() where id = t.id;
    perform notify_many(array(select admin_accounts(t.school_id)),
      'Görev aksadı: ' || t.full_name || ' · ' || t.topic || ' (' || t.solved || '/' || t.question_count || ', son gün ' || tr_d(t.due_date) || ')',
      jsonb_build_object('page', 'ogrenci', 'sid', t.student_id, 'tab', 'gorevler'));
    n_over := n_over + 1;
  end loop;
  for t in select id from tasks where weekly and not spawned_next and completed_at is null and due_date < tr_today() loop
    perform spawn_weekly_copy(t.id);
    n_spawn := n_spawn + 1;
  end loop;
  return jsonb_build_object('gecikme_bildirimi', n_over, 'haftalik_kopya', n_spawn);
end $$;
revoke all on function gunluk_isler() from public, anon, authenticated;
grant execute on function gunluk_isler() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
-- Her gün 07.00 (Türkiye) = 04.00 UTC
select cron.schedule('gunluk-isler', '0 4 * * *', $$select public.gunluk_isler()$$);
