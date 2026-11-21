-- 0091: Yaklaşan deneme. Yayınevinin önceden gönderdiği kazanım listesi (soru → kazanım) deneme yapılmadan sisteme girilir.
-- Sonuç PDF'i yüklenince bu liste PDF'te okunamayan kazanımları tamamlar (D/Y/B/net/puan'a dokunmaz; CLAUDE.md §2).
-- Takvimdeki deneme etkinliğine bağlanır; veli/öğrenci/öğretmen etkinliği görebiliyorsa konu listesini görür.
-- Tamamen isteğe bağlıdır: liste gelmeyen denemeler eskisi gibi yüklenir. Mevcut hiçbir tablo ve fonksiyon değişmez.

create table yaklasan_denemeler (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null check (length(btrim(name)) between 2 and 120),
  exam_date date not null,
  grade smallint not null default 8 check (grade between 1 and 12),
  publisher text check (publisher is null or length(publisher) <= 120),
  source_name text check (source_name is null or length(source_name) <= 200),
  calendar_event_id uuid references calendar_events(id) on delete set null,
  exam_id uuid references exams(id) on delete set null,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index yaklasan_takvim_tek on yaklasan_denemeler (calendar_event_id) where calendar_event_id is not null;
create unique index yaklasan_sinav_tek on yaklasan_denemeler (exam_id) where exam_id is not null;
create index yaklasan_okul_tarih on yaklasan_denemeler (school_id, exam_date);

create table yaklasan_deneme_sorulari (
  deneme_id uuid not null references yaklasan_denemeler(id) on delete cascade,
  subject subject_code not null,
  q_no int not null check (q_no between 1 and 40),          -- A kitapçığı
  q_b int check (q_b between 1 and 40),
  q_c int check (q_c between 1 and 40),
  q_d int check (q_d between 1 and 40),
  konu text check (konu is null or length(konu) <= 200),
  raw_code text check (raw_code is null or length(raw_code) <= 60),
  raw_text text check (raw_text is null or length(raw_text) <= 1000),
  outcome_code text references outcomes(code),
  match match_level not null default 'none',
  primary key (deneme_id, subject, q_no),
  check ((outcome_code is null) = (match = 'none'))
);

alter table yaklasan_denemeler enable row level security;
alter table yaklasan_deneme_sorulari enable row level security;
-- Doğrudan okuma/silme yalnız rehberlik ve yönetim; ekleme yalnız yaklasan_deneme_kaydet ile. Diğer roller konu listesini
-- yaklasan_deneme_konulari ile (etkinliği görebiliyorsa) görür.
create policy yaklasan_oku on yaklasan_denemeler for select using (school_id = my_school() and is_staff());
create policy yaklasan_sil on yaklasan_denemeler for delete using (school_id = my_school() and is_staff());
create policy yaklasan_soru_oku on yaklasan_deneme_sorulari for select
  using (exists (select 1 from yaklasan_denemeler y where y.id = deneme_id and y.school_id = my_school() and is_staff()));
create policy mod_lgs on yaklasan_denemeler as restrictive for all using (is_admin() or module_enabled('lgs'));
create policy mod_lgs on yaklasan_deneme_sorulari as restrictive for all using (is_admin() or module_enabled('lgs'));
create trigger audit_yaklasan after insert or update or delete on yaklasan_denemeler for each row execute function audit_row();

-- Kaydet: başlık + sorular + takvim (var olan deneme etkinliğine bağla ya da yeni etkinlik aç). Tek işlem.
-- p = {name, exam_date, grade, publisher, source_name, items:[{subject,q_no,q_b,q_c,q_d,konu,raw_code,raw_text,outcome_code,match}],
--      takvim:{mode:'bagla', event_id} | {mode:'yeni', target:'okul'|'kademe'|'sinif', level, class_ids:[...]}}
create or replace function yaklasan_deneme_kaydet(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := my_school();
  v_id uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_date date := (p->>'exam_date')::date;
  v_event uuid;
  t jsonb := coalesce(p->'takvim', '{}'::jsonb);
  it jsonb;
  v_code text;
  v_match match_level;
  v_subject subject_code;
begin
  if not is_staff() then raise exception 'Yaklaşan deneme eklemek için rehberlik veya yönetici yetkisi gerekir.' using errcode = '42501'; end if;
  if not (is_admin() or module_enabled('lgs')) then raise exception 'Deneme modülü kapalı.' using errcode = '42501'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Deneme adı gerekli.' using errcode = '22023'; end if;
  if v_date is null then raise exception 'Deneme tarihi gerekli.' using errcode = '22023'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 or jsonb_array_length(p->'items') > 200 then
    raise exception 'Kazanım listesi boş ya da çok uzun.' using errcode = '22023';
  end if;

  if t->>'mode' = 'bagla' then
    select e.id into v_event from calendar_events e
    where e.id = (t->>'event_id')::uuid and e.school_id = v_school and e.type = 'deneme';
    if v_event is null then raise exception 'Takvimdeki deneme bulunamadı.' using errcode = '22023'; end if;
    if exists (select 1 from yaklasan_denemeler where calendar_event_id = v_event) then
      raise exception 'Bu takvim etkinliğine zaten bir kazanım listesi bağlı.' using errcode = '23505';
    end if;
  elsif t->>'mode' = 'yeni' then
    if t->>'target' = 'okul' then
      insert into calendar_events (school_id, title, type, starts_on, ends_on, target, created_by)
      values (v_school, v_name, 'deneme', v_date, v_date, 'okul', auth.uid()) returning id into v_event;
    elsif t->>'target' = 'kademe' then
      insert into calendar_events (school_id, title, type, starts_on, ends_on, target, level, created_by)
      values (v_school, v_name, 'deneme', v_date, v_date, 'kademe', t->>'level', auth.uid()) returning id into v_event;
    elsif t->>'target' = 'sinif' then
      if jsonb_typeof(t->'class_ids') <> 'array' or jsonb_array_length(t->'class_ids') = 0 then
        raise exception 'En az bir sınıf seç.' using errcode = '22023';
      end if;
      -- Takvimde çok sınıflı etkinlik tek satırdır (class_id = ilk sınıf, class_ids = hepsi); sınıfları calendar_before doğrular.
      insert into calendar_events (school_id, title, type, starts_on, ends_on, target, class_id, class_ids, created_by)
      values (v_school, v_name, 'deneme', v_date, v_date, 'sinif', (t->'class_ids'->>0)::uuid,
              array(select (x #>> '{}')::uuid from jsonb_array_elements(t->'class_ids') x), auth.uid())
      returning id into v_event;
    else
      raise exception 'Takvim hedefi geçersiz.' using errcode = '22023';
    end if;
  elsif t ? 'mode' then
    raise exception 'Takvim seçimi geçersiz.' using errcode = '22023';
  end if;

  insert into yaklasan_denemeler (school_id, name, exam_date, grade, publisher, source_name, calendar_event_id, created_by)
  values (v_school, v_name, v_date, coalesce((p->>'grade')::smallint, 8), nullif(btrim(coalesce(p->>'publisher', '')), ''),
          nullif(btrim(coalesce(p->>'source_name', '')), ''), v_event, auth.uid())
  returning id into v_id;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_subject := (it->>'subject')::subject_code;
    v_code := nullif(it->>'outcome_code', '');
    v_match := coalesce(nullif(it->>'match', ''), 'none')::match_level;
    -- Yalnız kodla güvenilir eşleşme saklanır; kod başka derse aitse ya da yoksa eşleşme yok sayılır (uydurulmaz).
    if v_code is null or v_match not in ('code_exact', 'code_inferred')
       or not exists (select 1 from outcomes o where o.code = v_code and o.subject = v_subject) then
      v_code := null; v_match := 'none';
    end if;
    insert into yaklasan_deneme_sorulari (deneme_id, subject, q_no, q_b, q_c, q_d, konu, raw_code, raw_text, outcome_code, match)
    values (v_id, v_subject, (it->>'q_no')::int, nullif(it->>'q_b', '')::int, nullif(it->>'q_c', '')::int, nullif(it->>'q_d', '')::int,
            left(nullif(btrim(coalesce(it->>'konu', '')), ''), 200), left(nullif(btrim(coalesce(it->>'raw_code', '')), ''), 60),
            left(nullif(btrim(coalesce(it->>'raw_text', '')), ''), 1000), v_code, v_match);
  end loop;
  return v_id;
end $$;
revoke all on function yaklasan_deneme_kaydet(jsonb) from public, anon;
grant execute on function yaklasan_deneme_kaydet(jsonb) to authenticated;

-- Sonuç yüklenince yaklaşan deneme yayınlanan denemeye bağlanır (öneri listesinden düşer). p_exam null → bağ kaldırılır.
create or replace function yaklasan_deneme_bagla(p_id uuid, p_exam uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Yetki yok.' using errcode = '42501'; end if;
  if p_exam is not null and not exists (select 1 from exams where id = p_exam and school_id = my_school()) then
    raise exception 'Deneme bulunamadı.' using errcode = '22023';
  end if;
  update yaklasan_denemeler set exam_id = p_exam where id = p_id and school_id = my_school();
  if not found then raise exception 'Yaklaşan deneme bulunamadı.' using errcode = '22023'; end if;
end $$;
revoke all on function yaklasan_deneme_bagla(uuid, uuid) from public, anon;
grant execute on function yaklasan_deneme_bagla(uuid, uuid) to authenticated;

-- Takvimdeki deneme etkinliğinin konu listesi. Etkinliği göremeyen (event_visible) hiçbir şey alamaz.
-- Kazanım kodu yalnız güvenilir eşleşmede döner (öğrencinin önceki denemeleriyle karşılaştırma için); ham kod/metin dönmez.
create or replace function yaklasan_deneme_konulari(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  e calendar_events;
  y yaklasan_denemeler;
begin
  select * into e from calendar_events where id = p_event and school_id = my_school();
  if not found or not event_visible(e) then return null; end if;
  if not (is_admin() or module_enabled('lgs')) then return null; end if;
  select * into y from yaklasan_denemeler where calendar_event_id = p_event;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', y.id,
    'ad', y.name,
    'tarih', e.starts_on,          -- takvimdeki tarih esas (etkinlik sonradan taşınmış olabilir)
    'sonuc_var', y.exam_id is not null,
    'sorular', (select coalesce(jsonb_agg(jsonb_build_object('ders', s.subject, 'no', s.q_no, 'konu', s.konu, 'kod', s.outcome_code)
                                          order by s.subject, s.q_no), '[]')
                from yaklasan_deneme_sorulari s where s.deneme_id = y.id));
end $$;
revoke all on function yaklasan_deneme_konulari(uuid) from public, anon;
grant execute on function yaklasan_deneme_konulari(uuid) to authenticated;
