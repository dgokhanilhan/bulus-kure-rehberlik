-- Öğretmenler Odası: üç yeni günlük oyun. Hepsi sunucuda üretilir ve doğrulanır (cevap oyun bitmeden tarayıcıya gitmez).
-- 1) Günün Şehri (sehir): bir il tahmin edilir; her yanlış tahminde hedefe uzaklık ve yön gelir, tahminler ilerledikçe yöresel
--    ipuçları açılır (3 ipucu). 6 hak; skor = tahmin sayısı (7 = bulunamadı).
-- 2) 5 Soruda Bugün (soru): her gün 5 genel kültür sorusu; o güne özel soru varsa ilk soru odur. Skor = doğru sayısı.
-- 3) Mini Bulmaca (bulmaca): 5×5 kafes (3 yatay, 3 düşey kelime); süre sunucuda ölçülür. Skor = saniye.
-- İçerik scripts/oyun-icerik/ altındaki dosyalardan üretilir. Oyunlar ayarlardan açılıp kapatılır (oda.oyun.*, 0072).
-- Geri alma: supabase/geri-alma/0073_oda_gunluk_oyunlar_geri_al.sql

alter function setting_spec() rename to setting_spec_before_0073;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0073() || '{
    "oda.oyun.sehir":{"type":"bool","default":true},
    "oda.oyun.soru":{"type":"bool","default":true},
    "oda.oyun.bulmaca":{"type":"bool","default":true}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

alter table oda_oyun drop constraint oda_oyun_oyun_check;
alter table oda_oyun add constraint oda_oyun_oyun_check
  check (oyun in ('sudoku', 'kelime', 'yilan', 'sprint', 'mayin', 'hafiza', 'sehir', 'soru', 'bulmaca'));
