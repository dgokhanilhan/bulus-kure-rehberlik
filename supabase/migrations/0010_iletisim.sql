-- İletişim: duyurular (okul / kademe / sınıf) ve veli–öğretmen mesajlaşması.
-- Kural: veli yalnız kendi çocuğunun öğretmenleriyle, rehberlik servisiyle ve yönetimle yazışır;
-- öğretmen yalnız ders verdiği ya da sınıf öğretmeni olduğu sınıfların velileriyle. Yönetici bütün yazışmaları görebilir.

-- ---------- Kimin hangi sınıflarla ilgisi var ----------
-- öğrenci: kendi sınıfı · veli: çocuklarının sınıfları · öğretmen: sınıf öğretmenliği + ders programındaki sınıfları
create or replace function profile_classes(uid uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.class_id from profiles p join students s on s.id = p.student_id
   where p.id = uid and p.role = 'ogrenci' and p.status = 'approved' and s.class_id is not null
  union
  select s.class_id from parent_links pl join profiles p on p.id = pl.parent_id join students s on s.id = pl.student_id
   where pl.parent_id = uid and p.status = 'approved' and s.class_id is not null
  union
  select c.id from classes c join profiles p on p.id = uid and p.status = 'approved' where c.homeroom_teacher_id = uid
  union
  select t.class_id from timetable t join profiles p on p.id = uid and p.status = 'approved' where t.teacher_id = uid
$$;
revoke all on function profile_classes(uuid) from public, anon, authenticated;

-- Öğretmen bu öğrencinin sınıfında ders veriyor ya da sınıf öğretmeni mi?
create or replace function teaches_student(uid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s where s.id = sid and s.class_id in (select profile_classes(uid)))
$$;
revoke all on function teaches_student(uuid, uuid) from public, anon, authenticated;

-- ---------- Duyurular ----------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  title text not null check (length(btrim(title)) between 3 and 120),
  body text not null check (length(btrim(body)) between 1 and 4000),
  scope text not null check (scope in ('okul', 'kademe', 'sinif')),
  level text check (level in ('ilkokul', 'ortaokul', 'lise')),
  class_id uuid references classes(id) on delete cascade,
  audience text[] not null default '{veli,ogrenci}'
    check (audience <@ array['veli', 'ogrenci', 'ogretmen'] and cardinality(audience) >= 1),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  author_name text,                                     -- veli öğretmen profillerini okuyamaz; yazan adı burada
  created_at timestamptz not null default now(),
  check ((scope = 'okul' and level is null and class_id is null)
      or (scope = 'kademe' and level is not null and class_id is null)
      or (scope = 'sinif' and level is null and class_id is not null))
);
create index announcements_school on announcements (school_id, created_at desc);
alter table announcements enable row level security;

-- Duyuruyu hedef kitledeki kişi görür (öğretmen için "ogretmen", yönetici de öğretmen sayılır).
create or replace function announcement_reaches(uid uuid, a announcements) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = uid and p.status = 'approved' and p.school_id = a.school_id
      and (case when p.role in ('admin', 'ogretmen') then 'ogretmen' else p.role::text end) = any(a.audience)
      and (a.scope = 'okul'
        or (p.role = 'admin')
        or (a.scope = 'kademe' and exists (select 1 from classes c where c.id in (select profile_classes(uid)) and c.level = a.level))
        or (a.scope = 'sinif' and a.class_id in (select profile_classes(uid)))))
$$;
revoke all on function announcement_reaches(uuid, announcements) from public, anon, authenticated;

-- Politikalar yalnız oturumdaki kullanıcıyı sorar (uid alan sürümler dışarı açık değil: başkasının sınıfını sızdırmasın).
create or replace function my_classes() returns setof uuid
language sql stable security definer set search_path = public as $$ select profile_classes(auth.uid()) $$;
create or replace function announcement_visible(a announcements) returns boolean
language sql stable security definer set search_path = public as $$ select announcement_reaches(auth.uid(), a) $$;
revoke all on function my_classes() from public, anon;
revoke all on function announcement_visible(announcements) from public, anon;
grant execute on function my_classes() to authenticated;
grant execute on function announcement_visible(announcements) to authenticated;

create policy ann_read on announcements for select using (
  school_id = my_school() and (is_staff() or created_by = auth.uid() or announcement_visible(announcements)));
