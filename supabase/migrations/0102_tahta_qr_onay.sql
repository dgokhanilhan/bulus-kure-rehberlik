-- BK Akıllı Yoklama: PIN'e ek olarak telefonla QR onayı.
-- Tahta PIN ekranında yoklama listesini sunucuya bırakır ve tek kullanımlık bir kod alır (2 dakika geçerli, ~80 bit).
-- Kod QR olarak gösterilir; öğretmen/yönetici telefonunda (oturumu açık) okutur, listeyi görür ve onaylar.
-- Onay anında yoklama sunucuda işlenir; tahta durumu sorarak sonucu öğrenir. PIN akışı aynen kalır.
-- Kimin onayladığı yoklama_oturum.profile_id'ye, yöntem yoklama_oturum.yontem'e yazılır.
-- tahta_yoklama_gonder'in kayıt kısmı ortak fonksiyona (tahta_yoklama_isle) taşındı; PIN davranışı değişmez.
-- Geri alma: supabase/geri-alma/0102_tahta_qr_onay_geri_al.sql

alter table yoklama_oturum add column yontem text not null default 'pin' check (yontem in ('pin', 'qr'));

create table tahta_onay (
  id uuid primary key default gen_random_uuid(),
  kod_ozet text not null unique,
  tahta_id uuid not null references tahta(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  gun date not null,
  kayit jsonb not null,
  olustu timestamptz not null default now(),
  son timestamptz not null,
  onaylayan uuid references profiles(id) on delete set null,
  onay_at timestamptz,
  sonuc jsonb
);
create index tahta_onay_tahta on tahta_onay (tahta_id, olustu);
create index tahta_onay_olustu on tahta_onay (olustu);
alter table tahta_onay enable row level security;
revoke all on tahta_onay from anon, authenticated;

-- Onay kodu: XXXX-XXXX-XXXX-XXXX, 32 harflik alfabe (0/O/1/I yok), 80 bit
create function tahta_onay_kod_uret() returns text language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(16); c text := ''; i int;
begin
  for i in 0..15 loop c := c || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4) || '-' || substr(c, 13, 4);
end $$;
revoke all on function tahta_onay_kod_uret() from public, anon, authenticated;

-- Sınıf tahta yoklamasına açık mı ve liste güncel mi (tahta_yoklama_gonder'deki denetimin aynısı)
create function tahta_kayit_dogrula(p_school uuid, p_class uuid, p_kayit jsonb) returns classes
language plpgsql stable security definer set search_path = public as $$
declare c classes;
begin
  select c2.* into c from classes c2 join tahta t2 on t2.class_id = c2.id where c2.id = p_class and c2.school_id = p_school;
  if c.id is null then raise exception 'Bu sınıf tahta yoklamasına açık değil.' using errcode = '42501'; end if;
  if jsonb_typeof(p_kayit) is distinct from 'object' then raise exception 'Yoklama listesi okunamadı.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_each_text(p_kayit) j
             where j.value not in ('geldi', 'devamsiz', 'gec', 'izinli', 'raporlu')
                or not exists (select 1 from students s where s.id::text = j.key and s.class_id = c.id and s.archived_at is null)) then
    raise exception 'Liste güncel değil. Listeyi yenileyip tekrar gönder.' using errcode = '22023';
  end if;
  return c;
end $$;
revoke all on function tahta_kayit_dogrula(uuid, uuid, jsonb) from public, anon, authenticated;

