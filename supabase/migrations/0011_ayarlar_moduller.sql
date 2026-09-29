-- Faz A · Yönetim Merkezi (1/2): merkezi okul ayarları ve modül aç/kapat.
-- Ayarlar anahtar/değer olarak tutulur; yazma yalnız set_settings() ile (yönetici + aal2), her anahtar
-- setting_spec()'teki türe ve sınıra göre doğrulanır ve audit_log'a yazılır. Yeni ayar = spec'e bir satır.
-- Modül kapatılınca: menüden ve kartlardan kalkar (arayüz) VE yönetici dışındakiler o modülün
-- verisini okuyamaz/yazamaz (aşağıdaki kısıtlayıcı politikalar ve tetikleyiciler).

create table school_settings (
  school_id uuid not null references schools(id),
  key text not null,
  value jsonb not null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);
alter table school_settings enable row level security;
-- Ayarlar gizli değildir (modül durumları velinin menüsünü belirler); okuldaki herkes okur, kimse doğrudan yazamaz.
create policy settings_read on school_settings for select using (school_id = my_school());

-- Bilinen ayarlar: tür (bool/int/text/date), sınırlar ve varsayılan.
create or replace function setting_spec() returns jsonb language sql immutable as $$
  select '{
    "genel.okul_adi":            {"type":"text","max":120},
    "genel.telefon":             {"type":"text","max":40,  "default":""},
    "genel.eposta":              {"type":"text","max":120, "default":""},
    "genel.adres":               {"type":"text","max":300, "default":""},
    "modul.lgs":                 {"type":"bool","default":true},
    "modul.yoklama":             {"type":"bool","default":true},
    "modul.ders_programi":       {"type":"bool","default":true},
    "modul.yemek":               {"type":"bool","default":true},
    "modul.duyuru":              {"type":"bool","default":true},
    "modul.mesaj":               {"type":"bool","default":true},
    "modul.odev":                {"type":"bool","default":true},
    "modul.takvim":              {"type":"bool","default":true},
    "modul.bursluluk":           {"type":"bool","default":false},
    "yoklama.ogretmen_girebilir":{"type":"bool","default":false}
  }'::jsonb
$$;

create or replace function setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from school_settings where school_id = my_school() and key = p_key),
    setting_spec()->p_key->'default')
$$;

-- Modül açık mı? (bilinmeyen modül açık sayılır; varsayılan spec'ten)
create or replace function module_enabled(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((setting('modul.' || p_module))::text::boolean, true)
$$;
grant execute on function setting(text) to authenticated;
grant execute on function module_enabled(text) to authenticated;

create or replace function set_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text; v jsonb; spec jsonb := setting_spec(); s jsonb; old jsonb; school uuid := my_school(); changed jsonb := '{}';
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Ayar biçimi geçersiz.' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p) loop
    s := spec->k;
    if s is null then raise exception 'Bilinmeyen ayar: %', k using errcode = '22023'; end if;
    case s->>'type'
      when 'bool' then
        if jsonb_typeof(v) <> 'boolean' then raise exception '% açık/kapalı olmalı.', k using errcode = '22023'; end if;
      when 'int' then
        if jsonb_typeof(v) <> 'number' or (v::text)::numeric <> floor((v::text)::numeric)
           or (s ? 'min' and (v::text)::numeric < (s->>'min')::numeric) or (s ? 'max' and (v::text)::numeric > (s->>'max')::numeric) then
          raise exception '% için değer % ile % arasında tam sayı olmalı.', k, s->>'min', s->>'max' using errcode = '22023';
        end if;
      when 'text' then
        if jsonb_typeof(v) <> 'string' or length(v#>>'{}') > coalesce((s->>'max')::int, 500) then
          raise exception '% en fazla % karakter olabilir.', k, coalesce(s->>'max', '500') using errcode = '22023';
        end if;
        v := to_jsonb(btrim(v#>>'{}'));
      else raise exception 'Ayar türü tanımsız: %', k;
    end case;
    if k = 'genel.okul_adi' then
      if length(v#>>'{}') < 3 then raise exception 'Okul adı en az 3 karakter olmalı.' using errcode = '22023'; end if;
      update schools set name = v#>>'{}' where id = school;   -- okul adı schools tablosunda da tutulur
    end if;
    select value into old from school_settings where school_id = school and key = k;
    if old is distinct from v then
      insert into school_settings (school_id, key, value, updated_by, updated_at) values (school, k, v, auth.uid(), now())
      on conflict (school_id, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
      changed := changed || jsonb_build_object(k, jsonb_build_object('eski', coalesce(old, spec->k->'default'), 'yeni', v));
    end if;
  end loop;
  if changed <> '{}' then
    insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'settings', 'school_settings', school, changed);
  end if;
end $$;
revoke all on function set_settings(jsonb) from public, anon;
grant execute on function set_settings(jsonb) to authenticated;

-- ---------- Modül kapalıyken erişim ----------
-- Kısıtlayıcı (restrictive) politika mevcut politikalarla VE'lenir: modül kapalıysa yönetici dışında kimse okuyamaz/yazamaz.
create policy mod_lgs_exams on exams as restrictive for all using (is_admin() or module_enabled('lgs'));
create policy mod_lgs_results on exam_results as restrictive for all using (is_admin() or module_enabled('lgs'));
create policy mod_lgs_questions on exam_questions as restrictive for all using (is_admin() or module_enabled('lgs'));
create policy mod_lgs_reports on reports as restrictive for all using (is_admin() or module_enabled('lgs'));
create policy mod_yoklama on attendance as restrictive for all using (is_admin() or module_enabled('yoklama'));
create policy mod_program on timetable as restrictive for all using (is_admin() or module_enabled('ders_programi'));
create policy mod_yemek on meals as restrictive for all using (is_admin() or module_enabled('yemek'));
create policy mod_duyuru on announcements as restrictive for all using (is_admin() or module_enabled('duyuru'));
create policy mod_mesaj_conv on conversations as restrictive for all using (is_admin() or module_enabled('mesaj'));
create policy mod_mesaj_msg on messages as restrictive for all using (is_admin() or module_enabled('mesaj'));

-- Yetkili fonksiyonlar (security definer) RLS'e takılmaz; yazmayı tetikleyici durdurur.
create or replace function module_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and not module_enabled(tg_argv[0]) then
    raise exception 'Bu modül okul yönetimi tarafından kapatıldı.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger mod_guard before insert or update on exams for each row execute function module_guard('lgs');
create trigger mod_guard before insert or update on exam_results for each row execute function module_guard('lgs');
create trigger mod_guard before insert or update on reports for each row execute function module_guard('lgs');
create trigger mod_guard before insert or update on conversations for each row execute function module_guard('mesaj');
create trigger mod_guard before insert on messages for each row execute function module_guard('mesaj');
create trigger mod_guard before insert on announcements for each row execute function module_guard('duyuru');
