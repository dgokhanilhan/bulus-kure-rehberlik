-- Okul geneli deneme altyapısı (5–12; Genel / LGS / TYT / AYT / YKS) · 1. aşama: veri modeli.
-- YALNIZ EKLEME: tablo/sütun silinmez, mevcut kimlikler ve LGS kayıtları değişmez. Mevcut LGS yolu (publish_exam,
-- exam_questions, outcomes, Deneme Köprüsü motoru) olduğu gibi çalışır; yeni alanları bilmeyen eklemeler
-- tetikleyiciyle 8. sınıf LGS olarak işaretlenir (o yol yalnız 8. sınıf kabul eder: tahmin değil, kural).
--
-- Neden yeni tablolar (paralel sistem değil, eksik boyutlar):
--   * outcomes.code tüm sistemde tek anahtar → TYMM'de aynı kod farklı tema bağlamında geçebilir; müfredat sürümü yok.
--     Yeni katalog learning_outcomes (uuid kimlik, sürüm + sınıf + ders + kod + tema bağlamı). outcomes LGS için kalır.
--   * exam_questions birincil anahtarı (exam_id, subject enum, q_no) → AYT'de Tarih-1/Tarih-2 gibi aynı dersin iki
--     bölümü çakışır; outcome_code global koda bağlı. Soru/kazanım düzeyi yeni denemelerde exam_items'ta.
--   * Ders kodları subject_code enum'unda 6 LGS dersi; enum'a dokunmadan yeni dersler subjects tablosunda (metin kod).

-- ---------- Dersler ve ders adı eşanlamlıları (genel başvuru verisi, okuldan bağımsız) ----------
create table if not exists subjects (
  code text primary key check (code ~ '^[A-Z]{2,6}$'),
  name text not null,
  short_name text not null,
  levels text[] not null default '{}',          -- ortaokul / lise
  sort int not null default 0,
  active boolean not null default true
);
insert into subjects (code, name, short_name, levels, sort) values
  ('TUR', 'Türkçe', 'Türkçe', '{ortaokul,lise}', 10),
  ('TDE', 'Türk Dili ve Edebiyatı', 'Edebiyat', '{lise}', 15),
  ('SOS', 'Sosyal Bilgiler', 'Sosyal', '{ortaokul}', 20),
  ('INK', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'İnkılap', '{ortaokul}', 25),
  ('TAR', 'Tarih', 'Tarih', '{lise}', 30),
  ('COG', 'Coğrafya', 'Coğrafya', '{lise}', 35),
  ('FEL', 'Felsefe', 'Felsefe', '{lise}', 40),
  ('DIN', 'Din Kültürü ve Ahlak Bilgisi', 'Din', '{ortaokul,lise}', 45),
  ('ING', 'İngilizce', 'İngilizce', '{ortaokul,lise}', 50),
  ('MAT', 'Matematik', 'Matematik', '{ortaokul,lise}', 60),
  ('FEN', 'Fen Bilimleri', 'Fen', '{ortaokul}', 70),
  ('FIZ', 'Fizik', 'Fizik', '{lise}', 75),
  ('KIM', 'Kimya', 'Kimya', '{lise}', 80),
  ('BIY', 'Biyoloji', 'Biyoloji', '{lise}', 85)
on conflict (code) do nothing;

-- Yayınların ders başlıkları (PDF'te görülenler) → ders. norm: büyük harf, Türkçe harfler sadeleştirilmiş, yalnız harf/rakam.
create or replace function norm_label(s text) returns text language sql immutable as $$
  select regexp_replace(translate(upper(coalesce(s, '')), 'ÇĞİIÖŞÜÂÎÛçğıiöşüâîû', 'CGIIOSUAIUCGIIOSUAIU'), '[^A-Z0-9]', '', 'g')
$$;
-- Kod normalleştirme (kontrollü): boşluk, büyük/küçük harf, Türkçe harf ve virgül→nokta farkı giderilir; NOKTALAR KALIR
-- (T.7.3.18 ile T.7.31.8 farklı kalır), sondaki nokta atılır. Farklı gerçek kodlar birbirine dönüşmez.
create or replace function norm_code(s text) returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(translate(upper(btrim(coalesce(s, ''))), 'ÇĞİIÖŞÜ,', 'CGIIOSU.'), '\s+', '', 'g'), '\.+$', ''), '')
$$;

create table if not exists subject_aliases (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),        -- null: herkes için
  alias text not null,
  alias_norm text generated always as (norm_label(alias)) stored,
  subject_code text not null references subjects(code),
  created_at timestamptz not null default now()
);
create unique index if not exists subject_aliases_uq on subject_aliases (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), alias_norm);
insert into subject_aliases (alias, subject_code)
select a, c from (values
  ('Türkçe', 'TUR'),
  ('Türk Dili', 'TDE'), ('Türk Dili ve Edebiyatı', 'TDE'), ('Edebiyat', 'TDE'),
  ('Sosyal', 'SOS'), ('Sosyal Bilgiler', 'SOS'),
  ('İnkılap', 'INK'), ('T.C. İnkılap Tarihi ve Atatürkçülük', 'INK'), ('İnkılap Tarihi', 'INK'), ('T.C. İNK.', 'INK'),
  ('Tarih', 'TAR'), ('Coğrafya', 'COG'), ('Felsefe', 'FEL'),
  ('Din Kültürü', 'DIN'), ('Din Kültürü ve Ahlak Bilgisi', 'DIN'), ('Din K.ve A.B.', 'DIN'),
  ('İngilizce', 'ING'), ('Matematik', 'MAT'), ('Mat', 'MAT'),
  ('Fen', 'FEN'), ('Fen Bilimleri', 'FEN'),
  ('Fizik', 'FIZ'), ('Kimya', 'KIM'), ('Biyoloji', 'BIY')
) v(a, c)
where not exists (select 1 from subject_aliases x where x.school_id is null and x.alias_norm = norm_label(v.a));

