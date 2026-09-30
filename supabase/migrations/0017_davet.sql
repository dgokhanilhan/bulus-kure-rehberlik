-- Faz F · Yöneticinin öğretmen ve veli hesabı açması (davet).
-- Akış: Yönetim ekranı → Edge Function "admin-davet" (JWT + yönetici + iki adımlı doğrulama/aal2 denetimi) →
-- davet niyeti (invite_intents) + Supabase Auth Admin inviteUserByEmail (kişiye şifre belirleme bağlantısı gider;
-- yönetici şifreyi görmez/belirlemez) →
-- finish_invite() profili onaylar, velide öğrenci bağlarını, öğretmende ders atamalarını ve sınıf öğretmenliğini yazar.
-- Davetle açılan kişi KVKK aydınlatma metnini ilk girişinde onaylar (accept_consent).
-- service_role anahtarı yalnız Edge Function ortamındadır; tarayıcıya çıkmaz.

alter table profiles add column phone text check (phone is null or phone ~ '^[0-9 +()-]{7,20}$');
alter table profiles add column invited_at timestamptz;
alter table profiles add column invited_by uuid references profiles(id) on delete set null;

-- Davet niyeti: Edge Function (service_role) hesabı açmadan hemen önce e-postayı buraya yazar. İstemcinin bu tabloya
-- hiçbir erişimi yoktur (RLS açık, politika yok); bu yüzden kayıt formundan "davetliyim" taklit edilemez.
create table invite_intents (
  email text primary key,
  admin_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table invite_intents enable row level security;

-- KVKK: 10 dakika içinde davet niyeti yazılmış e-postayla açılan hesapta onay kayıtta aranmaz; kişi ilk girişinde onaylar.
-- Kendi kendine kayıtta kural aynen geçerli (0006).
create or replace function handle_new_user_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := new.raw_user_meta_data->>'consent_version';
  invited boolean := exists (select 1 from invite_intents i where i.email = lower(new.email) and i.created_at > now() - interval '10 minutes');
begin
  if session_user = 'supabase_auth_admin' and not invited and (v is null or length(v) > 40) then
    raise exception 'Aydınlatma metni onaylanmalı.' using errcode = '22023';
  end if;
  if v is not null and length(v) > 40 then v := null; end if;
  update profiles set consent_version = case when not invited then v end,
                      consent_at = case when not invited and v is not null then now() end
  where id = new.id;
  delete from invite_intents where email = lower(new.email);
  return new;
end $$;

create or replace function accept_consent(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_version is null or length(p_version) > 40 then raise exception 'Sürüm geçersiz.' using errcode = '22023'; end if;
  update profiles set consent_version = p_version, consent_at = now() where id = auth.uid();
  insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'consent', 'profiles', auth.uid(), jsonb_build_object('version', p_version));
end $$;
revoke all on function accept_consent(text) from public, anon;
grant execute on function accept_consent(text) to authenticated;

-- Davet tamamlama (yalnız Edge Function / service_role). Yöneticinin yetkisi fonksiyonda da yeniden denetlenir.
-- p: {"role","phone","branch","students":[{"student_id","relation"}],"assignments":[{"class_id","course_id"}],"homeroom_class_id"}
create or replace function finish_invite(p_user uuid, p_admin uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles; u profiles; it jsonb;
begin
  select * into a from profiles where id = p_admin and role = 'admin' and status = 'approved';
  select * into u from profiles where id = p_user;
  if a.id is null or u.id is null or u.school_id <> a.school_id then raise exception 'Davet tamamlanamadı.' using errcode = '42501'; end if;
  update profiles set status = 'approved', approved_by = a.id, approved_at = now(), invited_at = now(), invited_by = a.id,
                      phone = nullif(btrim(coalesce(p->>'phone', '')), '')
  where id = u.id;
  if u.role = 'veli' then
    for it in select * from jsonb_array_elements(coalesce(p->'students', '[]')) loop
      if not exists (select 1 from students where id = (it->>'student_id')::uuid and school_id = a.school_id) then
        raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002';
      end if;
      insert into parent_links (parent_id, student_id, relation)
      values (u.id, (it->>'student_id')::uuid, case when it->>'relation' in ('Anne', 'Baba', 'Vasi', 'Diğer') then it->>'relation' else 'Diğer' end)
      on conflict do nothing;
    end loop;
  elsif u.role = 'ogretmen' then
    for it in select * from jsonb_array_elements(coalesce(p->'assignments', '[]')) loop
      insert into teaching_assignments (school_id, class_id, course_id, teacher_id)
      values (a.school_id, (it->>'class_id')::uuid, (it->>'course_id')::uuid, u.id) on conflict do nothing;
    end loop;
    if p->>'homeroom_class_id' is not null then
      update classes set homeroom_teacher_id = u.id where id = (p->>'homeroom_class_id')::uuid and school_id = a.school_id;
    end if;
  end if;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (a.id, 'invite', 'profiles', u.id, jsonb_build_object('role', u.role, 'email', u.email,
          'students', jsonb_array_length(coalesce(p->'students', '[]')), 'assignments', jsonb_array_length(coalesce(p->'assignments', '[]'))));
end $$;
revoke all on function finish_invite(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function finish_invite(uuid, uuid, jsonb) to service_role;

-- Hesapların davet/giriş durumu (yalnız yönetici): davet bekliyor mu, hiç giriş yaptı mı.
create or replace function admin_user_states() returns table (id uuid, invited_at timestamptz, last_sign_in_at timestamptz, confirmed boolean)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.invited_at, u.last_sign_in_at, u.email_confirmed_at is not null
  from profiles p join auth.users u on u.id = p.id
  where is_admin() and p.school_id = my_school()
$$;
revoke all on function admin_user_states() from public, anon;
grant execute on function admin_user_states() to authenticated;
