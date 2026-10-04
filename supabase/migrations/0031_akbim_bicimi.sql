-- Akbim ODS sonuç belgesi biçimi (yazılım biçimi; yayından bağımsız) ve yayın bağlantıları.
-- Kurumların optik okuma yazılımı (Akbim ODS) farklı yayınların denemelerini aynı karne düzeninde basar: TÖDER ve Sinan Kuzucu
-- örnek karneleri (8. sınıf LGS; 35 + 124 öğrenci) genel motorla soru düzeyi dahil hatasız okundu. Benim Hocam karnesi mevcut
-- LGS motorunun "gruplu sonuç belgesi" düzeninde (schoolnet_grouped_v1) okunuyor: o biçime bağlanır.
-- 8. sınıf Akbim karnesi genel akıştan LGS türünde içe aktarılır (LGS motoru bu düzeni okumaz); Hız 8 LGS motorunda kalır.
-- YALNIZ EKLEME, tekrar çalıştırılabilir.
insert into exam_format_profiles (code, name, parser_family, supported_grades, supported_exam_types, detect, status, builtin, notes)
select 'AKBIM_SONUC_BELGESI_V1', 'Akbim ODS sınav sonuç belgesi', 'AKBIM', '{5,6,7,8}'::smallint[], '{LGS,GENEL,KURUMSAL}'::text[],
       '{"headers":["SINAV SONUÇ BELGESİ"],"keywords":["DERSLER","SORU SAYISI","NET SAYISI","Akbim ODS"]}'::jsonb, 'aktif', true,
       'Yayından bağımsız yazılım biçimi (TÖDER, Sinan Kuzucu örnekleri). 5–7 örneği yok: o sınıflarda şablon soru sayıları kontrol edilmeli.'
where not exists (select 1 from exam_format_profiles where school_id is null and code = 'AKBIM_SONUC_BELGESI_V1');

insert into publisher_formats (publisher_id, format_id)
select p.id, f.id from publishers p join exam_format_profiles f on f.school_id is null
where p.school_id is null and (p.name, f.code) in (('TÖDER', 'AKBIM_SONUC_BELGESI_V1'), ('Sinan Kuzucu Yayınları', 'AKBIM_SONUC_BELGESI_V1'), ('Benim Hocam Yayınları', 'schoolnet_grouped_v1'))
on conflict do nothing;

-- Okulun 2026–2027 lise deneme takviminde olup listede olmayan yayınlar ve seri adları (yalnız ad: biçim bağlantısı örnek
-- karneyle doğrulanmadan kurulmaz; o zamana kadar PDF'leri Excel/CSV ya da elle girilir).
insert into publishers (name, series)
select n, sr from (values
  ('VİP Yayınları', '{}'::text[]), ('Eksen Yayınları', '{}'), ('Liderler Karması', '{}'), ('Üç Dört Beş Yayınları', '{}'), ('Aydın Yayınları', '{}'),
  ('4K Yayınları', '{}'), ('Eğitim Vadisi Yayınları', '{}'), ('Miray Yayınları', '{}')
) v(n, sr)
where not exists (select 1 from publishers p where p.school_id is null and lower(p.name) = lower(v.n));
update publishers set series = series || array[s] from (values ('Özdebir Yayınları', 'MSÜ'), ('Paraf Yayınları', 'Paraf Mor'), ('Palme Yayınevi', 'Enerji')) v(n, s)
where school_id is null and name = v.n and not (v.s = any(series));