-- ---------- Yayıncı ≠ biçim ----------
create table if not exists publishers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),        -- null: yerleşik
  name text not null check (length(btrim(name)) between 2 and 80),
  series text[] not null default '{}',          -- deneme serileri (ör. "Hız TG", "LGS Max"); tanımada işaret olarak
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists publishers_uq on publishers (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Biçim (PDF düzeni) profili. parser_family motordaki ayrıştırıcı ailesi; aynı aileyi birden çok yayın kullanabilir.
create table if not exists exam_format_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),        -- null: yerleşik
  code text not null check (code ~ '^[A-Za-z0-9_]{3,60}$'),
  name text not null,
  parser_family text not null,                  -- motor: LEGACY_DK, HIZ_ORTAOKUL, HIZ_LISE, ... (motor tanımıyorsa UNKNOWN kalır)
  supported_grades smallint[] not null default '{}',
  supported_exam_types text[] not null default '{}',
  detect jsonb not null default '{}'::jsonb,    -- tanıma işaretleri: başlık metinleri, anahtar kelimeler (veri; kod çalıştırmaz)
  config jsonb not null default '{}'::jsonb,    -- ayrıştırma ayarları (ders başlığı eşlemesi, kod deseni…)
  status text not null default 'aktif' check (status in ('aktif', 'test', 'pasif')),
  builtin boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists exam_format_profiles_uq on exam_format_profiles (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create table if not exists publisher_formats (
  publisher_id uuid not null references publishers(id) on delete cascade,
  format_id uuid not null references exam_format_profiles(id) on delete cascade,
  primary key (publisher_id, format_id)
);

-- ---------- Sınav türü ----------
create or replace function valid_exam_type(t text) returns boolean language sql immutable as $$
  select t in ('GENEL', 'LGS', 'TYT', 'AYT', 'YKS', 'BRANS', 'KURUMSAL', 'DIGER')
$$;

-- Sınıfa göre varsayılan sınav türü (Buluş Küre düzeni; okul kendi satırıyla değiştirebilir, kodda sabit değil).
create table if not exists exam_type_defaults (
  school_id uuid references schools(id),        -- null: genel varsayılan
  grade smallint not null check (grade between 1 and 12),
  exam_type text not null check (valid_exam_type(exam_type)),
  yks_part text check (yks_part in ('TYT', 'AYT'))
);
create unique index if not exists exam_type_defaults_uq on exam_type_defaults (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), grade);
insert into exam_type_defaults (grade, exam_type, yks_part)
select g, t, p from (values (5, 'GENEL', null), (6, 'GENEL', null), (7, 'GENEL', null), (8, 'LGS', null),
                            (9, 'TYT', null), (10, 'TYT', null), (11, 'AYT', null), (12, 'YKS', 'TYT')) v(g, t, p)
where not exists (select 1 from exam_type_defaults d where d.school_id is null and d.grade = v.g);

-- ---------- Deneme şablonu: dersler, soru sayıları, net kuralı ----------
create table if not exists exam_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),        -- null: yerleşik
  name text not null check (length(btrim(name)) between 3 and 100),
  grade smallint not null check (grade between 1 and 12),
  exam_types text[] not null check (array_length(exam_types, 1) >= 1),
  publisher_id uuid references publishers(id),
  format_id uuid references exam_format_profiles(id),
  wrong_per_correct numeric check (wrong_per_correct is null or wrong_per_correct > 0),  -- null: yanlış doğruyu götürmez
  strict_counts boolean not null default true,  -- D+Y+B = soru sayısı zorunlu mu (false: ≤)
  status text not null default 'hazir' check (status in ('hazir', 'bekliyor', 'pasif')),
  builtin boolean not null default false,
  source_note text,                             -- nereden doğrulandı
  created_at timestamptz not null default now()
);

-- Bölüm: dersin sınavdaki parçası (AYT'de TAR1/TAR2). key sonuç jsonb'sinde anahtar olur.
create table if not exists exam_template_sections (
  template_id uuid not null references exam_templates(id) on delete cascade,
  key text not null check (key ~ '^[A-Z][A-Z0-9_]{1,15}$'),
  subject_code text not null references subjects(code),
  label text not null,
  question_count int not null check (question_count between 1 and 200),
  sort int not null default 0,
  optional_group text,                          -- aynı gruptan yalnız biri uygulanır (ör. Din ↔ Felsefe-2); diğeri N/A
  outcome_grades smallint[],                    -- kazanım hangi sınıfların kataloğunda aranır (null: denemenin sınıfı)
  outcome_subject text references subjects(code), -- kazanım hangi dersin kataloğunda aranır (null: subject_code; TYT Türkçe → TDE)
  primary key (template_id, key)
);

-- ---------- Müfredat sürümü ve kazanım / öğrenme çıktısı kataloğu ----------
create table if not exists curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  authority text not null default 'Millî Eğitim Bakanlığı',
  name text not null,                           -- ör. "Ortaokul Matematik Dersi Öğretim Programı (2018)"
  curriculum_type text not null check (curriculum_type in ('LEGACY', 'TYMM')),
  grade smallint not null check (grade between 1 and 12),
  subject_code text not null references subjects(code),
  year_from smallint not null check (year_from between 2000 and 2100),  -- geçerli ilk eğitim yılının başlangıç yılı (2026 = 2026–2027)
  year_to smallint check (year_to is null or year_to >= year_from),    -- son eğitim yılı başlangıcı (null: hâlâ geçerli)
  outcome_kind text not null check (outcome_kind in ('KAZANIM', 'OGRENME_CIKTISI')),
  source_title text not null,
  source_url text not null,
  source_pages text,
  source_sha256 text,
  retrieved_at date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (curriculum_type, grade, subject_code, year_from)
);