-- Yönetici ve rehberlik her kapsamda; öğretmen yalnız kendi sınıflarına duyuru yayınlar.
create policy ann_insert on announcements for insert with check (
  school_id = my_school() and created_by = auth.uid()
  and (is_staff() or (is_teacher() and scope = 'sinif' and class_id in (select my_classes()))));
create policy ann_delete on announcements for delete using (school_id = my_school() and (is_admin() or created_by = auth.uid()));

create or replace function announcements_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select case when p.role = 'admin' then p.full_name || ' · Okul yönetimi' when p.branch = 'Rehberlik' then p.full_name || ' · Rehberlik servisi'
              else p.full_name || ' · ' || p.branch || ' öğretmeni' end
    into new.author_name from profiles p where p.id = new.created_by;
  return new;
end $$;
create trigger announcements_author before insert on announcements
  for each row execute function announcements_author();

create or replace function announcements_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_many(
    array(select p.id from profiles p where p.school_id = new.school_id and p.status = 'approved'
            and p.id is distinct from new.created_by and announcement_reaches(p.id, new)),
    'Duyuru: ' || new.title,
    jsonb_build_object('page', 'iletisim', 'announcement', new.id));
  return null;
end $$;
create trigger announcements_notify after insert on announcements
  for each row execute function announcements_notify();

-- ---------- Mesajlaşma ----------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  student_id uuid not null references students(id) on delete cascade,
  parent_id uuid not null references profiles(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (student_id, parent_id, teacher_id)
);
create index conversations_parent on conversations (parent_id, last_at desc);
create index conversations_teacher on conversations (teacher_id, last_at desc);
alter table conversations enable row level security;
create policy conv_read on conversations for select using (
  school_id = my_school() and (parent_id = auth.uid() or teacher_id = auth.uid() or is_admin()));

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_conv on messages (conversation_id, created_at);
alter table messages enable row level security;
create policy msg_read on messages for select using (
  exists (select 1 from conversations c where c.id = conversation_id and c.school_id = my_school()
          and (c.parent_id = auth.uid() or c.teacher_id = auth.uid() or is_admin())));
-- Yazma yalnız aşağıdaki fonksiyonlarla (istemciden doğrudan insert/update yok).

