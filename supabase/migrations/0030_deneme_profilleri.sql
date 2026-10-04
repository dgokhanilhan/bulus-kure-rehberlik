-- Deneme profilleri ve alt testler (2026–2027): okulun her sınıf için analiz etmek istediği alt testler, adları ve sırası.
-- Kaynak: okulun "MEB 2026–2027 Kodlu Öğrenme Hedefleri" paketindeki 8 profil (6, 6, 6, 6, 9, 10, 13, 13 alt test).
-- Profil, yayıncı şablonundan (soru sayısı, net kuralı) AYRIDIR: soru sayısı, puan ağırlığı ve net formülü burada YOK.
-- Gösterim: denemedeki şablon bölümü, aynı aşamadaki (TYT/AYT) izinli derse sahip alt teste eşlenir; denemede olmayan alt test
-- "ölçülmedi" görünür (başarısız sayılmaz), profilde olmayan bölüm ayrı listelenir. TYT ve AYT netleri ayrı kalır.
-- Okul türü: Buluş Küre Anadolu lisesi (fen lisesi değil) → 9–12 genel lise programları. Yabancı Dil = İngilizce (language_code en);
-- başka dilin sonucu İngilizceye bağlanmaz. 11–12 profillerinde yabancı dil alt testi yok (paketle aynı).
-- YALNIZ EKLEME, tekrar çalıştırılabilir. Yönetici okul profili ekleyebilir; yerleşik profiller kilitli.

create table if not exists exam_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),        -- null: yerleşik
  academic_year smallint not null check (academic_year between 2020 and 2100),  -- başlangıç yılı (2026 = 2026–2027)
  student_grade smallint not null check (student_grade between 1 and 12),
  school_type text not null check (school_type in ('ORTAOKUL', 'ANADOLU_LISESI', 'FEN_LISESI', 'DIGER')),
  program_family text not null check (program_family in ('TYMM', 'LEGACY')),
  outcome_term text not null check (outcome_term in ('OGRENME_CIKTISI', 'KAZANIM')),
  builtin boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists exam_profiles_uq on exam_profiles (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year, student_grade, school_type);

create table if not exists exam_subtests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references exam_profiles(id) on delete cascade,
  sort int not null,
  exam_stage text not null check (exam_stage in ('SCHOOL', 'LGS', 'TYT', 'AYT')),
  display_name text not null,                   -- okulun verdiği ad aynen (ör. "AYT İleri Matematik", "Yabancı Dil")
  canonical_subject text not null references subjects(code),
  section_subjects text[] not null,             -- bu alt teste eşlenebilen şablon bölümü dersleri (ör. TYT Türkçe: TUR, TDE)
  language_code text,                           -- Yabancı Dil: en
  unique (profile_id, sort)
);

alter table exam_profiles enable row level security;
alter table exam_subtests enable row level security;
drop policy if exists exam_profiles_read on exam_profiles;
create policy exam_profiles_read on exam_profiles for select using (is_approved() and (school_id is null or school_id = my_school()));
drop policy if exists exam_profiles_admin on exam_profiles;
create policy exam_profiles_admin on exam_profiles for all using (is_admin() and school_id = my_school() and not builtin)
  with check (is_admin() and school_id = my_school() and not builtin);
drop policy if exists exam_subtests_read on exam_subtests;
create policy exam_subtests_read on exam_subtests for select using (exists (select 1 from exam_profiles p where p.id = profile_id));
drop policy if exists exam_subtests_admin on exam_subtests;
create policy exam_subtests_admin on exam_subtests for all
  using (is_admin() and exists (select 1 from exam_profiles p where p.id = profile_id and p.school_id = my_school() and not p.builtin))
  with check (is_admin() and exists (select 1 from exam_profiles p where p.id = profile_id and p.school_id = my_school() and not p.builtin));