create table if not exists learning_outcomes (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references curriculum_versions(id),
  grade smallint not null,
  subject_code text not null references subjects(code),
  code text,                                    -- resmî kaynakta yoksa null (yapay kod üretilmez)
  code_norm text generated always as (norm_code(code)) stored,
  title text not null,
  description text,
  theme text,
  unit text,
  outcome_type text not null check (outcome_type in ('KAZANIM', 'OGRENME_CIKTISI')),
  sort_order int not null default 0,
  source_page int,
  active boolean not null default true
);
-- Kod tek başına benzersiz DEĞİL: sürüm + kod + tema/ünite bağlamı.
create unique index if not exists learning_outcomes_ctx_uq on learning_outcomes (curriculum_version_id, code, coalesce(theme, ''), coalesce(unit, '')) where code is not null;
create index if not exists learning_outcomes_lookup on learning_outcomes (grade, subject_code, curriculum_version_id);
create index if not exists learning_outcomes_code on learning_outcomes (code_norm) where code_norm is not null;

-- Deneme tarihi → eğitim yılı başlangıcı (Eylül ve sonrası o yılın başlangıcı).
create or replace function academic_year_start(d date) returns smallint language sql immutable as $$
  select (extract(year from d) - case when extract(month from d) >= 9 then 0 else 1 end)::smallint
$$;
-- Bir sınıf + ders + eğitim yılı için geçerli müfredat sürümü (birden çoksa en yeni başlangıç).
create or replace function curriculum_for(p_grade smallint, p_subject text, p_year smallint) returns uuid
language sql stable as $$
  select id from curriculum_versions
  where grade = p_grade and subject_code = p_subject and active
    and year_from <= p_year and (year_to is null or year_to >= p_year)
  order by year_from desc limit 1
$$;

-- Yayıncının yazdığı kod/metin → doğrulanmış kazanım (bir kez onaylanınca sonraki denemelerde kullanılır).
create table if not exists learning_outcome_aliases (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  publisher_id uuid references publishers(id),
  format_id uuid references exam_format_profiles(id),
  subject_code text not null references subjects(code),
  grade smallint,
  curriculum_version_id uuid references curriculum_versions(id),
  raw_code text,
  raw_text text,
  raw_text_norm text generated always as (case when raw_text is null then null else norm_label(raw_text) end) stored,
  learning_outcome_id uuid not null references learning_outcomes(id),
  approved_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (raw_code is not null or raw_text is not null)
);
create index if not exists learning_outcome_aliases_lookup on learning_outcome_aliases (school_id, subject_code, raw_text_norm);

-- ---------- Denemeye eklenen alanlar ----------
alter table exams add column if not exists grade smallint check (grade between 1 and 12);
alter table exams add column if not exists exam_type text check (exam_type is null or valid_exam_type(exam_type));
alter table exams add column if not exists yks_part text check (yks_part in ('TYT', 'AYT'));
alter table exams add column if not exists exam_code text;
alter table exams add column if not exists academic_year text check (academic_year ~ '^\d{4}-\d{4}$');
alter table exams add column if not exists publisher_id uuid references publishers(id);
alter table exams add column if not exists format_id uuid references exam_format_profiles(id);
alter table exams add column if not exists exam_template_id uuid references exam_templates(id);
alter table exams add column if not exists target_class_ids uuid[] not null default '{}';
alter table exams add column if not exists status text check (status in ('taslak', 'yayinda', 'arsiv'));
alter table exams add column if not exists archived_at timestamptz;
alter table exams drop constraint if exists exams_yks_part_ck;
alter table exams add constraint exams_yks_part_ck check ((exam_type = 'YKS') = (yks_part is not null) or exam_type is null);

-- Eski yolla (yeni alanlar boş) eklenen deneme: 8. sınıf LGS (publish_exam yalnız 8. sınıf kabul eder).
create or replace function exams_defaults() returns trigger language plpgsql as $$
begin
  if new.grade is null and new.exam_type is null then
    new.grade := 8; new.exam_type := 'LGS';
  end if;
  new.academic_year := coalesce(new.academic_year, academic_year_start(new.exam_date) || '-' || (academic_year_start(new.exam_date) + 1));
  new.status := coalesce(new.status, case when new.published_at is not null then 'yayinda' else 'taslak' end);
  return new;
end $$;
drop trigger if exists exams_defaults on exams;
create trigger exams_defaults before insert on exams for each row execute function exams_defaults();

-- Mevcut kayıtlar (hepsi eski yoldan geldi): deterministik ve tekrar çalıştırılabilir doldurma; dolu alana dokunulmaz.
update exams set grade = 8, exam_type = 'LGS' where grade is null and exam_type is null;
update exams set academic_year = academic_year_start(exam_date) || '-' || (academic_year_start(exam_date) + 1) where academic_year is null;
update exams set status = case when published_at is not null then 'yayinda' else 'taslak' end where status is null;
-- status için sütun varsayılanı YOK: varsayılan tetikleyiciden önce uygulanır ve yayınlanmış LGS denemesini taslak yapardı.
alter table exams alter column status set not null;