create unique index oda_oyun_gunluk2 on oda_oyun (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca');

-- İçerik tabloları: kural yok, yalnız fonksiyonlar okur
create table oda_sehir (
  plaka int primary key check (plaka between 1 and 81),
  ad text not null unique,
  enlem numeric(5, 2) not null,
  boylam numeric(5, 2) not null,
  ipuclari text[] not null check (array_length(ipuclari, 1) = 3)
);
alter table oda_sehir enable row level security;
create table oda_soru (
  id int generated always as identity primary key,
  soru text not null,
  secenekler text[] not null check (array_length(secenekler, 1) = 4),
  dogru int not null check (dogru between 1 and 4),
  ay int check (ay between 1 and 12),
  gun int check (gun between 1 and 31),
  check ((ay is null) = (gun is null))
);
alter table oda_soru enable row level security;
create table oda_bulmaca (
  no int primary key,
  yatay text[] not null check (array_length(yatay, 1) = 3),
  dusey text[] not null check (array_length(dusey, 1) = 3),
  yatay_ipucu text[] not null check (array_length(yatay_ipucu, 1) = 3),
  dusey_ipucu text[] not null check (array_length(dusey_ipucu, 1) = 3)
);
alter table oda_bulmaca enable row level security;
revoke all on oda_sehir, oda_soru, oda_bulmaca from anon, authenticated;

insert into oda_sehir (plaka, ad, enlem, boylam, ipuclari) values
  (1, 'Adana', 37.00, 35.32, array['Taşköprü, Seyhan Nehri üzerindedir', 'Varda Köprüsü ve şalgam suyu', 'Adını taşıyan acılı kebabıyla ünlüdür']),
  (2, 'Adıyaman', 37.76, 38.28, array['Cendere Köprüsü buradadır', 'Çiğ köftesiyle bilinir', 'Nemrut Dağı''ndaki dev heykeller bu ildedir']),
  (3, 'Afyonkarahisar', 38.76, 30.54, array['Termal kaplıcaları ve mermeriyle bilinir', 'Büyük Taarruz Kocatepe''den başladı', 'Kaymağı ve sucuğu ünlüdür']),
  (4, 'Ağrı', 39.72, 43.05, array['Meteor çukuru Doğubayazıt''tadır', 'İshak Paşa Sarayı bu ildedir', 'Türkiye''nin en yüksek dağıyla aynı adı taşır']),
  (5, 'Amasya', 40.65, 35.83, array['Kral kaya mezarları şehre tepeden bakar', 'Şehzadeler şehri; Yeşilırmak kıyısında yalıboyu evleri', 'Elmasıyla ünlüdür; 1919''da genelgesi yayımlandı']),
  (6, 'Ankara', 39.93, 32.86, array['Tiftik keçisi ve simidi ünlüdür', 'Anadolu Medeniyetleri Müzesi buradadır', 'Anıtkabir bu şehirdedir']),
  (7, 'Antalya', 36.89, 30.71, array['Düden Şelalesi denize dökülür', 'Aspendos Antik Tiyatrosu bu ildedir', 'Kaleiçi ve Konyaaltı; turizmin başkenti']),
  (8, 'Artvin', 41.18, 41.82, array['Kafkasör''de boğa güreşleri yapılır', 'Macahel Vadisi ve Borçka Karagöl', 'Çoruh Nehri bu ilden geçer; Hopa ilçesi']),
  (9, 'Aydın', 37.85, 27.85, array['Afrodisias Antik Kenti bu ildedir', 'Efeler diyarı olarak anılır', 'İnciri ünlüdür; Kuşadası ve Didim ilçeleri']),
  (10, 'Balıkesir', 39.65, 27.89, array['Höşmerim tatlısı buraya özgüdür', 'Kuvayımilliye şehri; Kazdağları''nın bir bölümü', 'Ayvalık, Edremit ve Bandırma ilçeleri']),
  (11, 'Bilecik', 40.14, 29.98, array['Osmaneli ve Bozüyük ilçeleri', 'Şeyh Edebali Türbesi buradadır', 'Osmanlı''nın kurulduğu Söğüt bu ildedir']),
  (12, 'Bingöl', 38.88, 40.50, array['Solhan''daki Yüzen Adalar', 'Balı ünlüdür; eski adı Çapakçur', 'Adı "bin göl" anlamına gelir']),
  (13, 'Bitlis', 38.40, 42.11, array['Ahlat Selçuklu Mezarlığı', 'Nemrut Krater Gölü', 'Tatvan ilçesi Van Gölü''nün batı kıyısındadır']),
  (14, 'Bolu', 40.74, 31.61, array['Aşçılarıyla ünlü Mengen', 'Yedigöller Milli Parkı', 'Abant Gölü ve Kartalkaya']),
  (15, 'Burdur', 37.72, 30.29, array['Ceviz ezmesi ve Teke yöresi türküleri', 'Sagalassos Antik Kenti', 'Salda Gölü bu ildedir']),
  (16, 'Bursa', 40.19, 29.06, array['Cumalıkızık köyü', 'Ulu Cami ve Yeşil Türbe', 'Uludağ ve İskender kebap']),
  (17, 'Çanakkale', 40.15, 26.41, array['Assos (Behramkale) bu ildedir', 'Truva Antik Kenti', '1915 Boğaz savaşları ve Şehitler Abidesi']),
  (18, 'Çankırı', 40.60, 33.62, array['Yâran kültürü yaşatılır', 'Tuz mağarasıyla bilinir', 'Ilgaz Dağı''nın güneyinde, Ankara''nın kuzeydoğu komşusu']),
  (19, 'Çorum', 40.55, 34.95, array['Alacahöyük bu ildedir', 'Hitit başkenti Hattuşa', 'Leblebisiyle ünlüdür']),
  (20, 'Denizli', 37.78, 29.09, array['Laodikeia Antik Kenti', 'Uzun ötüşlü horozu ünlüdür', 'Pamukkale travertenleri']),
  (21, 'Diyarbakır', 37.91, 40.24, array['On Gözlü Köprü Dicle üzerindedir', 'Hevsel Bahçeleri ve karpuzu', 'Kilometrelerce uzanan bazalt surları']),
  (22, 'Edirne', 41.68, 26.56, array['Meriç Köprüsü ve tava ciğeri', 'Kırkpınar Yağlı Güreşleri', 'Selimiye Camii bu şehirdedir']),
  (23, 'Elazığ', 38.67, 39.22, array['Çayda Çıra oyunu', 'Hazar Gölü', 'Harput Kalesi ve Keban Barajı']),
  (24, 'Erzincan', 39.75, 39.49, array['Girlevik Şelalesi', '1939 büyük depremi', 'Tulum peyniri ve Kemaliye (Eğin)']),
  (25, 'Erzurum', 39.90, 41.27, array['Oltu taşı işlemeciliği', 'Çifte Minareli Medrese; 1919 kongresi', 'Palandöken ve cağ kebabı']),
  (26, 'Eskişehir', 39.78, 30.52, array['Lületaşı buradan çıkar', 'Odunpazarı evleri ve Porsuk Çayı', 'Çibörek; Anadolu Üniversitesi']),
  (27, 'Gaziantep', 37.07, 37.38, array['Zeugma Mozaik Müzesi', 'Bakırcılar Çarşısı ve fıstığı', 'Baklavasıyla ünlüdür']),
  (28, 'Giresun', 40.91, 38.39, array['Aksu Şenlikleri', 'Kümbet ve Bektaş yaylaları', 'Kirazın anavatanı sayılır; fındığı ünlüdür']),
  (29, 'Gümüşhane', 40.46, 39.48, array['Karaca Mağarası', 'Pestil ve kömesi ünlüdür', 'Zigana Geçidi; adında bir maden var']),
  (30, 'Hakkâri', 37.57, 43.74, array['Cilo Dağları ve buzulları', 'Ters lale ve Zap Suyu', 'Yüksekova ilçesi; Türkiye''nin güneydoğu ucu']),
  (31, 'Hatay', 36.20, 36.16, array['Titus Tüneli', 'Künefesi ve Habib-i Neccar Camii', '1939''da Türkiye''ye katıldı; Antakya ve İskenderun']),
  (32, 'Isparta', 37.76, 30.55, array['Eğirdir Gölü', 'Lavanta bahçeleri ve halısı', 'Gülü ve gül yağıyla ünlüdür']),
  (33, 'Mersin', 36.80, 34.63, array['Kızkalesi', 'Cezerye ve Tarsus Şelalesi', 'Tantunisiyle ünlüdür']),
  (34, 'İstanbul', 41.01, 28.98, array['Yerebatan Sarnıcı', 'Galata Kulesi ve Kapalıçarşı', 'İki kıtayı birleştiren Boğaz']),
  (35, 'İzmir', 38.42, 27.14, array['Kemeraltı Çarşısı', 'Efes Antik Kenti ve boyoz', 'Konak Meydanı''ndaki Saat Kulesi; Kordon']),
  (36, 'Kars', 40.60, 43.10, array['Ani Harabeleri', 'Kaşarı ve gravyeri ünlüdür', 'Sarıkamış; Doğu Ekspresi''nin son durağı']),
  (37, 'Kastamonu', 41.38, 33.78, array['Valla Kanyonu', 'Taşköprü sarımsağı', 'Atatürk Şapka Devrimi''ni 1925''te burada duyurdu']),
  (38, 'Kayseri', 38.72, 35.49, array['Kültepe (Kaniş) kazıları', 'Erciyes Dağı', 'Mantısı ve pastırması ünlüdür']),
  (39, 'Kırklareli', 41.74, 27.22, array['Dupnisa Mağarası', 'İğneada Longoz Ormanları', 'Trakya''da; Lüleburgaz ilçesi ve Dereköy Sınır Kapısı']),
  (40, 'Kırşehir', 39.15, 34.16, array['Kaman Kalehöyük', 'Ahi Evran ve Ahilik', 'Neşet Ertaş''ın memleketi; Cacabey Medresesi']),
  (41, 'Kocaeli', 40.77, 29.92, array['Kartepe kayak merkezi', 'Pişmaniyesi ünlüdür', 'Merkezi İzmit''tir; Gebze ilçesi']),
  (42, 'Konya', 37.87, 32.48, array['Çatalhöyük', 'Etli ekmek; Türkiye''nin yüz ölçümü en büyük ili', 'Mevlana Müzesi']),
  (43, 'Kütahya', 39.42, 29.98, array['Aizanoi Antik Kenti''ndeki Zeus Tapınağı', 'Dumlupınar ve Zafer Anıtı', 'Çinisi ve porseleni ünlüdür']),
  (44, 'Malatya', 38.35, 38.31, array['Arslantepe Höyüğü', 'Battalgazi ve Levent Vadisi', 'Kayısısıyla ünlüdür']),
  (45, 'Manisa', 38.61, 27.43, array['Sardes Antik Kenti', 'Spil Dağı ve Ağlayan Kaya', 'Mesir macunu ve Sultaniye üzümü']),
  (46, 'Kahramanmaraş', 37.58, 36.93, array['Afşin''deki Eshab-ı Kehf Külliyesi', 'Tarhanası ve biberi ünlüdür', 'Dövme dondurmasıyla bilinir']),
  (47, 'Mardin', 37.31, 40.74, array['Dara Antik Kenti', 'Deyrulzafaran Manastırı ve telkâri', 'Mezopotamya ovasına bakan taş evler']),
  (48, 'Muğla', 37.22, 28.36, array['Dalyan''daki Kaunos kaya mezarları', 'Saklıkent Kanyonu ve Ölüdeniz', 'Bodrum, Marmaris ve Fethiye ilçeleri']),
  (49, 'Muş', 38.73, 41.49, array['Tarihî Murat Köprüsü', 'Ovası ve lalesiyle bilinir', '1071 Malazgirt Zaferi bu ilin sınırlarında kazanıldı']),
  (50, 'Nevşehir', 38.62, 34.71, array['Derinkuyu Yeraltı Şehri', 'Avanos çömlekçiliği; Hacı Bektaş Veli', 'Peribacaları ve sıcak hava balonları']),
  (51, 'Niğde', 37.97, 34.68, array['Tyana Antik Kenti ve Gümüşler Manastırı', 'Aladağlar Milli Parkı', 'Patatesi ve elması ünlüdür; Bor ilçesi']),
  (52, 'Ordu', 40.98, 37.88, array['Yason Burnu', 'Boztepe''ye teleferikle çıkılır', 'Fındık üretiminde ilk sıradadır; Fatsa ve Ünye']),
  (53, 'Rize', 41.02, 40.52, array['Zil Kale ve Fırtına Deresi', 'Ayder Yaylası ve Anzer balı', 'Çayın başkenti']),
  (54, 'Sakarya', 40.77, 30.40, array['Taraklı evleri ve ıslama köfte', 'Sapanca Gölü', 'Merkezi Adapazarı''dır; bir nehirle aynı adı taşır']),
  (55, 'Samsun', 41.29, 36.33, array['Kızılırmak ve Yeşilırmak deltaları bu ildedir', 'Bafra pidesi ve Bandırma Vapuru müzesi', '19 Mayıs 1919']),
  (56, 'Siirt', 37.93, 41.94, array['Botan Vadisi ve Tillo''daki ışık hadisesi', 'Büryan kebabı ve perde pilavı', 'Fıstığı ve battaniyesi ünlüdür; Batman''ın doğu komşusu']),
  (57, 'Sinop', 42.03, 35.15, array['Tarihî cezaevi müze olarak gezilir', 'Hamsilos Koyu ve Erfelek şelaleleri', 'Türkiye''nin en kuzey ucu İnceburun buradadır']),
  (58, 'Sivas', 39.75, 37.02, array['Divriği Ulu Camii ve Darüşşifası', 'Kangal köpeği ve Balıklı Kaplıca', '4 Eylül 1919 kongresi; Gök Medrese']),
  (59, 'Tekirdağ', 40.98, 27.51, array['Rakoczi Müzesi', 'Namık Kemal''in doğduğu şehir', 'Köftesi ünlüdür; Çorlu ve Çerkezköy ilçeleri']),
  (60, 'Tokat', 40.31, 36.55, array['Ballıca Mağarası', 'Zile pekmezi ve yazmacılık', 'Adını taşıyan kebabı; Niksar, Erbaa ve Turhal ilçeleri']),
  (61, 'Trabzon', 41.00, 39.72, array['Vakfıkebir ekmeği ve Akçaabat köftesi', 'Uzungöl', 'Sümela Manastırı']),
  (62, 'Tunceli', 39.11, 39.55, array['Pülümür Vadisi', 'Munzur Vadisi Milli Parkı', 'Eski adı Dersim; Ovacık ilçesi']),
  (63, 'Şanlıurfa', 37.16, 38.79, array['Halfeti ve Harran''ın kümbet evleri', 'Balıklıgöl', 'Göbeklitepe']),
  (64, 'Uşak', 38.68, 29.41, array['Ulubey Kanyonu', 'Eşme kilimi ve tarhanası', 'Karun Hazinesi burada sergilenir']),
  (65, 'Van', 38.49, 43.38, array['Akdamar Adası', 'Kahvaltısı ve inci kefali', 'Kedisi ünlüdür; Türkiye''nin en büyük gölü']),
  (66, 'Yozgat', 39.82, 34.81, array['Bozok Yaylası', 'Testi kebabı ve Sürmeli türküsü', 'Türkiye''nin ilk milli parkı Çamlık; Sorgun ilçesi']),
  (67, 'Zonguldak', 41.45, 31.79, array['Gökgöl Mağarası', 'Ereğli''deki Cehennemağzı Mağaraları', 'Taş kömürüyle bilinir']),
  (68, 'Aksaray', 38.37, 34.03, array['Sultanhanı Kervansarayı', 'Ihlara Vadisi', 'Hasan Dağı; Tuz Gölü''nün güneydoğusu']),
  (69, 'Bayburt', 40.26, 40.22, array['Baksı Müzesi', 'Dede Korkut Türbesi ve Aydıntepe Yeraltı Şehri', 'Çoruh kıyısındaki kalesi; nüfusu en az illerden']),
  (70, 'Karaman', 37.18, 33.22, array['Karadağ''daki Binbir Kilise', 'Türkçeyi resmî dil ilan eden beyin şehri (1277)', 'Bisküvi ve bulgur fabrikaları; Ermenek ilçesi']),
  (71, 'Kırıkkale', 39.85, 33.51, array['Çeşnigir Köprüsü', 'Makine ve silah sanayisiyle gelişti', 'Ankara''nın doğu komşusu; Keskin ve Delice ilçeleri']),
  (72, 'Batman', 37.88, 41.13, array['Malabadi Köprüsü', 'Hasankeyf bu ildedir', 'Petrol rafinerisi; bir çizgi roman kahramanıyla adaş']),
  (73, 'Şırnak', 37.52, 42.46, array['Cudi ve Gabar dağları', 'Cizre''deki Mem û Zin Türbesi', 'Habur Sınır Kapısı ve Silopi']),
  (74, 'Bartın', 41.64, 32.34, array['Güzelcehisar lav sütunları', 'İnkumu plajı', 'Amasra bu ilin ilçesidir']),
  (75, 'Ardahan', 41.11, 42.70, array['Şeytan Kalesi', 'Çıldır Gölü ve Damal bebekleri', 'Kaşarı ve kazı ünlüdür; Posof ilçesi, Gürcistan sınırı']),
  (76, 'Iğdır', 39.92, 44.05, array['Tuzluca tuz mağaraları', 'Ilıman iklimi sayesinde kayısı ve pamuk yetişir', 'Üç ülkeyle sınırı olan tek il: Ermenistan, Azerbaycan (Nahçıvan), İran']),
  (77, 'Yalova', 40.65, 29.27, array['Yürüyen Köşk', 'Termal kaplıcaları ve çiçek seraları', 'Türkiye''nin yüz ölçümü en küçük ili; Çınarcık ilçesi']),
  (78, 'Karabük', 41.20, 32.63, array['Yenice Ormanları', 'Türkiye''nin ilk demir-çelik fabrikası (1937)', 'Safranbolu evleri']),
  (79, 'Kilis', 36.72, 37.12, array['Öncüpınar Sınır Kapısı', 'Tavası, katmeri ve zeytinyağı', 'Gaziantep''in güney komşusu; Suriye sınırında küçük il']),
  (80, 'Osmaniye', 37.07, 36.25, array['Karatepe-Aslantaş Açık Hava Müzesi', 'Yer fıstığı üretimiyle bilinir', 'Çukurova''nın doğusu; Kadirli ve Düziçi ilçeleri']),
  (81, 'Düzce', 40.84, 31.16, array['Güzeldere ve Samandere şelaleleri', 'Akçakoca ilçesi ve fındığı', 'Bolu Dağı''nın batısında; 1999''da il oldu']);

insert into oda_soru (soru, secenekler, dogru, ay, gun) values
  ('Türkiye''nin yüz ölçümü en büyük ili hangisidir?', array['Ankara', 'Konya', 'Sivas', 'Erzurum'], 2, null, null),
  ('Tamamı Türkiye sınırları içinde olan en uzun nehir hangisidir?', array['Fırat', 'Sakarya', 'Kızılırmak', 'Dicle'], 3, null, null),
  ('Türkiye''nin en büyük gölü hangisidir?', array['Tuz Gölü', 'Beyşehir Gölü', 'Van Gölü', 'Eğirdir Gölü'], 3, null, null),
  ('Türkiye''nin en yüksek dağı hangisidir?', array['Erciyes', 'Ağrı Dağı', 'Kaçkar', 'Süphan'], 2, null, null),
  ('Türkiye''nin kaç ülkeyle kara sınırı vardır?', array['6', '7', '8', '9'], 3, null, null),
  ('İstiklal Marşı''nın şairi kimdir?', array['Namık Kemal', 'Mehmet Âkif Ersoy', 'Ziya Gökalp', 'Yahya Kemal Beyatlı'], 2, null, null),
  ('İstiklal Marşı hangi yıl kabul edildi?', array['1920', '1921', '1923', '1924'], 2, null, null),
  ('Cumhuriyet hangi yıl ilan edildi?', array['1920', '1922', '1923', '1924'], 3, null, null),
  ('Türkiye Büyük Millet Meclisi hangi tarihte açıldı?', array['19 Mayıs 1919', '23 Nisan 1920', '30 Ağustos 1922', '29 Ekim 1923'], 2, null, null),
  ('Malazgirt Savaşı hangi yıl yapıldı?', array['1071', '1176', '1299', '1453'], 1, null, null),
  ('İstanbul hangi yıl fethedildi?', array['1071', '1299', '1453', '1517'], 3, null, null),
  ('İstanbul''u fetheden padişah kimdir?', array['Yavuz Sultan Selim', 'II. Mehmed', 'Kanuni Sultan Süleyman', 'I. Murad'], 2, null, null),
  ('Harf İnkılabı hangi yıl yapıldı?', array['1925', '1926', '1928', '1934'], 3, null, null),
  ('Soyadı Kanunu hangi yıl çıkarıldı?', array['1928', '1930', '1934', '1938'], 3, null, null),
  ('Lozan Antlaşması hangi yıl imzalandı?', array['1920', '1921', '1922', '1923'], 4, null, null),
  ('Büyük Taarruz hangi yıl yapıldı?', array['1920', '1921', '1922', '1923'], 3, null, null),
  ('Atatürk, Nutuk''u hangi yıl okudu?', array['1923', '1925', '1927', '1933'], 3, null, null),
  ('Güneş''e en yakın gezegen hangisidir?', array['Venüs', 'Merkür', 'Mars', 'Dünya'], 2, null, null),
  ('Güneş sisteminin en büyük gezegeni hangisidir?', array['Satürn', 'Jüpiter', 'Neptün', 'Uranüs'], 2, null, null),
  ('Suyun kimyasal formülü hangisidir?', array['CO₂', 'H₂O', 'O₂', 'NaCl'], 2, null, null),
  ('Sofra tuzunun kimyasal formülü hangisidir?', array['NaCl', 'KCl', 'CaCO₃', 'H₂SO₄'], 1, null, null),
  ('Işık boşlukta saniyede yaklaşık kaç kilometre yol alır?', array['3.000', '30.000', '300.000', '3.000.000'], 3, null, null),
  ('İnsan vücudunun en büyük organı hangisidir?', array['Karaciğer', 'Deri', 'Akciğer', 'Beyin'], 2, null, null),
  ('Yetişkin bir insanda kaç kemik bulunur?', array['106', '206', '306', '406'], 2, null, null),
  ('Bitkilerin ışık yardımıyla besin üretmesine ne denir?', array['Solunum', 'Fotosentez', 'Terleme', 'Mayalanma'], 2, null, null),
  ('Atmosferde en çok bulunan gaz hangisidir?', array['Oksijen', 'Karbondioksit', 'Azot', 'Argon'], 3, null, null),
  ('DNA''nın çift sarmal yapısını 1953''te açıklayan bilim insanları kimlerdir?', array['Watson ve Crick', 'Curie ve Pasteur', 'Newton ve Hooke', 'Mendel ve Darwin'], 1, null, null),
  ('Periyodik tablonun ilk elementi hangisidir?', array['Helyum', 'Hidrojen', 'Lityum', 'Oksijen'], 2, null, null),
  ('Elektrik akımının birimi hangisidir?', array['Volt', 'Watt', 'Amper', 'Ohm'], 3, null, null),
  ('Kuvvetin birimi hangisidir?', array['Joule', 'Newton', 'Pascal', 'Watt'], 2, null, null),
  ('Pi sayısının yaklaşık değeri hangisidir?', array['3,12', '3,14', '3,16', '3,41'], 2, null, null),
  ('Bir üçgenin iç açılarının toplamı kaç derecedir?', array['90', '180', '270', '360'], 2, null, null),
  ('En küçük asal sayı hangisidir?', array['0', '1', '2', '3'], 3, null, null),
  ('1''den 100''e kadar olan sayıların toplamı kaçtır?', array['4950', '5000', '5050', '5100'], 3, null, null),
  ('Dik kenarları 3 ve 4 birim olan dik üçgenin hipotenüsü kaç birimdir?', array['5', '6', '7', '12'], 1, null, null),
  ('Romen rakamıyla L kaçtır?', array['5', '50', '100', '500'], 2, null, null),
  ('Düzgün altıgenin bir iç açısı kaç derecedir?', array['108', '120', '135', '150'], 2, null, null),
  ('"Sinekli Bakkal" romanının yazarı kimdir?', array['Halide Edib Adıvar', 'Reşat Nuri Güntekin', 'Yakup Kadri Karaosmanoğlu', 'Peyami Safa'], 1, null, null),
  ('"Çalıkuşu" romanının yazarı kimdir?', array['Halide Edib Adıvar', 'Reşat Nuri Güntekin', 'Refik Halid Karay', 'Ömer Seyfettin'], 2, null, null),
  ('"Kuyucaklı Yusuf" romanının yazarı kimdir?', array['Sabahattin Ali', 'Orhan Kemal', 'Yaşar Kemal', 'Kemal Tahir'], 1, null, null),
  ('"İnce Memed" romanının yazarı kimdir?', array['Orhan Pamuk', 'Yaşar Kemal', 'Aziz Nesin', 'Fakir Baykurt'], 2, null, null),
  ('Nobel Edebiyat Ödülü''nü alan ilk Türk yazar kimdir?', array['Yaşar Kemal', 'Orhan Pamuk', 'Nâzım Hikmet', 'Aziz Nesin'], 2, null, null),
  ('2015 Nobel Kimya Ödülü''nü alan Türk bilim insanı kimdir?', array['Aziz Sancar', 'Cahit Arf', 'Feza Gürsey', 'Oktay Sinanoğlu'], 1, null, null),
  ('"Safahat" kimin eseridir?', array['Tevfik Fikret', 'Mehmet Âkif Ersoy', 'Ziya Paşa', 'Namık Kemal'], 2, null, null),
  ('Dede Korkut Kitabı''nın Dresden nüshasında kaç hikâye vardır?', array['7', '10', '12', '40'], 3, null, null),
  ('Divânu Lügâti''t-Türk''ün yazarı kimdir?', array['Yusuf Has Hacib', 'Kaşgarlı Mahmud', 'Ali Şîr Nevâî', 'Edip Ahmet Yüknekî'], 2, null, null),
  ('Kutadgu Bilig''in yazarı kimdir?', array['Kaşgarlı Mahmud', 'Yusuf Has Hacib', 'Ahmet Yesevî', 'Yunus Emre'], 2, null, null),
  ('"Vatan yahut Silistre" oyununun yazarı kimdir?', array['Namık Kemal', 'Şinasi', 'Ziya Paşa', 'Abdülhak Hâmid Tarhan'], 1, null, null),
  ('İlk yerli roman sayılan "Taaşşuk-ı Talat ve Fitnat"ın yazarı kimdir?', array['Şemsettin Sami', 'Namık Kemal', 'Ahmet Mithat Efendi', 'Recaizade Mahmud Ekrem'], 1, null, null),
  ('"Suç ve Ceza" romanının yazarı kimdir?', array['Tolstoy', 'Dostoyevski', 'Çehov', 'Gogol'], 2, null, null),
  ('"Sefiller" romanının yazarı kimdir?', array['Balzac', 'Victor Hugo', 'Émile Zola', 'Flaubert'], 2, null, null),
  ('"Don Kişot" romanının yazarı kimdir?', array['Cervantes', 'Dante', 'Shakespeare', 'Goethe'], 1, null, null),
  ('"Hamlet" oyununun yazarı kimdir?', array['Molière', 'Shakespeare', 'Goethe', 'Ibsen'], 2, null, null),
  ('Mona Lisa tablosunun ressamı kimdir?', array['Michelangelo', 'Leonardo da Vinci', 'Raffaello', 'Rembrandt'], 2, null, null),
  ('"Yıldızlı Gece" tablosunun ressamı kimdir?', array['Claude Monet', 'Vincent van Gogh', 'Pablo Picasso', 'Salvador Dalí'], 2, null, null),
  ('"Kaplumbağa Terbiyecisi" tablosunun ressamı kimdir?', array['Osman Hamdi Bey', 'İbrahim Çallı', 'Bedri Rahmi Eyüboğlu', 'Şeker Ahmed Paşa'], 1, null, null),
  ('Selimiye Camii''nin mimarı kimdir?', array['Mimar Kemaleddin', 'Mimar Sinan', 'Sedefkâr Mehmed Ağa', 'Mimar Hayreddin'], 2, null, null),
  ('Sultanahmet Camii''nin mimarı kimdir?', array['Mimar Sinan', 'Sedefkâr Mehmed Ağa', 'Davud Ağa', 'Mimar Kasım'], 2, null, null),
  ('Dünyanın en büyük okyanusu hangisidir?', array['Atlas Okyanusu', 'Hint Okyanusu', 'Büyük Okyanus', 'Arktik Okyanusu'], 3, null, null),
  ('Dünyanın en yüksek dağı hangisidir?', array['K2', 'Everest', 'Kilimanjaro', 'Mont Blanc'], 2, null, null),
  ('Yüz ölçümü en büyük ülke hangisidir?', array['Kanada', 'Çin', 'Rusya', 'ABD'], 3, null, null),
  ('Japonya''nın başkenti neresidir?', array['Kyoto', 'Osaka', 'Tokyo', 'Seul'], 3, null, null),
  ('Avustralya''nın başkenti neresidir?', array['Sidney', 'Melbourne', 'Canberra', 'Perth'], 3, null, null),
  ('Kanada''nın başkenti neresidir?', array['Toronto', 'Ottawa', 'Vancouver', 'Montreal'], 2, null, null),
  ('Brezilya''nın başkenti neresidir?', array['Rio de Janeiro', 'São Paulo', 'Brasília', 'Salvador'], 3, null, null),
  ('Azerbaycan''ın başkenti neresidir?', array['Bakü', 'Gence', 'Tiflis', 'Aşkabat'], 1, null, null),
  ('Kazakistan''ın başkenti neresidir?', array['Almatı', 'Astana', 'Bişkek', 'Taşkent'], 2, null, null),
  ('Ekvator''un uzunluğu yaklaşık kaç kilometredir?', array['20.000', '40.000', '60.000', '80.000'], 2, null, null),
  ('Ankara hangi yıl başkent oldu?', array['1920', '1923', '1924', '1930'], 2, null, null),
  ('Türkiye''de kaç il vardır?', array['67', '77', '81', '85'], 3, null, null),
  ('Türkiye kaç coğrafi bölgeye ayrılır?', array['5', '6', '7', '8'], 3, null, null),
  ('İstanbul''daki ilk Boğaz köprüsü hangi yıl açıldı?', array['1963', '1973', '1983', '1988'], 2, null, null),
  ('Türkiye''nin en kalabalık ili hangisidir?', array['Ankara', 'İzmir', 'İstanbul', 'Bursa'], 3, null, null),
  ('Tuz Gölü hangi bölgemizdedir?', array['Ege', 'İç Anadolu', 'Akdeniz', 'Doğu Anadolu'], 2, null, null),
  ('Peribacaları hangi yöremizdedir?', array['Kapadokya', 'Çukurova', 'Trakya', 'Teke Yöresi'], 1, null, null),
  ('Olimpiyat bayrağında kaç halka vardır?', array['4', '5', '6', '7'], 2, null, null),
  ('Futbolda bir takım sahaya kaç oyuncuyla çıkar?', array['9', '10', '11', '12'], 3, null, null),
  ('Basketbolda bir takım sahada kaç oyuncuyla oynar?', array['5', '6', '7', '11'], 1, null, null),
  ('Voleybolda bir takım sahada kaç oyuncuyla oynar?', array['5', '6', '7', '9'], 2, null, null),
  ('Türkiye, 2002 FIFA Dünya Kupası''nı kaçıncı bitirdi?', array['İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci'], 2, null, null),
  ('Naim Süleymanoğlu hangi spor dalında olimpiyat şampiyonu oldu?', array['Güreş', 'Halter', 'Boks', 'Atletizm'], 2, null, null),
  ('Satranç tahtasında kaç kare vardır?', array['36', '49', '64', '81'], 3, null, null),
  ('Artık yıl kaç gündür?', array['364', '365', '366', '367'], 3, null, null),
  ('Türk alfabesinde kaç harf vardır?', array['26', '28', '29', '31'], 3, null, null),
  ('Türk alfabesinde kaç ünlü harf vardır?', array['6', '7', '8', '9'], 3, null, null),
  ('"Kitaplık" sözcüğündeki "-lık" hangi tür ektir?', array['Çekim eki', 'Yapım eki', 'Hâl eki', 'İyelik eki'], 2, null, null),
  ('Hangisi bir noktalama işareti değildir?', array['Virgül', 'Ünlem', 'Kesme', 'Hece'], 4, null, null),
  ('İnternet adreslerindeki "www" neyin kısaltmasıdır?', array['World Wide Web', 'Wide World Web', 'World Web Wide', 'Web World Wide'], 1, null, null),
  ('Bilgisayarda 1 bayt kaç bittir?', array['4', '8', '16', '32'], 2, null, null),
  ('Türkçenin bilinen ilk sözlüğü hangisidir?', array['Kâmûs-ı Türkî', 'Divânu Lügâti''t-Türk', 'Lehçe-i Osmânî', 'Kutadgu Bilig'], 2, null, null),
  ('Telefonun mucidi olarak bilinen kişi kimdir?', array['Thomas Edison', 'Alexander Graham Bell', 'Nikola Tesla', 'Guglielmo Marconi'], 2, null, null),
  ('Akkor telli ampulü geliştirip yaygınlaştıran mucit kimdir?', array['Thomas Edison', 'Graham Bell', 'James Watt', 'Benjamin Franklin'], 1, null, null),
  ('Evrensel kütle çekim yasasını ortaya koyan bilim insanı kimdir?', array['Galileo', 'Newton', 'Einstein', 'Kepler'], 2, null, null),
  ('Görelilik kuramını geliştiren bilim insanı kimdir?', array['Newton', 'Bohr', 'Einstein', 'Planck'], 3, null, null),
  ('Penisilini bulan bilim insanı kimdir?', array['Louis Pasteur', 'Alexander Fleming', 'Robert Koch', 'Edward Jenner'], 2, null, null),
  ('İnsan Ay''a ilk kez hangi yıl ayak bastı?', array['1961', '1965', '1969', '1972'], 3, null, null),
  ('Uzaya çıkan ilk insan kimdir?', array['Neil Armstrong', 'Yuri Gagarin', 'Buzz Aldrin', 'John Glenn'], 2, null, null),
  ('Türkiye''nin yörüngeye yerleşen ilk haberleşme uydusu hangisidir?', array['Göktürk-1', 'Türksat 1B', 'RASAT', 'İMECE'], 2, null, null),
  ('Türkiye''nin uzaya giden ilk astronotu kimdir?', array['Alper Gezeravcı', 'Tuva Cihangir Atasever', 'Aziz Sancar', 'Cahit Arf'], 1, null, null),
  ('ABO sisteminde kaç ana kan grubu vardır?', array['2', '3', '4', '6'], 3, null, null),
  ('İnsan kalbi kaç odacıklıdır?', array['2', '3', '4', '5'], 3, null, null),
  ('Hangisi bir memelidir?', array['Penguen', 'Yunus', 'Köpek balığı', 'Timsah'], 2, null, null),
  ('Su, deniz seviyesinde kaç santigrat derecede kaynar?', array['90', '100', '110', '120'], 2, null, null),
  ('Sesin havadaki hızı saniyede yaklaşık kaç metredir?', array['34', '340', '3.400', '34.000'], 2, null, null),
  ('Gökkuşağında kaç renk sayılır?', array['5', '6', '7', '8'], 3, null, null),
  ('Türk lirasının simgesi (₺) hangi yıl tanıtıldı?', array['2005', '2009', '2012', '2016'], 3, null, null),
  ('10 TL''lik banknotun arka yüzünde hangi bilim insanı yer alır?', array['Aziz Sancar', 'Cahit Arf', 'Fatma Aliye', 'Yunus Emre'], 2, null, null),
  ('Dünyanın ilk kadın savaş pilotu olarak bilinen Türk havacı kimdir?', array['Sabiha Gökçen', 'Halide Edib Adıvar', 'Afet İnan', 'Safiye Ali'], 1, null, null),
  ('Göbeklitepe hangi ilimizdedir?', array['Mardin', 'Şanlıurfa', 'Diyarbakır', 'Adıyaman'], 2, null, null),
  ('Efes Antik Kenti hangi ilimizdedir?', array['Aydın', 'İzmir', 'Muğla', 'Manisa'], 2, null, null),
  ('Sümela Manastırı hangi ilimizdedir?', array['Rize', 'Trabzon', 'Giresun', 'Artvin'], 2, null, null),
  ('Pamukkale travertenleri hangi ilimizdedir?', array['Denizli', 'Burdur', 'Afyonkarahisar', 'Uşak'], 1, null, null),
  ('Anıtkabir''in mimarları kimlerdir?', array['Emin Onat ve Orhan Arda', 'Mimar Kemaleddin ve Vedat Tek', 'Sedad Hakkı Eldem ve Paul Bonatz', 'Clemens Holzmeister ve Bruno Taut'], 1, null, null),
  ('Atatürk hangi şehirde doğdu?', array['Manastır', 'Selanik', 'Üsküp', 'İstanbul'], 2, null, null),
  ('Köy Enstitüleri hangi yıl kuruldu?', array['1930', '1935', '1940', '1946'], 3, null, null),
  ('Türkiye''de Öğretmenler Günü hangi tarihte kutlanır?', array['5 Ekim', '24 Kasım', '10 Kasım', '23 Nisan'], 2, null, null),
  ('Bugün 29 Ekim. Cumhuriyet ilan edildiğinde ilk cumhurbaşkanı kim seçildi?', array['İsmet İnönü', 'Mustafa Kemal', 'Fevzi Çakmak', 'Kâzım Karabekir'], 2, 10, 29),
  ('Bugün 23 Nisan. Türkiye Büyük Millet Meclisi ilk kez hangi şehirde toplandı?', array['İstanbul', 'Sivas', 'Ankara', 'Erzurum'], 3, 4, 23),
  ('Bugün 19 Mayıs. Mustafa Kemal 1919''da Samsun''a hangi vapurla çıktı?', array['Gülcemal', 'Bandırma', 'Ertuğrul', 'Nusret'], 2, 5, 19),
  ('Bugün 30 Ağustos. Başkomutanlık Meydan Muharebesi hangi yıl kazanıldı?', array['1920', '1921', '1922', '1923'], 3, 8, 30),
  ('Bugün 10 Kasım. Atatürk''ün naaşı Anıtkabir''e hangi yıl nakledildi?', array['1938', '1944', '1953', '1960'], 3, 11, 10),
  ('Bugün 24 Kasım Öğretmenler Günü. Atatürk''e "Başöğretmen" unvanı hangi yıl verildi?', array['1923', '1928', '1934', '1938'], 2, 11, 24),
  ('Bugün 18 Mart. Çanakkale Deniz Zaferi hangi yıl kazanıldı?', array['1914', '1915', '1916', '1918'], 2, 3, 18),
  ('Bugün 12 Mart. İstiklal Marşı Meclis''te hangi yıl kabul edildi?', array['1920', '1921', '1922', '1923'], 2, 3, 12),
  ('Bugün 14 Mart (3/14). Dünyada bu gün hangi sayının günü olarak kutlanır?', array['e sayısı', 'Pi sayısı', 'Altın oran', 'Sıfır'], 2, 3, 14),
  ('Bugün 21 Mart. Bu tarih dolaylarında kuzey yarım kürede hangisi yaşanır?', array['Yaz gündönümü', 'İlkbahar ekinoksu', 'Kış gündönümü', 'Sonbahar ekinoksu'], 2, 3, 21),
  ('Bugün 21 Haziran. Bu tarih dolaylarında kuzey yarım kürede hangisi yaşanır?', array['En uzun gündüz', 'En uzun gece', 'Gece ile gündüzün eşitliği', 'Güneş tutulması'], 1, 6, 21),
  ('Bugün 21 Aralık. Bu tarih dolaylarında kuzey yarım kürede hangisi yaşanır?', array['En uzun gündüz', 'En uzun gece', 'Gece ile gündüzün eşitliği', 'Ay tutulması'], 2, 12, 21),
  ('Bugün 23 Eylül. Bu tarih dolaylarında kuzey yarım kürede hangisi yaşanır?', array['Yaz gündönümü', 'İlkbahar ekinoksu', 'Kış gündönümü', 'Sonbahar ekinoksu'], 4, 9, 23),
  ('Bugün 5 Haziran. Birleşmiş Milletler bu günü hangi ad ile kutlar?', array['Dünya Su Günü', 'Dünya Çevre Günü', 'Dünya Ormancılık Günü', 'Dünya Okyanuslar Günü'], 2, 6, 5),
  ('Bugün 22 Mart. Birleşmiş Milletler bu günü hangi ad ile kutlar?', array['Dünya Su Günü', 'Dünya Çevre Günü', 'Dünya Sağlık Günü', 'Dünya Kitap Günü'], 1, 3, 22),
  ('Bugün 6 Ekim. İstanbul hangi yıl kurtuldu?', array['1918', '1920', '1922', '1923'], 4, 10, 6),
  ('Bugün 9 Eylül. İzmir hangi yıl kurtuldu?', array['1920', '1921', '1922', '1923'], 3, 9, 9),
  ('Bugün 26 Eylül Türk Dil Bayramı. Birinci Türk Dil Kurultayı hangi yıl toplandı?', array['1928', '1932', '1934', '1936'], 2, 9, 26),
  ('Bugün 5 Aralık. Türk kadınına milletvekili seçme ve seçilme hakkı hangi yıl tanındı?', array['1930', '1933', '1934', '1946'], 3, 12, 5),
  ('Bugün 1 Kasım. Yeni Türk harflerinin kabulüne dair kanun hangi yıl çıkarıldı?', array['1926', '1927', '1928', '1929'], 3, 11, 1),
  ('Bugün 3 Mart. 1924''te bu tarihte çıkarılan ve eğitimi tek çatı altında toplayan kanun hangisidir?', array['Tevhid-i Tedrisat Kanunu', 'Teşkilât-ı Esâsîye Kanunu', 'Takrir-i Sükûn Kanunu', 'Soyadı Kanunu'], 1, 3, 3),
  ('Bugün 13 Ekim. Ankara hangi yıl başkent oldu?', array['1920', '1921', '1923', '1924'], 3, 10, 13);

insert into oda_bulmaca (no, yatay, dusey, yatay_ipucu, dusey_ipucu) values
  (0, array['böcek', 'davul', 'müzik'], array['badem', 'ceviz', 'kulak'], array['Altı bacaklı küçük canlı', 'Sahurda çalınır', 'Seslerle yapılan sanat'], array['Çağlası yeşil yenir', 'Sert kabuklu, içi beyne benzeyen yemiş', 'İşitme organı']),
  (1, array['banka', 'resim', 'kanat'], array['börek', 'nisan', 'armut'], array['Para yatırılan kurum', 'Tuvale yapılan sanat eseri', 'Kuşun uçma organı'], array['Yufkadan yapılan hamur işi', '23''ü çocuk bayramı olan ay', 'Atasözünde dibine düşen meyve']),
  (2, array['yasak', 'takım', 'kenar'], array['yatak', 'sakin', 'kömür'], array['Yapılmasına izin verilmeyen', 'Birlikte oynayan oyuncular', 'Üçgende üç tane bulunur'], array['Üzerinde uyunur', 'Durgun', 'Zonguldak''ın madeni']),
  (3, array['sabır', 'kilim', 'liman'], array['sakal', 'bilim', 'roman'], array['Sonu selamet olan erdem', 'Havsız, düz dokuma yaygı', 'Gemilerin barındığı yer'], array['Çenede çıkan kıllar', 'Deney ve gözleme dayanan uğraş', 'Uzun kurgu türü']),
  (4, array['hekim', 'bulut', 'roman'], array['haber', 'kalem', 'metin'], array['Doktor', 'Gökte yüzen su damlacıkları kümesi', 'Uzun kurgu türü'], array['Gazetede okunur', 'Yazı yazma aracı', 'Yazı']),
  (5, array['karne', 'şeker', 'keman'], array['kaşık', 'rakam', 'ekran'], array['Dönem sonunda alınır', 'Çaya atılır', 'Yayla çalınan dört telli çalgı'], array['Çorba içme aracı', 'Sayıları yazmaya yarayan işaret', 'Televizyonun görüntü yüzeyi']),
  (6, array['sokak', 'kalem', 'nokta'], array['sakin', 'kulak', 'kimya'], array['Caddeden dar yol', 'Yazı yazma aracı', 'Cümlenin sonuna konur'], array['Durgun', 'İşitme organı', 'Maddeleri inceleyen bilim']),
  (7, array['sokak', 'yılan', 'asker'], array['sayfa', 'kulak', 'kenar'], array['Caddeden dar yol', 'Sürünen, bacaksız hayvan', 'Vatan görevi yapan kişi'], array['Kitabın bir yaprağının yüzü', 'İşitme organı', 'Üçgende üç tane bulunur']),
  (8, array['tabak', 'nehir', 'sirke'], array['tenis', 'bahar', 'karne'], array['Yemek konan kap', 'Irmak', 'Üzümden yapılan ekşi sıvı'], array['Raketle oynanan spor', 'Çiçeklerin açtığı mevsim', 'Dönem sonunda alınır']),
  (9, array['yasak', 'takım', 'kanun'], array['yatak', 'sakin', 'keman'], array['Yapılmasına izin verilmeyen', 'Birlikte oynayan oyuncular', 'Yasa; bir Türk çalgısı'], array['Üzerinde uyunur', 'Durgun', 'Yayla çalınan dört telli çalgı']),
  (10, array['kemik', 'liman', 'torun'], array['kilit', 'memur', 'kanun'], array['İskeleti oluşturur', 'Gemilerin barındığı yer', 'Çocuğun çocuğu'], array['Anahtarla açılır', 'Devlet görevlisi', 'Yasa; bir Türk çalgısı']),
  (11, array['sehpa', 'nokta', 'kimya'], array['sinek', 'hakem', 'araba'], array['Koltuğun önündeki küçük masa', 'Cümlenin sonuna konur', 'Maddeleri inceleyen bilim'], array['Vızıldayan uçan böcek', 'Maçı yöneten kişi', 'Otomobil']),
  (12, array['siyah', 'kaşık', 'kalem'], array['sokak', 'yeşil', 'hakem'], array['Kömürün rengi', 'Çorba içme aracı', 'Yazı yazma aracı'], array['Caddeden dar yol', 'Çimenin rengi', 'Maçı yöneten kişi']),
  (13, array['sehpa', 'ceket', 'keman'], array['sıcak', 'hekim', 'altın'], array['Koltuğun önündeki küçük masa', 'Takım elbisenin üstü', 'Yayla çalınan dört telli çalgı'], array['Soğuğun karşıtı', 'Doktor', 'Sarı değerli maden']),
  (14, array['sabır', 'hekim', 'ekran'], array['sahne', 'bakır', 'roman'], array['Sonu selamet olan erdem', 'Doktor', 'Televizyonun görüntü yüzeyi'], array['Oyuncuların çıktığı yer', 'Kablolarda kullanılan kızıl maden', 'Uzun kurgu türü']),
  (15, array['burun', 'yasak', 'kimya'], array['bıyık', 'resim', 'nokta'], array['Koku alma organı', 'Yapılmasına izin verilmeyen', 'Maddeleri inceleyen bilim'], array['Üst dudağın üstünde çıkar', 'Tuvale yapılan sanat eseri', 'Cümlenin sonuna konur']),
  (16, array['satır', 'börek', 'hakem'], array['sabah', 'tarak', 'rakam'], array['Sayfadaki yazı dizisi', 'Yufkadan yapılan hamur işi', 'Maçı yöneten kişi'], array['Günün ilk saatleri', 'Saç düzeltir', 'Sayıları yazmaya yarayan işaret']),
  (17, array['sokak', 'yazım', 'asker'], array['sayfa', 'kazak', 'kemer'], array['Caddeden dar yol', 'İmla', 'Vatan görevi yapan kişi'], array['Kitabın bir yaprağının yüzü', 'Yünden örülen giysi', 'Bele takılır']),
  (18, array['karar', 'çiçek', 'kalem'], array['küçük', 'reçel', 'rakam'], array['Düşünüp verilen yargı', 'Bitkinin renkli, kokulu bölümü', 'Yazı yazma aracı'], array['Ufak', 'Kahvaltıda ekmeğe sürülen tatlı', 'Sayıları yazmaya yarayan işaret']),
  (19, array['sinek', 'kasım', 'kanun'], array['sokak', 'nisan', 'keman'], array['Vızıldayan uçan böcek', '24''ü Öğretmenler Günü olan ay', 'Yasa; bir Türk çalgısı'], array['Caddeden dar yol', '23''ü çocuk bayramı olan ay', 'Yayla çalınan dört telli çalgı']),
  (20, array['küçük', 'biber', 'kenar'], array['kabuk', 'çoban', 'karar'], array['Ufak', 'Acısı da tatlısı da olur', 'Üçgende üç tane bulunur'], array['Yumurtanın dış kısmı', 'Sürüyü güden kişi', 'Düşünüp verilen yargı']),
  (21, array['bıyık', 'cevap', 'kaşık'], array['böcek', 'yavaş', 'köpek'], array['Üst dudağın üstünde çıkar', 'Sorunun karşılığı', 'Çorba içme aracı'], array['Altı bacaklı küçük canlı', 'Ağır ağır', 'Sadık dost']),
  (22, array['büyük', 'bilim', 'kenar'], array['bebek', 'yılan', 'kemer'], array['Küçüğün karşıtı', 'Deney ve gözleme dayanan uğraş', 'Üçgende üç tane bulunur'], array['Yeni doğmuş çocuk', 'Sürünen, bacaksız hayvan', 'Bele takılır']),
  (23, array['kayık', 'vatan', 'asker'], array['kavga', 'yatak', 'kenar'], array['Kürekle çekilen küçük tekne', 'Yurt', 'Vatan görevi yapan kişi'], array['Dövüş', 'Üzerinde uyunur', 'Üçgende üç tane bulunur']),
  (24, array['sinek', 'cesur', 'kenar'], array['sıcak', 'nisan', 'karar'], array['Vızıldayan uçan böcek', 'Yürekli', 'Üçgende üç tane bulunur'], array['Soğuğun karşıtı', '23''ü çocuk bayramı olan ay', 'Düşünüp verilen yargı']),
  (25, array['sabah', 'nehir', 'kiraz'], array['sinek', 'bahar', 'horoz'], array['Günün ilk saatleri', 'Irmak', 'Küçük, kırmızı, saplı meyve'], array['Vızıldayan uçan böcek', 'Çiçeklerin açtığı mevsim', 'Sabah öter']),
  (26, array['hatır', 'rakam', 'zemin'], array['horoz', 'takım', 'roman'], array['Gönül; kahvenin kırk yıllık olanı', 'Sayıları yazmaya yarayan işaret', 'Odanın tabanı'], array['Sabah öter', 'Birlikte oynayan oyuncular', 'Uzun kurgu türü']),
  (27, array['kimya', 'hesap', 'eylül'], array['kahve', 'masal', 'ampul'], array['Maddeleri inceleyen bilim', 'Lokantada ödenir', 'Okulların açıldığı ay'], array['Fincanda içilir, falına bakılır', 'Olağanüstü olaylar anlatan çocuk öyküsü', 'Edison''un geliştirdiği ışık kaynağı']),
  (28, array['sirke', 'kemer', 'kanun'], array['sokak', 'roman', 'ekran'], array['Üzümden yapılan ekşi sıvı', 'Bele takılır', 'Yasa; bir Türk çalgısı'], array['Caddeden dar yol', 'Uzun kurgu türü', 'Televizyonun görüntü yüzeyi']),
  (29, array['bahar', 'bıyık', 'kilim'], array['bebek', 'hayal', 'rakam'], array['Çiçeklerin açtığı mevsim', 'Üst dudağın üstünde çıkar', 'Havsız, düz dokuma yaygı'], array['Yeni doğmuş çocuk', 'Düş', 'Sayıları yazmaya yarayan işaret']),
  (30, array['köpek', 'bilim', 'kavga'], array['kabuk', 'pilav', 'kimya'], array['Sadık dost', 'Deney ve gözleme dayanan uğraş', 'Dövüş'], array['Yumurtanın dış kısmı', 'Pirinçten ya da bulgurdan yapılır', 'Maddeleri inceleyen bilim']),
  (31, array['hakem', 'kazak', 'mayıs'], array['hekim', 'kuzey', 'makas'], array['Maçı yöneten kişi', 'Yünden örülen giysi', '19''u gençlik bayramı olan ay'], array['Doktor', 'Pusulanın gösterdiği yön', 'İki ağızlı kesme aleti']),
  (32, array['meyve', 'kalem', 'sinek'], array['makas', 'yılan', 'ekmek'], array['Elma, armut, kiraz', 'Yazı yazma aracı', 'Vızıldayan uçan böcek'], array['İki ağızlı kesme aleti', 'Sürünen, bacaksız hayvan', 'Fırından sıcak çıkar']),
  (33, array['sebze', 'nehir', 'fırın'], array['sınıf', 'bahar', 'ekran'], array['Ispanak, pırasa, lahana', 'Irmak', 'Ekmek pişirilen yer'], array['Derslik', 'Çiçeklerin açtığı mevsim', 'Televizyonun görüntü yüzeyi']),
  (34, array['böcek', 'resim', 'karar'], array['börek', 'cesur', 'kömür'], array['Altı bacaklı küçük canlı', 'Tuvale yapılan sanat eseri', 'Düşünüp verilen yargı'], array['Yufkadan yapılan hamur işi', 'Yürekli', 'Zonguldak''ın madeni']),
  (35, array['takım', 'bilet', 'keman'], array['tabak', 'kilim', 'metin'], array['Birlikte oynayan oyuncular', 'Otobüse binerken alınır', 'Yayla çalınan dört telli çalgı'], array['Yemek konan kap', 'Havsız, düz dokuma yaygı', 'Yazı']),
  (36, array['kayık', 'pazar', 'kemer'], array['köpek', 'yazım', 'karar'], array['Kürekle çekilen küçük tekne', 'Haftanın son günü', 'Bele takılır'], array['Sadık dost', 'İmla', 'Düşünüp verilen yargı']),
  (37, array['kemik', 'limon', 'yarın'], array['kolay', 'memur', 'kanun'], array['İskeleti oluşturur', 'Ekşi, sarı meyve', 'Bugünden sonraki gün'], array['Zorun karşıtı', 'Devlet görevlisi', 'Yasa; bir Türk çalgısı']),
  (38, array['bıyık', 'resim', 'şeker'], array['barış', 'yasak', 'kömür'], array['Üst dudağın üstünde çıkar', 'Tuvale yapılan sanat eseri', 'Çaya atılır'], array['Savaşın karşıtı', 'Yapılmasına izin verilmeyen', 'Zonguldak''ın madeni']),
  (39, array['temiz', 'rakam', 'nisan'], array['torun', 'makas', 'zemin'], array['Kirlinin karşıtı', 'Sayıları yazmaya yarayan işaret', '23''ü çocuk bayramı olan ay'], array['Çocuğun çocuğu', 'İki ağızlı kesme aleti', 'Odanın tabanı']),
  (40, array['böcek', 'bavul', 'köpek'], array['bebek', 'cevap', 'kulak'], array['Altı bacaklı küçük canlı', 'Yolculukta eşya konur', 'Sadık dost'], array['Yeni doğmuş çocuk', 'Sorunun karşılığı', 'İşitme organı']),
  (41, array['kimya', 'lamba', 'tarla'], array['kilit', 'memur', 'araba'], array['Maddeleri inceleyen bilim', 'Işık verir', 'Ekin ekilen arazi'], array['Anahtarla açılır', 'Devlet görevlisi', 'Otomobil']),
  (42, array['ceket', 'memur', 'ekran'], array['cümle', 'kömür', 'torun'], array['Takım elbisenin üstü', 'Devlet görevlisi', 'Televizyonun görüntü yüzeyi'], array['Nokta ile biter', 'Zonguldak''ın madeni', 'Çocuğun çocuğu']),
  (43, array['keman', 'bıyık', 'pasta'], array['kebap', 'mayıs', 'nokta'], array['Yayla çalınan dört telli çalgı', 'Üst dudağın üstünde çıkar', 'Doğum gününde kesilir'], array['Şişte ya da ızgarada pişen et yemeği', '19''u gençlik bayramı olan ay', 'Cümlenin sonuna konur']),
  (44, array['kasım', 'bulut', 'kanun'], array['kabuk', 'salon', 'metin'], array['24''ü Öğretmenler Günü olan ay', 'Gökte yüzen su damlacıkları kümesi', 'Yasa; bir Türk çalgısı'], array['Yumurtanın dış kısmı', 'Evin en geniş odası', 'Yazı']),
  (45, array['tarak', 'kasım', 'memur'], array['takım', 'resim', 'kemer'], array['Saç düzeltir', '24''ü Öğretmenler Günü olan ay', 'Devlet görevlisi'], array['Birlikte oynayan oyuncular', 'Tuvale yapılan sanat eseri', 'Bele takılır']),
  (46, array['böcek', 'bavul', 'kazak'], array['bebek', 'ceviz', 'kulak'], array['Altı bacaklı küçük canlı', 'Yolculukta eşya konur', 'Yünden örülen giysi'], array['Yeni doğmuş çocuk', 'Sert kabuklu, içi beyne benzeyen yemiş', 'İşitme organı']),
  (47, array['büyük', 'yazım', 'karar'], array['bıyık', 'yazar', 'kömür'], array['Küçüğün karşıtı', 'İmla', 'Düşünüp verilen yargı'], array['Üst dudağın üstünde çıkar', 'Kitap kaleme alan kişi', 'Zonguldak''ın madeni']),
  (48, array['sıcak', 'hakem', 'antik'], array['sehpa', 'ceket', 'kemik'], array['Soğuğun karşıtı', 'Maçı yöneten kişi', 'Çok eski çağlardan kalma'], array['Koltuğun önündeki küçük masa', 'Takım elbisenin üstü', 'İskeleti oluşturur']),
  (49, array['sofra', 'büyük', 'hatır'], array['sabah', 'fiyat', 'asker'], array['Yemek yenen masa', 'Küçüğün karşıtı', 'Gönül; kahvenin kırk yıllık olanı'], array['Günün ilk saatleri', 'Bir malın para olarak değeri', 'Vatan görevi yapan kişi']),
  (50, array['ceket', 'demir', 'ekran'], array['cadde', 'kemer', 'torun'], array['Takım elbisenin üstü', 'Mıknatısın çektiği maden', 'Televizyonun görüntü yüzeyi'], array['Geniş ana yol', 'Bele takılır', 'Çocuğun çocuğu']),
  (51, array['tenis', 'bahar', 'karne'], array['tabak', 'nehir', 'serçe'], array['Raketle oynanan spor', 'Çiçeklerin açtığı mevsim', 'Dönem sonunda alınır'], array['Yemek konan kap', 'Irmak', 'Küçük, kahverengi kuş']),
  (52, array['hakem', 'bulut', 'roman'], array['haber', 'kilim', 'metin'], array['Maçı yöneten kişi', 'Gökte yüzen su damlacıkları kümesi', 'Uzun kurgu türü'], array['Gazetede okunur', 'Havsız, düz dokuma yaygı', 'Yazı']),
  (53, array['kahve', 'çatal', 'kural'], array['küçük', 'hatır', 'eylül'], array['Fincanda içilir, falına bakılır', 'Sofrada bıçağın eşi', 'Uyulması gereken ilke'], array['Ufak', 'Gönül; kahvenin kırk yıllık olanı', 'Okulların açıldığı ay']),
  (54, array['sınıf', 'fikir', 'araba'], array['sofra', 'nokta', 'fırça'], array['Derslik', 'Düşünce', 'Otomobil'], array['Yemek yenen masa', 'Cümlenin sonuna konur', 'Boya sürmeye yarar']),
  (55, array['bıçak', 'barış', 'köpek'], array['bebek', 'çorap', 'kaşık'], array['Kesici mutfak aleti', 'Savaşın karşıtı', 'Sadık dost'], array['Yeni doğmuş çocuk', 'Ayakkabının içine giyilir', 'Çorba içme aracı']),
  (56, array['tarak', 'kasım', 'memur'], array['takım', 'resim', 'kömür'], array['Saç düzeltir', '24''ü Öğretmenler Günü olan ay', 'Devlet görevlisi'], array['Birlikte oynayan oyuncular', 'Tuvale yapılan sanat eseri', 'Zonguldak''ın madeni']),
  (57, array['kabuk', 'sabır', 'perde'], array['kasap', 'biber', 'karne'], array['Yumurtanın dış kısmı', 'Sonu selamet olan erdem', 'Pencereye asılır'], array['Et satan esnaf', 'Acısı da tatlısı da olur', 'Dönem sonunda alınır']),
  (58, array['kemik', 'hisar', 'eylül'], array['kahve', 'masal', 'kural'], array['İskeleti oluşturur', 'Küçük kale', 'Okulların açıldığı ay'], array['Fincanda içilir, falına bakılır', 'Olağanüstü olaylar anlatan çocuk öyküsü', 'Uyulması gereken ilke']),
  (59, array['makas', 'yılan', 'ekmek'], array['meyve', 'kilim', 'sinek'], array['İki ağızlı kesme aleti', 'Sürünen, bacaksız hayvan', 'Fırından sıcak çıkar'], array['Elma, armut, kiraz', 'Havsız, düz dokuma yaygı', 'Vızıldayan uçan böcek']);

create function oda_gun_no(g date) returns int language sql immutable as $$ select g - date '2026-01-01' $$;

-- ---------- Günün Şehri ----------
create function oda_sehir_gunun(g date) returns int language sql stable security definer set search_path = public as $$
  select plaka from oda_sehir order by md5('sehir:' || g || ':' || plaka) limit 1
$$;

create function oda_sehir_durum_of(s oda_oyun) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare h oda_sehir; x oda_sehir; t jsonb := '[]'; p int; km int; aci float8; n int;
  e1 float8; e2 float8; db float8;
begin
  select * into h from oda_sehir where plaka = oda_sehir_gunun(s.gun);
  for p in select v::int from jsonb_array_elements_text(coalesce(s.durum->'tahminler', '[]')) with ordinality a(v, o) order by o loop
    select * into x from oda_sehir where plaka = p;
    if p = h.plaka then
      t := t || jsonb_build_object('plaka', p, 'ad', x.ad, 'km', 0, 'yon', null);
    else
      e1 := radians(x.enlem::float8); e2 := radians(h.enlem::float8); db := radians((h.boylam - x.boylam)::float8);
      km := greatest(5, (round(6371 * 2 * asin(sqrt(power(sin((e2 - e1) / 2), 2) + cos(e1) * cos(e2) * power(sin(db / 2), 2))) / 5) * 5)::int);
      -- Hedef, tahmin edilen ilin hangi yönünde: 0° kuzey, 90° doğu
      aci := degrees(atan2(db * cos((e1 + e2) / 2), e2 - e1));
      t := t || jsonb_build_object('plaka', p, 'ad', x.ad, 'km', km,
        'yon', (array['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'])[1 + (floor((aci + 360 + 22.5) / 45)::int % 8)]);
    end if;
  end loop;
  n := jsonb_array_length(t);
  return jsonb_build_object('gun', s.gun, 'bitti', s.bitti, 'puan', s.puan, 'tahminler', t,
    'ipuclari', to_jsonb(h.ipuclari[1:case when s.bitti is not null then 3 else least(3, 1 + n / 2) end]),
    'cevap', case when s.bitti is not null then h.ad end,
    'iller', (select jsonb_agg(jsonb_build_object('plaka', i.plaka, 'ad', i.ad) order by i.plaka) from oda_sehir i));
end $$;

create function oda_sehir_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, durum) values (my_school(), auth.uid(), 'sehir', g, '{"tahminler":[]}')
    on conflict (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sehir' and gun = g;
  return oda_sehir_durum_of(s);
end $$;

create function oda_sehir_tahmin(p int) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; n int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  if p is null or not exists (select 1 from oda_sehir where plaka = p) then raise exception 'Listeden bir il seç'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sehir' and gun = g for update;
  if s.id is null then raise exception 'Önce oyunu aç'; end if;
  if s.bitti is not null then return oda_sehir_durum_of(s); end if;
  if coalesce(s.durum->'tahminler', '[]') @> to_jsonb(p) then raise exception 'Bu ili zaten denedin'; end if;
  s.durum := jsonb_set(coalesce(s.durum, '{}'), '{tahminler}', coalesce(s.durum->'tahminler', '[]') || to_jsonb(p));
  n := jsonb_array_length(s.durum->'tahminler');
  if p = oda_sehir_gunun(g) then s.bitti := now(); s.puan := n;
  elsif n >= 6 then s.bitti := now(); s.puan := 7;
  end if;
  update oda_oyun set durum = s.durum, bitti = s.bitti, puan = s.puan where id = s.id;
  return oda_sehir_durum_of(s);
end $$;

-- ---------- 5 Soruda Bugün ----------
-- Güne özel soru varsa ilk sıradadır; kalanlar genel sorulardan sırayla (tekrar etmeden döner) seçilir.
create function oda_soru_gunun(g date) returns int[] language sql stable security definer set search_path = public as $$
  with ozel as (select id from oda_soru where ay = extract(month from g)::int and gun = extract(day from g)::int order by id limit 1),
  genel as (select id, (row_number() over (order by md5('soru:' || id)) - 1)::int rn, (count(*) over ())::int n from oda_soru where ay is null),
  sirali as (select id, (((rn - oda_gun_no(g) * 5) % n) + n) % n poz from genel)
  select coalesce((select array_agg(id) from ozel), '{}')
      || (select array_agg(id order by poz) from sirali where poz < 5 - (select count(*) from ozel))
$$;

create function oda_soru_durum_of(s oda_oyun) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ids int[] := oda_soru_gunun(s.gun); c jsonb := coalesce(s.durum->'cevaplar', '[]'); t jsonb := '[]'; q oda_soru; i int; n int;
begin
  n := jsonb_array_length(c);
  for i in 1..array_length(ids, 1) loop
    select * into q from oda_soru where id = ids[i];
    t := t || jsonb_build_object('soru', q.soru, 'secenekler', to_jsonb(q.secenekler),
      'cevap', case when i <= n then (c->>(i - 1))::int end,
      'dogru', case when i <= n then q.dogru end);
  end loop;
  return jsonb_build_object('gun', s.gun, 'bitti', s.bitti, 'puan', s.puan, 'sorular', t);
end $$;

create function oda_soru_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, durum) values (my_school(), auth.uid(), 'soru', g, '{"cevaplar":[]}')
    on conflict (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'soru' and gun = g;
  return oda_soru_durum_of(s);
end $$;

-- Sıradaki soruyu cevaplar (1–4). Beşinci cevapta oyun biter; skor doğru sayısıdır.
create function oda_soru_cevap(p int) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; ids int[]; n int; d int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  if p is null or p < 1 or p > 4 then raise exception 'Bir seçenek seç'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'soru' and gun = g for update;
  if s.id is null then raise exception 'Önce oyunu aç'; end if;
  if s.bitti is not null then return oda_soru_durum_of(s); end if;
  ids := oda_soru_gunun(g);
  s.durum := jsonb_set(coalesce(s.durum, '{}'), '{cevaplar}', coalesce(s.durum->'cevaplar', '[]') || to_jsonb(p));
  n := jsonb_array_length(s.durum->'cevaplar');
  if n >= array_length(ids, 1) then
    select count(*) into d from generate_series(1, array_length(ids, 1)) i join oda_soru q on q.id = ids[i]
      where q.dogru = (s.durum->'cevaplar'->>(i - 1))::int;
    s.bitti := now(); s.puan := d;
  end if;
  update oda_oyun set durum = s.durum, bitti = s.bitti, puan = s.puan where id = s.id;
  return oda_soru_durum_of(s);
end $$;

-- ---------- Mini Bulmaca ----------
create function oda_bulmaca_gunun(g date) returns oda_bulmaca language sql stable security definer set search_path = public as $$
  select b from oda_bulmaca b
  where b.no = ((oda_gun_no(g) % (select count(*) from oda_bulmaca)::int) + (select count(*) from oda_bulmaca)::int) % (select count(*) from oda_bulmaca)::int
$$;
-- Kafesin beş satırı; kara kareler nokta
create function oda_bulmaca_satirlar(b oda_bulmaca) returns text[] language sql immutable as $$
  select array[
    b.yatay[1],
    substr(b.dusey[1], 2, 1) || '.' || substr(b.dusey[2], 2, 1) || '.' || substr(b.dusey[3], 2, 1),
    b.yatay[2],
    substr(b.dusey[1], 4, 1) || '.' || substr(b.dusey[2], 4, 1) || '.' || substr(b.dusey[3], 4, 1),
    b.yatay[3]]
$$;

create function oda_bulmaca_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; b oda_bulmaca;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun) values (my_school(), auth.uid(), 'bulmaca', g)
    on conflict (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and gun = g;
  b := oda_bulmaca_gunun(g);
  return jsonb_build_object('gun', g, 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
    'yatay', to_jsonb(b.yatay_ipucu), 'dusey', to_jsonb(b.dusey_ipucu),
    'cozum', case when s.bitti is not null then to_jsonb(oda_bulmaca_satirlar(b)) end);
end $$;

-- p: beş satır, her biri beş karakter (kara kareler nokta). Yanlışsa kaç kutunun yanlış olduğu döner.
create function oda_bulmaca_bitir(p text[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; c text[]; yanlis int; sn int;
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then return jsonb_build_object('dogru', true, 'puan', s.puan); end if;
  if p is null or array_length(p, 1) is distinct from 5 or exists (select 1 from unnest(p) x where x is null or char_length(x) <> 5) then
    raise exception 'Bulmaca eksik';
  end if;
  c := oda_bulmaca_satirlar(oda_bulmaca_gunun(g));
  select count(*) into yanlis from generate_series(1, 5) i, generate_series(1, 5) j
    where substr(c[i], j, 1) <> '.' and substr(c[i], j, 1) <> substr(p[i], j, 1);
  if yanlis > 0 then return jsonb_build_object('dogru', false, 'yanlis', yanlis); end if;
  sn := greatest(1, extract(epoch from now() - s.basladi)::int);
  update oda_oyun set bitti = now(), puan = sn where id = s.id;
  return jsonb_build_object('dogru', true, 'puan', sn);
end $$;

do $$ declare f text; begin
  foreach f in array array['oda_sehir_ac()', 'oda_sehir_tahmin(int)', 'oda_soru_ac()', 'oda_soru_cevap(int)', 'oda_bulmaca_ac()', 'oda_bulmaca_bitir(text[])'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['oda_sehir_gunun(date)', 'oda_sehir_durum_of(oda_oyun)', 'oda_soru_gunun(date)', 'oda_soru_durum_of(oda_oyun)',
                           'oda_bulmaca_gunun(date)', 'oda_bulmaca_satirlar(oda_bulmaca)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------- Skor tablosu, lig, istatistik: yeni oyunlar ----------
-- 5 Soruda Bugün'de çok olan iyidir; Günün Şehri'nde bulunamayan (7) tabloya ve lige girmez.
create or replace function oda_skor_tablosu(p_oyun text, p_donem text default 'gun')
returns table (sira int, user_id uuid, ad text, puan int, ben boolean)
language sql stable security definer set search_path = public as $$
  with b as (
    select o.user_id, case when p_oyun in ('yilan', 'sprint', 'soru') then max(o.puan) else min(o.puan) end p
    from oda_oyun o
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.oyun = p_oyun and o.bitti is not null and o.puan is not null
      and o.gun between (case when p_donem = 'hafta' then oda_hafta_basi() else tr_today() end) and tr_today()
      and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.user_id
  )
  select (rank() over (order by case when p_oyun in ('yilan', 'sprint', 'soru') then -b.p else b.p end))::int, b.user_id, pr.full_name, b.p, b.user_id = auth.uid()
  from b join profiles pr on pr.id = b.user_id
  order by 1, 3
  limit 50
$$;

create or replace function oda_lig(p_hafta_basi date default null)
returns table (sira int, user_id uuid, ad text, puan int, oyun_sayisi int, ben boolean)
language sql stable security definer set search_path = public as $$
  with h as (select coalesce(p_hafta_basi, oda_hafta_basi()) b),
  en as (
    select o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o, h
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.bitti is not null and o.puan is not null
      and oda_oyun_acik(o.oyun)
      and o.gun between h.b and h.b + 6 and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.oyun, o.user_id
  ),
  s as (select oyun, user_id, rank() over (partition by oyun order by k) r from en),
  t as (select user_id, sum(case r when 1 then 10 when 2 then 8 when 3 then 6 when 4 then 5 when 5 then 4 else 2 end)::int p, count(*)::int n
        from s group by user_id)
  select (rank() over (order by t.p desc))::int, t.user_id, pr.full_name, t.p, t.n, t.user_id = auth.uid()
  from t join profiles pr on pr.id = t.user_id
  order by 1, 3
  limit 50
$$;

create or replace function oda_oyun_istatistik() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'toplam', (select count(*) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'sudoku', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'sudoku_en_iyi', (select min(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'kelime_bulunan', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 6),
    'kelime_ikide', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 2),
    'yilan_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'yilan'),
    'sprint_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sprint'),
    'sehir_ikide', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'sehir' and puan <= 2),
    'soru_tam', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'soru' and puan = 5),
    'bulmaca', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and bitti is not null),
    'oyun_turu', (select count(distinct oyun) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'gunler', (select coalesce(jsonb_agg(g order by g desc), '[]') from (select distinct gun g from oda_oyun
               where user_id = auth.uid() and bitti is not null and gun > tr_today() - 60) d))
  where oda_ogretmen('oyunlar')
$$;
