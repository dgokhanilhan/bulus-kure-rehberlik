-- 0102 geri alma: QR onayı kaldırılır, tahta_yoklama_gonder 0080 hâline döner.
drop function if exists tahta_onay_goster(text);
drop function if exists tahta_onay_onayla(text);
drop function if exists tahta_onay_bul(text);
drop function if exists tahta_onay_baslat(text, uuid, jsonb);
drop function if exists tahta_onay_durum(text, text);

-- Yoklamayı kaydeder. PIN hatası exception değil {ok:false} döner (deneme kaydı geri alınmasın diye).
create or replace function tahta_yoklama_gonder(p_token text, p_pin text, p_class uuid, p_kayit jsonb) returns jsonb
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


drop function if exists tahta_yoklama_isle(tahta, profiles, uuid, jsonb, text);
drop function if exists tahta_kayit_dogrula(uuid, uuid, jsonb);
drop function if exists tahta_onay_kod_uret();
drop table if exists tahta_onay;
alter table yoklama_oturum drop column if exists yontem;
