-- Paylaşımlı etüt: bir öğrenci aynı Cumartesi aynı ders saatinde birden çok etüde yazılabilir (ör. 8'ler 1. Grup 3. derste
-- hem İngilizce hem Din Kültürü öğretmeninde; 20'şer dakika ya da haftaya göre öğretmenler kendi aralarında paylaşır).
-- Okulun bilinçli kararıdır: Etüt sayfası çakışmayı uyarı olarak gösterir ve "Yine de kaydet / yayınla" diye sorar.
-- Aynı etütte (hücrede) aynı öğrenci iki kez yazılamaz. Gruba etüt (etut_grup_ekle) çakışan öğrenciyi yine eklemez, bildirir.
-- Geri alma: supabase/geri-alma/0063_etut_paylasimli_geri_al.sql

alter table etut_ogrenciler drop constraint if exists etut_ogrenciler_gun_id_ders_student_id_key;
alter table etut_ogrenciler add constraint etut_ogrenciler_hucre_ogrenci unique (hucre_id, student_id);
create index if not exists etut_ogrenciler_gun_ders_ogr on etut_ogrenciler (gun_id, ders, student_id);

-- etut_kaydet: "aynı ders saatinde iki etüde yazılamaz" hatası kalkar; aynı hücrede tekrar eden öğrenci bir kez yazılır
do $$
declare def text; yeni text;
begin
  def := pg_get_functiondef('etut_kaydet(uuid,jsonb)'::regprocedure);
  yeni := regexp_replace(def,
    'if exists \(select 1 from etut_ogrenciler where gun_id = v_id and ders = \(h->>''ders''\)::int and student_id = st\.id\) then\s+raise exception ''% aynı ders saatinde \(%\. ders\) iki etüde yazılamaz\.''[^;]*;\s+end if;',
    'if exists (select 1 from etut_ogrenciler where hucre_id = hid and student_id = st.id) then continue; end if;');
  if yeni = def then raise exception 'etut_kaydet beklenen biçimde değil (0063)'; end if;
  execute yeni;
end $$;
