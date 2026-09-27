-- Aşama 5 · Etüt bildirimleri, okul ayarları, KVKK onayı, işlem kayıtları

-- ---------- Yetki düzeltmesi (0001 taslağı) ----------
-- INSERT'te yalnız WITH CHECK uygulanır; 0001'de bu koşullar yalnız okulu denetliyordu ve okulun onaylı
-- her kullanıcısı (veli dahil) deneme, öğrenci ve etüt ekleyebiliyordu. Rol koşulu WITH CHECK'e de eklendi.
drop policy students_admin on students;
create policy students_admin on students for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
drop policy exams_staff on exams;
create policy exams_staff on exams for all using (is_staff() and school_id = my_school()) with check (is_staff() and school_id = my_school());
drop policy sessions_staff on study_sessions;
create policy sessions_staff on study_sessions for all using (is_staff() and school_id = my_school()) with check (is_staff() and school_id = my_school());

-- ---------- Etüt (Cumartesi) ----------
-- Tarih bugünden önce olamaz; oluşturan oturumdaki kişidir. Cumartesi ve 1 saatlik dilim kısıtları 0001'de.
create or replace function study_sessions_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    if new.session_date < tr_today() then raise exception 'Geçmiş bir gün seçilemez.' using errcode = '22023'; end if;
  end if;
  new.topics := array(select distinct btrim(t) from unnest(new.topics) t where btrim(t) <> '');
  if coalesce(array_length(new.topics, 1), 0) = 0 then raise exception 'En az bir konu seç.' using errcode = '22023'; end if;
  return new;
end $$;
create trigger study_sessions_before before insert or update on study_sessions
  for each row execute function study_sessions_before();

create or replace function class_accounts(school uuid, cls text) returns uuid[] language sql stable security definer set search_path = public as $$
  select array(
    select p.id from profiles p join students s on s.id = p.student_id
      where s.school_id = school and s.class_name = cls and s.archived_at is null and p.status = 'approved' and p.role = 'ogrenci'
    union
    select p.id from parent_links pl join profiles p on p.id = pl.parent_id join students s on s.id = pl.student_id
      where s.school_id = school and s.class_name = cls and s.archived_at is null and p.status = 'approved')
$$;

create or replace function study_sessions_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare slot_tr text;
begin
  if tg_op = 'DELETE' then
    slot_tr := replace(old.slot, '-', '.00–') || '.00';
    perform notify_many(class_accounts(old.school_id, old.class_name),
      'Cumartesi etüdü iptal edildi: ' || tr_dw(old.session_date) || ' ' || slot_tr, '{"page":"ozet"}');
    return old;
  end if;
  slot_tr := replace(new.slot, '-', '.00–') || '.00';
  perform notify_many(class_accounts(new.school_id, new.class_name),
    'Cumartesi etüdü: ' || tr_dw(new.session_date) || ' ' || slot_tr || ' · ' ||
      case new.subject when 'TUR' then 'Türkçe' when 'MAT' then 'Matematik' when 'FEN' then 'Fen' when 'INK' then 'İnkılap' when 'DIN' then 'Din' else 'İngilizce' end
      || ' · ' || array_to_string(new.topics, ', '),
    '{"page":"ozet"}');
  return new;
end $$;
create trigger study_sessions_after after insert or delete on study_sessions
  for each row execute function study_sessions_after();

-- ---------- Okul ayarları (yalnız admin) ----------
-- settings: {"bugun":{"netDrop":3,"netRise":5,"repeatMin":3},"ai":{"dailyPerUser":60,"monthlyUsd":10,"dailyAlarmUsd":1}}
create or replace function update_school_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cur jsonb;
  b jsonb := coalesce(p->'bugun', '{}');
  a jsonb := coalesce(p->'ai', '{}');
  num numeric;
  k text;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  for k in select jsonb_object_keys(b) loop
    if k not in ('netDrop','netRise','repeatMin') then raise exception 'Geçersiz ayar: %', k using errcode = '22023'; end if;
    num := (b->>k)::numeric;
    if num is null or num < 1 or num > 50 then raise exception 'Eşik 1 ile 50 arasında olmalı.' using errcode = '22023'; end if;
  end loop;
  for k in select jsonb_object_keys(a) loop
    if k not in ('dailyPerUser','monthlyUsd','dailyAlarmUsd') then raise exception 'Geçersiz ayar: %', k using errcode = '22023'; end if;
    num := (a->>k)::numeric;
    if num is null or num < 0 or num > 10000 then raise exception 'Geçersiz değer.' using errcode = '22023'; end if;
  end loop;
  select settings into cur from schools where id = my_school() for update;
  cur := jsonb_set(jsonb_set(coalesce(cur, '{}'), '{bugun}', coalesce(cur->'bugun', '{}') || b), '{ai}', coalesce(cur->'ai', '{}') || a);
  update schools set settings = cur where id = my_school();
  insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'settings', 'schools', my_school(), p);
  return cur;
end $$;
revoke all on function update_school_settings(jsonb) from public, anon;
grant execute on function update_school_settings(jsonb) to authenticated;

-- ---------- KVKK aydınlatma / açık rıza ----------
-- Kayıtta onay zorunlu; sürüm ve tarih profilde saklanır. Metin sürümü okulun hukukçusu onayladıkça artırılır.
create or replace function handle_new_user_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text := new.raw_user_meta_data->>'consent_version';
begin
  -- Auth servisi üzerinden gelen her kayıtta (bağlantı rolü supabase_auth_admin) onay zorunlu (security definer
  -- içinde current_user fonksiyon sahibidir; bu yüzden session_user). Yalnız doğrudan veritabanı
  -- sahibinin eklediği kayıtlar (yerel seed) muaftır; istemci bunu metadata ile taklit edemez.
  if session_user = 'supabase_auth_admin' and (v is null or length(v) > 40) then
    raise exception 'Aydınlatma metni onaylanmalı.' using errcode = '22023';
  end if;
  update profiles set consent_version = v, consent_at = case when v is null then null else now() end where id = new.id;
  return new;
end $$;
-- 'zz': profili oluşturan on_auth_user_created'dan SONRA çalışmalı (trigger'lar ada göre sıralanır).
create trigger on_auth_user_zz_consent after insert on auth.users
  for each row execute function handle_new_user_consent();

-- ---------- İşlem kayıtları (admin) ----------
-- audit_log okunurken kişi adları için görünüm (yalnız admin; RLS audit_admin).
create view audit_view with (security_invoker = true) as
  select a.id, a.created_at, a.action, a.entity, a.entity_id, a.meta, a.user_id, p.full_name as user_name
  from audit_log a left join profiles p on p.id = a.user_id;
grant select on audit_view to authenticated;

-- Rehber notu okunduğunda kayıt: istemci, notlar sekmesi açıldığında bir kez çağırır (GET salt okunur olduğundan ayrı RPC).
create or replace function log_view(p_entity text, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_entity not in ('rehber_notlari','rapor') then raise exception 'Geçersiz kayıt türü' using errcode = '22023'; end if;
  if not (is_staff() and can_see_student(p_student)) then return; end if;
  insert into audit_log (user_id, action, entity, entity_id) values (auth.uid(), 'view', p_entity, p_student);
end $$;
revoke all on function log_view(text, uuid) from public, anon;
grant execute on function log_view(text, uuid) to authenticated;