alter table exam_results add column if not exists computed_score numeric;  -- sistemin hesapladığı (yayıncı puanı score'da kalır)
alter table exam_results add column if not exists total_net numeric;
alter table exam_results add column if not exists success_pct numeric check (success_pct is null or success_pct between -100 and 100);
comment on column exam_results.score is 'Yayıncının PDF''te verdiği puan (reported_score); sistem hesabı computed_score''da, üzerine yazılmaz.';
comment on column exam_results.success_pct is 'Başarı yüzdesi = toplam net / uygulanan bölümlerin toplam soru sayısı × 100 (net ile karıştırılmaz).';

-- Soru düzeyi (yeni denemeler): cevap anahtarı + kazanım eşleşmesi. LGS'de exam_questions aynen kullanılır.
create table if not exists exam_items (
  exam_id uuid not null references exams(id) on delete cascade,
  section_key text not null,
  q_no int not null check (q_no between 1 and 200),
  subject_code text not null references subjects(code),
  correct_answer text,
  raw_code text,                                -- PDF'te okunan
  raw_text text,
  outcome_grade smallint,                       -- kazanımın sınıfı (denemenin sınıfından farklı olabilir: TYT/AYT)
  curriculum_version_id uuid references curriculum_versions(id),
  learning_outcome_id uuid references learning_outcomes(id),
  match_method text not null default 'UNRESOLVED'
    check (match_method in ('CODE_EXACT', 'CODE_NORMALIZED', 'CONTEXT_EXACT', 'TEXT_EXACT', 'TEXT_NORMALIZED', 'TEXT_MATCH', 'ALIAS', 'MANUAL', 'SEMANTIC_MATCH', 'UNRESOLVED')),
  match_confidence numeric check (match_confidence is null or match_confidence between 0 and 1),
  primary key (exam_id, section_key, q_no),
  check ((learning_outcome_id is null) = (match_method in ('UNRESOLVED', 'SEMANTIC_MATCH')) or match_method = 'SEMANTIC_MATCH')
);
create index if not exists exam_items_outcome on exam_items (learning_outcome_id) where learning_outcome_id is not null;
create index if not exists exam_items_unresolved on exam_items (exam_id) where learning_outcome_id is null;

-- İçe aktarım geçmişi (dosya içeriği saklanmaz; yalnız özet ve hash).
create table if not exists exam_imports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) default my_school(),
  exam_id uuid references exams(id) on delete set null,
  uploaded_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  source_kind text not null check (source_kind in ('pdf', 'excel', 'csv', 'manuel')),
  filename text,
  file_sha256 text,
  publisher_id uuid references publishers(id),
  format_code text,
  grade smallint,
  exam_type text,
  student_count int not null default 0,
  result_count int not null default 0,
  outcome_count int not null default 0,
  unresolved_count int not null default 0,
  status text not null check (status in ('basarili', 'kismi', 'basarisiz')),
  detection jsonb not null default '{}'::jsonb, -- yayın/sınıf/biçim güveni ve kanıtları
  errors jsonb not null default '[]'::jsonb
);
create index if not exists exam_imports_school on exam_imports (school_id, created_at desc);

-- ---------- Yerleşik yayınlar, biçimler, şablonlar (2025–2026 Hız karnelerinden doğrulandı) ----------
-- Yalnız ad ve seri: biçim bağlantısı örnek PDF'le doğrulanmadan kurulmaz (Hız ve Fenomen dışında).
insert into publishers (name, series)
select n, sr from (values
  ('Hız Yayınları', '{Hız TG,Hız Kurumsal,Gelişim ve Değerlendirme}'::text[]), ('Frekans Yayınları', '{}'), ('Özdebir Yayınları', '{Türkiye Geneli}'),
  ('Fenomen Yayınları', '{}'), ('ATA Yayınları', '{Süreç Değerlendirme,LGS Max}'), ('Kafa Dengi Yayınları', '{}'), ('Sinan Kuzucu Yayınları', '{}'),
  ('TÖDER', '{}'), ('Hiper Zeka Yayınları', '{}'), ('Benim Hocam Yayınları', '{}'), ('Çanta Yayınları', '{}'), ('Nartest Yayınları', '{}'),
  ('Ankara Yayıncılık', '{}'), ('Allstar Yayınları', '{3-4-5 Allstar}'), ('3D Yayınları', '{}'), ('Bilgi Sarmal Yayınları', '{}'),
  ('Limit Yayınları', '{}'), ('Apotemi Yayınları', '{}'), ('Endemik Yayınları', '{}'), ('Karekök Yayınları', '{}'), ('Paraf Yayınları', '{}'),
  ('Yayın Denizi', '{}'), ('Acil Yayınları', '{}'), ('Tonguç Akademi', '{}'), ('Okyanus Yayınları', '{}'), ('Bilfen Yayıncılık', '{}'),
  ('Mozaik Yayınları', '{}'), ('Palme Yayınevi', '{}'), ('Esen Yayınları', '{}')
) v(n, sr)
where not exists (select 1 from publishers p where p.school_id is null and lower(p.name) = lower(v.n));