-- Velinin yazışabileceği kişiler: çocuğun öğretmenleri (ders programı + sınıf öğretmeni), rehberlik, yönetim.
create or replace function child_contacts(p_student uuid)
returns table (id uuid, full_name text, branch text, role text, subjects text[], homeroom boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.branch, p.role::text,
         coalesce(array(select distinct t.subject from timetable t join students s on s.class_id = t.class_id
                        where s.id = p_student and t.teacher_id = p.id order by 1), '{}'),
         exists (select 1 from classes c join students s on s.class_id = c.id where s.id = p_student and c.homeroom_teacher_id = p.id)
  from profiles p
  where can_see_student(p_student)
    and p.school_id = my_school() and p.status = 'approved'
    and (p.role = 'admin' or (p.role = 'ogretmen' and (p.branch = 'Rehberlik' or teaches_student(p.id, p_student))))
  order by (p.role = 'admin'), p.full_name
$$;
revoke all on function child_contacts(uuid) from public, anon;
grant execute on function child_contacts(uuid) to authenticated;

-- Öğretmenin yazışabileceği veliler: ders verdiği öğrencinin (rehberlik/yönetim: her öğrencinin) onaylı velileri.
create or replace function student_parents(p_student uuid)
returns table (id uuid, full_name text, relation text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, pl.relation
  from parent_links pl join profiles p on p.id = pl.parent_id
  where pl.student_id = p_student and p.status = 'approved' and p.school_id = my_school()
    and (is_staff() or (is_teacher() and teaches_student(auth.uid(), p_student)))
  order by p.full_name
$$;
revoke all on function student_parents(uuid) from public, anon;
grant execute on function student_parents(uuid) to authenticated;

-- Yazışma başlat (varsa olanı döner). Veli çağırırsa p_other öğretmen; öğretmen/yönetici çağırırsa p_other veli.
create or replace function start_conversation(p_student uuid, p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me profiles; v_parent uuid; v_teacher uuid; v_id uuid; s students;
begin
  select * into me from profiles where id = auth.uid() and status = 'approved';
  select * into s from students where id = p_student and school_id = me.school_id;
  if me.id is null or s.id is null then raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002'; end if;
  if me.role = 'veli' then
    if not is_parent_of(p_student) then raise exception 'Yalnız kendi çocuğun için yazabilirsin.' using errcode = '42501'; end if;
    if not exists (select 1 from child_contacts(p_student) c where c.id = p_other) then
      raise exception 'Bu kişiye yazamazsın: çocuğunun öğretmenlerinden biri değil.' using errcode = '42501';
    end if;
    v_parent := me.id; v_teacher := p_other;
  elsif me.role in ('ogretmen', 'admin') then
    if not exists (select 1 from student_parents(p_student) sp where sp.id = p_other) then
      raise exception 'Bu veliye yazamazsın: öğrenci senin sınıflarından birinde değil ya da veli bağlı değil.' using errcode = '42501';
    end if;
    v_parent := p_other; v_teacher := me.id;
  else
    raise exception 'Mesajlaşma veli ve öğretmenler içindir.' using errcode = '42501';
  end if;
  insert into conversations (school_id, student_id, parent_id, teacher_id)
  values (me.school_id, p_student, v_parent, v_teacher)
  on conflict (student_id, parent_id, teacher_id) do update set last_at = conversations.last_at
  returning id into v_id;
  return v_id;
end $$;

create or replace function send_message(p_conversation uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c conversations; v_id uuid; other uuid; s students; me profiles;
begin
  select * into me from profiles where id = auth.uid() and status = 'approved';
  select * into c from conversations where id = p_conversation for update;
  if me.id is null or c.id is null or me.id not in (c.parent_id, c.teacher_id) then
    raise exception 'Yazışma bulunamadı.' using errcode = 'P0002';
  end if;
  other := case when me.id = c.parent_id then c.teacher_id else c.parent_id end;
  if not exists (select 1 from profiles where id = other and status = 'approved') then
    raise exception 'Karşı tarafın hesabı kapalı; mesaj gönderilemez.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'Mesaj boş olamaz.' using errcode = '22023'; end if;
  insert into messages (conversation_id, sender_id, body) values (c.id, me.id, btrim(p_body)) returning id into v_id;
  update conversations set last_at = now() where id = c.id;
  select * into s from students where id = c.student_id;
  perform notify_many(array[other], me.full_name || ' mesaj gönderdi (' || s.full_name || ')',
    jsonb_build_object('page', 'iletisim', 'conversation', c.id));
  return v_id;
end $$;

create or replace function mark_conversation_read(p_conversation uuid)
returns void language sql security definer set search_path = public as $$
  update messages m set read_at = now()
  from conversations c
  where c.id = p_conversation and m.conversation_id = c.id and m.read_at is null
    and m.sender_id is distinct from auth.uid() and auth.uid() in (c.parent_id, c.teacher_id)
$$;

-- Yazışma listesi: karşı taraf, öğrenci, son mesaj, okunmamış sayısı (yönetici hepsini görür).
create or replace function my_conversations()
returns table (id uuid, student_id uuid, student_name text, parent_id uuid, parent_name text, teacher_id uuid, teacher_name text,
               teacher_branch text, last_at timestamptz, last_body text, unread int)
language sql stable security definer set search_path = public as $$
  select c.id, c.student_id, s.full_name, c.parent_id, pp.full_name, c.teacher_id, tp.full_name,
         case when tp.role = 'admin' then 'Yönetim' else tp.branch end, c.last_at,
         (select m.body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
         (select count(*)::int from messages m where m.conversation_id = c.id and m.read_at is null and m.sender_id is distinct from auth.uid()
            and auth.uid() in (c.parent_id, c.teacher_id))
  from conversations c
  join students s on s.id = c.student_id
  join profiles pp on pp.id = c.parent_id
  join profiles tp on tp.id = c.teacher_id
  where c.school_id = my_school() and (c.parent_id = auth.uid() or c.teacher_id = auth.uid() or is_admin())
  order by c.last_at desc
$$;

revoke all on function start_conversation(uuid, uuid) from public, anon;
revoke all on function send_message(uuid, text) from public, anon;
revoke all on function mark_conversation_read(uuid) from public, anon;
revoke all on function my_conversations() from public, anon;
grant execute on function start_conversation(uuid, uuid) to authenticated;
grant execute on function send_message(uuid, text) to authenticated;
grant execute on function mark_conversation_read(uuid) to authenticated;
grant execute on function my_conversations() to authenticated;
