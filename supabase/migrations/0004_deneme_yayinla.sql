-- Aşama 3 · Deneme yükleme, yayınlama ve geri alma
-- PDF tarayıcıda (Deneme Köprüsü motoru, Web Worker) okunur; sunucuya yalnız okunan yapı gelir.
-- Sunucu, sonuç kurallarını (D+Y+B = soru sayısı, net = D − Y/3) yeniden doğrular: istemciye güvenilmez.

alter table exams add column source_sha256 text;
alter table exams add column created_students uuid[] not null default '{}';
create unique index exams_school_sha on exams (school_id, source_sha256) where source_sha256 is not null;

alter table exam_results add column source jsonb not null default '{}'::jsonb;  -- {page, adapter, recordId}

-- Ders soru sayıları (legacy motorla aynı)
create or replace function subject_q(s subject_code) returns int language sql immutable as
$$ select case s when 'TUR' then 20 when 'MAT' then 20 when 'FEN' then 20 else 10 end $$;

-- ---------- Yayınla ----------
-- p: { name, publisher, template_id, exam_date, sha256, notify,
--      questions: [{subject, q_no, correct_answer, outcome_code, match}],
--      results:   [{student_id | new_student:{full_name, class_name, school_no},
--                   score, subjects:{TUR:{d,y,b,net}|null,…}, answers:{TUR:"AB_?…"}, outcomes_ok, source}] }
-- Aynı PDF (sha256) ikinci kez gelirse yeni kayıt açılmaz, mevcut deneme döner (idempotent).
create or replace function publish_exam(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := my_school();
  v_exam uuid;
  v_created uuid[] := '{}';
  v_name text := btrim(coalesce(p->>'name', ''));
  v_date date := (p->>'exam_date')::date;
  r jsonb;
  s record;
  v_sid uuid;
  v_seen uuid[] := '{}';
  v_subjects jsonb;
  k text;
  n int := 0;
  st students;
begin
  if not is_staff() then
    raise exception 'Deneme yayınlamak için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501';
  end if;
  if length(v_name) < 1 or length(v_name) > 80 then raise exception 'Deneme adı gerekli.' using errcode = '22023'; end if;
  if v_date is null or v_date > tr_today() then raise exception 'Deneme tarihi bugünden sonra olamaz.' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p->'results', '[]')) = 0 then raise exception 'Yayınlanacak sonuç yok.' using errcode = '22023'; end if;

  if p->>'sha256' is not null then
    select id into v_exam from exams where school_id = v_school and source_sha256 = p->>'sha256';
    if v_exam is not null then return v_exam; end if;
  end if;

  insert into exams (school_id, name, publisher, template_id, exam_date, published_at, published_by, source_sha256)
  values (v_school, v_name, nullif(btrim(p->>'publisher'), ''), p->>'template_id', v_date, now(), auth.uid(), p->>'sha256')
  returning id into v_exam;

  -- Cevap anahtarı ve kazanım eşleşmesi. Katalogda olmayan kod analize girmez.
  insert into exam_questions (exam_id, subject, q_no, correct_answer, outcome_code, match)
  select v_exam, (x->>'subject')::subject_code, (x->>'q_no')::int, nullif(x->>'correct_answer', ''),
         o.code,
         case when o.code is null then 'none' else coalesce((x->>'match')::match_level, 'none') end
  from jsonb_array_elements(coalesce(p->'questions', '[]')) x
  left join outcomes o on o.code = x->>'outcome_code' and o.subject = (x->>'subject')::subject_code;

  for r in select * from jsonb_array_elements(p->'results') loop
    -- Öğrenci: mevcut kayıt ya da (kontrol ekranında seçildiyse) yeni kayıt
    if r->>'student_id' is not null then
      v_sid := (r->>'student_id')::uuid;
      if not exists (select 1 from students where id = v_sid and school_id = v_school and archived_at is null) then
        raise exception 'Öğrenci kaydı bulunamadı.' using errcode = 'P0002';
      end if;
    elsif r ? 'new_student' then
      if coalesce(r->'new_student'->>'class_name', '') !~ '^8/[A-Z]$' or length(btrim(coalesce(r->'new_student'->>'full_name', ''))) < 3 then
        raise exception 'Yeni öğrenci bilgisi eksik.' using errcode = '22023';
      end if;
      begin
        insert into students (school_id, full_name, class_name, school_no)
        values (v_school, btrim(r->'new_student'->>'full_name'), r->'new_student'->>'class_name', nullif(btrim(r->'new_student'->>'school_no'), ''))
        returning id into v_sid;
      exception when unique_violation then
        raise exception 'Bu okul numarası başka bir öğrencide kayıtlı: %', r->'new_student'->>'school_no' using errcode = '23505';
      end;
      v_created := v_created || v_sid;
    else
      raise exception 'Sonuç satırında öğrenci yok.' using errcode = '22023';
    end if;
    if v_sid = any(v_seen) then
      raise exception 'Aynı öğrenci iki kez eşleştirildi.' using errcode = '23505';
    end if;
    v_seen := v_seen || v_sid;

    -- Sonuç kuralları: ders ya yoktur (okunamadı, NULL) ya da tutarlıdır.
    v_subjects := '{}'::jsonb;
    for k in select jsonb_object_keys(coalesce(r->'subjects', '{}')) loop
      if k not in ('TUR','MAT','FEN','INK','DIN','ING') then raise exception 'Geçersiz ders: %', k using errcode = '22023'; end if;
      continue when jsonb_typeof(r->'subjects'->k) = 'null';
      select (r->'subjects'->k->>'d')::int as d, (r->'subjects'->k->>'y')::int as y,
             (r->'subjects'->k->>'b')::int as b, (r->'subjects'->k->>'net')::numeric as net into s;
      if s.d < 0 or s.y < 0 or s.b < 0 or s.d + s.y + s.b <> subject_q(k::subject_code) then
        raise exception 'Doğru + yanlış + boş, soru sayısını tutmuyor: %', k using errcode = '22023';
      end if;
      if abs(s.net - (s.d - s.y / 3.0)) > 0.011 then
        raise exception 'Net, doğru − yanlış/3 ile tutmuyor: %', k using errcode = '22023';
      end if;
      v_subjects := v_subjects || jsonb_build_object(k, jsonb_build_object('d', s.d, 'y', s.y, 'b', s.b, 'net', round(s.net, 2)));
    end loop;
    if v_subjects = '{}'::jsonb then raise exception 'Hiç ders sonucu okunamamış bir satır yayınlanamaz.' using errcode = '22023'; end if;

    insert into exam_results (exam_id, student_id, score, subjects, answers, outcomes_ok, source)
    values (v_exam, v_sid, (r->>'score')::numeric, v_subjects, r->'answers', coalesce((r->>'outcomes_ok')::boolean, false), coalesce(r->'source', '{}'::jsonb));
    n := n + 1;

    if coalesce((p->>'notify')::boolean, false) then
      select * into st from students where id = v_sid;
      perform notify_many(array(select parent_accounts(v_sid)) || array(select student_accounts(v_sid)),
        v_name || ' sonucu yayınlandı: ' || st.full_name, '{"page":"ozet"}');
    end if;
  end loop;

  update exams set created_students = v_created where id = v_exam;
  perform notify_many(array(select admin_accounts(v_school)), v_name || ' yayınlandı (' || n || ' öğrenci)', '{"page":"denemeler"}');
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'publish', 'exams', v_exam, jsonb_build_object('results', n, 'new_students', coalesce(array_length(v_created, 1), 0), 'sha256', p->>'sha256'));
  return v_exam;
end $$;

-- ---------- Geri al (yayından sonraki 7 gün) ----------
create or replace function unpublish_exam(p_exam uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e exams;
begin
  if not is_staff() then
    raise exception 'Bu işlem için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501';
  end if;
  select * into e from exams where id = p_exam and school_id = my_school() for update;
  if e.id is null then raise exception 'Deneme bulunamadı.' using errcode = 'P0002'; end if;
  if e.published_at is null or e.published_at < now() - interval '7 days' then
    raise exception 'Yayından 7 gün geçti; deneme artık geri alınamaz.' using errcode = '22023';
  end if;
  delete from exams where id = e.id;  -- sonuçlar, anahtar ve raporlar birlikte silinir
  -- Bu yayında açılan ve başka hiçbir kaydı olmayan öğrenci kayıtları da kaldırılır.
  delete from students s where s.id = any(e.created_students)
    and not exists (select 1 from exam_results x where x.student_id = s.id)
    and not exists (select 1 from profiles p where p.student_id = s.id)
    and not exists (select 1 from parent_links l where l.student_id = s.id)
    and not exists (select 1 from tasks t where t.student_id = s.id);
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'unpublish', 'exams', e.id, jsonb_build_object('name', e.name));
end $$;

revoke all on function publish_exam(jsonb) from public, anon;
revoke all on function unpublish_exam(uuid) from public, anon;
grant execute on function publish_exam(jsonb) to authenticated;
grant execute on function unpublish_exam(uuid) to authenticated;