insert into exam_format_profiles (code, name, parser_family, supported_grades, supported_exam_types, detect, status, builtin, notes)
select * from (values
  ('hiz_cards_v1', 'Hız LGS sonuç kartı (Deneme Köprüsü)', 'LEGACY_DK', '{8}'::smallint[], '{LGS}'::text[],
   '{"headers":["ÖĞRENCİ SINAV\nSONUÇ BELGESİ"],"classPattern":"8/"}'::jsonb, 'aktif', true, 'Mevcut LGS motoru; değiştirilmeden kullanılır.'),
  ('fenomen_rows_v1', 'Fenomen LGS sonuç belgesi (Deneme Köprüsü)', 'LEGACY_DK', '{8}', '{LGS}', '{"headers":["ÖĞRENCİ SINAV SONUÇ BELGESİ"]}', 'aktif', true, 'Mevcut LGS motoru.'),
  ('schoolnet_grouped_v1', 'Gruplu sonuç belgesi (Deneme Köprüsü)', 'LEGACY_DK', '{8}', '{LGS}', '{"headers":["SONUÇ BELGESİ"]}', 'aktif', true, 'Mevcut LGS motoru.'),
  ('HIZ_ORTAOKUL_KARNE_V1', 'Hız ortaokul öğrenci karnesi', 'HIZ_ORTAOKUL', '{5,6,7}', '{GENEL,KURUMSAL}',
   '{"headers":["ÖĞRENCİ SINAV","SONUÇ BELGESİ"],"keywords":["GELİŞİM VE DEĞERLENDİRME","KAZANIMLAR"]}', 'test', true,
   'Sonuç sayfası + KAZANIMLAR sayfası. 8. sınıf aynı düzende ama LGS motoruyla okunur.'),
  ('HIZ_LISE_KARNE_V1', 'Hız lise öğrenci karnesi (TYT/AYT düzeni)', 'HIZ_LISE', '{9,10,11,12}', '{TYT,AYT,YKS,GENEL,KURUMSAL}',
   '{"headers":["ÖĞRENCİ SINAV","SONUÇ BELGESİ"],"keywords":["Sınav Karşılaştırma Grafiği"]}', 'test', true,
   'Frekans AYT de bu düzeni kullanır. Kazanımlar ikinci yüzde soru listesi.'),
  ('OZDEBIR_TG_V1', 'Özdebir Türkiye geneli karnesi', 'UNKNOWN', '{12}', '{TYT}', '{"keywords":["TÜRKİYE GENELİ DENEME"]}', 'test', true,
   'Tek örnek var; ayrıştırıcısı yazılana kadar tanınır ama okunmaz.')
) v(code, name, fam, gr, ty, det, st, b, nt)
where not exists (select 1 from exam_format_profiles f where f.school_id is null and f.code = v.code);

insert into publisher_formats (publisher_id, format_id)
select p.id, f.id from publishers p join exam_format_profiles f on f.school_id is null
where p.school_id is null and (p.name, f.code) in (('Hız Yayınları', 'hiz_cards_v1'), ('Hız Yayınları', 'HIZ_ORTAOKUL_KARNE_V1'),
  ('Hız Yayınları', 'HIZ_LISE_KARNE_V1'), ('Frekans Yayınları', 'HIZ_LISE_KARNE_V1'), ('Fenomen Yayınları', 'fenomen_rows_v1'), ('Özdebir Yayınları', 'OZDEBIR_TG_V1'))
on conflict do nothing;

