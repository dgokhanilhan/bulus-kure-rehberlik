-- BK Akıllı Yoklama (pilot): akıllı tahtadan sabah yoklaması ve veliye toplu bildirim.
-- Pilot sınıf = idarenin tahta bağladığı sınıf (tahta tablosunda satırı olan). Başka sınıflarda hiçbir davranış değişmez:
-- yoklama bildirimi eskisi gibi kayıt anında gider.
-- Pilot sınıfta "gelmedi / geç geldi" bildirimi yoklama.bildirim_saati'ne (varsayılan 10:00) kadar bekler ve o anki son
-- duruma göre gider; saat geçtikten sonraki değişiklik veliye "Düzeltme: …" olarak hemen gider.
-- Tahta kimliği: idarenin verdiği tek kullanımlık eşleştirme kodu → tahtaya 256 bit gizli anahtar (veritabanında yalnız özeti).
-- Öğretmen kimliği: sistemin verdiği, okul içinde benzersiz 4 haneli PIN (vault anahtarıyla HMAC; düz PIN saklanmaz).
-- Yanlış PIN: 10 dakikada 5 → tahta 10 dk kilit + idareye bildirim; günde 10 → idare açana kadar kilit.
-- Geri alma: supabase/geri-alma/0080_tahta_yoklama_geri_al.sql

-- ---------- Ayar ----------
alter function setting_spec() rename to setting_spec_before_0080;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0080() || '{
    "yoklama.bildirim_saati":{"type":"enum","values":["anlik","09:30","09:40","10:00","10:30","11:00","12:00"],"default":"10:00"}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'tahta_pin_key', 'Tahta yoklama PIN özeti anahtarı');