-- Yerleşik 2026–2027 profilleri (deterministik kimlik: tekrar çalıştırmak çoğaltmaz)
do $$
declare
  p jsonb;
  pid uuid;
  s jsonb;
  i int;
  profiles jsonb := $j$[
    {"g":5,"t":"ORTAOKUL","f":"TYMM","o":"OGRENME_CIKTISI","s":[["SCHOOL","Türkçe","TUR"],["SCHOOL","Matematik","MAT"],["SCHOOL","Fen Bilimleri","FEN"],["SCHOOL","Sosyal Bilgiler","SOS"],["SCHOOL","Din Kültürü ve Ahlak Bilgisi","DIN"],["SCHOOL","Yabancı Dil","ING"]]},
    {"g":6,"t":"ORTAOKUL","f":"TYMM","o":"OGRENME_CIKTISI","s":[["SCHOOL","Türkçe","TUR"],["SCHOOL","Matematik","MAT"],["SCHOOL","Fen Bilimleri","FEN"],["SCHOOL","Sosyal Bilgiler","SOS"],["SCHOOL","Din Kültürü ve Ahlak Bilgisi","DIN"],["SCHOOL","Yabancı Dil","ING"]]},
    {"g":7,"t":"ORTAOKUL","f":"TYMM","o":"OGRENME_CIKTISI","s":[["SCHOOL","Türkçe","TUR"],["SCHOOL","Matematik","MAT"],["SCHOOL","Fen Bilimleri","FEN"],["SCHOOL","Sosyal Bilgiler","SOS"],["SCHOOL","Din Kültürü ve Ahlak Bilgisi","DIN"],["SCHOOL","Yabancı Dil","ING"]]},
    {"g":8,"t":"ORTAOKUL","f":"LEGACY","o":"KAZANIM","s":[["LGS","Türkçe","TUR"],["LGS","Matematik","MAT"],["LGS","Fen Bilimleri","FEN"],["LGS","T.C. İnkılap Tarihi ve Atatürkçülük","INK"],["LGS","Din Kültürü ve Ahlak Bilgisi","DIN"],["LGS","Yabancı Dil","ING"]]},
    {"g":9,"t":"ANADOLU_LISESI","f":"TYMM","o":"OGRENME_CIKTISI","s":[["SCHOOL","Türk Dili ve Edebiyatı","TDE"],["SCHOOL","Matematik","MAT"],["SCHOOL","Fizik","FIZ"],["SCHOOL","Kimya","KIM"],["SCHOOL","Biyoloji","BIY"],["SCHOOL","Tarih","TAR"],["SCHOOL","Coğrafya","COG"],["SCHOOL","Din Kültürü ve Ahlak Bilgisi","DIN"],["SCHOOL","Yabancı Dil","ING"]]},
    {"g":10,"t":"ANADOLU_LISESI","f":"TYMM","o":"OGRENME_CIKTISI","s":[["SCHOOL","Türk Dili ve Edebiyatı","TDE"],["SCHOOL","Matematik","MAT"],["SCHOOL","Fizik","FIZ"],["SCHOOL","Kimya","KIM"],["SCHOOL","Biyoloji","BIY"],["SCHOOL","Tarih","TAR"],["SCHOOL","Coğrafya","COG"],["SCHOOL","Felsefe","FEL"],["SCHOOL","Din Kültürü ve Ahlak Bilgisi","DIN"],["SCHOOL","Yabancı Dil","ING"]]},
    {"g":11,"t":"ANADOLU_LISESI","f":"TYMM","o":"OGRENME_CIKTISI","s":[["TYT","TYT Türkçe","TUR"],["TYT","TYT Matematik","MAT"],["TYT","TYT Fizik","FIZ"],["TYT","TYT Kimya","KIM"],["TYT","TYT Biyoloji","BIY"],["TYT","TYT Tarih","TAR"],["TYT","TYT Coğrafya","COG"],["TYT","TYT Felsefe","FEL"],["TYT","TYT Din Kültürü ve Ahlak Bilgisi","DIN"],["AYT","AYT İleri Matematik","MAT"],["AYT","AYT İleri Fizik","FIZ"],["AYT","AYT İleri Kimya","KIM"],["AYT","AYT İleri Biyoloji","BIY"]]},
    {"g":12,"t":"ANADOLU_LISESI","f":"LEGACY","o":"KAZANIM","s":[["TYT","TYT Türkçe","TUR"],["TYT","TYT Temel Matematik","MAT"],["TYT","TYT Fizik","FIZ"],["TYT","TYT Kimya","KIM"],["TYT","TYT Biyoloji","BIY"],["TYT","TYT Tarih","TAR"],["TYT","TYT Coğrafya","COG"],["TYT","TYT Felsefe","FEL"],["TYT","TYT Din Kültürü ve Ahlak Bilgisi","DIN"],["AYT","AYT Matematik","MAT"],["AYT","AYT Fizik","FIZ"],["AYT","AYT Kimya","KIM"],["AYT","AYT Biyoloji","BIY"]]}
  ]$j$::jsonb;
begin
  for p in select * from jsonb_array_elements(profiles) loop
    pid := md5('exam_profile|2026|' || (p->>'g') || '|' || (p->>'t'))::uuid;
    insert into exam_profiles (id, academic_year, student_grade, school_type, program_family, outcome_term, builtin, notes)
    values (pid, 2026, (p->>'g')::smallint, p->>'t', p->>'f', p->>'o', true, 'Okulun 2026–2027 deneme profili (kaynak paketi). Soru sayısı ve net kuralı şablonda.')
    on conflict do nothing;
    i := 0;
    for s in select * from jsonb_array_elements(p->'s') loop
      i := i + 1;
      insert into exam_subtests (id, profile_id, sort, exam_stage, display_name, canonical_subject, section_subjects, language_code)
      values (md5('exam_subtest|' || pid || '|' || i)::uuid, pid, i, s->>0, s->>1, s->>2,
              case when s->>2 = 'TUR' and s->>0 = 'TYT' then array['TUR', 'TDE'] else array[s->>2] end,
              case when s->>2 = 'ING' then 'en' end)
      on conflict do nothing;
    end loop;
  end loop;
end $$;
