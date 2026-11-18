-- 0086: Mini Bulmaca'ya 6×6 ve 7×7 kafesler. Biçim aynı: üç yatay, üç düşey kelime; her kesişim doğrulanır.
-- Takvim (yürürlük gününden itibaren): 6×6 her çarşamba, 7×7 her ayın son cuması; diğer günler mevcut 5×5 bulmacalar.
-- Geçmiş günler ve mevcut 5×5 bulmacalar değişmez. Skorlar: günlük tabloda herkes aynı bulmacayı çözdüğü için büyük
-- bulmaca da sıralanır; haftalık tablo, haftalık lig ve kürsüde yalnız 5×5 süreleri sayılır (kişisel en iyi 5×5 kalır).
-- Geri alma: supabase/geri-alma/0086_bulmaca_buyuk_geri_al.sql

create table oda_bulmaca_buyuk (
  boyut int not null check (boyut in (6, 7)),
  sira int not null check (sira >= 0),
  satirlar int[] not null check (array_length(satirlar, 1) = 3),
  sutunlar int[] not null check (array_length(sutunlar, 1) = 3),
  yatay text[] not null check (array_length(yatay, 1) = 3),
  dusey text[] not null check (array_length(dusey, 1) = 3),
  yatay_ipucu text[] not null check (array_length(yatay_ipucu, 1) = 3),
  dusey_ipucu text[] not null check (array_length(dusey_ipucu, 1) = 3),
  primary key (boyut, sira)
);
alter table oda_bulmaca_buyuk enable row level security;
revoke all on oda_bulmaca_buyuk from anon, authenticated;