-- ---------- Tablolar ----------
create table tahta (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null unique references classes(id) on delete cascade,
  ad text not null check (char_length(btrim(ad)) between 2 and 60),
  token_hash text unique,
  kod_hash text unique,
  kod_son timestamptz,
  eslesti_at timestamptz,
  son_gorulme timestamptz,
  kilit_acik_at timestamptz,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table tahta enable row level security;   -- politika yok: yalnız aşağıdaki fonksiyonlar okur/yazar
revoke all on tahta from anon, authenticated;

create table tahta_pin (
  profile_id uuid primary key references profiles(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  son_kullanim timestamptz,
  son_tahta uuid references tahta(id) on delete set null,
  unique (school_id, pin_hash)
);
alter table tahta_pin enable row level security;
revoke all on tahta_pin from anon, authenticated;

create table tahta_deneme (
  id bigint generated always as identity primary key,
  tahta_id uuid not null references tahta(id) on delete cascade,
  at timestamptz not null default now(),
  basarili boolean not null
);
create index tahta_deneme_tahta on tahta_deneme (tahta_id, at);
alter table tahta_deneme enable row level security;
revoke all on tahta_deneme from anon, authenticated;

-- Hangi sınıfın yoklaması kimce, ne zaman alındı (geleni kayıt tutulmadığı için "alındı" bilgisi buradan)
create table yoklama_oturum (
  class_id uuid not null references classes(id) on delete cascade,
  day date not null,
  school_id uuid not null references schools(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  tahta_id uuid references tahta(id) on delete set null,
  at timestamptz not null default now(),
  duzeltme int not null default 0,
  primary key (class_id, day)
);
alter table yoklama_oturum enable row level security;
create policy yoklama_oturum_read on yoklama_oturum for select using (is_teacher() and school_id = my_school());
revoke insert, update, delete on yoklama_oturum from anon, authenticated;

-- Pilot sınıf bildirim kuyruğu: gonderilen = veliye en son bildirilen durum (null: hiç bildirilmedi)
create table yoklama_bildirim (
  student_id uuid not null references students(id) on delete cascade,
  day date not null,
  school_id uuid not null references schools(id) on delete cascade,
  gonderilen text check (gonderilen in ('geldi', 'devamsiz', 'gec', 'izinli', 'raporlu')),
  islendi boolean not null default false,
  primary key (student_id, day)
);
create index yoklama_bildirim_bekleyen on yoklama_bildirim (day) where not islendi;
alter table yoklama_bildirim enable row level security;
revoke all on yoklama_bildirim from anon, authenticated;

-- Kaydın kaynağı: tahtadan mı, siteden mi. İdarenin siteden girdiği izinli/raporlu tahtada kilitli görünür.
alter table attendance add column kaynak text not null default 'site' check (kaynak in ('site', 'tahta'));

create function attendance_kaynak() returns trigger language plpgsql as $$
begin
  new.kaynak := case when current_setting('bk.tahta', true) = '1' then 'tahta' else 'site' end;
  return new;
end $$;
create trigger attendance_kaynak before insert or update on attendance
  for each row execute function attendance_kaynak();

-- ---------- Bildirim ----------
create function yoklama_pilot(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s join tahta t on t.class_id = s.class_id and t.school_id = s.school_id where s.id = p_student)
$$;
revoke all on function yoklama_pilot(uuid) from public, anon, authenticated;

-- Pilot öğrencinin o günkü bildirim anı; null = beklemeden (ayar "anlik" ya da pilot değil).
create function yoklama_bildirim_ani(p_student uuid, p_day date) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when v is null or v = 'anlik' then null else (p_day + v::time) at time zone 'Europe/Istanbul' end
  from (select (school_setting(s.school_id, 'yoklama.bildirim_saati'))#>>'{}' v from students s where s.id = p_student) x
  where yoklama_pilot(p_student)
$$;
revoke all on function yoklama_bildirim_ani(uuid, date) from public, anon, authenticated;

-- O anki duruma göre veliye/öğrenciye bildirir (gerekirse "Düzeltme"); kuyruk satırını işlendi yapar.
create function yoklama_bildir(p_student uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare s students; cur text; q yoklama_bildirim; msg text; dd text := to_char(p_day, 'DD.MM.YYYY');
begin
  select * into s from students where id = p_student;
  if s.id is null then return; end if;
  select status into cur from attendance where student_id = p_student and day = p_day;
  cur := coalesce(cur, 'geldi');
  select * into q from yoklama_bildirim where student_id = p_student and day = p_day for update;
  if q.gonderilen is null then
    if cur in ('devamsiz', 'gec') then
      msg := s.full_name || ' ' || dd || ' günü ' || case cur when 'devamsiz' then 'okula gelmedi.' else 'okula geç geldi.' end;
    end if;
  elsif q.gonderilen <> cur then
    msg := 'Düzeltme: ' || s.full_name || ' ' || dd || ' günü ' || case cur
      when 'devamsiz' then 'okula gelmedi.' when 'gec' then 'okula geç geldi.' when 'geldi' then 'okuldaydı.'
      when 'izinli' then 'izinli sayıldı.' else 'raporlu sayıldı.' end;
  end if;
  if msg is not null then
    perform notify_many(array(select parent_accounts(s.id)) || array(select student_accounts(s.id)), msg, jsonb_build_object('page', 'okul'));
  end if;
  insert into yoklama_bildirim (student_id, day, school_id, gonderilen, islendi)
  values (p_student, p_day, s.school_id, case when msg is not null then cur else q.gonderilen end, true)
  on conflict (student_id, day) do update set gonderilen = excluded.gonderilen, islendi = true;
end $$;
revoke all on function yoklama_bildir(uuid, date) from public, anon, authenticated;

-- Pilot öğrencinin (öğrenci, gün) kaydı değişti: saat gelmediyse kuyruğa, geldiyse hemen.
create function yoklama_degisti(p_student uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare due timestamptz := yoklama_bildirim_ani(p_student, p_day);
begin
  if due is not null and now() < due then
    insert into yoklama_bildirim (student_id, day, school_id)
    select p_student, p_day, s.school_id from students s where s.id = p_student
    on conflict (student_id, day) do update set islendi = false;
  else
    perform yoklama_bildir(p_student, p_day);
  end if;
end $$;
revoke all on function yoklama_degisti(uuid, date) from public, anon, authenticated;

-- Pilot dışı sınıflar: 0009'daki davranışın aynısı (değişiklik yok). Pilot sınıflar: kuyruklu bildirim.
create or replace function attendance_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare s students; label text;
begin
  if tg_op = 'UPDATE' and old.status = new.status and old.day = new.day then return null; end if;
  if tg_op in ('UPDATE', 'DELETE') and yoklama_pilot(old.student_id) then
    perform yoklama_degisti(old.student_id, old.day);
  end if;
  if tg_op = 'DELETE' then return null; end if;
  if yoklama_pilot(new.student_id) then
    if tg_op = 'INSERT' or old.day <> new.day or old.student_id <> new.student_id then perform yoklama_degisti(new.student_id, new.day); end if;
    return null;
  end if;
  if new.status not in ('devamsiz', 'gec') then return null; end if;
  select * into s from students where id = new.student_id;
  label := case new.status when 'devamsiz' then 'okula gelmedi' else 'okula geç geldi' end;
  perform notify_many(array(select parent_accounts(s.id)) || array(select student_accounts(s.id)),
    s.full_name || ' ' || to_char(new.day, 'DD.MM.YYYY') || ' günü ' || label || '.',
    jsonb_build_object('page', 'okul'));
  return null;
end $$;
drop trigger attendance_notify on attendance;
create trigger attendance_notify after insert or update or delete on attendance
  for each row execute function attendance_notify();

-- Saati gelen bekleyen bildirimler (dakikada bir). p_simdi yalnız testler için.
create function yoklama_bildirim_gonder(p_simdi timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select student_id, day from yoklama_bildirim
           where not islendi and coalesce(yoklama_bildirim_ani(student_id, day), '-infinity') <= p_simdi loop
    perform yoklama_bildir(r.student_id, r.day);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function yoklama_bildirim_gonder(timestamptz) from public, anon, authenticated;
grant execute on function yoklama_bildirim_gonder(timestamptz) to service_role;
select cron.schedule('yoklama-bildirim', '* * * * *', $$select public.yoklama_bildirim_gonder()$$);

-- ---------- Yardımcılar ----------
create function tahta_bugun() returns date language sql stable as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

create function tahta_ozet(p text) returns text language sql immutable set search_path = public as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;
revoke all on function tahta_ozet(text) from public, anon, authenticated;

create function tahta_pin_ozet(p_school uuid, p_pin text) returns text
language sql stable security definer set search_path = public as $$
  select encode(extensions.hmac(p_school::text || ':' || p_pin,
    (select decrypted_secret from vault.decrypted_secrets where name = 'tahta_pin_key'), 'sha256'), 'hex')
$$;
revoke all on function tahta_pin_ozet(uuid, text) from public, anon, authenticated;

-- Eşleştirme kodu: XXXX-XXXX, 32 harflik alfabe (0/O/1/I yok), 40 bit
create function tahta_kod_uret() returns text language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); c text := ''; i int;
begin
  for i in 0..7 loop c := c || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return substr(c, 1, 4) || '-' || substr(c, 5, 4);
end $$;
revoke all on function tahta_kod_uret() from public, anon, authenticated;

create function tahta_kod_norm(p text) returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- Token'dan tahta; yoksa hata.
create function tahta_bul(p_token text) returns tahta
language plpgsql security definer set search_path = public as $$
declare t tahta;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Bu tahta okula bağlı değil.' using errcode = '28000'; end if;
  select * into t from tahta where token_hash = tahta_ozet(p_token);
  if t.id is null then raise exception 'Bu tahta okula bağlı değil.' using errcode = '28000'; end if;
  update tahta set son_gorulme = now() where id = t.id;
  return t;
end $$;
revoke all on function tahta_bul(text) from public, anon, authenticated;

-- Kilit: idarenin son açışından sonra, 10 dakikada 5 yanlış → son yanlıştan 10 dk; bugün 10 yanlış → 'infinity'.
create function tahta_kilit(p_tahta uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  with t as (select greatest(coalesce(kilit_acik_at, '-infinity'), (tahta_bugun()::timestamp at time zone 'Europe/Istanbul')) basla from tahta where id = p_tahta),
       f as (select d.at from tahta_deneme d, t where d.tahta_id = p_tahta and not d.basarili and d.at > t.basla)
  select case
    when (select count(*) from f) >= 10 then 'infinity'::timestamptz
    when (select count(*) from f where at > now() - interval '10 minutes') >= 5 and (select max(at) from f) + interval '10 minutes' > now()
      then (select max(at) from f) + interval '10 minutes'
  end
$$;
revoke all on function tahta_kilit(uuid) from public, anon, authenticated;

create function tahta_sinif_listesi(p_school uuid, p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'ad', c.name,
    'alindi', case when o.class_id is null then null else jsonb_build_object('kim', p.full_name, 'saat', to_char(o.at at time zone 'Europe/Istanbul', 'HH24:MI')) end)
    order by c.grade, c.section), '[]')
  from tahta t join classes c on c.id = t.class_id
  left join yoklama_oturum o on o.class_id = c.id and o.day = p_day
  left join profiles p on p.id = o.profile_id
  where t.school_id = p_school
$$;
revoke all on function tahta_sinif_listesi(uuid, date) from public, anon, authenticated;

-- ---------- Tahtanın çağırdıkları (anon anahtarla; kimlik = tahta token'ı) ----------
create function tahta_eslestir(p_kod text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tahta; tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into t from tahta where kod_hash = tahta_ozet(tahta_kod_norm(p_kod)) and kod_son > now() for update;
  if t.id is null then raise exception 'Kod geçersiz ya da süresi dolmuş. İdareden yeni kod iste.' using errcode = '22023'; end if;
  update tahta set token_hash = tahta_ozet(tok), kod_hash = null, kod_son = null, eslesti_at = now(), son_gorulme = now() where id = t.id;
  return jsonb_build_object('token', tok, 'tahta', t.ad, 'sinif', (select name from classes where id = t.class_id),
                            'okul', (select name from schools where id = t.school_id));
end $$;

create function tahta_durum(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tahta := tahta_bul(p_token); d date := tahta_bugun();
begin
  return jsonb_build_object(
    'tahta', jsonb_build_object('id', t.id, 'ad', t.ad, 'sinif_id', t.class_id),
    'okul', (select name from schools where id = t.school_id),
    'gun', d,
    'siniflar', tahta_sinif_listesi(t.school_id, d),
    'bildirim_saati', (school_setting(t.school_id, 'yoklama.bildirim_saati'))#>>'{}',
    'kilit', tahta_kilit(t.id));
end $$;

create function tahta_liste(p_token text, p_class uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tahta := tahta_bul(p_token); d date := tahta_bugun(); c classes;
begin
  select c2.* into c from classes c2 join tahta t2 on t2.class_id = c2.id where c2.id = p_class and c2.school_id = t.school_id;
  if c.id is null then raise exception 'Bu sınıf tahta yoklamasına açık değil.' using errcode = '42501'; end if;
  return jsonb_build_object('sinif', jsonb_build_object('id', c.id, 'ad', c.name),
    'alindi', (select x->'alindi' from jsonb_array_elements(tahta_sinif_listesi(t.school_id, d)) x where x->>'id' = c.id::text),
    'ogrenciler', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'ad', s.full_name, 'no', s.school_no,
        'durum', coalesce(a.status, 'geldi'),
        'kilitli', coalesce(a.status in ('izinli', 'raporlu') and a.kaynak = 'site', false))
      order by s.school_no nulls last, s.full_name)
      from students s left join attendance a on a.student_id = s.id and a.day = d
      where s.class_id = c.id and s.archived_at is null), '[]'));
end $$;

-- Yoklamayı kaydeder. PIN hatası exception değil {ok:false} döner (deneme kaydı geri alınmasın diye).
create function tahta_yoklama_gonder(p_token text, p_pin text, p_class uuid, p_kayit jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tahta := tahta_bul(p_token); d date := tahta_bugun(); c classes; k timestamptz; p profiles;
  r record; e attendance; n_bildir int := 0; due text; kalan int;
begin
  k := tahta_kilit(t.id);
  if k is not null then return jsonb_build_object('ok', false, 'hata', 'kilit', 'kilit', k); end if;

  select pr.* into p from tahta_pin tp join profiles pr on pr.id = tp.profile_id
  where tp.school_id = t.school_id and coalesce(p_pin, '') ~ '^[0-9]{4}$' and tp.pin_hash = tahta_pin_ozet(t.school_id, p_pin)
    and pr.status = 'approved' and pr.school_id = t.school_id and (pr.role in ('admin', 'ogretmen') or has_role(pr.id, 'ogretmen'));
  if p.id is null then
    insert into tahta_deneme (tahta_id, basarili) values (t.id, false);
    k := tahta_kilit(t.id);
    if k is not null then
      perform notify_many(array(select admin_accounts(t.school_id)),
        t.ad || ' tahtasında art arda yanlış PIN girildi (' || to_char(now() at time zone 'Europe/Istanbul', 'HH24:MI') || '). Tahta ' ||
        case when k = 'infinity' then 'siz açana kadar' else '10 dakika' end || ' kilitli.', jsonb_build_object('page', 'yonetim'));
      return jsonb_build_object('ok', false, 'hata', 'kilit', 'kilit', k);
    end if;
    select 5 - count(*) into kalan from tahta_deneme
      where tahta_id = t.id and not basarili and at > greatest(now() - interval '10 minutes', coalesce(t.kilit_acik_at, '-infinity'));
    return jsonb_build_object('ok', false, 'hata', 'pin', 'kalan', greatest(kalan, 1));
  end if;
  insert into tahta_deneme (tahta_id, basarili) values (t.id, true);
  update tahta_pin set son_kullanim = now(), son_tahta = t.id where profile_id = p.id;

  select c2.* into c from classes c2 join tahta t2 on t2.class_id = c2.id where c2.id = p_class and c2.school_id = t.school_id;
  if c.id is null then raise exception 'Bu sınıf tahta yoklamasına açık değil.' using errcode = '42501'; end if;
  if jsonb_typeof(p_kayit) <> 'object' then raise exception 'Yoklama listesi okunamadı.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_each_text(p_kayit) j
             where j.value not in ('geldi', 'devamsiz', 'gec', 'izinli', 'raporlu')
                or not exists (select 1 from students s where s.id::text = j.key and s.class_id = c.id and s.archived_at is null)) then
    raise exception 'Liste güncel değil. Listeyi yenileyip tekrar gönder.' using errcode = '22023';
  end if;

  perform set_config('bk.tahta', '1', true);
  for r in select j.key::uuid sid, j.value st from jsonb_each_text(p_kayit) j loop
    select * into e from attendance where student_id = r.sid and day = d;
    continue when e.id is not null and e.status in ('izinli', 'raporlu') and e.kaynak = 'site';
    if r.st = 'geldi' then
      if e.id is not null then delete from attendance where id = e.id; end if;
    elsif e.id is null then
      insert into attendance (school_id, student_id, day, status, created_by) values (t.school_id, r.sid, d, r.st, p.id);
    elsif e.status <> r.st then
      update attendance set status = r.st, created_by = p.id where id = e.id;
    end if;
  end loop;
  perform set_config('bk.tahta', '', true);

  insert into yoklama_oturum (class_id, day, school_id, profile_id, tahta_id)
  values (c.id, d, t.school_id, p.id, t.id)
  on conflict (class_id, day) do update set profile_id = excluded.profile_id, tahta_id = excluded.tahta_id, at = now(),
    duzeltme = yoklama_oturum.duzeltme + 1;

  select count(*) into n_bildir from attendance a join students s on s.id = a.student_id
  where s.class_id = c.id and a.day = d and a.status in ('devamsiz', 'gec');
  due := (school_setting(t.school_id, 'yoklama.bildirim_saati'))#>>'{}';
  return jsonb_build_object('ok', true, 'ogretmen', p.full_name, 'sinif', c.name,
    'saat', to_char(now() at time zone 'Europe/Istanbul', 'HH24:MI'), 'bildirilecek', n_bildir,
    'bildirim_saati', due,
    'bekliyor', due <> 'anlik' and now() < (d + due::time) at time zone 'Europe/Istanbul');
end $$;

revoke all on function tahta_eslestir(text), tahta_durum(text), tahta_liste(text, uuid), tahta_yoklama_gonder(text, text, uuid, jsonb) from public;
grant execute on function tahta_eslestir(text), tahta_durum(text), tahta_liste(text, uuid), tahta_yoklama_gonder(text, text, uuid, jsonb) to anon, authenticated;

-- ---------- Öğretmen: PIN ----------
-- Sistem verir (öğretmen seçmez): seçilebilir olsaydı "bu PIN kullanılıyor" cevabı başkasının PIN'ini ele verirdi.
create function tahta_pin_yenile() returns text
language plpgsql volatile security definer set search_path = public as $$
declare sid uuid := my_school(); b bytea; pin text; i int := 0;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler PIN alabilir.' using errcode = '42501'; end if;
  loop
    i := i + 1;
    if i > 200 then raise exception 'PIN üretilemedi, tekrar dene.'; end if;
    b := extensions.gen_random_bytes(2);
    pin := lpad(((get_byte(b, 0) * 256 + get_byte(b, 1)) % 10000)::text, 4, '0');
    continue when pin ~ '^(\d)\1{3}$' or '0123456789' like '%' || pin || '%' or '9876543210' like '%' || pin || '%'
      or pin ~ '^(19|20)\d\d$' or pin ~ '^(\d\d)\1$';
    continue when exists (select 1 from tahta_pin where school_id = sid and pin_hash = tahta_pin_ozet(sid, pin) and profile_id <> auth.uid());
    exit;
  end loop;
  insert into tahta_pin (profile_id, school_id, pin_hash) values (auth.uid(), sid, tahta_pin_ozet(sid, pin))
  on conflict (profile_id) do update set pin_hash = excluded.pin_hash, created_at = now(), son_kullanim = null, son_tahta = null;
  return pin;
end $$;

create function tahta_pin_durum() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('var', tp.profile_id is not null, 'olusturma', tp.created_at, 'son_kullanim', tp.son_kullanim,
                            'son_tahta', (select ad from tahta where id = tp.son_tahta),
                            'pilot', exists (select 1 from tahta where school_id = my_school()))
  from (select 1) x left join tahta_pin tp on tp.profile_id = auth.uid()
  where is_teacher()
$$;
revoke all on function tahta_pin_yenile(), tahta_pin_durum() from public, anon;
grant execute on function tahta_pin_yenile(), tahta_pin_durum() to authenticated;

-- ---------- İdare: tahtalar ----------
create function tahta_listesi() returns table (id uuid, ad text, class_id uuid, sinif text, eslesti boolean, kod_son timestamptz,
  son_gorulme timestamptz, kilit timestamptz, bugun jsonb)
language sql stable security definer set search_path = public as $$
  select t.id, t.ad, t.class_id, c.name, t.token_hash is not null, case when t.kod_son > now() then t.kod_son end, t.son_gorulme,
         tahta_kilit(t.id),
         (select jsonb_build_object('kim', p.full_name, 'saat', to_char(o.at at time zone 'Europe/Istanbul', 'HH24:MI'), 'duzeltme', o.duzeltme)
          from yoklama_oturum o left join profiles p on p.id = o.profile_id where o.class_id = t.class_id and o.day = tahta_bugun())
  from tahta t join classes c on c.id = t.class_id
  where is_admin() and t.school_id = my_school()
  order by c.grade, c.section
$$;

create function tahta_ekle(p_class uuid, p_ad text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c classes; kod text := tahta_kod_uret(); nid uuid;
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  select * into c from classes where id = p_class and school_id = my_school();
  if c.id is null then raise exception 'Sınıf bulunamadı.' using errcode = '22023'; end if;
  if exists (select 1 from tahta where class_id = c.id) then raise exception '% sınıfının tahtası zaten ekli.', c.name using errcode = '23505'; end if;
  insert into tahta (school_id, class_id, ad, kod_hash, kod_son)
  values (c.school_id, c.id, coalesce(nullif(btrim(p_ad), ''), c.name || ' tahtası'), tahta_ozet(tahta_kod_norm(kod)), now() + interval '10 minutes')
  returning id into nid;
  return jsonb_build_object('id', nid, 'kod', kod, 'son', now() + interval '10 minutes');
end $$;

create function tahta_kod_yenile(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare kod text := tahta_kod_uret();
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  update tahta set kod_hash = tahta_ozet(tahta_kod_norm(kod)), kod_son = now() + interval '10 minutes'
  where id = p_id and school_id = my_school();
  if not found then raise exception 'Tahta bulunamadı.' using errcode = '22023'; end if;
  return jsonb_build_object('kod', kod, 'son', now() + interval '10 minutes');
end $$;

create function tahta_kaldir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  delete from tahta where id = p_id and school_id = my_school();
end $$;

create function tahta_kilit_ac(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  update tahta set kilit_acik_at = now() where id = p_id and school_id = my_school();
end $$;

revoke all on function tahta_listesi(), tahta_ekle(uuid, text), tahta_kod_yenile(uuid), tahta_kaldir(uuid), tahta_kilit_ac(uuid) from public, anon;
grant execute on function tahta_listesi(), tahta_ekle(uuid, text), tahta_kod_yenile(uuid), tahta_kaldir(uuid), tahta_kilit_ac(uuid) to authenticated;