-- ---------- Resmî kazanım kataloğu (MEB 2018 / Türkçe 2019) ----------
-- OTOMATİK ÜRETİLDİ — scripts/gen-outcomes.mjs (meb-8-2018-tr2019, 326 kazanım)
insert into outcomes (code, subject, title, full_text) values
  ('M.8.1.1.1', 'MAT', 'Verilen pozitif tam sayıların pozitif tam sayı çarpanlarını bulur, pozitif…', 'Verilen pozitif tam sayıların pozitif tam sayı çarpanlarını bulur, pozitif tam sayıların pozitif tam sayı çarpanlarını üslü ifadelerin çarpımı şeklinde yazar.'),
  ('M.8.1.1.2', 'MAT', 'İki doğal sayının en büyük ortak bölenini (EBOB) ve en küçük ortak katını…', 'İki doğal sayının en büyük ortak bölenini (EBOB) ve en küçük ortak katını (EKOK) hesaplar, ilgili problemleri çözer.'),
  ('M.8.1.1.3', 'MAT', 'Verilen iki doğal sayının aralarında asal olup olmadığını belirler', 'Verilen iki doğal sayının aralarında asal olup olmadığını belirler.'),
  ('M.8.1.2.1', 'MAT', 'Tam sayıların, tam sayı kuvvetlerini hesaplar', 'Tam sayıların, tam sayı kuvvetlerini hesaplar.'),
  ('M.8.1.2.2', 'MAT', 'Üslü ifadelerle ilgili temel kuralları anlar, birbirine denk ifadeler oluşturur', 'Üslü ifadelerle ilgili temel kuralları anlar, birbirine denk ifadeler oluşturur.'),
  ('M.8.1.2.3', 'MAT', 'Sayıların ondalık gösterimlerini 10’un tam sayı kuvvetlerini kullanarak çözümler', 'Sayıların ondalık gösterimlerini 10’un tam sayı kuvvetlerini kullanarak çözümler.'),
  ('M.8.1.2.4', 'MAT', 'Verilen bir sayıyı 10’un farklı tam sayı kuvvetlerini kullanarak ifade eder', 'Verilen bir sayıyı 10’un farklı tam sayı kuvvetlerini kullanarak ifade eder.'),
  ('M.8.1.2.5', 'MAT', 'Çok büyük ve çok küçük sayıları bilimsel gösterimle ifade eder ve karşılaştırır', 'Çok büyük ve çok küçük sayıları bilimsel gösterimle ifade eder ve karşılaştırır.'),
  ('M.8.1.3.1', 'MAT', 'Tam kare pozitif tam sayılarla bu sayıların karekökleri arasındaki ilişkiyi…', 'Tam kare pozitif tam sayılarla bu sayıların karekökleri arasındaki ilişkiyi belirler.'),
  ('M.8.1.3.2', 'MAT', 'Tam kare olmayan kareköklü bir sayının hangi iki doğal sayı arasında…', 'Tam kare olmayan kareköklü bir sayının hangi iki doğal sayı arasında olduğunu belirler.'),
  ('M.8.1.3.3', 'MAT', 'Kareköklü bir ifadeyi a b şeklinde yazar ve a b şeklindeki ifadede katsayıyı…', 'Kareköklü bir ifadeyi a b şeklinde yazar ve a b şeklindeki ifadede katsayıyı kök içine alır.'),
  ('M.8.1.3.4', 'MAT', 'Kareköklü ifadelerde çarpma ve bölme işlemlerini yapar', 'Kareköklü ifadelerde çarpma ve bölme işlemlerini yapar.'),
  ('M.8.1.3.5', 'MAT', 'Kareköklü ifadelerde toplama ve çıkarma işlemlerini yapar', 'Kareköklü ifadelerde toplama ve çıkarma işlemlerini yapar.'),
  ('M.8.1.3.6', 'MAT', 'Kareköklü bir ifade ile çarpıldığında, sonucu bir doğal sayı yapan…', 'Kareköklü bir ifade ile çarpıldığında, sonucu bir doğal sayı yapan çarpanlara örnek verir.'),
  ('M.8.1.3.7', 'MAT', 'Ondalık ifadelerin kareköklerini belirler', 'Ondalık ifadelerin kareköklerini belirler.'),
  ('M.8.1.3.8', 'MAT', 'Gerçek sayıları tanır, rasyonel ve irrasyonel sayılarla ilişkilendirir', 'Gerçek sayıları tanır, rasyonel ve irrasyonel sayılarla ilişkilendirir.'),
  ('M.8.2.1.1', 'MAT', 'Basit cebirsel ifadeleri anlar ve farklı biçimlerde yazar', 'Basit cebirsel ifadeleri anlar ve farklı biçimlerde yazar.'),
  ('M.8.2.1.2', 'MAT', 'Cebirsel ifadelerin çarpımını yapar', 'Cebirsel ifadelerin çarpımını yapar.'),
  ('M.8.2.1.3', 'MAT', 'Özdeşlikleri modellerle açıklar', 'Özdeşlikleri modellerle açıklar.'),
  ('M.8.2.1.4', 'MAT', 'Cebirsel ifadeleri çarpanlara ayırır', 'Cebirsel ifadeleri çarpanlara ayırır.'),
  ('M.8.2.2.1', 'MAT', 'Birinci dereceden bir bilinmeyenli denklemleri çözer', 'Birinci dereceden bir bilinmeyenli denklemleri çözer.'),
  ('M.8.2.2.2', 'MAT', 'Koordinat sistemini özellikleriyle tanır ve sıralı ikilileri gösterir', 'Koordinat sistemini özellikleriyle tanır ve sıralı ikilileri gösterir.'),
  ('M.8.2.2.3', 'MAT', 'Aralarında doğrusal ilişki bulunan iki değişkenden birinin diğerine bağlı…', 'Aralarında doğrusal ilişki bulunan iki değişkenden birinin diğerine bağlı olarak nasıl değiştiğini tablo ve denklem ile ifade eder.'),
  ('M.8.2.2.4', 'MAT', 'Doğrusal denklemlerin grafiğini çizer', 'Doğrusal denklemlerin grafiğini çizer.'),
  ('M.8.2.2.5', 'MAT', 'Doğrusal ilişki içeren gerçek hayat durumlarına ait denklem, tablo ve…', 'Doğrusal ilişki içeren gerçek hayat durumlarına ait denklem, tablo ve grafiği oluşturur ve yorumlar.'),
  ('M.8.2.2.6', 'MAT', 'Doğrunun eğimini modellerle açıklar, doğrusal denklemleri ve grafiklerini…', 'Doğrunun eğimini modellerle açıklar, doğrusal denklemleri ve grafiklerini eğimle ilişkilendirir.'),
  ('M.8.2.3.1', 'MAT', 'Birinci dereceden bir bilinmeyenli eşitsizlik içeren günlük hayat…', 'Birinci dereceden bir bilinmeyenli eşitsizlik içeren günlük hayat durumlarına uygun matematik cümleleri yazar.'),
  ('M.8.2.3.2', 'MAT', 'Birinci dereceden bir bilinmeyenli eşitsizlikleri sayı doğrusunda gösterir', 'Birinci dereceden bir bilinmeyenli eşitsizlikleri sayı doğrusunda gösterir.'),
  ('M.8.2.3.3', 'MAT', 'Birinci dereceden bir bilinmeyenli eşitsizlikleri çözer', 'Birinci dereceden bir bilinmeyenli eşitsizlikleri çözer.'),
  ('M.8.3.1.1', 'MAT', 'Üçgende kenarortay, açıortay ve yüksekliği inşa eder', 'Üçgende kenarortay, açıortay ve yüksekliği inşa eder.'),
  ('M.8.3.1.2', 'MAT', 'Üçgenin iki kenar uzunluğunun toplamı veya farkı ile üçüncü kenarının…', 'Üçgenin iki kenar uzunluğunun toplamı veya farkı ile üçüncü kenarının uzunluğunu ilişkilendirir.'),
  ('M.8.3.1.3', 'MAT', 'Üçgenin kenar uzunlukları ile bu kenarların karşısındaki açıların ölçülerini…', 'Üçgenin kenar uzunlukları ile bu kenarların karşısındaki açıların ölçülerini ilişkilendirir.'),
  ('M.8.3.1.4', 'MAT', 'Yeterli sayıda elemanının ölçüleri verilen bir üçgeni çizer', 'Yeterli sayıda elemanının ölçüleri verilen bir üçgeni çizer.'),
  ('M.8.3.1.5', 'MAT', 'Pisagor bağıntısını oluşturur, ilgili problemleri çözer', 'Pisagor bağıntısını oluşturur, ilgili problemleri çözer.'),
  ('M.8.3.2.1', 'MAT', 'Nokta, doğru parçası ve diğer şekillerin öteleme sonucundaki görüntülerini çizer', 'Nokta, doğru parçası ve diğer şekillerin öteleme sonucundaki görüntülerini çizer.'),
  ('M.8.3.2.2', 'MAT', 'Nokta, doğru parçası ve diğer şekillerin yansıma sonucu oluşan görüntüsünü…', 'Nokta, doğru parçası ve diğer şekillerin yansıma sonucu oluşan görüntüsünü oluşturur.'),
  ('M.8.3.2.3', 'MAT', 'Çokgenlerin öteleme ve yansımalar sonucunda ortaya çıkan görüntüsünü oluşturur', 'Çokgenlerin öteleme ve yansımalar sonucunda ortaya çıkan görüntüsünü oluşturur.'),
  ('M.8.3.3.1', 'MAT', 'Eşlik ve benzerliği ilişkilendirir, eş ve benzer şekillerin kenar ve açı…', 'Eşlik ve benzerliği ilişkilendirir, eş ve benzer şekillerin kenar ve açı ilişkilerini belirler.'),
  ('M.8.3.3.2', 'MAT', 'Benzer çokgenlerin benzerlik oranını belirler, bir çokgene eş ve benzer…', 'Benzer çokgenlerin benzerlik oranını belirler, bir çokgene eş ve benzer çokgenler oluşturur.'),
  ('M.8.3.4.1', 'MAT', 'Dik prizmaları tanır, temel elemanlarını belirler, inşa eder ve açınımını çizer', 'Dik prizmaları tanır, temel elemanlarını belirler, inşa eder ve açınımını çizer.'),
  ('M.8.3.4.2', 'MAT', 'Dik dairesel silindirin temel elemanlarını belirler, inşa eder ve açınımını…', 'Dik dairesel silindirin temel elemanlarını belirler, inşa eder ve açınımını çizer.'),
  ('M.8.3.4.3', 'MAT', 'Dik dairesel silindirin yüzey alanı bağıntısını oluşturur, ilgili…', 'Dik dairesel silindirin yüzey alanı bağıntısını oluşturur, ilgili problemleri çözer.'),
  ('M.8.3.4.4', 'MAT', 'Dik dairesel silindirin hacim bağıntısını oluşturur; ilgili problemleri çözer', 'Dik dairesel silindirin hacim bağıntısını oluşturur; ilgili problemleri çözer.'),
  ('M.8.3.4.5', 'MAT', 'Dik piramidi tanır, temel elemanlarını belirler, inşa eder ve açınımını çizer', 'Dik piramidi tanır, temel elemanlarını belirler, inşa eder ve açınımını çizer.'),
  ('M.8.3.4.6', 'MAT', 'Dik koniyi tanır, temel elemanlarını belirler, inşa eder ve açınımını çizer', 'Dik koniyi tanır, temel elemanlarını belirler, inşa eder ve açınımını çizer.'),
  ('M.8.4.1.1', 'MAT', 'En fazla üç veri grubuna ait çizgi ve sütun grafiklerini yorumlar', 'En fazla üç veri grubuna ait çizgi ve sütun grafiklerini yorumlar.'),
  ('M.8.4.1.2', 'MAT', 'Verileri sütun, daire veya çizgi grafiği ile gösterir ve bu gösterimler…', 'Verileri sütun, daire veya çizgi grafiği ile gösterir ve bu gösterimler arasında uygun olan dönüşümleri yapar.'),
  ('M.8.5.1.1', 'MAT', 'Bir olaya ait olası durumları belirler', 'Bir olaya ait olası durumları belirler.'),
  ('M.8.5.1.2', 'MAT', '“Daha fazla”, “eşit”, “daha az” olasılıklı olayları ayırt eder, örnek verir', '“Daha fazla”, “eşit”, “daha az” olasılıklı olayları ayırt eder, örnek verir.'),
  ('M.8.5.1.3', 'MAT', 'Eşit şansa sahip olan olaylarda her bir çıktının olasılık değerinin eşit…', 'Eşit şansa sahip olan olaylarda her bir çıktının olasılık değerinin eşit olduğunu ve bu değerin 1/n olduğunu açıklar.'),
  ('M.8.5.1.4', 'MAT', 'Olasılık değerinin 0 ile 1 arasında (0 ve 1 dâhil) olduğunu anlar', 'Olasılık değerinin 0 ile 1 arasında (0 ve 1 dâhil) olduğunu anlar.'),
  ('M.8.5.1.5', 'MAT', 'Basit bir olayın olma olasılığını hesaplar', 'Basit bir olayın olma olasılığını hesaplar.'),
  ('F.8.1.1.1', 'FEN', 'Mevsimlerin oluşumuna yönelik tahminlerde bulunur', 'Mevsimlerin oluşumuna yönelik tahminlerde bulunur.'),
  ('F.8.1.2.1', 'FEN', 'İklim ve hava olayları arasındaki farkı açıklar', 'İklim ve hava olayları arasındaki farkı açıklar.'),
  ('F.8.1.2.2', 'FEN', 'İklim biliminin (klimatoloji) bir bilim dalı olduğunu ve bu alanda çalışan…', 'İklim biliminin (klimatoloji) bir bilim dalı olduğunu ve bu alanda çalışan uzmanlara iklim bilimci (klima tolog) adı verildiğini söyler.'),
  ('F.8.2.1.1', 'FEN', 'Nükleotid, gen, DNA ve kromozom kavramlarını açıklayarak bu kavramlar…', 'Nükleotid, gen, DNA ve kromozom kavramlarını açıklayarak bu kavramlar arasında ilişki kurar.'),
  ('F.8.2.1.2', 'FEN', 'DNA’nın yapısını model üzerinde gösterir', 'DNA’nın yapısını model üzerinde gösterir.'),
  ('F.8.2.1.3', 'FEN', 'DNA’nın kendini nasıl eşlediğini ifade eder', 'DNA’nın kendini nasıl eşlediğini ifade eder.'),
  ('F.8.2.2.1', 'FEN', 'Kalıtım ile ilgili kavramları tanımlar', 'Kalıtım ile ilgili kavramları tanımlar.'),
  ('F.8.2.2.2', 'FEN', 'Tek karakter çaprazlamaları ile ilgili problemler çözerek sonuçlar hakkında…', 'Tek karakter çaprazlamaları ile ilgili problemler çözerek sonuçlar hakkında yorum yapar.'),
  ('F.8.2.2.3', 'FEN', 'Akraba evliliklerinin genetik sonuçlarını tartışır', 'Akraba evliliklerinin genetik sonuçlarını tartışır.'),
  ('F.8.2.3.1', 'FEN', 'Örneklerden yola çıkarak mutasyonu açıklar', 'Örneklerden yola çıkarak mutasyonu açıklar.'),
  ('F.8.2.3.2', 'FEN', 'Örneklerden yola çıkarak modifikasyonu açıklar', 'Örneklerden yola çıkarak modifikasyonu açıklar.'),
  ('F.8.2.3.3', 'FEN', 'Mutasyonla modifikasyon arasındaki farklar ile ilgili çıkarımda bulunur', 'Mutasyonla modifikasyon arasındaki farklar ile ilgili çıkarımda bulunur.'),
  ('F.8.2.4.1', 'FEN', 'Canlıların yaşadıkları çevreye uyumlarını gözlem yaparak açıklar', 'Canlıların yaşadıkları çevreye uyumlarını gözlem yaparak açıklar.'),
  ('F.8.2.5.1', 'FEN', 'Genetik mühendisliğini ve biyoteknolojiyi ilişkilendirir', 'Genetik mühendisliğini ve biyoteknolojiyi ilişkilendirir.'),
  ('F.8.2.5.2', 'FEN', 'Biyoteknolojik uygulamalar kapsamında oluşturulan ikilemlerle bu…', 'Biyoteknolojik uygulamalar kapsamında oluşturulan ikilemlerle bu uygulamaların insanlık için yararlı ve zararlı yönlerini tartışır.'),
  ('F.8.2.5.3', 'FEN', 'Gelecekteki genetik mühendisliği ve biyoteknoloji uygulamalarının neler…', 'Gelecekteki genetik mühendisliği ve biyoteknoloji uygulamalarının neler olabileceği hakkında tah minde bulunur.'),
  ('F.8.3.1.1', 'FEN', 'Katı basıncını etkileyen değişkenleri deneyerek keşfeder', 'Katı basıncını etkileyen değişkenleri deneyerek keşfeder.'),
  ('F.8.3.1.2', 'FEN', 'Sıvı basıncını etkileyen değişkenleri tahmin eder ve tahminlerini test eder', 'Sıvı basıncını etkileyen değişkenleri tahmin eder ve tahminlerini test eder.'),
  ('F.8.3.1.3', 'FEN', 'Katı, sıvı ve gazların basınç özelliklerinin günlük yaşam ve teknolojideki…', 'Katı, sıvı ve gazların basınç özelliklerinin günlük yaşam ve teknolojideki uygulamalarına örnekler verir.'),
  ('F.8.4.1.1', 'FEN', 'Periyodik sistemde, grup ve periyotların nasıl oluşturulduğunu açıklar', 'Periyodik sistemde, grup ve periyotların nasıl oluşturulduğunu açıklar.'),
  ('F.8.4.1.2', 'FEN', 'Elementleri periyodik tablo üzerinde metal, yarımetal ve ametal olarak…', 'Elementleri periyodik tablo üzerinde metal, yarımetal ve ametal olarak sınıflandırır.'),
  ('F.8.4.2.1', 'FEN', 'Fiziksel ve kimyasal değişim arasındaki farkları, çeşitli olayları…', 'Fiziksel ve kimyasal değişim arasındaki farkları, çeşitli olayları gözlemleyerek açıklar.'),
  ('F.8.4.3.1', 'FEN', 'Bileşiklerin kimyasal tepkime sonucunda oluştuğunu bilir', 'Bileşiklerin kimyasal tepkime sonucunda oluştuğunu bilir.'),
  ('F.8.4.4.1', 'FEN', 'Asit ve bazların genel özelliklerini ifade eder', 'Asit ve bazların genel özelliklerini ifade eder.'),
  ('F.8.4.4.2', 'FEN', 'Asit ve bazlara günlük yaşamdan örnekler verir', 'Asit ve bazlara günlük yaşamdan örnekler verir.'),
  ('F.8.4.4.3', 'FEN', 'Günlük hayatta ulaşılabilecek malzemeleri asit-baz ayracı olarak kullanır', 'Günlük hayatta ulaşılabilecek malzemeleri asit-baz ayracı olarak kullanır.'),
  ('F.8.4.4.4', 'FEN', 'Maddelerin asitlik ve bazlık durumlarına ilişkin pH değerlerini kullanarak…', 'Maddelerin asitlik ve bazlık durumlarına ilişkin pH değerlerini kullanarak çıkarımda bulunur.'),
  ('F.8.4.4.5', 'FEN', 'Asit ve bazların çeşitli maddeler üzerindeki etkilerini gözlemler', 'Asit ve bazların çeşitli maddeler üzerindeki etkilerini gözlemler.'),
  ('F.8.4.4.6', 'FEN', 'Asit ve bazların temizlik malzemesi olarak kullanılması esnasında…', 'Asit ve bazların temizlik malzemesi olarak kullanılması esnasında oluşabilecek tehlikelerle ilgili gerekli tedbirleri alır.'),
  ('F.8.4.4.7', 'FEN', 'Asit yağmurlarının önlenmesine yönelik çözüm önerileri sunar', 'Asit yağmurlarının önlenmesine yönelik çözüm önerileri sunar.'),
  ('F.8.4.5.1', 'FEN', 'Isınmanın maddenin cinsine, kütlesine ve/veya sıcaklık değişimine bağlı…', 'Isınmanın maddenin cinsine, kütlesine ve/veya sıcaklık değişimine bağlı olduğunu deney yaparak keşfeder.'),
  ('F.8.4.5.2', 'FEN', 'Hâl değiştirmek için gerekli ısının maddenin cinsi ve kütlesiyle ilişkili…', 'Hâl değiştirmek için gerekli ısının maddenin cinsi ve kütlesiyle ilişkili olduğunu deney yaparak keşfeder.'),
  ('F.8.4.5.3', 'FEN', 'Maddelerin hâl değişimi ve ısınma grafiğini çizerek yorumlar', 'Maddelerin hâl değişimi ve ısınma grafiğini çizerek yorumlar.'),
  ('F.8.4.5.4', 'FEN', 'Günlük yaşamda meydana gelen hâl değişimleri ile ısı alışverişini ilişkilendirir', 'Günlük yaşamda meydana gelen hâl değişimleri ile ısı alışverişini ilişkilendirir.'),
  ('F.8.4.6.1', 'FEN', 'Geçmişten günümüze Türkiye’deki kimya endüstrisinin gelişimini araştırır', 'Geçmişten günümüze Türkiye’deki kimya endüstrisinin gelişimini araştırır.'),
  ('F.8.4.6.2', 'FEN', 'Kimya endüstrisinde meslek dallarını araştırır ve gelecekteki yeni meslek…', 'Kimya endüstrisinde meslek dallarını araştırır ve gelecekteki yeni meslek alanları hakkında öneriler sunar.'),
  ('F.8.5.1.1', 'FEN', 'Basit makinelerin sağladığı avantajları örnekler üzerinden açıklar', 'Basit makinelerin sağladığı avantajları örnekler üzerinden açıklar.'),
  ('F.8.5.1.2', 'FEN', 'Basit makinelerden yararlanarak günlük yaşamda iş kolaylığı sağlayacak bir…', 'Basit makinelerden yararlanarak günlük yaşamda iş kolaylığı sağlayacak bir düzenek tasarlar.'),
  ('F.8.6.1.1', 'FEN', 'Besin zincirindeki üretici, tüketici, ayrıştırıcılara örnekler verir', 'Besin zincirindeki üretici, tüketici, ayrıştırıcılara örnekler verir.'),
  ('F.8.6.2.1', 'FEN', 'Bitkilerde besin üretiminde fotosentezin önemini fark eder', 'Bitkilerde besin üretiminde fotosentezin önemini fark eder.'),
  ('F.8.6.2.2', 'FEN', 'Fotosentez hızını etkileyen faktörler ile ilgili çıkarımlarda bulunur', 'Fotosentez hızını etkileyen faktörler ile ilgili çıkarımlarda bulunur.'),
  ('F.8.6.2.3', 'FEN', 'Canlılarda solunumun önemini belirtir', 'Canlılarda solunumun önemini belirtir.'),
  ('F.8.6.3.1', 'FEN', 'Madde döngülerini şema üzerinde göstererek açıklar', 'Madde döngülerini şema üzerinde göstererek açıklar.'),
  ('F.8.6.3.2', 'FEN', 'Madde döngülerinin yaşam açısından önemini sorgular', 'Madde döngülerinin yaşam açısından önemini sorgular.'),
  ('F.8.6.3.3', 'FEN', 'Küresel iklim değişikliklerinin nedenlerini ve olası sonuçlarını tartışır', 'Küresel iklim değişikliklerinin nedenlerini ve olası sonuçlarını tartışır.'),
  ('F.8.6.4.1', 'FEN', 'Kaynakların kullanımında tasarruflu davranmaya özen gösterir', 'Kaynakların kullanımında tasarruflu davranmaya özen gösterir.'),
  ('F.8.6.4.2', 'FEN', 'Kaynakların tasarruflu kullanımına yönelik proje tasarlar', 'Kaynakların tasarruflu kullanımına yönelik proje tasarlar.'),
  ('F.8.6.4.3', 'FEN', 'Geri dönüşüm için katı atıkların ayrıştırılmasının önemini açıklar', 'Geri dönüşüm için katı atıkların ayrıştırılmasının önemini açıklar.'),
  ('F.8.6.4.4', 'FEN', 'Geri dönüşümün ülke ekonomisine katkısına ilişkin araştırma verilerini…', 'Geri dönüşümün ülke ekonomisine katkısına ilişkin araştırma verilerini kullanarak çözüm önerileri sunar.'),
  ('F.8.6.4.5', 'FEN', 'Kaynakların tasarruflu kullanılmaması durumunda gelecekte karşılaşılabilecek…', 'Kaynakların tasarruflu kullanılmaması durumunda gelecekte karşılaşılabilecek problemleri belirterek çözüm önerileri sunar.'),
  ('F.8.7.1.1', 'FEN', 'Elektriklenmeyi, bazı doğa olayları ve teknolojideki uygulama örnekleri ile…', 'Elektriklenmeyi, bazı doğa olayları ve teknolojideki uygulama örnekleri ile açıklar.'),
  ('F.8.7.1.2', 'FEN', 'Elektrik yüklerini sınıflandırarak aynı ve farklı cins elektrik yüklerinin…', 'Elektrik yüklerini sınıflandırarak aynı ve farklı cins elektrik yüklerinin birbirlerine etkisini açıklar.'),
  ('F.8.7.1.3', 'FEN', 'Deneyler yaparak elektriklenme çeşitlerini fark eder', 'Deneyler yaparak elektriklenme çeşitlerini fark eder.'),
  ('F.8.7.2.1', 'FEN', 'Cisimleri, sahip oldukları elektrik yükleri bakımından sınıflandırır', 'Cisimleri, sahip oldukları elektrik yükleri bakımından sınıflandırır.'),
  ('F.8.7.2.2', 'FEN', 'Topraklamayı açıklar', 'Topraklamayı açıklar.'),
  ('F.8.7.3.1', 'FEN', 'Elektrik enerjisinin ısı, ışık ve hareket enerjisine dönüştüğü uygulamalara…', 'Elektrik enerjisinin ısı, ışık ve hareket enerjisine dönüştüğü uygulamalara örnekler verir.'),
  ('F.8.7.3.2', 'FEN', 'Elektirik enerjisinin ısı, ışık veya hareket enerjisine dönüşümü temel alan…', 'Elektirik enerjisinin ısı, ışık veya hareket enerjisine dönüşümü temel alan bir model tasarlar.'),
  ('F.8.7.3.3', 'FEN', 'Güç santrallerinde elektrik enerjisinin nasıl üretildiğini açıklar', 'Güç santrallerinde elektrik enerjisinin nasıl üretildiğini açıklar.'),
  ('F.8.7.3.4', 'FEN', 'Güç santrallerinin avantaj ve dezavantajları konusunda fikirler üretir', 'Güç santrallerinin avantaj ve dezavantajları konusunda fikirler üretir.'),
  ('F.8.7.3.5', 'FEN', 'Elektrik enerjisinin bilinçli ve tasarruflu kullanılmasının aile ve ülke…', 'Elektrik enerjisinin bilinçli ve tasarruflu kullanılmasının aile ve ülke ekonomisi bakımından önemini tartışır.'),
  ('F.8.7.3.6', 'FEN', 'Evlerde elektriği tasarruflu kullanmaya özen gösterir', 'Evlerde elektriği tasarruflu kullanmaya özen gösterir.'),
  ('T.8.1.1', 'TUR', 'Dinlediklerinde/izlediklerinde geçen olayların gelişimi ve sonucu hakkında…', 'Dinlediklerinde/izlediklerinde geçen olayların gelişimi ve sonucu hakkında tahminde bulunur.'),
  ('T.8.1.2', 'TUR', 'Dinlediklerinde/izlediklerinde geçen bilmediği kelimelerin anlamını tahmin eder', 'Dinlediklerinde/izlediklerinde geçen bilmediği kelimelerin anlamını tahmin eder.'),
  ('T.8.1.3', 'TUR', 'Dinlediklerini/izlediklerini özetler', 'Dinlediklerini/izlediklerini özetler.'),
  ('T.8.1.4', 'TUR', 'Dinledikleri/izlediklerine yönelik sorulara cevap verir', 'Dinledikleri/izlediklerine yönelik sorulara cevap verir.'),
  ('T.8.1.5', 'TUR', 'Dinlediklerinin/izlediklerinin konusunu tespit eder', 'Dinlediklerinin/izlediklerinin konusunu tespit eder.'),
  ('T.8.1.6', 'TUR', 'Dinlediklerinin/izlediklerinin ana fikrini/ana duygusunu tespit eder', 'Dinlediklerinin/izlediklerinin ana fikrini/ana duygusunu tespit eder.'),
  ('T.8.1.7', 'TUR', 'Dinlediklerine/izlediklerine yönelik farklı başlıklar önerir', 'Dinlediklerine/izlediklerine yönelik farklı başlıklar önerir.'),
  ('T.8.1.8', 'TUR', 'Dinlediği/izlediği hikâye edici metinleri canlandırır', 'Dinlediği/izlediği hikâye edici metinleri canlandırır.'),
  ('T.8.1.9', 'TUR', 'Dinlediklerinde/izlediklerinde tutarlılığı sorgular', 'Dinlediklerinde/izlediklerinde tutarlılığı sorgular.'),
  ('T.8.1.10', 'TUR', 'Dinledikleriyle/izledikleriyle ilgili görüşlerini bildirir', 'Dinledikleriyle/izledikleriyle ilgili görüşlerini bildirir.'),
  ('T.8.1.11', 'TUR', 'Dinledikleri/izledikleri medya metinlerini değerlendirir', 'Dinledikleri/izledikleri medya metinlerini değerlendirir.'),
  ('T.8.1.12', 'TUR', 'Dinlediklerinde/izlediklerinde başvurulan düşünceyi geliştirme yollarını…', 'Dinlediklerinde/izlediklerinde başvurulan düşünceyi geliştirme yollarını tespit eder.'),
  ('T.8.1.13', 'TUR', 'Konuşmacının sözlü olmayan mesajlarını kavrar', 'Konuşmacının sözlü olmayan mesajlarını kavrar.'),
  ('T.8.1.14', 'TUR', 'Dinleme stratejilerini uygular', 'Dinleme stratejilerini uygular.'),
  ('T.8.2.1', 'TUR', 'Hazırlıklı konuşma yapar', 'Hazırlıklı konuşma yapar.'),
  ('T.8.2.2', 'TUR', 'Hazırlıksız konuşma yapar', 'Hazırlıksız konuşma yapar.'),
  ('T.8.2.3', 'TUR', 'Konuşma stratejilerini uygular', 'Konuşma stratejilerini uygular.'),
  ('T.8.2.4', 'TUR', 'Konuşmalarında beden dilini etkili bir şekilde kullanır', 'Konuşmalarında beden dilini etkili bir şekilde kullanır.'),
  ('T.8.2.5', 'TUR', 'Kelimeleri anlamlarına uygun kullanır', 'Kelimeleri anlamlarına uygun kullanır.'),
  ('T.8.2.6', 'TUR', 'Konuşmalarında yabancı dillerden alınmış, dilimize henüz yerleşmemiş…', 'Konuşmalarında yabancı dillerden alınmış, dilimize henüz yerleşmemiş kelimelerin Türkçelerini kullanır.'),
  ('T.8.2.7', 'TUR', 'Konuşmalarında uygun geçiş ve bağlantı ifadelerini kullanır', 'Konuşmalarında uygun geçiş ve bağlantı ifadelerini kullanır.'),
  ('T.8.3.1', 'TUR', 'Noktalama işaretlerine dikkat ederek sesli ve sessiz okur', 'Noktalama işaretlerine dikkat ederek sesli ve sessiz okur.'),
  ('T.8.3.2', 'TUR', 'Metni türün özelliklerine uygun biçimde okur', 'Metni türün özelliklerine uygun biçimde okur.'),
  ('T.8.3.3', 'TUR', 'Farklı yazı karakterleri ile yazılmış yazıları okur', 'Farklı yazı karakterleri ile yazılmış yazıları okur.'),
  ('T.8.3.4', 'TUR', 'Okuma stratejilerini kullanır', 'Okuma stratejilerini kullanır.'),
  ('T.8.3.5', 'TUR', 'Bağlamdan yararlanarak bilmediği kelime ve kelime gruplarının anlamını…', 'Bağlamdan yararlanarak bilmediği kelime ve kelime gruplarının anlamını tahmin eder.'),
  ('T.8.3.6', 'TUR', 'Deyim, atasözü ve özdeyişlerin metne katkısını belirler', 'Deyim, atasözü ve özdeyişlerin metne katkısını belirler.'),
  ('T.8.3.7', 'TUR', 'Metindeki söz sanatlarını tespit eder', 'Metindeki söz sanatlarını tespit eder.'),
  ('T.8.3.8', 'TUR', 'Metindeki anlatım bozukluklarını belirler', 'Metindeki anlatım bozukluklarını belirler.'),
  ('T.8.3.9', 'TUR', 'Fiilimsilerin cümledeki işlevlerini kavrar', 'Fiilimsilerin cümledeki işlevlerini kavrar.'),
  ('T.8.3.10', 'TUR', 'Geçiş ve bağlantı ifadelerinin metnin anlamına olan katkısını değerlendirir', 'Geçiş ve bağlantı ifadelerinin metnin anlamına olan katkısını değerlendirir.'),
  ('T.8.3.11', 'TUR', 'Metindeki anlatım biçimlerini belirler', 'Metindeki anlatım biçimlerini belirler.'),
  ('T.8.3.12', 'TUR', 'Görsel ve başlıktan hareketle okuyacağı metnin konusunu tahmin eder', 'Görsel ve başlıktan hareketle okuyacağı metnin konusunu tahmin eder.'),
  ('T.8.3.13', 'TUR', 'Okuduklarını özetler', 'Okuduklarını özetler.'),
  ('T.8.3.14', 'TUR', 'Metinle ilgili soruları cevaplar', 'Metinle ilgili soruları cevaplar.'),
  ('T.8.3.15', 'TUR', 'Metinle ilgili sorular sorar', 'Metinle ilgili sorular sorar.'),
  ('T.8.3.16', 'TUR', 'Metnin konusunu belirler', 'Metnin konusunu belirler.'),
  ('T.8.3.17', 'TUR', 'Metnin ana fikrini/ana duygusunu belirler', 'Metnin ana fikrini/ana duygusunu belirler.'),
  ('T.8.3.18', 'TUR', 'Metindeki yardımcı fikirleri belirler', 'Metindeki yardımcı fikirleri belirler.'),
  ('T.8.3.19', 'TUR', 'Metnin içeriğine uygun başlık/başlıklar belirler', 'Metnin içeriğine uygun başlık/başlıklar belirler.'),
  ('T.8.3.20', 'TUR', 'Okuduğu metinlerdeki hikâye unsurlarını belirler', 'Okuduğu metinlerdeki hikâye unsurlarını belirler.'),
  ('T.8.3.21', 'TUR', 'Metnin içeriğini yorumlar', 'Metnin içeriğini yorumlar.'),
  ('T.8.3.22', 'TUR', 'Metinde ele alınan sorunlara farklı çözümler üretir', 'Metinde ele alınan sorunlara farklı çözümler üretir.'),
  ('T.8.3.23', 'TUR', 'Metinler arasında karşılaştırma yapar', 'Metinler arasında karşılaştırma yapar.'),
  ('T.8.3.24', 'TUR', 'Metindeki gerçek ve kurgusal unsurları ayırt eder', 'Metindeki gerçek ve kurgusal unsurları ayırt eder.'),
  ('T.8.3.25', 'TUR', 'Okudukları ile ilgili çıkarımlarda bulunur', 'Okudukları ile ilgili çıkarımlarda bulunur.'),
  ('T.8.3.26', 'TUR', 'Metin türlerini ayırt eder', 'Metin türlerini ayırt eder.'),
  ('T.8.3.27', 'TUR', 'Görsellerle ilgili soruları cevaplar', 'Görsellerle ilgili soruları cevaplar.'),
  ('T.8.3.28', 'TUR', 'Metinde önemli noktaların vurgulanış biçimlerini kavrar', 'Metinde önemli noktaların vurgulanış biçimlerini kavrar.'),
  ('T.8.3.29', 'TUR', 'Medya metinlerini analiz eder', 'Medya metinlerini analiz eder.'),
  ('T.8.3.30', 'TUR', 'Bilgi kaynaklarını etkili bir şekilde kullanır', 'Bilgi kaynaklarını etkili bir şekilde kullanır.'),
  ('T.8.3.31', 'TUR', 'Bilgi kaynaklarının güvenilirliğini sorgular', 'Bilgi kaynaklarının güvenilirliğini sorgular.'),
  ('T.8.3.32', 'TUR', 'Grafik, tablo ve çizelgeyle sunulan bilgileri yorumlar', 'Grafik, tablo ve çizelgeyle sunulan bilgileri yorumlar.'),
  ('T.8.3.33', 'TUR', 'Edebî eserin yazılı metni ile medya sunumunu karşılaştırır', 'Edebî eserin yazılı metni ile medya sunumunu karşılaştırır.'),
  ('T.8.3.34', 'TUR', 'Okuduklarında kullanılan düşünceyi geliştirme yollarını belirler', 'Okuduklarında kullanılan düşünceyi geliştirme yollarını belirler.'),
  ('T.8.3.35', 'TUR', 'Metindeki iş ve işlem basamaklarını kavrar', 'Metindeki iş ve işlem basamaklarını kavrar.'),
  ('T.8.4.1', 'TUR', 'Şiir yazar', 'Şiir yazar.'),
  ('T.8.4.2', 'TUR', 'Bilgilendirici metin yazar', 'Bilgilendirici metin yazar.'),
  ('T.8.4.3', 'TUR', 'Hikâye edici metin yazar', 'Hikâye edici metin yazar.'),
  ('T.8.4.4', 'TUR', 'Yazma stratejilerini uygular', 'Yazma stratejilerini uygular.'),
  ('T.8.4.5', 'TUR', 'Anlatımı desteklemek için grafik ve tablo kullanır', 'Anlatımı desteklemek için grafik ve tablo kullanır.'),
  ('T.8.4.6', 'TUR', 'Bir işi işlem basamaklarına göre yazar', 'Bir işi işlem basamaklarına göre yazar.'),
  ('T.8.4.7', 'TUR', 'Yazılarını zenginleştirmek için atasözleri, deyimler ve özdeyişler kullanır', 'Yazılarını zenginleştirmek için atasözleri, deyimler ve özdeyişler kullanır.'),
  ('T.8.4.8', 'TUR', 'Yazılarında mizahi ögeler kullanır', 'Yazılarında mizahi ögeler kullanır.'),
  ('T.8.4.9', 'TUR', 'Yazılarında anlatım biçimlerini kullanır', 'Yazılarında anlatım biçimlerini kullanır.'),
  ('T.8.4.10', 'TUR', 'Yazdıklarında yabancı dillerden alınmış, dilimize henüz yerleşmemiş…', 'Yazdıklarında yabancı dillerden alınmış, dilimize henüz yerleşmemiş kelimelerin Türkçelerini kullanır.'),
  ('T.8.4.11', 'TUR', 'Formları yönergelerine uygun doldurur', 'Formları yönergelerine uygun doldurur.'),
  ('T.8.4.12', 'TUR', 'Kısa metinler yazar', 'Kısa metinler yazar.'),
  ('T.8.4.13', 'TUR', 'Yazdıklarının içeriğine uygun başlık belirler', 'Yazdıklarının içeriğine uygun başlık belirler.'),
  ('T.8.4.14', 'TUR', 'Araştırmalarının sonuçlarını yazılı olarak sunar', 'Araştırmalarının sonuçlarını yazılı olarak sunar.'),
  ('T.8.4.15', 'TUR', 'Yazılarında uygun geçiş ve bağlantı ifadelerini kullanır', 'Yazılarında uygun geçiş ve bağlantı ifadelerini kullanır.'),
  ('T.8.4.16', 'TUR', 'Yazdıklarını düzenler', 'Yazdıklarını düzenler.'),
  ('T.8.4.17', 'TUR', 'Yazdıklarını paylaşır', 'Yazdıklarını paylaşır.'),
  ('T.8.4.18', 'TUR', 'Cümlenin ögelerini ayırt eder', 'Cümlenin ögelerini ayırt eder.'),
  ('T.8.4.19', 'TUR', 'Cümle türlerini tanır', 'Cümle türlerini tanır.'),
  ('T.8.4.20', 'TUR', 'Fiillerin çatı özelliklerinin anlama olan katkısını kavrar', 'Fiillerin çatı özelliklerinin anlama olan katkısını kavrar.'),
  ('İTA.8.1.1', 'INK', 'Avrupa’daki gelişmelerin yansımaları bağlamında Osmanlı Devleti’nin yirminci…', 'Avrupa’daki gelişmelerin yansımaları bağlamında Osmanlı Devleti’nin yirminci yüzyılın başlarındaki siyasi ve sosyal durumunu kavrar.'),
  ('İTA.8.1.2', 'INK', 'Mustafa Kemal’in çocukluk ve öğrenim hayatından hareketle onun kişilik…', 'Mustafa Kemal’in çocukluk ve öğrenim hayatından hareketle onun kişilik özelliklerinin oluşumu hakkında çıkarımlarda bulunur.'),
  ('İTA.8.1.3', 'INK', 'Gençlik döneminde Mustafa Kemal’in fikir hayatını etkileyen önemli kişileri…', 'Gençlik döneminde Mustafa Kemal’in fikir hayatını etkileyen önemli kişileri ve olayları kavrar.'),
  ('İTA.8.1.4', 'INK', 'Mustafa Kemal’in askerlik hayatı ile ilgili olayları ve olguları onun…', 'Mustafa Kemal’in askerlik hayatı ile ilgili olayları ve olguları onun kişilik özellikleri ile ilişkilendirir.'),
  ('İTA.8.2.1', 'INK', 'Birinci Dünya Savaşı’nın sebeplerini ve savaşın başlamasına yol açan…', 'Birinci Dünya Savaşı’nın sebeplerini ve savaşın başlamasına yol açan gelişmeleri kavrar.'),
  ('İTA.8.2.2', 'INK', 'Birinci Dünya Savaşı’nda Osmanlı Devleti’nin durumu hakkında çıkarımlarda…', 'Birinci Dünya Savaşı’nda Osmanlı Devleti’nin durumu hakkında çıkarımlarda bulunur.'),
  ('İTA.8.2.3', 'INK', 'Mondros Ateşkes Antlaşması’nın imzalanması ve uygulanması karşısında Osmanlı…', 'Mondros Ateşkes Antlaşması’nın imzalanması ve uygulanması karşısında Osmanlı yönetiminin, Mustafa Kemal’in ve halkın tutumunu analiz eder.'),
  ('İTA.8.2.4', 'INK', 'Kuvâ-yı Millîye’nin oluşum sürecini ve sonrasında meydana gelen gelişmeleri…', 'Kuvâ-yı Millîye’nin oluşum sürecini ve sonrasında meydana gelen gelişmeleri kavrar.'),
  ('İTA.8.2.5', 'INK', 'Millî Mücadele’nin hazırlık döneminde Mustafa Kemal’in yaptığı çalışmaları…', 'Millî Mücadele’nin hazırlık döneminde Mustafa Kemal’in yaptığı çalışmaları analiz eder.'),
  ('İTA.8.2.6', 'INK', 'Misakımilli’nin kabulünü ve Büyük Millet Meclisinin açılışını vatanın…', 'Misakımilli’nin kabulünü ve Büyük Millet Meclisinin açılışını vatanın bütünlüğü esası ile “ulusal egemenlik” ve “tam bağımsızlık” ilkeleri ile ilişkilendirir.'),
  ('İTA.8.2.7', 'INK', 'Büyük Millet Meclisine karşı ayaklanmalar ile ayaklanmaların bastırılması…', 'Büyük Millet Meclisine karşı ayaklanmalar ile ayaklanmaların bastırılması için alınan tedbirleri analiz eder.'),
  ('İTA.8.2.8', 'INK', 'Mustafa Kemal’in ve Türk milletinin Sevr Antlaşması’na karşı tepkilerini…', 'Mustafa Kemal’in ve Türk milletinin Sevr Antlaşması’na karşı tepkilerini değerlendirir.'),
  ('İTA.8.3.1', 'INK', 'Millî Mücadele Dönemi’nde Doğu Cephesi ve Güney Cephesi’nde meydana gelen…', 'Millî Mücadele Dönemi’nde Doğu Cephesi ve Güney Cephesi’nde meydana gelen gelişmeleri kavrar.'),
  ('İTA.8.3.2', 'INK', 'Millî Mücadele Dönemi’nde Batı Cephesi’nde meydana gelen gelişmeleri kavrar', 'Millî Mücadele Dönemi’nde Batı Cephesi’nde meydana gelen gelişmeleri kavrar.'),
  ('İTA.8.3.3', 'INK', 'Millî Mücadele’nin zor bir döneminde Maarif Kongresi yapan Atatürk’ün, millî…', 'Millî Mücadele’nin zor bir döneminde Maarif Kongresi yapan Atatürk’ün, millî ve çağdaş eğitime verdiği önemi kavrar.'),
  ('İTA.8.3.4', 'INK', 'Türk milletinin millî birlik, beraberlik ve dayanışmasının bir örneği olarak…', 'Türk milletinin millî birlik, beraberlik ve dayanışmasının bir örneği olarak Tekalif-i Millîye Emirleri doğrultusunda yapılan uygulamaları analiz eder.'),
  ('İTA.8.3.5', 'INK', 'Sakarya Meydan Savaşı’nın kazanılmasında ve Büyük Taarruz’un başarılı…', 'Sakarya Meydan Savaşı’nın kazanılmasında ve Büyük Taarruz’un başarılı olmasında Mustafa Kemal’in rolüne ilişkin çıkarımlarda bulunur.'),
  ('İTA.8.3.6', 'INK', 'Lozan Antlaşması’nın sağladığı kazanımları analiz eder', 'Lozan Antlaşması’nın sağladığı kazanımları analiz eder.'),
  ('İTA.8.3.7', 'INK', 'Millî Mücadele Dönemi’nin siyasi, sosyal ve kültürel olaylarının sanat ve…', 'Millî Mücadele Dönemi’nin siyasi, sosyal ve kültürel olaylarının sanat ve edebiyat ürünlerine yansımalarına kanıtlar gösterir.'),
  ('İTA.8.4.1', 'INK', 'Çağdaşlaşan Türkiye’nin temeli olan Atatürk ilkelerini açıklar', 'Çağdaşlaşan Türkiye’nin temeli olan Atatürk ilkelerini açıklar.'),
  ('İTA.8.4.2', 'INK', 'Siyasi alanda meydana gelen gelişmeleri kavrar', 'Siyasi alanda meydana gelen gelişmeleri kavrar.'),
  ('İTA.8.4.3', 'INK', 'Hukuk alanında meydana gelen gelişmelerin toplumsal hayata yansımalarını kavrar', 'Hukuk alanında meydana gelen gelişmelerin toplumsal hayata yansımalarını kavrar.'),
  ('İTA.8.4.4', 'INK', 'Eğitim ve kültür alanında yapılan inkılapları ve gelişmeleri kavrar', 'Eğitim ve kültür alanında yapılan inkılapları ve gelişmeleri kavrar.'),
  ('İTA.8.4.5', 'INK', 'Toplumsal alanda yapılan inkılapları ve meydana gelen gelişmeleri kavrar', 'Toplumsal alanda yapılan inkılapları ve meydana gelen gelişmeleri kavrar.'),
  ('İTA.8.4.6', 'INK', 'Ekonomi alanında meydana gelen gelişmeleri kavrar', 'Ekonomi alanında meydana gelen gelişmeleri kavrar.'),
  ('İTA.8.4.7', 'INK', 'Atatürk Dönemi’nde sağlık alanında yapılan çalışmaları devletin temel…', 'Atatürk Dönemi’nde sağlık alanında yapılan çalışmaları devletin temel görevleri ile ilişkilendirir.'),
  ('İTA.8.4.8', 'INK', 'Cumhuriyet’in sağladığı kazanımları ve Atatürk’ün Türk milleti için…', 'Cumhuriyet’in sağladığı kazanımları ve Atatürk’ün Türk milleti için gösterdiği hedefleri analiz eder.'),
  ('İTA.8.4.9', 'INK', 'Atatürk ilke ve inkılaplarını oluşturan temel esasları kavrar', 'Atatürk ilke ve inkılaplarını oluşturan temel esasları kavrar.'),
  ('İTA.8.5.1', 'INK', 'Atatürk Dönemi’ndeki demokratikleşme yolunda atılan adımları açıklar', 'Atatürk Dönemi’ndeki demokratikleşme yolunda atılan adımları açıklar.'),
  ('İTA.8.5.2', 'INK', 'Mustafa Kemal’e suikast girişimini analiz eder', 'Mustafa Kemal’e suikast girişimini analiz eder.'),
  ('İTA.8.5.3', 'INK', 'Cumhuriyetin ilk yıllarında Türkiye Cumhuriyetine yönelik tehditleri analiz eder', 'Cumhuriyetin ilk yıllarında Türkiye Cumhuriyetine yönelik tehditleri analiz eder.'),
  ('İTA.8.6.1', 'INK', 'Atatürk Dönemi Türk dış politikasının temel ilkelerini ve amaçlarını açıklar', 'Atatürk Dönemi Türk dış politikasının temel ilkelerini ve amaçlarını açıklar.'),
  ('İTA.8.6.2', 'INK', 'Atatürk Dönemi Türk dış politikasında yaşanan gelişmeleri analiz eder', 'Atatürk Dönemi Türk dış politikasında yaşanan gelişmeleri analiz eder.'),
  ('İTA.8.6.3', 'INK', 'Atatürk’ün Hatay’ı ülkemize katmak konusunda yaptıklarına ve bu uğurda…', 'Atatürk’ün Hatay’ı ülkemize katmak konusunda yaptıklarına ve bu uğurda gösterdiği özveriye kanıtlar gösterir.'),
  ('İTA.8.7.1', 'INK', 'Atatürk’ün ölümüne ilişkin yansıma ve değerlendirmelerden hareketle onun…', 'Atatürk’ün ölümüne ilişkin yansıma ve değerlendirmelerden hareketle onun fikir ve eserlerinin evrensel değerine ilişkin çıkarımlarda bulunur.'),
  ('İTA.8.7.2', 'INK', 'Atatürk’ün Türk Milleti’ne bıraktığı eserlerinden örnekler verir', 'Atatürk’ün Türk Milleti’ne bıraktığı eserlerinden örnekler verir.'),
  ('İTA.8.7.3', 'INK', 'Atatürk’ün İkinci Dünya Savaşı öncesi tespitleri ve girişimleri Türkiye’nin…', 'Atatürk’ün İkinci Dünya Savaşı öncesi tespitleri ve girişimleri Türkiye’nin savaşta izlediği denge siyaseti ile ilişkilendirilir.'),
  ('İTA.8.7.4', 'INK', 'İkinci Dünya Savaşı’ndaki gelişmelerin ve bu savaşın sonuçlarının Türkiye’ye…', 'İkinci Dünya Savaşı’ndaki gelişmelerin ve bu savaşın sonuçlarının Türkiye’ye etkilerini analiz eder.'),
  ('İTA.8.7.5', 'INK', 'Türkiye’de çok partili siyasi hayata geçişi hızlandıran gelişmeleri…', 'Türkiye’de çok partili siyasi hayata geçişi hızlandıran gelişmeleri, demokrasinin gerekleri açısından analiz eder.'),
  ('8.1.1', 'DIN', 'Kader ve kaza inancını ayet ve hadislerle açıklar', 'Kader ve kaza inancını ayet ve hadislerle açıklar.'),
  ('8.1.2', 'DIN', 'İnsanın ilmi, iradesi, sorumluluğu ile kader arasında ilişki kurar', 'İnsanın ilmi, iradesi, sorumluluğu ile kader arasında ilişki kurar.'),
  ('8.1.3', 'DIN', 'Kaza ve kader ile ilgili kavramları analiz eder', 'Kaza ve kader ile ilgili kavramları analiz eder.'),
  ('8.1.4', 'DIN', 'Toplumda kader ve kaza ile ilgili yaygın olan yanlış anlayışları sorgular', 'Toplumda kader ve kaza ile ilgili yaygın olan yanlış anlayışları sorgular.'),
  ('8.1.5', 'DIN', 'Hz', 'Hz. Musa’nın (a.s.) hayatını ana hatlarıyla tanır.'),
  ('8.1.6', 'DIN', 'Ayet el-Kürsi''yi okur, anlamını söyler', 'Ayet el-Kürsi''yi okur, anlamını söyler.'),
  ('8.2.1', 'DIN', 'İslam’ın paylaşma ve yardımlaşmaya verdiği önemi ayet ve hadisler ışığında…', 'İslam’ın paylaşma ve yardımlaşmaya verdiği önemi ayet ve hadisler ışığında yorumlar.'),
  ('8.2.2', 'DIN', 'Zekât ve sadaka ibadetini ayet ve hadislerle açıklar', 'Zekât ve sadaka ibadetini ayet ve hadislerle açıklar.'),
  ('8.2.3', 'DIN', 'Zekât, infak ve sadakanın bireysel ve toplumsal önemini fark eder', 'Zekât, infak ve sadakanın bireysel ve toplumsal önemini fark eder.'),
  ('8.2.4', 'DIN', 'Hz', 'Hz. Şuayb’in (a.s.) hayatını ana hatlarıyla tanır.'),
  ('8.2.5', 'DIN', 'Maûn suresini okur, anlamını söyler', 'Maûn suresini okur, anlamını söyler.'),
  ('8.3.1', 'DIN', 'Din, birey ve toplum arasındaki ilişkiyi yorumlar', 'Din, birey ve toplum arasındaki ilişkiyi yorumlar.'),
  ('8.3.2', 'DIN', 'İslam dininin can, nesil, akıl, mal ve din emniyetiyle ilgili ortaya koyduğu…', 'İslam dininin can, nesil, akıl, mal ve din emniyetiyle ilgili ortaya koyduğu ilke ve hedefleri analiz eder.'),
  ('8.3.3', 'DIN', 'Hz', 'Hz. Yusuf’un (a.s.) örnek hayatından ilkeler çıkarır.'),
  ('8.3.4', 'DIN', 'Asr suresini okur, anlamını söyler', 'Asr suresini okur, anlamını söyler.'),
  ('8.4.1', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) doğruluğu ve güvenilir kişiliği ile peygamberlerin özellikleri arasında ilişki kurar.'),
  ('8.4.2', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) merhametli ve affedici oluşunu davranışlarında yansıtmaya özen gösterir.'),
  ('8.4.3', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) istişareye verdiği önemi ortaya koyan örnek olaylardan hareketle gündelik hayatla ilgili çıkarımlarda bulunur.'),
  ('8.4.4', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) cesaret ve kararlılığını örnek olaylarla açıklar.'),
  ('8.4.5', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) hakkı gözetmedeki hassasiyetine örnekler verir.'),
  ('8.4.6', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) insanlara verdiği değeri örneklerle açıklar.'),
  ('8.4.7', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) örnek davranışlarının toplumsal hayattaki önemini değerlendirir.'),
  ('8.4.8', 'DIN', 'Hz', 'Hz. Muhammed’in (s.a.v.) hikmetli söz ve davranışlarıyla insanları iyiye ve güzele yönlendirdiğini fark eder.'),
  ('8.4.9', 'DIN', 'Kureyş suresini okur, anlamını söyler', 'Kureyş suresini okur, anlamını söyler.'),
  ('8.5.1', 'DIN', 'İslam dininin temel kaynaklarını tanır', 'İslam dininin temel kaynaklarını tanır.'),
  ('8.5.2', 'DIN', 'Ayetlerden hareketle Kur’an’ın ana konularını sınıflandırır', 'Ayetlerden hareketle Kur’an’ın ana konularını sınıflandırır.'),
  ('8.5.3', 'DIN', 'Kur’an-ı Kerim’in temel özelliklerini değerlendirir', 'Kur’an-ı Kerim’in temel özelliklerini değerlendirir.'),
  ('8.5.4', 'DIN', 'Hz', 'Hz. Nuh’un (a.s.) tevhide davetini özetler.'),
  ('E8.1.L1', 'ING', 'Students will be able to understand the specific information in short…', 'Students will be able to understand the specific information in short conversations on everyday topics, such as accepting and refusing an offer/invitation, apologizing and making simple inquiries.'),
  ('E8.1.SI1', 'ING', 'Students will be able to interact with reasonable ease in structured…', 'Students will be able to interact with reasonable ease in structured situations and short conversations involving accepting and refusing an offer/invitation, apologizing and making simple inquiries.'),
  ('E8.1.SP1', 'ING', 'Students will be able to structure a talk to make simple inquiries, give…', 'Students will be able to structure a talk to make simple inquiries, give explanations and reasons.'),
  ('E8.1.R1', 'ING', 'Students will be able to understand short and simple texts about friendship', 'Students will be able to understand short and simple texts about friendship.'),
  ('E8.1.R2', 'ING', 'Students will be able to understand short and simple invitation letters…', 'Students will be able to understand short and simple invitation letters, cards and e-mails.'),
  ('E8.1.W1', 'ING', 'Students will be able to write a short and simple letter apologizing and…', 'Students will be able to write a short and simple letter apologizing and giving reasons for not attending a party in response to an invitation.'),
  ('E8.2.L1', 'ING', 'Students will be able to understand phrases and expressions about regular…', 'Students will be able to understand phrases and expressions about regular activities of teenagers.'),
  ('E8.2.SI1', 'ING', 'Students will be able to talk about regular activities of teenagers', 'Students will be able to talk about regular activities of teenagers.'),
  ('E8.2.SP1', 'ING', 'Students will be able to express what they prefer, like and dislike', 'Students will be able to express what they prefer, like and dislike.'),
  ('E8.2.SP2', 'ING', 'Students will be able to give a simple description of daily activities in a…', 'Students will be able to give a simple description of daily activities in a simple way.'),
  ('E8.2.R1', 'ING', 'Students will be able to understand short and simple texts about regular…', 'Students will be able to understand short and simple texts about regular activities of teenagers.'),
  ('E8.2.W1', 'ING', 'Students will be able to write a short and simple paragraph about regular…', 'Students will be able to write a short and simple paragraph about regular activities of teenagers.'),
  ('E8.3.L1', 'ING', 'Students will be able to get the gist of short, clear, simple descriptions…', 'Students will be able to get the gist of short, clear, simple descriptions of a process.'),
  ('E8.3.SI1', 'ING', 'Students will be able to ask and answer questions and exchange ideas and…', 'Students will be able to ask and answer questions and exchange ideas and information on a topic related to how something is processed.'),
  ('E8.3.SP1', 'ING', 'Students will be able to give a simple description about a process', 'Students will be able to give a simple description about a process.'),
  ('E8.3.R1', 'ING', 'Students will be able to understand the overall meaning of short texts about…', 'Students will be able to understand the overall meaning of short texts about a process.'),
  ('E8.3.R2', 'ING', 'Students will be able to guess the meaning of unknown words from the text', 'Students will be able to guess the meaning of unknown words from the text.'),
  ('E8.3.W1', 'ING', 'Students will be able to write a series of simple phrases and sentences by…', 'Students will be able to write a series of simple phrases and sentences by using linkers to describe a process.'),
  ('E8.4.L1', 'ING', 'Students will be able to understand phrases and related vocabulary items', 'Students will be able to understand phrases and related vocabulary items.'),
  ('E8.4.L2', 'ING', 'Students will be able to follow a phone conversation', 'Students will be able to follow a phone conversation.'),
  ('E8.4.SI1', 'ING', 'Students will be able to make a simple phone call asking and responding to…', 'Students will be able to make a simple phone call asking and responding to questions.'),
  ('E8.4.SP1', 'ING', 'Students will be able to express their decisions taken at the moment of…', 'Students will be able to express their decisions taken at the moment of conversation.'),
  ('E8.4.R1', 'ING', 'Students will be able to understand short and simple texts with related…', 'Students will be able to understand short and simple texts with related vocabulary.'),
  ('E8.4.W1', 'ING', 'Students will be able to write short and simple conversations', 'Students will be able to write short and simple conversations.'),
  ('E8.5.L1', 'ING', 'Students will be able to understand the gist of oral texts', 'Students will be able to understand the gist of oral texts.'),
  ('E8.5.L2', 'ING', 'Students will be able to comprehend phrases and related vocabulary items', 'Students will be able to comprehend phrases and related vocabulary items.'),
  ('E8.5.SI1', 'ING', 'Students will be able to talk about their Internet habits', 'Students will be able to talk about their Internet habits.'),
  ('E8.5.SI2', 'ING', 'Students will be able to exchange information about the Internet', 'Students will be able to exchange information about the Internet.'),
  ('E8.5.SP1', 'ING', 'Students will be able to make excuses, and to accept and refuse offers by…', 'Students will be able to make excuses, and to accept and refuse offers by using a series of phrases and simple sentences.'),
  ('E8.5.R1', 'ING', 'Students will be able to identify main ideas in short and simple texts about…', 'Students will be able to identify main ideas in short and simple texts about internet habits.'),
  ('E8.5.R2', 'ING', 'Students will be able to find specific information about the Internet in…', 'Students will be able to find specific information about the Internet in various texts.'),
  ('E8.5.W1', 'ING', 'Students will be able to write a basic paragraph to describe their internet…', 'Students will be able to write a basic paragraph to describe their internet habits.'),
  ('E8.6.L1', 'ING', 'Students will be able to follow a discussion on adventures', 'Students will be able to follow a discussion on adventures.'),
  ('E8.6.L2', 'ING', 'Students will be able to understand the main points of simple messages', 'Students will be able to understand the main points of simple messages.'),
  ('E8.6.SI1', 'ING', 'Students will be able to interact with reasonable ease in short conversations', 'Students will be able to interact with reasonable ease in short conversations.'),
  ('E8.6.SI2', 'ING', 'Students will be able to talk about comparisons, preferences and their reasons', 'Students will be able to talk about comparisons, preferences and their reasons.'),
  ('E8.6.SP1', 'ING', 'Students will be able to make comparisons about sports and games by using…', 'Students will be able to make comparisons about sports and games by using simple descriptive language.'),
  ('E8.6.R1', 'ING', 'Students will be able to understand short and simple texts to find the main…', 'Students will be able to understand short and simple texts to find the main points about adventures.'),
  ('E8.6.W1', 'ING', 'Students will be able to write a short and simple paragraph comparing two…', 'Students will be able to write a short and simple paragraph comparing two objects.'),
  ('E8.7.L1', 'ING', 'Students will be able to understand and extract the specific information…', 'Students will be able to understand and extract the specific information from short and simple oral texts.'),
  ('E8.7.SI1', 'ING', 'Students will be able to exchange information about tourism', 'Students will be able to exchange information about tourism.'),
  ('E8.7.SI2', 'ING', 'Students will be able to talk about their favorite tourist attractions by…', 'Students will be able to talk about their favorite tourist attractions by giving details.'),
  ('E8.7.SP1', 'ING', 'Students will be able to express their preferences for particular tourist…', 'Students will be able to express their preferences for particular tourist attractions and give reasons.'),
  ('E8.7.SP2', 'ING', 'Students will be able to make simple comparisons between different tourist…', 'Students will be able to make simple comparisons between different tourist attractions.'),
  ('E8.7.SP3', 'ING', 'Students will be able to express their experiences about places', 'Students will be able to express their experiences about places.'),
  ('E8.7.R1', 'ING', 'Students will be able to find specific information from various texts about…', 'Students will be able to find specific information from various texts about tourism.'),
  ('E8.7.W1', 'ING', 'Students will be able to design a brochure, advertisement or a postcard…', 'Students will be able to design a brochure, advertisement or a postcard about their favorite tourist attraction(s).'),
  ('E8.8.L1', 'ING', 'Students will be able to identify the main points of a short talk describing…', 'Students will be able to identify the main points of a short talk describing the responsibilities of people.'),
  ('E8.8.L2', 'ING', 'Students will be able to understand obligations, likes and dislikes in…', 'Students will be able to understand obligations, likes and dislikes in various oral texts.'),
  ('E8.8.L3', 'ING', 'Students will be able to follow topic change during factual, short talks', 'Students will be able to follow topic change during factual, short talks.'),
  ('E8.8.SI1', 'ING', 'Students will be able to interact during simple, routine tasks requiring a…', 'Students will be able to interact during simple, routine tasks requiring a direct exchange of information.'),
  ('E8.8.SI2', 'ING', 'Students will be able to talk about responsibilities', 'Students will be able to talk about responsibilities.'),
  ('E8.8.SP1', 'ING', 'Students will be able to express their obligations, likes and dislikes in…', 'Students will be able to express their obligations, likes and dislikes in simple terms.'),
  ('E8.8.R1', 'ING', 'Students will be able to understand various short and simple texts about…', 'Students will be able to understand various short and simple texts about responsibilities.'),
  ('E8.8.W1', 'ING', 'Students will be able to write short and simple poems/stories about their…', 'Students will be able to write short and simple poems/stories about their feelings and responsibilities.'),
  ('E8.9.L1', 'ING', 'Students will be able to recognize main ideas and key information in short…', 'Students will be able to recognize main ideas and key information in short oral texts about science.'),
  ('E8.9.SI1', 'ING', 'Students will be able to talk about actions happening currently and in the past', 'Students will be able to talk about actions happening currently and in the past.'),
  ('E8.9.SI2', 'ING', 'Students will be able to involve in simple discussions about scientific…', 'Students will be able to involve in simple discussions about scientific achievements.'),
  ('E8.9.SP1', 'ING', 'Students will be able to describe actions happening currently', 'Students will be able to describe actions happening currently.'),
  ('E8.9.SP2', 'ING', 'Students will be able to present information about scientific achievements…', 'Students will be able to present information about scientific achievements in a simple way.'),
  ('E8.9.R1', 'ING', 'Students will be able to understand short and simple texts about actions…', 'Students will be able to understand short and simple texts about actions happening currently and in the past.'),
  ('E8.9.R2', 'ING', 'Students will be able to identify main ideas and supporting details in short…', 'Students will be able to identify main ideas and supporting details in short texts about science.'),
  ('E8.9.W1', 'ING', 'Students will be able to write simple descriptions of scientific…', 'Students will be able to write simple descriptions of scientific achievements in a short paragraph.'),
  ('E8.10.L1', 'ING', 'Students will be able to identify the main points of TV news about natural…', 'Students will be able to identify the main points of TV news about natural forces and disasters.'),
  ('E8.10.SI1', 'ING', 'Students will be able to talk about predictions concerning future of the Earth', 'Students will be able to talk about predictions concerning future of the Earth.'),
  ('E8.10.SI2', 'ING', 'Students will be able to negotiate reasons and results to support their…', 'Students will be able to negotiate reasons and results to support their predictions about natural forces and disasters.'),
  ('E8.10.SP1', 'ING', 'Students will be able to express predictions concerning future of the Earth', 'Students will be able to express predictions concerning future of the Earth.'),
  ('E8.10.SP2', 'ING', 'Students will be able to give reasons and results to support their…', 'Students will be able to give reasons and results to support their predictions about natural forces and disasters.'),
  ('E8.10.R1', 'ING', 'Students will be able to identify specific information in simple texts about…', 'Students will be able to identify specific information in simple texts about natural forces and disasters.'),
  ('E8.10.W1', 'ING', 'Students will be able to write a short and simple paragraph about reasons…', 'Students will be able to write a short and simple paragraph about reasons and results of natural forces and disasters.')
on conflict (code) do update set subject = excluded.subject, title = excluded.title, full_text = excluded.full_text;