insert into oda_bulmaca_buyuk (boyut, sira, satirlar, sutunlar, yatay, dusey, yatay_ipucu, dusey_ipucu) values
  (6, 0, array[0, 3, 5], array[0, 3, 5], array['zabıta', 'kasaba', 'makara'], array['zakkum', 'ızgara', 'atmaca'], array['Belediyenin denetim görevlisi', 'Köyden büyük, kentten küçük yerleşim', 'İplik sarılan silindir'], array['Pembe çiçekli, zehirli süs bitkisi', 'Eti köz ateşinde pişirmeye yarar', 'Kartaldan küçük, yırtıcı bir kuş']),
  (6, 1, array[0, 2, 5], array[0, 2, 5], array['yazlık', 'sincap', 'kartal'], array['yastık', 'zincir', 'kapsül'], array['Tatilde kalınan ev', 'Kabarık kuyruklu, fındık seven hayvan', 'Yırtıcı kuşların en bilineni'], array['Başın altına konur', 'Birbirine geçmiş halkalardan oluşur', 'İlaç konan küçük, yutulabilir kap']),
  (6, 2, array[0, 2, 5], array[0, 2, 5], array['kibrit', 'yıldız', 'koltuk'], array['kaymak', 'bülbül', 'tuzluk'], array['Kutusuna sürtünce yanan çöp', 'Gece gökyüzünde parlar', 'Tek kişilik rahat oturak'], array['Kaynatılan sütün üstünde toplanan tabaka', 'Güzel ötüşüyle ünlü kuş', 'Sofrada tuz konan kap']),
  (6, 3, array[0, 2, 5], array[0, 2, 5], array['yastık', 'zincir', 'kaplan'], array['yazlık', 'sincap', 'karton'], array['Başın altına konur', 'Birbirine geçmiş halkalardan oluşur', 'Çizgili büyük kedi'], array['Tatilde kalınan ev', 'Kabarık kuyruklu, fındık seven hayvan', 'Kalın kâğıt']),
  (6, 4, array[0, 3, 5], array[0, 3, 5], array['mutfak', 'sümbül', 'musluk'], array['mevsim', 'futbol', 'keklik'], array['Yemek pişirilen oda', 'Baharda açan, kokulu, soğanlı çiçek', 'Suyu açıp kapamaya yarar'], array['Yılın dörtte biri', 'On birer kişilik iki takımla oynanır', 'Taşlık yerlerde yaşayan av kuşu']),
  (6, 5, array[0, 2, 5], array[0, 2, 5], array['toprak', 'boncuk', 'termos'], array['tablet', 'panter', 'kaktüs'], array['Bitkilerin kök saldığı yer', 'İpe dizilen delikli süs', 'Sıcağı sıcak, soğuğu soğuk tutan kap'], array['Dokunmatik ekranlı taşınabilir bilgisayar', 'Kara renkli büyük yaban kedisi', 'Dikenli çöl bitkisi']),
  (6, 6, array[0, 3, 5], array[0, 3, 5], array['dolmuş', 'kardeş', 'tebrik'], array['dikkat', 'minder', 'şimşek'], array['Belirli güzergâhta yolcu taşıyan küçük araç', 'Aynı anne babanın çocukları', 'Kutlama'], array['Özen, uyanıklık', 'Yere konan yumuşak oturak', 'Gök gürültüsünden önce çakar']),
  (6, 7, array[0, 2, 5], array[0, 2, 5], array['termos', 'baston', 'atmaca'], array['tabela', 'ressam', 'sinema'], array['Sıcağı sıcak, soğuğu soğuk tutan kap', 'Yürürken dayanılan değnek', 'Kartaldan küçük, yırtıcı bir kuş'], array['Dükkânın adının yazılı olduğu levha', 'Resim yapan sanatçı', 'Film izlenen salon']),
  (6, 8, array[0, 2, 5], array[0, 2, 5], array['zambak', 'mendil', 'tırnak'], array['zümrüt', 'minder', 'koltuk'], array['Beyaz, kokulu, iri çiçek', 'Burun silmeye yarar', 'Parmak ucunda uzar'], array['Yeşil değerli taş', 'Yere konan yumuşak oturak', 'Tek kişilik rahat oturak']),
  (6, 9, array[0, 2, 5], array[0, 2, 5], array['kibrit', 'kantin', 'sünger'], array['kaktüs', 'benzin', 'tandır'], array['Kutusuna sürtünce yanan çöp', 'Okulda yiyecek satılan yer', 'Bulaşık yıkarken kullanılır'], array['Dikenli çöl bitkisi', 'Otomobil yakıtı', 'Toprağa gömülü fırın']),
  (6, 10, array[0, 2, 5], array[0, 2, 5], array['poyraz', 'korsan', 'kantin'], array['piknik', 'yorgan', 'zengin'], array['Kuzeydoğudan esen soğuk rüzgâr', 'Gemi soyan deniz haydudu', 'Okulda yiyecek satılan yer'], array['Açık havada yenen yemek', 'Uyurken üstümüze örteriz', 'Varlıklı']),
  (6, 11, array[0, 2, 5], array[0, 2, 5], array['çiftçi', 'mutfak', 'kelime'], array['çömlek', 'futbol', 'iskele'], array['Toprağı ekip biçen kişi', 'Yemek pişirilen oda', 'Sözcük'], array['Topraktan pişirilmiş kap', 'On birer kişilik iki takımla oynanır', 'Gemilerin yanaştığı yer']),
  (6, 12, array[0, 3, 5], array[0, 3, 5], array['terlik', 'mağara', 'zürafa'], array['temmuz', 'lahana', 'kasaba'], array['Evde giyilen ayakkabı', 'Kayalar içindeki doğal oyuk', 'Uzun boyunlu hayvan'], array['Yılın yedinci ayı', 'Yaprağından sarma yapılan sebze', 'Köyden büyük, kentten küçük yerleşim']),
  (6, 13, array[0, 3, 5], array[0, 3, 5], array['lastik', 'rehber', 'kaynak'], array['levrek', 'tribün', 'kuyruk'], array['Tekerleğe takılır', 'Yol gösteren kişi', 'Suyun yerden çıktığı yer'], array['Lezzetli bir deniz balığı', 'Stadyumda seyircilerin oturduğu yer', 'Hayvanın arkasında sallanır']),
  (6, 14, array[0, 3, 5], array[0, 3, 5], array['şerbet', 'şömine', 'karaca'], array['şimşek', 'balina', 'tabela'], array['Tatlının üstüne dökülen şekerli su', 'Duvara yapılmış ocak', 'Küçük bir geyik türü'], array['Gök gürültüsünden önce çakar', 'Denizlerdeki en büyük memeli', 'Dükkânın adının yazılı olduğu levha']),
  (6, 15, array[0, 2, 5], array[0, 2, 5], array['zabıta', 'karaca', 'mercek'], array['zakkum', 'berber', 'aralık'], array['Belediyenin denetim görevlisi', 'Küçük bir geyik türü', 'Büyüteçte ve gözlükte bulunur'], array['Pembe çiçekli, zehirli süs bitkisi', 'Saç tıraşı yapan esnaf', 'Yılın son ayı']),
  (6, 16, array[0, 3, 5], array[0, 3, 5], array['birlik', 'defter', 'kalkan'], array['bardak', 'lastik', 'katran'], array['Beraberlik', 'Derste not tutulur', 'Savaşta korunma aracı; bir balık'], array['Su içilen kap', 'Tekerleğe takılır', 'Kara, yapışkan madde']),
  (6, 17, array[0, 3, 5], array[0, 3, 5], array['terlik', 'sözlük', 'heykel'], array['timsah', 'leylek', 'kaşkol'], array['Evde giyilen ayakkabı', 'Kelimelerin anlamlarını verir', 'Taştan ya da tunçtan yapılan sanat eseri'], array['Nehirde yaşayan, iri ağızlı sürüngen', 'Baharda gelen, uzun bacaklı göçmen kuş', 'Boyna sarılan atkı']),
  (6, 18, array[0, 2, 5], array[0, 2, 5], array['mızrak', 'sansar', 'kanepe'], array['musluk', 'zengin', 'karate'], array['Uzun saplı, sivri uçlu eski silah', 'Kümese dadanan küçük yırtıcı hayvan', 'Birkaç kişilik oturma mobilyası'], array['Suyu açıp kapamaya yarar', 'Varlıklı', 'Uzak Doğu dövüş sporu']),
  (6, 19, array[0, 3, 5], array[0, 3, 5], array['sözlük', 'devlet', 'kaşkol'], array['sandık', 'leylek', 'kartal'], array['Kelimelerin anlamlarını verir', 'Ülkeyi yöneten örgütlü yapı', 'Boyna sarılan atkı'], array['Kapaklı büyük kutu', 'Baharda gelen, uzun bacaklı göçmen kuş', 'Yırtıcı kuşların en bilineni']),
  (6, 20, array[0, 3, 5], array[0, 3, 5], array['makine', 'kaleci', 'peçete'], array['matkap', 'iskele', 'elbise'], array['Motorla çalışan alet', 'Kaleyi korur', 'Yemekte ağız silinir'], array['Delik açan alet', 'Gemilerin yanaştığı yer', 'Giysi']),
  (6, 21, array[0, 2, 5], array[0, 2, 5], array['tablet', 'peynir', 'kamyon'], array['toprak', 'bayram', 'tarçın'], array['Dokunmatik ekranlı taşınabilir bilgisayar', 'Sütten yapılan kahvaltılık', 'Yük taşıyan büyük araç'], array['Bitkilerin kök saldığı yer', 'Kutlama günü', 'Sütlacın üstüne serpilen baharat']),
  (6, 22, array[0, 3, 5], array[0, 3, 5], array['pergel', 'sinema', 'kamera'], array['porsuk', 'gazete', 'lahana'], array['Çember çizmeye yarar', 'Film izlenen salon', 'Görüntü kaydeden alet'], array['Toprak altında yaşayan, yüzü kara-beyaz çizgili hayvan', 'Her gün basılan haber yayını', 'Yaprağından sarma yapılan sebze']),
  (6, 23, array[0, 2, 5], array[0, 2, 5], array['yıldız', 'mevsim', 'keklik'], array['yumruk', 'levrek', 'zambak'], array['Gece gökyüzünde parlar', 'Yılın dörtte biri', 'Taşlık yerlerde yaşayan av kuşu'], array['Sıkılmış el', 'Lezzetli bir deniz balığı', 'Beyaz, kokulu, iri çiçek']),
  (6, 24, array[0, 3, 5], array[0, 3, 5], array['kerpiç', 'podyum', 'kaynak'], array['kirpik', 'papyon', 'çakmak'], array['Saman katılmış çamurdan yapılan tuğla', 'Dereceye girenlerin çıktığı yükselti', 'Suyun yerden çıktığı yer'], array['Göz kapağının kenarında çıkar', 'Gömlek yakasına takılan fiyonk', 'Ateş yakmaya yarayan küçük alet']),
  (6, 25, array[0, 3, 5], array[0, 3, 5], array['servis', 'bakkal', 'tırnak'], array['sohbet', 'volkan', 'sazlık'], array['Öğrencileri okula taşıyan araç', 'Mahalledeki küçük dükkân', 'Parmak ucunda uzar'], array['Söyleşi', 'Yanardağ', 'Kamışla kaplı sulak yer']),
  (6, 26, array[0, 2, 5], array[0, 2, 5], array['dikkat', 'papyon', 'mantar'], array['deprem', 'kaplan', 'tandır'], array['Özen, uyanıklık', 'Gömlek yakasına takılan fiyonk', 'Yağmurdan sonra biter; şapkalıdır'], array['Yer sarsıntısı', 'Çizgili büyük kedi', 'Toprağa gömülü fırın']),
  (6, 27, array[0, 2, 5], array[0, 2, 5], array['mikrop', 'kurşun', 'pancar'], array['mektup', 'karton', 'panter'], array['Hastalık yapan çok küçük canlı', 'Ağır ve yumuşak gri metal', 'Şekeri yapılan kök bitki'], array['Zarfa konup gönderilir', 'Kalın kâğıt', 'Kara renkli büyük yaban kedisi']),
  (6, 28, array[0, 3, 5], array[0, 3, 5], array['yumruk', 'tambur', 'mızrak'], array['yöntem', 'rehber', 'kuyruk'], array['Sıkılmış el', 'Uzun saplı bir Türk müziği çalgısı', 'Uzun saplı, sivri uçlu eski silah'], array['Metot', 'Yol gösteren kişi', 'Hayvanın arkasında sallanır']),
  (6, 29, array[0, 3, 5], array[0, 3, 5], array['telsiz', 'salata', 'harita'], array['timsah', 'sürahi', 'zürafa'], array['Kablosuz haberleşme aracı', 'Marul ve yeşilliklerle yapılır', 'Yeryüzünün kâğıt üzerindeki çizimi'], array['Nehirde yaşayan, iri ağızlı sürüngen', 'Su konan kulplu kap', 'Uzun boyunlu hayvan']),
  (7, 0, array[0, 3, 6], array[0, 3, 6], array['bilezik', 'dilekçe', 'ıspanak'], array['buzdağı', 'ejderha', 'kelebek'], array['Bileğe takılan takı', 'Resmî kuruma yazılan istek yazısı', 'Yaprakları yemeği yapılan demirli sebze'], array['Denizde yüzen dev buz kütlesi', 'Masallarda ağzından ateş saçan yaratık', 'Renkli kanatlı böcek']),
  (7, 1, array[0, 3, 6], array[0, 3, 6], array['kurbağa', 'ejderha', 'telefon'], array['kerevit', 'bezelye', 'armağan'], array['Vıraklayan hayvan', 'Masallarda ağzından ateş saçan yaratık', 'Uzaktakiyle konuşmaya yarar'], array['Tatlı suda yaşayan, kıskaçlı kabuklu', 'Yeşil, yuvarlak taneli baklagil', 'Hediye']),
  (7, 2, array[0, 3, 6], array[0, 3, 6], array['kiremit', 'tarihçi', 'ekonomi'], array['kestane', 'eldiven', 'tamirci'], array['Çatıya döşenir', 'Geçmişi inceleyen bilim insanı', 'Üretim, tüketim ve paranın bilimi'], array['Kışın közde pişirilir', 'Ele giyilir', 'Bozulanı onaran usta']),
  (7, 3, array[0, 3, 6], array[0, 3, 6], array['başkent', 'eğlence', 'ekvator'], array['bezelye', 'kamelya', 'tebeşir'], array['Bir ülkenin yönetim merkezi', 'Neşeli vakit geçirme', 'Dünyayı iki yarım küreye ayıran çizgi'], array['Yeşil, yuvarlak taneli baklagil', 'Bahçedeki çardak', 'Kara tahtaya yazar']),
  (7, 4, array[0, 3, 6], array[0, 3, 6], array['balıkçı', 'kumanya', 'traktör'], array['başkent', 'ıspanak', 'ıhlamur'], array['Balık tutan kişi', 'Yolculuk için hazırlanan yiyecek', 'Tarlada çalışan araç'], array['Bir ülkenin yönetim merkezi', 'Yaprakları yemeği yapılan demirli sebze', 'Kışın içilen bitki çayı']),
  (7, 5, array[0, 3, 6], array[0, 3, 6], array['patates', 'ahtapot', 'tornacı'], array['piramit', 'armağan', 'soytarı'], array['Kızartması sevilen yumru', 'Sekiz kollu deniz hayvanı', 'Torna tezgâhında çalışan usta'], array['Mısır firavunlarının anıt mezarı', 'Hediye', 'Saray güldürücüsü']),
  (7, 6, array[0, 3, 6], array[0, 3, 6], array['otopark', 'nişasta', 'kanarya'], array['oyuncak', 'papatya', 'kumanya'], array['Arabaların bırakıldığı yer', 'Muhallebiye kıvam verir', 'Sarı renkli ötücü kuş'], array['Çocukların oynadığı nesne', 'Beyaz yapraklı, sarı göbekli çiçek', 'Yolculuk için hazırlanan yiyecek']),
  (7, 7, array[0, 3, 6], array[0, 3, 6], array['plastik', 'nişasta', 'soytarı'], array['prenses', 'seyahat', 'kebapçı'], array['Petrolden yapılan hafif malzeme', 'Muhallebiye kıvam verir', 'Saray güldürücüsü'], array['Kralın kızı', 'Yolculuk', 'Kebap satılan lokanta']),
  (7, 8, array[0, 3, 6], array[0, 3, 6], array['palmiye', 'sebzeci', 'kalamar'], array['plastik', 'manzara', 'enginar'], array['Sıcak ülkelerin uzun ağacı', 'Manav', 'Halka halka kızartılan deniz hayvanı'], array['Petrolden yapılan hafif malzeme', 'Göz önüne serilen görünüm', 'Zeytinyağlısı yapılan, yaprakları kat kat sebze']),
  (7, 9, array[0, 3, 6], array[0, 3, 6], array['bilezik', 'kamelya', 'ispinoz'], array['bisküvi', 'ekmekçi', 'kavanoz'], array['Bileğe takılan takı', 'Bahçedeki çardak', 'Küçük, ötücü bir kuş'], array['Çayın yanında yenen gevrek yiyecek', 'Fırıncı', 'Reçel konan cam kap']),
  (7, 10, array[0, 3, 6], array[0, 3, 6], array['çekmece', 'basamak', 'ıhlamur'], array['çorbacı', 'makarna', 'emektar'], array['Dolabın içine kayan bölme', 'Merdivenin her bir adımı', 'Kışın içilen bitki çayı'], array['Çorba satılan dükkân', 'Haşlanarak yenen hamur işi', 'Uzun yıllar hizmet etmiş']),
  (7, 11, array[0, 3, 6], array[0, 3, 6], array['pastane', 'menekşe', 'ekonomi'], array['palmiye', 'telefon', 'ekmekçi'], array['Pasta satılan dükkân', 'Mor renkli küçük çiçek', 'Üretim, tüketim ve paranın bilimi'], array['Sıcak ülkelerin uzun ağacı', 'Uzaktakiyle konuşmaya yarar', 'Fırıncı']),
  (7, 12, array[0, 3, 6], array[0, 3, 6], array['kelebek', 'tiyatro', 'uçurtma'], array['kartopu', 'ekvator', 'kolonya'], array['Renkli kanatlı böcek', 'Oyunların sahnelendiği yer', 'Rüzgârda uçurulur'], array['Kışın karla oynanan oyun', 'Dünyayı iki yarım küreye ayıran çizgi', 'Bayramda ikram edilen ferahlatıcı sıvı']);