-- Şablonlar: soru sayıları ve net kuralı tahmin değil; her biri belirtilen karnelerdeki bütün öğrencilerde
-- D+Y+B = soru sayısı ve net kuralıyla doğrulandı.
do $$
declare t uuid; hiz uuid; frk uuid; fo uuid; fl uuid; fl8 uuid;
begin
  if exists (select 1 from exam_templates where builtin) then return; end if;
  select id into hiz from publishers where school_id is null and name = 'Hız Yayınları';
  select id into frk from publishers where school_id is null and name = 'Frekans Yayınları';
  select id into fo from exam_format_profiles where school_id is null and code = 'HIZ_ORTAOKUL_KARNE_V1';
  select id into fl from exam_format_profiles where school_id is null and code = 'HIZ_LISE_KARNE_V1';
  select id into fl8 from exam_format_profiles where school_id is null and code = 'hiz_cards_v1';

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('5. Sınıf Hız Genel Deneme', 5, '{GENEL,KURUMSAL}', hiz, fo, 3, true, 'Hız 5. Sınıf Gelişim ve Değerlendirme-6 (2025–2026), 23 öğrenci') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort) values
    (t, 'TUR', 'TUR', 'Türkçe', 15, 1), (t, 'SOS', 'SOS', 'Sosyal Bilgiler', 10, 2), (t, 'DIN', 'DIN', 'Din Kültürü', 10, 3),
    (t, 'ING', 'ING', 'İngilizce', 10, 4), (t, 'MAT', 'MAT', 'Matematik', 15, 5), (t, 'FEN', 'FEN', 'Fen Bilimleri', 15, 6);

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('6. Sınıf Hız Genel Deneme', 6, '{GENEL,KURUMSAL}', hiz, fo, 3, true, 'Hız 6. Sınıf Gelişim ve Değerlendirme-6 (2025–2026), 24 öğrenci') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort) values
    (t, 'TUR', 'TUR', 'Türkçe', 15, 1), (t, 'SOS', 'SOS', 'Sosyal Bilgiler', 10, 2), (t, 'DIN', 'DIN', 'Din Kültürü', 10, 3),
    (t, 'ING', 'ING', 'İngilizce', 10, 4), (t, 'MAT', 'MAT', 'Matematik', 15, 5), (t, 'FEN', 'FEN', 'Fen Bilimleri', 15, 6);

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('7. Sınıf Hız Genel Deneme', 7, '{GENEL,KURUMSAL}', hiz, fo, 3, true, 'Hız 7. Sınıf Gelişim ve Değerlendirme-6 (2025–2026), 15 öğrenci') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort) values
    (t, 'TUR', 'TUR', 'Türkçe', 20, 1), (t, 'SOS', 'SOS', 'Sosyal Bilgiler', 10, 2), (t, 'DIN', 'DIN', 'Din Kültürü', 10, 3),
    (t, 'ING', 'ING', 'İngilizce', 10, 4), (t, 'MAT', 'MAT', 'Matematik', 20, 5), (t, 'FEN', 'FEN', 'Fen Bilimleri', 20, 6);

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('8. Sınıf LGS', 8, '{LGS}', hiz, fl8, 3, true, 'Mevcut LGS motoru (Deneme Köprüsü) soru sayıları') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort) values
    (t, 'TUR', 'TUR', 'Türkçe', 20, 1), (t, 'INK', 'INK', 'T.C. İnkılap Tarihi', 10, 2), (t, 'DIN', 'DIN', 'Din Kültürü', 10, 3),
    (t, 'ING', 'ING', 'İngilizce', 10, 4), (t, 'MAT', 'MAT', 'Matematik', 20, 5), (t, 'FEN', 'FEN', 'Fen Bilimleri', 20, 6);

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('9. Sınıf Hız TG Deneme', 9, '{TYT,GENEL,KURUMSAL}', hiz, fl, 4, true, 'Hız 9. Sınıf TG Deneme-6 (2025–2026), 6 öğrenci') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort) values
    (t, 'TDE', 'TDE', 'Türk Dili', 30, 1), (t, 'TAR', 'TAR', 'Tarih', 13, 2), (t, 'COG', 'COG', 'Coğrafya', 12, 3), (t, 'DIN', 'DIN', 'Din Kültürü', 5, 4),
    (t, 'MAT', 'MAT', 'Matematik', 30, 5), (t, 'FIZ', 'FIZ', 'Fizik', 10, 6), (t, 'KIM', 'KIM', 'Kimya', 10, 7), (t, 'BIY', 'BIY', 'Biyoloji', 10, 8);

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('10. Sınıf Hız TG Deneme', 10, '{TYT,GENEL,KURUMSAL}', hiz, fl, 4, true, 'Hız 10. Sınıf TG Deneme-6 (2025–2026), 17 öğrenci') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort) values
    (t, 'TDE', 'TDE', 'Türk Dili', 30, 1), (t, 'TAR', 'TAR', 'Tarih', 10, 2), (t, 'COG', 'COG', 'Coğrafya', 10, 3), (t, 'FEL', 'FEL', 'Felsefe', 5, 4),
    (t, 'DIN', 'DIN', 'Din Kültürü', 5, 5), (t, 'MAT', 'MAT', 'Matematik', 30, 6), (t, 'FIZ', 'FIZ', 'Fizik', 10, 7), (t, 'KIM', 'KIM', 'Kimya', 10, 8),
    (t, 'BIY', 'BIY', 'Biyoloji', 10, 9);

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('11. Sınıf Hız TG Deneme', 11, '{AYT,TYT,GENEL,KURUMSAL}', hiz, fl, 4, true, 'Hız 11. Sınıf TG Deneme-6 (2025–2026), 7 öğrenci; bölüm yapısı 10. sınıfla aynı') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort) values
    (t, 'TDE', 'TDE', 'Türk Dili', 30, 1), (t, 'TAR', 'TAR', 'Tarih', 10, 2), (t, 'COG', 'COG', 'Coğrafya', 10, 3), (t, 'FEL', 'FEL', 'Felsefe', 5, 4),
    (t, 'DIN', 'DIN', 'Din Kültürü', 5, 5), (t, 'MAT', 'MAT', 'Matematik', 30, 6), (t, 'FIZ', 'FIZ', 'Fizik', 10, 7), (t, 'KIM', 'KIM', 'Kimya', 10, 8),
    (t, 'BIY', 'BIY', 'Biyoloji', 10, 9);

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('12. Sınıf YKS · TYT (Hız)', 12, '{YKS,TYT}', hiz, fl, 4, true, 'Hız 12. Sınıf TYT TG-7 (2025–2026), 8 öğrenci') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort, optional_group, outcome_grades) values
    (t, 'TUR', 'TUR', 'Türkçe', 40, 1, null, '{9,10,11,12}'), (t, 'TAR', 'TAR', 'Tarih', 5, 2, null, '{9,10,11,12}'),
    (t, 'COG', 'COG', 'Coğrafya', 5, 3, null, '{9,10,11,12}'), (t, 'FEL', 'FEL', 'Felsefe', 5, 4, null, '{10,11}'),
    (t, 'DIN', 'DIN', 'Din Kültürü', 5, 5, 'DIN_FEL2', '{9,10,11,12}'), (t, 'FEL2', 'FEL', 'Felsefe-2', 5, 6, 'DIN_FEL2', '{10,11}'),
    (t, 'MAT', 'MAT', 'Matematik', 40, 7, null, '{9,10,11,12}'), (t, 'FIZ', 'FIZ', 'Fizik', 7, 8, null, '{9,10,11,12}'),
    (t, 'KIM', 'KIM', 'Kimya', 7, 9, null, '{9,10,11,12}'), (t, 'BIY', 'BIY', 'Biyoloji', 6, 10, null, '{9,10,11,12}');

  -- TYT "Türkçe" testi lise Türk Dili ve Edebiyatı programını ölçer: kazanım TDE kataloğunda aranır
  update exam_template_sections set outcome_subject = 'TDE' where template_id = t and key = 'TUR';

  insert into exam_templates (name, grade, exam_types, publisher_id, format_id, wrong_per_correct, builtin, source_note)
  values ('12. Sınıf YKS · AYT (Frekans)', 12, '{YKS,AYT}', frk, fl, 4, true, 'Frekans 25-26 AYT Deneme-7 (Hız lise düzeni), 8 öğrenci') returning id into t;
  insert into exam_template_sections (template_id, key, subject_code, label, question_count, sort, optional_group, outcome_grades) values
    (t, 'TDE', 'TDE', 'Türk Dili ve Edebiyatı', 24, 1, null, '{9,10,11,12}'), (t, 'TAR1', 'TAR', 'Tarih-1', 10, 2, null, '{9,10,11,12}'),
    (t, 'COG1', 'COG', 'Coğrafya-1', 6, 3, null, '{9,10,11,12}'), (t, 'TAR2', 'TAR', 'Tarih-2', 11, 4, null, '{9,10,11,12}'),
    (t, 'COG2', 'COG', 'Coğrafya-2', 11, 5, null, '{9,10,11,12}'), (t, 'FEL1', 'FEL', 'Felsefe Grubu', 12, 6, null, '{10,11,12}'),
    (t, 'DIN', 'DIN', 'Din Kültürü', 6, 7, 'DIN_FEL2', '{9,10,11,12}'), (t, 'FEL2', 'FEL', 'Felsefe-2', 6, 8, 'DIN_FEL2', '{10,11,12}'),
    (t, 'MAT', 'MAT', 'Matematik', 40, 9, null, '{9,10,11,12}'), (t, 'FIZ', 'FIZ', 'Fizik', 14, 10, null, '{9,10,11,12}'),
    (t, 'KIM', 'KIM', 'Kimya', 13, 11, null, '{9,10,11,12}'), (t, 'BIY', 'BIY', 'Biyoloji', 13, 12, null, '{9,10,11,12}');