-- Yoklamayı yazar (kimlik doğrulandıktan sonra). Gövde 0080 tahta_yoklama_gonder'den alındı.
create function tahta_yoklama_isle(t tahta, p profiles, p_class uuid, p_kayit jsonb, p_yontem text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := tahta_bugun(); c classes; r record; e attendance; n_bildir int := 0; due text;
begin
  c := tahta_kayit_dogrula(t.school_id, p_class, p_kayit);

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

  insert into yoklama_oturum (class_id, day, school_id, profile_id, tahta_id, yontem)
  values (c.id, d, t.school_id, p.id, t.id, p_yontem)
  on conflict (class_id, day) do update set profile_id = excluded.profile_id, tahta_id = excluded.tahta_id, at = now(),
    duzeltme = yoklama_oturum.duzeltme + 1, yontem = excluded.yontem;

  select count(*) into n_bildir from attendance a join students s on s.id = a.student_id
  where s.class_id = c.id and a.day = d and a.status in ('devamsiz', 'gec');
  due := (school_setting(t.school_id, 'yoklama.bildirim_saati'))#>>'{}';
  return jsonb_build_object('ok', true, 'ogretmen', p.full_name, 'sinif', c.name,
    'saat', to_char(now() at time zone 'Europe/Istanbul', 'HH24:MI'), 'bildirilecek', n_bildir,
    'bildirim_saati', due,
    'bekliyor', due <> 'anlik' and now() < (d + due::time) at time zone 'Europe/Istanbul');
end $$;
revoke all on function tahta_yoklama_isle(tahta, profiles, uuid, jsonb, text) from public, anon, authenticated;

-- PIN akışı: kimlik ve kilit denetimi 0080'deki gibi; kayıt ortak fonksiyonda.
create or replace function tahta_yoklama_gonder(p_token text, p_pin text, p_class uuid, p_kayit jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tahta := tahta_bul(p_token); k timestamptz; p profiles; kalan int;
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

  return tahta_yoklama_isle(t, p, p_class, p_kayit, 'pin');
end $$;

-- ---------- Tahta (anon + tahta anahtarı) ----------
-- Listeyi bırakır, onay kodu alır. Aynı tahtanın onaylanmamış eski kodu geçersiz olur.
create function tahta_onay_baslat(p_token text, p_class uuid, p_kayit jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare t tahta := tahta_bul(p_token); kod text; son timestamptz := now() + interval '2 minutes';
begin
  perform tahta_kayit_dogrula(t.school_id, p_class, p_kayit);
  if (select count(*) from tahta_onay where tahta_id = t.id and olustu > now() - interval '10 minutes') >= 40 then
    raise exception 'Kısa sürede çok fazla kod istendi. Birkaç dakika sonra tekrar dene ya da PIN''ini kullan.' using errcode = '53400';
  end if;
  delete from tahta_onay where olustu < now() - interval '1 day';
  delete from tahta_onay where tahta_id = t.id and onay_at is null;
  kod := tahta_onay_kod_uret();
  insert into tahta_onay (kod_ozet, tahta_id, school_id, class_id, gun, kayit, son)
  values (tahta_ozet(tahta_kod_norm(kod)), t.id, t.school_id, p_class, tahta_bugun(), p_kayit, son);
  return jsonb_build_object('kod', kod, 'son', son, 'sure', 120);
end $$;

-- Tahta onay durumunu sorar: bekliyor / onaylandi (+sonuc) / suresi_doldu / yok
create function tahta_onay_durum(p_token text, p_kod text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare t tahta := tahta_bul(p_token); o tahta_onay;
begin
  select * into o from tahta_onay where kod_ozet = tahta_ozet(tahta_kod_norm(p_kod)) and tahta_id = t.id;
  if o.id is null then return jsonb_build_object('durum', 'yok'); end if;
  if o.onay_at is not null then return jsonb_build_object('durum', 'onaylandi', 'sonuc', o.sonuc); end if;
  if o.son <= now() or o.gun <> tahta_bugun() then return jsonb_build_object('durum', 'suresi_doldu'); end if;
  return jsonb_build_object('durum', 'bekliyor', 'son', o.son);
end $$;

revoke all on function tahta_onay_baslat(text, uuid, jsonb), tahta_onay_durum(text, text) from public;
grant execute on function tahta_onay_baslat(text, uuid, jsonb), tahta_onay_durum(text, text) to anon, authenticated;

-- ---------- Telefon (oturum açık öğretmen / yönetici) ----------
-- Kodun kaydı; yetki: okulun onaylı öğretmeni ya da (iki adımlı doğrulamalı) yöneticisi.
create function tahta_onay_bul(p_kod text) returns tahta_onay
language plpgsql stable security definer set search_path = public as $$
declare o tahta_onay;
begin
  if not is_teacher() then raise exception 'Bu işlem için yetkin yok. Yalnız öğretmen ve yönetici hesapları tahta yoklamasını onaylayabilir.' using errcode = '42501'; end if;
  if tahta_kod_norm(p_kod) !~ '^[A-Z0-9]{16}$' then raise exception 'Kod okunamadı.' using errcode = '22023'; end if;
  select * into o from tahta_onay where kod_ozet = tahta_ozet(tahta_kod_norm(p_kod));
  if o.id is null or o.school_id is distinct from my_school() then
    raise exception 'Bu kod geçersiz ya da yenilenmiş. Tahtadaki güncel kodu okut.' using errcode = '22023';
  end if;
  return o;
end $$;
revoke all on function tahta_onay_bul(text) from public, anon, authenticated;

-- Onay ekranı: sınıf, tahta, gelmeyen/geç öğrenciler, bildirim saati
create function tahta_onay_goster(p_kod text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o tahta_onay := tahta_onay_bul(p_kod); due text;
begin
  due := (school_setting(o.school_id, 'yoklama.bildirim_saati'))#>>'{}';
  return jsonb_build_object(
    'durum', case when o.onay_at is not null then 'onaylandi' when o.son <= now() or o.gun <> tahta_bugun() then 'suresi_doldu' else 'bekliyor' end,
    'sinif', (select name from classes where id = o.class_id),
    'tahta', (select ad from tahta where id = o.tahta_id),
    'olustu', o.olustu, 'son', o.son,
    'onaylayan', (select full_name from profiles where id = o.onaylayan), 'onay_at', o.onay_at,
    'sayilar', (select jsonb_object_agg(d, n) from (
                  select d, count(j.value) n from unnest(array['geldi', 'devamsiz', 'gec', 'izinli', 'raporlu']) d
                  left join jsonb_each_text(o.kayit) j on j.value = d group by d) x),
    'liste', coalesce((select jsonb_agg(jsonb_build_object('ad', s.full_name, 'durum', j.value) order by s.school_no nulls last, s.full_name)
                       from jsonb_each_text(o.kayit) j join students s on s.id::text = j.key where j.value <> 'geldi'), '[]'),
    'bildirim_saati', due,
    'bekliyor', due <> 'anlik' and now() < (tahta_bugun() + due::time) at time zone 'Europe/Istanbul');
end $$;

-- Onay: tek kullanımlık; süresi geçmiş ya da kullanılmış kod reddedilir. Yoklama hemen işlenir.
create function tahta_onay_onayla(p_kod text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o tahta_onay := tahta_onay_bul(p_kod); t tahta; p profiles; r jsonb;
begin
  update tahta_onay set onaylayan = auth.uid(), onay_at = now()
  where id = o.id and onay_at is null and son > now() and gun = tahta_bugun()
  returning * into o;
  if o.onay_at is null or o.onaylayan is distinct from auth.uid() then
    raise exception 'Bu kodun süresi dolmuş ya da kullanılmış. Tahtadaki güncel kodu okut.' using errcode = '22023';
  end if;
  select * into t from tahta where id = o.tahta_id;
  select * into p from profiles where id = auth.uid();
  r := tahta_yoklama_isle(t, p, o.class_id, o.kayit, 'qr');
  update tahta_onay set sonuc = r where id = o.id;
  return r;
end $$;

revoke all on function tahta_onay_goster(text), tahta_onay_onayla(text) from public, anon;
grant execute on function tahta_onay_goster(text), tahta_onay_onayla(text) to authenticated;