-- Güvence: kelime uzunlukları, satır/sütun konumları ve her kesişimdeki harf tutmalı; sıra numaraları kesintisiz olmalı
do $$
begin
  if exists (select 1 from oda_bulmaca_buyuk b, unnest(b.yatay || b.dusey) w where char_length(w) <> b.boyut)
     or exists (select 1 from oda_bulmaca_buyuk b, unnest(b.satirlar || b.sutunlar) k where k < 0 or k >= b.boyut)
     or exists (select 1 from oda_bulmaca_buyuk b, generate_subscripts(b.satirlar, 1) i, generate_subscripts(b.sutunlar, 1) j
                where substr(b.yatay[i], b.sutunlar[j] + 1, 1) <> substr(b.dusey[j], b.satirlar[i] + 1, 1))
     or exists (select boyut from oda_bulmaca_buyuk group by boyut having max(sira) + 1 <> count(*)) then
    raise exception 'Büyük bulmaca verisi tutarsız';
  end if;
end $$;

insert into oda_icerik_surum (ad, baslangic) values ('bulmaca2', tr_today() + 1);
-- Büyük bulmaca satırını işaretler (5×5 satırlarda boş kalır; mevcut satırlar değişmez)
alter table oda_oyun add column boyut smallint check (boyut in (6, 7));