end $$;

-- Mevcut 8. sınıf kataloğu (outcomes, 2018/2019 programları) yeni kataloğa da sürümüyle aktarılır; outcomes aynen kalır.
insert into curriculum_versions (name, curriculum_type, grade, subject_code, year_from, year_to, outcome_kind, source_title, source_url, retrieved_at)
select v.name, 'LEGACY', 8, v.s, 2018, null, 'KAZANIM', v.name, v.url, date '2026-09-28'
from (values
  ('MAT', 'Matematik Dersi Öğretim Programı (2018)', 'https://mufredat.meb.gov.tr/Dosyalar/201813017165445-MATEMAT%C4%B0K%20%C3%96%C4%9ERET%C4%B0M%20PROGRAMI%202018v.pdf'),
  ('FEN', 'Fen Bilimleri Dersi Öğretim Programı (2018)', 'https://mufredat.meb.gov.tr/Dosyalar/201812312311937-FEN%20B%C4%B0L%C4%B0MLER%C4%B0%20%C3%96%C4%9ERET%C4%B0M%20PROGRAMI2018.pdf'),
  ('TUR', 'Türkçe Dersi Öğretim Programı (2019)', 'https://mufredat.meb.gov.tr/Dosyalar/20195716392253-02-T%C3%BCrk%C3%A7e%20%C3%96%C4%9Fretim%20Program%C4%B1%202019.pdf'),
  ('INK', 'T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (2018)', 'https://mufredat.meb.gov.tr/Dosyalar/201812104016155-%C4%B0NKILAP%20TAR%C4%B0H%C4%B0%20VE%20ATAT%C3%9CRK%C3%87%C3%9CL%C3%9CK%20%C3%96%C4%9ERET%C4%B0M%20PROGRAMI.pdf'),
  ('DIN', 'Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (4–8, 2018)', 'https://mufredat.meb.gov.tr/Dosyalar/20221229134650712-DKAB_%284-8.%20S%C4%B1n%C4%B1f%29_DOP_%202018.pdf'),
  ('ING', 'İngilizce Dersi Öğretim Programı (2018)', 'https://mufredat.meb.gov.tr/Dosyalar/201812411191321-%C4%B0NG%C4%B0L%C4%B0ZCE%20%C3%96%C4%9ERET%C4%B0M%20PROGRAMI%20Klas%C3%B6r%C3%BC.pdf')
) v(s, name, url)
on conflict (curriculum_type, grade, subject_code, year_from) do nothing;

insert into learning_outcomes (curriculum_version_id, grade, subject_code, code, title, description, outcome_type, sort_order)
select cv.id, 8, o.subject::text, o.code, coalesce(o.full_text, o.title), null, 'KAZANIM', row_number() over (partition by o.subject order by o.code)
from outcomes o
join curriculum_versions cv on cv.curriculum_type = 'LEGACY' and cv.grade = 8 and cv.subject_code = o.subject::text and cv.year_from = 2018
where not exists (select 1 from learning_outcomes l where l.curriculum_version_id = cv.id and l.code = o.code);

-- ---------- Eşleşmeyen kazanımlar kuyruğu ----------
create or replace view unresolved_outcomes with (security_invoker = true) as
select i.exam_id, e.name as exam_name, e.grade, e.exam_type, e.publisher_id, e.format_id, i.section_key, i.subject_code, i.q_no,
       i.raw_code, i.raw_text, i.outcome_grade, i.curriculum_version_id, i.match_method, i.match_confidence
from exam_items i join exams e on e.id = i.exam_id
where i.learning_outcome_id is null and (i.raw_code is not null or i.raw_text is not null) and e.archived_at is null;

-- ---------- RLS ----------
alter table subjects enable row level security;
alter table subject_aliases enable row level security;
alter table publishers enable row level security;
alter table exam_format_profiles enable row level security;
alter table publisher_formats enable row level security;
alter table exam_type_defaults enable row level security;
alter table exam_templates enable row level security;
alter table exam_template_sections enable row level security;
alter table curriculum_versions enable row level security;
alter table learning_outcomes enable row level security;
alter table learning_outcome_aliases enable row level security;
alter table exam_items enable row level security;
alter table exam_imports enable row level security;