-- Günün kafes boyu
create function oda_bulmaca_boyut(g date) returns int language sql stable security definer set search_path = public as $$
  select case
    when g < coalesce((select baslangic from oda_icerik_surum where ad = 'bulmaca2'), 'infinity'::date) then 5
    when extract(isodow from g) = 5 and extract(month from g + 7) <> extract(month from g)
         and exists (select 1 from oda_bulmaca_buyuk where boyut = 7) then 7
    when extract(isodow from g) = 3 and exists (select 1 from oda_bulmaca_buyuk where boyut = 6) then 6
    else 5 end
$$;

-- Günün büyük bulmacası: 6×6 haftadan haftaya, 7×7 aydan aya sırayla döner
create function oda_bulmaca_buyuk_gunun(g date) returns oda_bulmaca_buyuk language sql stable security definer set search_path = public as $$
  with k as (select oda_bulmaca_boyut(g) n),
  c as (select count(*)::int c from oda_bulmaca_buyuk, k where boyut = k.n)
  select b from oda_bulmaca_buyuk b, k, c
  where b.boyut = k.n
    and b.sira = case when k.n = 7 then (extract(year from g)::int * 12 + extract(month from g)::int - 1) % c.c
                      else ((oda_gun_no(g) / 7) % c.c + c.c) % c.c end
$$;

-- Kafesin satırları (kara kareler nokta): yatay kelime satırları tam, diğer satırlarda yalnız düşey kelimelerin harfleri
create function oda_bulmaca_kafes(n int, lr int[], lc int[], y text[], d text[]) returns text[] language sql immutable as $$
  select array_agg(
    case when r = any(lr) then y[array_position(lr, r)]
    else (select string_agg(case when c = any(lc) then substr(d[array_position(lc, c)], r + 1, 1) else '.' end, '' order by c)
          from generate_series(0, n - 1) c) end
    order by r)
  from generate_series(0, n - 1) r
$$;

create or replace function oda_bulmaca_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; b oda_bulmaca; bb oda_bulmaca_buyuk; n int := oda_bulmaca_boyut(tr_today());
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, boyut) values (my_school(), auth.uid(), 'bulmaca', g, nullif(n, 5))
    on conflict (user_id, oyun, gun) where oyun in ('sehir', 'soru', 'bulmaca') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and gun = g;
  if n = 5 then
    b := oda_bulmaca_gunun(g);
    return jsonb_build_object('gun', g, 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
      'boyut', 5, 'satirlar', '[0, 2, 4]'::jsonb, 'sutunlar', '[0, 2, 4]'::jsonb,
      'yatay', to_jsonb(b.yatay_ipucu), 'dusey', to_jsonb(b.dusey_ipucu),
      'cozum', case when s.bitti is not null then to_jsonb(oda_bulmaca_satirlar(b)) end);
  end if;
  bb := oda_bulmaca_buyuk_gunun(g);
  return jsonb_build_object('gun', g, 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
    'boyut', n, 'satirlar', to_jsonb(bb.satirlar), 'sutunlar', to_jsonb(bb.sutunlar),
    'yatay', to_jsonb(bb.yatay_ipucu), 'dusey', to_jsonb(bb.dusey_ipucu),
    'cozum', case when s.bitti is not null then to_jsonb(oda_bulmaca_kafes(n, bb.satirlar, bb.sutunlar, bb.yatay, bb.dusey)) end);