-- Başvuru verisi: onaylı herkes okur; katalog yalnız migration/içe aktarımla değişir (istemciden yazma yok).
drop policy if exists subjects_read on subjects;
create policy subjects_read on subjects for select using (is_approved());
drop policy if exists curriculum_read on curriculum_versions;
create policy curriculum_read on curriculum_versions for select using (is_approved());
drop policy if exists outcomes2_read on learning_outcomes;
create policy outcomes2_read on learning_outcomes for select using (is_approved());

-- Okul + yerleşik kayıtlar: okuma onaylı herkes, yazma yönetici (aal2) ve yalnız kendi okulunun satırı (yerleşikler kilitli).
drop policy if exists subject_aliases_read on subject_aliases;
create policy subject_aliases_read on subject_aliases for select using (is_approved() and (school_id is null or school_id = my_school()));
drop policy if exists subject_aliases_admin on subject_aliases;
create policy subject_aliases_admin on subject_aliases for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
drop policy if exists publishers_read on publishers;
create policy publishers_read on publishers for select using (is_approved() and (school_id is null or school_id = my_school()));
drop policy if exists publishers_admin on publishers;
create policy publishers_admin on publishers for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
drop policy if exists formats_read on exam_format_profiles;
create policy formats_read on exam_format_profiles for select using (is_approved() and (school_id is null or school_id = my_school()));
drop policy if exists formats_admin on exam_format_profiles;
create policy formats_admin on exam_format_profiles for all using (is_admin() and school_id = my_school() and not builtin)
  with check (is_admin() and school_id = my_school() and not builtin);
drop policy if exists publisher_formats_read on publisher_formats;
create policy publisher_formats_read on publisher_formats for select using (exists (select 1 from publishers p where p.id = publisher_id));
drop policy if exists publisher_formats_admin on publisher_formats;
-- Okul kendi yayınını herhangi bir biçime, ya da herhangi bir yayını (yerleşik dahil) kendi biçim kaydına bağlayabilir
create policy publisher_formats_admin on publisher_formats for all
  using (is_admin() and (exists (select 1 from publishers p where p.id = publisher_id and p.school_id = my_school())
                         or exists (select 1 from exam_format_profiles f where f.id = format_id and f.school_id = my_school() and not f.builtin)))
  with check (is_admin() and (exists (select 1 from publishers p where p.id = publisher_id and p.school_id = my_school())
                              or exists (select 1 from exam_format_profiles f where f.id = format_id and f.school_id = my_school() and not f.builtin)));
drop policy if exists type_defaults_read on exam_type_defaults;
create policy type_defaults_read on exam_type_defaults for select using (is_approved() and (school_id is null or school_id = my_school()));
drop policy if exists type_defaults_admin on exam_type_defaults;
create policy type_defaults_admin on exam_type_defaults for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
drop policy if exists templates_read on exam_templates;
create policy templates_read on exam_templates for select using (is_approved() and (school_id is null or school_id = my_school()));
drop policy if exists templates_admin on exam_templates;
create policy templates_admin on exam_templates for all using (is_admin() and school_id = my_school() and not builtin)
  with check (is_admin() and school_id = my_school() and not builtin);
drop policy if exists template_sections_read on exam_template_sections;
create policy template_sections_read on exam_template_sections for select using (exists (select 1 from exam_templates t where t.id = template_id));
drop policy if exists template_sections_admin on exam_template_sections;
create policy template_sections_admin on exam_template_sections for all
  using (is_admin() and exists (select 1 from exam_templates t where t.id = template_id and t.school_id = my_school() and not t.builtin))
  with check (is_admin() and exists (select 1 from exam_templates t where t.id = template_id and t.school_id = my_school() and not t.builtin));

-- Kazanım takma adları: rehberlik/yönetici okur; yalnız yönetici onaylar.
drop policy if exists lo_aliases_read on learning_outcome_aliases;
create policy lo_aliases_read on learning_outcome_aliases for select using (is_staff() and school_id = my_school());
drop policy if exists lo_aliases_admin on learning_outcome_aliases;
create policy lo_aliases_admin on learning_outcome_aliases for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());

-- Soru düzeyi: deneme görünürse okunur (exam_questions ile aynı); yazma rehberlik/yönetici.
drop policy if exists exam_items_read on exam_items;
create policy exam_items_read on exam_items for select using (exists (select 1 from exams e where e.id = exam_id));
drop policy if exists exam_items_staff on exam_items;
create policy exam_items_staff on exam_items for all
  using (is_staff() and exists (select 1 from exams e where e.id = exam_id and e.school_id = my_school()))
  with check (is_staff() and exists (select 1 from exams e where e.id = exam_id and e.school_id = my_school()));
drop policy if exists mod_lgs_items on exam_items;
create policy mod_lgs_items on exam_items as restrictive for all using (is_admin() or module_enabled('lgs'));

-- İçe aktarım geçmişi: rehberlik/yönetici.
drop policy if exists exam_imports_staff on exam_imports;
create policy exam_imports_staff on exam_imports for all using (is_staff() and school_id = my_school()) with check (is_staff() and school_id = my_school());

-- Taslak ve arşivdeki deneme ve sonuçları yalnız rehberlik/yönetici görür (yanlış içe aktarım veliye görünmez).
drop policy if exists exams_visible on exams;
create policy exams_visible on exams as restrictive for select using (is_staff() or status = 'yayinda');
drop policy if exists results_visible on exam_results;
create policy results_visible on exam_results as restrictive for select
  using (is_staff() or exists (select 1 from exams e where e.id = exam_id and e.status = 'yayinda'));

grant select on unresolved_outcomes to authenticated;