end $$;

-- p: n satır, her biri n karakter (kara kareler nokta). Yanlışsa kaç kutunun yanlış olduğu döner.
create or replace function oda_bulmaca_bitir(p text[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; c text[]; yanlis int; sn int; n int := oda_bulmaca_boyut(tr_today());
begin
  if not oda_ogretmen('oyunlar') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'bulmaca' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then return jsonb_build_object('dogru', true, 'puan', s.puan); end if;
  if p is null or array_length(p, 1) is distinct from n or exists (select 1 from unnest(p) x where x is null or char_length(x) <> n) then
    raise exception 'Bulmaca eksik';
  end if;
  if n = 5 then
    c := oda_bulmaca_satirlar(oda_bulmaca_gunun(g));
  else
    select oda_bulmaca_kafes(n, b.satirlar, b.sutunlar, b.yatay, b.dusey) into c from oda_bulmaca_buyuk_gunun(g) b;
  end if;
  select count(*) into yanlis from generate_series(1, n) i, generate_series(1, n) j
    where substr(c[i], j, 1) <> '.' and substr(c[i], j, 1) <> substr(p[i], j, 1);
  if yanlis > 0 then return jsonb_build_object('dogru', false, 'yanlis', yanlis); end if;
  sn := greatest(1, extract(epoch from now() - s.basladi)::int);
  update oda_oyun set bitti = now(), puan = sn where id = s.id;
  return jsonb_build_object('dogru', true, 'puan', sn);
end $$;

do $$ declare f text; begin
  foreach f in array array['oda_bulmaca_boyut(date)', 'oda_bulmaca_buyuk_gunun(date)', 'oda_bulmaca_kafes(int, int[], int[], text[], text[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Skor tablosu: haftalık görünümde yalnız 5×5 bulmaca (0084'teki gövde + tek satır)
create or replace function oda_skor_tablosu(p_oyun text, p_donem text default 'gun')
returns table (sira int, user_id uuid, ad text, puan int, ben boolean, ipucu int)
language sql stable security definer set search_path = public as $$
  with b as (
    select o.user_id, case when p_oyun in ('yilan', 'sprint', 'soru') then max(o.puan) else min(o.puan) end p,
           (array_agg(o.ipucu order by case when p_oyun in ('yilan', 'sprint', 'soru') then -o.puan else o.puan end))[1] i
    from oda_oyun o
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.oyun = p_oyun and o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and (p_donem is distinct from 'hafta' or o.oyun <> 'bulmaca' or o.boyut is null)
      and o.gun between (case when p_donem = 'hafta' then oda_hafta_basi() else tr_today() end) and tr_today()
      and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.user_id
  )
  select (rank() over (order by case when p_oyun in ('yilan', 'sprint', 'soru') then -b.p else b.p end))::int, b.user_id, pr.full_name, b.p, b.user_id = auth.uid(), b.i::int
  from b join profiles pr on pr.id = b.user_id
  order by 1, 3
  limit 50
$$;
revoke all on function oda_skor_tablosu(text, text) from public, anon;
grant execute on function oda_skor_tablosu(text, text) to authenticated;

-- Haftalık lig: yalnız 5×5 bulmaca süreleri (0084'teki gövde + tek satır)
create or replace function oda_lig(p_hafta_basi date default null)
returns table (sira int, user_id uuid, ad text, puan int, oyun_sayisi int, ben boolean)
language sql stable security definer set search_path = public as $$
  with h as (select coalesce(p_hafta_basi, oda_hafta_basi()) b),
  en as (
    select o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o, h
    where oda_ogretmen('oyunlar') and o.school_id = my_school() and o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and (o.oyun <> 'bulmaca' or o.boyut is null)
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

-- Kürsü: yalnız 5×5 bulmaca süreleri (0084'teki gövde + tek satır)
create or replace function oda_lig_kursu_yaz(p_hafta date, p_bildir boolean default true) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if p_hafta is null or extract(isodow from p_hafta) <> 1 then raise exception 'Hafta pazartesi olmalı.'; end if;
  with en as (
    select o.school_id, o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint', 'soru') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o
    where o.bitti is not null and o.puan is not null
      and not o.lig_disi
      and (o.oyun <> 'bulmaca' or o.boyut is null)
      and o.gun between p_hafta and p_hafta + 6
      and (o.oyun not in ('kelime', 'sehir') or o.puan <= 6)
      and coalesce((school_setting(o.school_id, 'oda.oyun.' || o.oyun))::text::boolean, true)
      and not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false)
    group by o.school_id, o.oyun, o.user_id
  ),
  s as (select school_id, oyun, user_id, rank() over (partition by school_id, oyun order by k) r from en),
  t as (select school_id, user_id, sum(case r when 1 then 10 when 2 then 8 when 3 then 6 when 4 then 5 when 5 then 4 else 2 end)::int p
        from s group by school_id, user_id),
  r as (select t.*, (rank() over (partition by t.school_id order by t.p desc))::int sira from t),
  ekle as (
    insert into oda_lig_kursu (school_id, hafta, user_id, sira, ad, puan)
    select r.school_id, p_hafta, r.user_id, r.sira, pr.full_name, r.p
    from r join profiles pr on pr.id = r.user_id and pr.status = 'approved' and pr.school_id = r.school_id
    where r.sira <= 3
    on conflict do nothing
    returning user_id, sira
  ),
  bil as (
    insert into notifications (user_id, text, link, type)
    select e.user_id, 'Tebrikler! Haftalık ligi ' || e.sira || '. bitirdin; adın panoda kürsüde 🏆',
           jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'pano'), 'oda'
    from ekle e where p_bildir
    returning 1
  )
  select count(*) into n from ekle;
  return n;
end $$;

