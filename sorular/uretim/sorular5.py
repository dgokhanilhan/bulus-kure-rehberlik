from figs5 import *

# Açık uçlu sorular. puan: (yüzde, ölçüt) — yüzdeler toplamı 100.
Q = [
 dict(k="MAT.5.3.1", d="Kolay", fig=(fig_q1, 130), satir=4, zemin="çizgili",
  q="Yukarıda I, II ve III numaralı temel geometrik çizimler verilmiştir.<br/>Her çizimin adını yazınız ve her birini sembolle gösteriniz.",
  cevap="I: doğru parçası, [KL]  ·  II: ışın, [MN  ·  III: doğru, PR",
  puan=[(30, "I. çizimin doğru parçası olduğunu yazıp [KL] (veya [LK]) ile gösterir."),
        (40, "II. çizimin ışın olduğunu yazıp başlangıç noktasından [MN ile gösterir. ([NM yazan bu puanı alamaz.)"),
        (30, "III. çizimin doğru olduğunu yazıp PR (veya RP) ile gösterir.")],
  s="I. çizimin iki ucu da noktayla bitmiştir; bu bir <b>doğru parçasıdır</b> ve [KL] ile gösterilir. II. çizim M noktasından başlayıp N yönünde sonsuza gider; bu bir <b>ışındır</b> ve başlangıç noktasından yazılır: [MN. III. çizim iki yönde de sonsuza gider; bu bir <b>doğrudur</b> ve PR ile gösterilir."),

 dict(k="MAT.5.3.1", d="Orta", fig=None, satir=6, zemin="çizgili",
  q="Öğretmen, öğrencilerinden kâğıtlarına sırasıyla şu üç çizimi yapmalarını istiyor:<br/>"
    "1) Bir noktayı merkez alan bir çember<br/>2) Bir doğruya, dışındaki bir noktadan dikme<br/>3) Ölçüsü 70° olan bir açı<br/><br/>"
    "Öğrencilerin yanındaki araçlar şunlardır:<br/>"
    "<b>Ali:</b> Pergel – Açıölçer – Çizgeç<br/><b>Bora:</b> Gönye – Pergel – Çizgeç<br/><b>Cem:</b> Çizgeç – Açıölçer – Gönye<br/><b>Deniz:</b> Pergel – Gönye – Açıölçer<br/><br/>"
    "a) Her çizim için hangi aracın gerektiğini yazınız.<br/>"
    "b) Üç çizimi de başka bir araca ihtiyaç duymadan tek başına yapabilecek öğrenci kimdir?<br/>"
    "c) Diğer öğrencilerin hangi çizimi yapamayacağını nedeniyle yazınız.",
  cevap="a) Çember → pergel, dikme → gönye, 70° açı → açıölçer  ·  b) Deniz  ·  c) Ali dikme (gönye yok), Bora 70° açı (açıölçer yok), Cem çember (pergel yok)",
  puan=[(30, "a) Üç çizim için gereken aracı doğru eşleştirir (her eşleştirme 10)."),
        (30, "b) Deniz'i bulur."),
        (40, "c) Ali, Bora ve Cem'in yapamayacağı çizimi eksik araçla açıklar (biri 10, ikisi 20, üçü 40).")],
  s="Çember için <b>pergel</b>, dikme için <b>gönye</b>, ölçüsü verilen açı için <b>açıölçer</b> gerekir. "
    "Ali'de gönye olmadığı için dikme çizemez. Bora'da açıölçer olmadığı için 70° açı çizemez. Cem'de pergel olmadığı için çember çizemez. "
    "Üç araç da yalnızca <b>Deniz</b>'de vardır. (Gönye ve açıölçerin düz kenarı çizgeç yerine kullanılabilir.)"),

 dict(k="MAT.5.3.2", d="Kolay", fig=(fig_q3, 190), satir=4, zemin="çizgili",
  q="Mühendis Zeynep Hanım, atık suyu binanın çatısındaki A noktasından zemine taşımak için 4 boru planlamıştır. Boruların uzunlukları şekilde verilmiştir. "
    "Atık su zemine <b>en kısa yoldan</b> taşınmak isteniyor.<br/>"
    "Hangi numaralı boru kullanılmalıdır? Bu borunun zeminle yaptığı açının çeşidini yazınız ve seçiminizin nedenini açıklayınız.",
  cevap="3 numaralı boru; zeminle dik açı (90°) yapar; bir doğruya dışındaki bir noktadan çizilen en kısa doğru parçası dikmedir.",
  puan=[(40, "3 numaralı boruyu seçer."),
        (30, "Borunun zeminle dik açı (90°) yaptığını yazar."),
        (30, "Gerekçe olarak en kısa yolun dikme olduğunu açıklar.")],
  s="Bir doğruya dışındaki bir noktadan çizilen doğru parçalarının <b>en kısası dikmedir</b>. Boruların en kısası 12 m uzunluğundaki 3 numaralı borudur. "
    "Bu boru zemine diktir, yani zeminle <b>dik açı (90°)</b> yapar. Bir doğruya dışındaki bir noktadan yalnız bir dikme çizilebilir."),

 dict(k="MAT.5.3.2", d="Orta", fig=(fig_q4, 150), satir=4, zemin="çizgili",
  q="Şekilde A, B, C ve D noktaları verilmiştir. Bu noktaların herhangi üçü aynı doğru üzerinde değildir.<br/>"
    "Bu noktalardan <b>en az ikisinden</b> geçen kaç farklı doğru çizilebilir? Bu doğruları sembolle yazarak gösteriniz.",
  cevap="6 doğru: AB, AC, AD, BC, BD, CD",
  puan=[(60, "Altı doğruyu sembolle yazar (her doğru 10)."),
        (40, "Doğru sayısının 6 olduğunu bulur.")],
  s="İki noktadan <b>yalnız bir doğru</b> geçer. Bu yüzden her nokta ikilisi için bir doğru vardır: "
    "AB, AC, AD, BC, BD, CD → <b>6 doğru</b>."),

 dict(k="MAT.5.3.2", d="Orta", fig=(fig_q5, 120), satir=5, zemin="çizgili",
  q="Betül, pergelinin açıklığını hiç değiştirmeden KL ışını üzerine çemberler çiziyor. İlk çemberin merkezi K noktasıdır. "
    "Sonraki her çemberin merkezi, bir önceki çemberin ışını kestiği yeni noktadır. Böylece ışın üzerinde sırasıyla P, R, S, T ve U noktaları oluşuyor.<br/>"
    "|KU| = 15 cm olduğuna göre |KS| kaç santimetredir? Çözümünüzü açıklayınız.",
  cevap="|KS| = 9 cm",
  puan=[(30, "Pergel açıklığı değişmediği için [KP], [PR], [RS], [ST], [TU] parçalarının eşit olduğunu belirtir."),
        (30, "Bir parçanın uzunluğunu 15 ÷ 5 = 3 cm olarak bulur."),
        (40, "|KS| = 3 × 3 = 9 cm olarak bulur.")],
  s="Pergelin açıklığı değişmediği için bütün çemberlerin yarıçapı eşittir; bu yüzden ışın üzerindeki parçalar <b>eşit uzunluktadır</b>. "
    "K'den U'ya 5 eş parça vardır: 15 ÷ 5 = 3 cm. K'den S'ye 3 eş parça vardır: |KS| = 3 × 3 = <b>9 cm</b>."),

 dict(k="MAT.5.3.3", d="Kolay", fig=(fig_q6, 175), satir=4, zemin="çizgili",
  q="Yukarıda AOB açısı açıölçer ile ölçülmektedir. Açının köşesi açıölçerin merkezine, [OA ışını ise açıölçerdeki 0 çizgisine yerleştirilmiştir.<br/>"
    "m(AÔB) kaç derecedir? Ölçümü açıölçerin hangi ölçeğinden okuduğunuzu nedeniyle açıklayınız.",
  cevap="m(AÔB) = 50°; [OA dış ölçeğin 0 çizgisinde olduğu için dış ölçek okunur.",
  puan=[(50, "Açının ölçüsünü 50° olarak bulur."),
        (30, "[OA ışını dış ölçeğin 0'ında olduğu için dış ölçeğin okunduğunu açıklar."),
        (20, "Açının dar açı olduğunu, bu yüzden 130° olamayacağını belirtir.")],
  s="Açıölçerde iki ölçek vardır. [OA ışını <b>dış ölçeğin 0</b> çizgisi üzerindedir; bu yüzden ölçüm dış ölçekten okunur: [OB dış ölçekte <b>50</b>'yi gösterir. "
    "AOB açısı dik açıdan küçüktür, yani dar açıdır; 130 iç ölçekten yanlış okunan değerdir."),

 dict(k="MAT.5.3.3", d="Orta", fig=(fig_q7, 170), satir=5, zemin="çizgili",
  q="Yukarıdaki saat 4.00'ü göstermektedir.<br/>Akrep ile yelkovan arasındaki <b>küçük</b> açının ölçüsünü bulunuz ve bu açının çeşidini yazınız. İşlemlerinizi gösteriniz.",
  cevap="120°, geniş açı",
  puan=[(30, "Ardışık iki sayı arasındaki açıyı 360° ÷ 12 = 30° olarak bulur."),
        (40, "4 × 30° = 120° olarak hesaplar."),
        (30, "Açının geniş açı olduğunu yazar.")],
  s="Yelkovan bir tam tur atınca <b>tam açı (360°)</b> oluşur. Kadran 12 eş parçaya bölündüğü için iki sayı arası 360° ÷ 12 = <b>30°</b>'dir. "
    "4.00'te yelkovan 12'de, akrep 4'tedir; arada 4 aralık vardır: 4 × 30° = <b>120°</b>. 120°, 90°'den büyük ve 180°'den küçük olduğu için <b>geniş açıdır</b>."),

 dict(k="MAT.5.3.3", d="Zor", fig=(fig_q8, 150), satir=6, zemin="çizgili",
  q="Elif, daire şeklindeki bir kâğıdı ortadan 3 kez katlayarak 8 eş dilim elde ediyor ve bir dilimi kendi açı ölçme birimi olarak kullanıyor. "
    "Can ise aynı büyüklükteki bir kâğıdı ortadan 4 kez katlayarak 16 eş dilim elde ediyor. "
    "Elif, dolap kapağının açıklığını kendi birimiyle <b>3 birim</b> olarak ölçüyor.<br/>"
    "a) Can aynı açıyı kendi birimiyle kaç birim olarak ölçer? Nedenini açıklayınız.<br/>"
    "b) Dolap kapağının açıklığı kaç derecedir? Bu açının çeşidini yazınız.",
  cevap="a) 6 birim  ·  b) 135°, geniş açı",
  puan=[(20, "a) Elif'in 1 diliminin Can'ın 2 dilimine eşit olduğunu belirtir."),
        (20, "a) Can'ın ölçümünü 6 birim olarak bulur."),
        (20, "b) Elif'in biriminin 360° ÷ 8 = 45° olduğunu bulur."),
        (20, "b) Açıyı 3 × 45° = 135° olarak bulur."),
        (20, "b) Açının geniş açı olduğunu yazar.")],
  s="Tam açı Elif'te 8, Can'da 16 eş dilime bölünmüştür. 16, 8'in 2 katı olduğu için Elif'in <b>1 dilimi</b>, Can'ın <b>2 dilimine</b> eşittir: 3 × 2 = <b>6 birim</b>. "
    "Elif'in birimi 360° ÷ 8 = 45°'dir; kapağın açıklığı 3 × 45° = <b>135°</b>'dir ve bu bir <b>geniş açıdır</b>."),

 dict(k="MAT.5.3.4", d="Kolay", fig=(fig_q9, 175), satir=5, zemin="çizgili",
  q="Kareli zemin üzerine AB, CD, EF ve GH doğruları çizilmiştir.<br/>"
    "Aşağıdaki doğru çiftlerinin birbirine göre durumunu (paralel, dik, kesişen) yazınız. Paralel ve dik olanları sembolle gösteriniz.<br/>"
    "a) AB ile CD&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;b) EF ile AB&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;c) GH ile CD&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ç) EF ile GH",
  cevap="a) Paralel, AB // CD  ·  b) Dik, EF ⊥ AB  ·  c) Kesişen  ·  ç) Kesişen (paralel değil, dik değil)",
  puan=[(30, "a) AB // CD yazar."),
        (30, "b) EF ⊥ AB yazar."),
        (20, "c) GH ile CD'nin kesişen olduğunu yazar."),
        (20, "ç) EF ile GH'nin kesişen olduğunu yazar.")],
  s="AB ve CD yataydır ve aralarındaki uzaklık değişmez: <b>AB // CD</b>. EF dikeydir, yatay AB ile 90° oluşturur: <b>EF ⊥ AB</b>. "
    "GH eğiktir ve CD ile bir noktada kesişir. EF ile GH aynı doğrultuda değildir, uzatılınca kesişirler; aralarında 90° oluşmadığı için dik de değildirler."),

 dict(k="MAT.5.3.4", d="Kolay", fig=(fig_q10, 170), satir=5, zemin="çizgili",
  q="İki doğrunun kesişmesiyle oluşan açılardan birinin ölçüsü 65°'dir.<br/>"
    "Şekildeki x ve y açılarının ölçülerini bulunuz. Her birinin 65°'lik açı ile ilişkisini (ters açı / komşu bütünler açı) yazınız.",
  cevap="x = 115° (65°'lik açının komşu bütünleri)  ·  y = 65° (65°'lik açının ters açısı)",
  puan=[(30, "x = 115° bulur."), (20, "x'in komşu bütünler açı olduğunu yazar."),
        (30, "y = 65° bulur."), (20, "y'nin ters açı olduğunu yazar.")],
  s="x açısı 65°'lik açıyla birlikte doğru açı oluşturur, yani <b>komşu bütünler</b> açıdır: x = 180° − 65° = <b>115°</b>. "
    "y açısı 65°'lik açının <b>ters açısıdır</b>; ters açıların ölçüleri eşittir: y = <b>65°</b>."),

 dict(k="MAT.5.3.4", d="Orta", fig=(fig_q11, 175), satir=6, zemin="çizgili",
  q="Asaf, defterine B noktasında kesişen AC, DF ve EH doğrularını çizmiştir. EH ⊥ AC ve m(FB̂C) = 32°'dir.<br/>"
    "a) m(HB̂F) kaç derecedir?<br/>b) m(AB̂D) kaç derecedir?<br/>c) m(AB̂F) kaç derecedir?<br/>"
    "ç) FBC açısının <b>tümler</b> olduğu bir açı ile <b>bütünler</b> olduğu bir açı yazınız.",
  cevap="a) 58°  ·  b) 32°  ·  c) 148°  ·  ç) Tümler: HBF (veya DBE); bütünler: ABF (veya CBD)",
  puan=[(25, "a) 58° bulur."), (25, "b) 32° bulur (ters açı)."), (25, "c) 148° bulur."),
        (25, "ç) Bir tümler ve bir bütünler açıyı doğru yazar (her biri yarı puan).")],
  s="HBC dik açıdır: m(HB̂F) = 90° − 32° = <b>58°</b>. ABD, FBC'nin ters açısıdır: <b>32°</b>. "
    "m(AB̂F) = 180° − 32° = <b>148°</b>. HBF ile FBC'nin toplamı 90° olduğu için <b>tümler</b>; ABF ile FBC'nin toplamı 180° olduğu için <b>bütünler</b> açılardır."),

 dict(k="MAT.5.3.4", d="Zor", fig=(fig_q12, 170), satir=7, zemin="çizgili",
  q="Birbirine paralel d₁ ve d₂ doğruları, k doğrusu ile kesilmiştir. Kesişim noktalarında oluşan açılardan biri 70°'dir.<br/>"
    "a) Oluşan 8 açının kaç tanesi dar, kaç tanesi geniş açıdır? Ölçülerini yazınız.<br/>"
    "b) Geniş açıların ölçüleri toplamı ile dar açıların ölçüleri toplamı arasındaki fark kaç derecedir?",
  cevap="a) 4 dar açı (70°), 4 geniş açı (110°)  ·  b) 440° − 280° = 160°",
  puan=[(20, "a) 4 dar ve 4 geniş açı oluştuğunu belirtir."),
        (30, "a) Dar açıları 70°, geniş açıları 110° olarak bulur."),
        (30, "b) Toplamları 280° ve 440° olarak hesaplar."),
        (20, "b) Farkı 160° olarak bulur.")],
  s="İki paralel doğruyu kesen bir doğru <b>4 dar ve 4 geniş açı</b> oluşturur. 70°'lik açının ters açısı 70°, komşu bütünleri 180° − 70° = 110°'dir; "
    "paralel doğrularda iki kesişim noktasındaki açılar aynıdır. Dar açılar: 4 × 70° = 280°. Geniş açılar: 4 × 110° = 440°. Fark: <b>160°</b>."),

 dict(k="MAT.5.3.5", d="Kolay", fig=(fig_q13, 175), satir=5, zemin="çizgili",
  q="İbrahim, halı deseni için doğrular çiziyor. Çizdiği son doğru ilk doğruyla kesişiyor ve yukarıdaki boyalı kapalı şekil oluşuyor.<br/>"
    "Bu kapalı şekil kaç doğrunun ardışık kesişmesiyle oluşmuştur? Şeklin adını yazınız. Doğru sayısı ile şeklin kenar sayısı arasındaki ilişkiyi açıklayınız.",
  cevap="5 doğru; beşgen; çokgenin kenar sayısı onu oluşturan doğru sayısına eşittir.",
  puan=[(30, "Şekli oluşturan doğru sayısını 5 olarak bulur."),
        (30, "Şeklin beşgen olduğunu yazar."),
        (40, "Kenar sayısının doğru sayısına eşit olduğunu açıklar.")],
  s="Her kenar, iki yönde uzayan bir doğrunun parçasıdır; <b>5 doğru</b> vardır. En az üç doğrunun ardışık kesişmesiyle (ilk doğru son doğruyla kesişmek şartıyla) oluşan kapalı şekle <b>çokgen</b> denir. "
    "Çokgenin kenar sayısı onu oluşturan doğru sayısına eşittir; 5 kenarlı çokgen <b>beşgendir</b>."),

 dict(k="MAT.5.3.5", d="Orta", fig=None, satir=7, zemin="çizgili",
  q="Üç arkadaş, düzlemde doğrular çizerek kapalı şekiller oluşturmaya çalışıyor:<br/>"
    "<b>Ayşe:</b> \"İki doğru çizerek bir kapalı şekil oluşturabilirim.\"<br/>"
    "<b>Mert:</b> \"Birbirine paralel üç doğru çizerek bir üçgen oluşturabilirim.\"<br/>"
    "<b>Zeynep:</b> \"Altı doğruyu, ilk doğru son doğruyla kesişecek şekilde ardışık olarak kesiştirirsem bir altıgen oluşur.\"<br/><br/>"
    "Hangi öğrencinin söylediği doğrudur? Diğer öğrencilerin neden yanıldığını açıklayınız.",
  cevap="Zeynep haklıdır. Ayşe: iki doğru bir bölgeyi kapatamaz, en az üç doğru gerekir. Mert: paralel doğrular kesişmez, kapalı şekil oluşturamaz.",
  puan=[(30, "Zeynep'in haklı olduğunu belirtir."),
        (35, "Ayşe'nin yanıldığını, kapalı şekil için en az üç doğru gerektiğini açıklar."),
        (35, "Mert'in yanıldığını, paralel doğruların kesişmediğini açıklar.")],
  s="İki doğru en fazla bir noktada kesişir ve bir bölgeyi kapatamaz; kapalı şekil için <b>en az üç doğru</b> gerekir. "
    "Paralel doğrular hiç kesişmez, bu yüzden kapalı şekil oluşturamaz. Altı doğrunun ardışık kesişimi (ilk ve son doğru da kesişirse) <b>altı kenarlı</b> bir çokgen, yani altıgen oluşturur."),

 dict(k="MAT.5.3.6", d="Kolay", fig=None, satir=6, zemin="çizgili",
  q="Aşağıda dört çokgen verilmiştir:<br/>"
    "1) Kenarları 5 cm olan kare<br/>2) Bütün kenarları 4 cm olan eşkenar üçgen<br/>"
    "3) Kenarları 4 cm, 6 cm, 4 cm, 6 cm ve bütün iç açıları 90° olan dikdörtgen<br/>"
    "4) Bütün kenarları 3 cm ve bütün iç açıları 120° olan altıgen<br/><br/>"
    "Bu çokgenlerden hangileri düzgün çokgendir? Düzgün çokgen olmayanın neden düzgün olmadığını açıklayınız.",
  cevap="1, 2 ve 4 düzgün çokgendir. 3 (dikdörtgen) düzgün değildir; açıları eşit olsa da kenarları eşit değildir.",
  puan=[(40, "1, 2 ve 4'ün düzgün çokgen olduğunu belirtir (eksik ya da fazla seçimde puan verilmez)."),
        (30, "Dikdörtgenin düzgün çokgen olmadığını belirtir."),
        (30, "Nedenini kenar uzunluklarının eşit olmamasıyla açıklar.")],
  s="Bütün kenar uzunlukları <b>ve</b> bütün iç açılarının ölçüleri eşit olan çokgene <b>düzgün çokgen</b> denir. "
    "Kare, eşkenar üçgen ve verilen altıgende hem kenarlar hem açılar eşittir. Dikdörtgenin açıları eşittir ama <b>kenarları eşit değildir</b> (4 cm ≠ 6 cm)."),

 dict(k="MAT.5.3.6", d="Orta", fig=(fig_q16, 175), satir=7, zemin="çizgili",
  q="Yukarıda ABCDEF altıgeni verilmiştir. Bu altıgen ile ilgili aşağıdaki ifadeler veriliyor:<br/>"
    "I. [AC] bu altıgenin bir köşegenidir.<br/>II. [EF] bu altıgenin bir köşegenidir.<br/>"
    "III. Altıgenin 6 iç açısı ve 6 dış açısı vardır.<br/>IV. Bu çokgen \"ACEBDF altıgeni\" diye isimlendirilebilir.<br/><br/>"
    "Her ifadenin doğru mu yanlış mı olduğunu yazınız. Yanlış olan ifadeleri düzelterek yeniden yazınız.",
  cevap="I doğru, II yanlış ([EF] bir kenardır), III doğru, IV yanlış (köşeler ardışık okunmalıdır, ör. ABCDEF altıgeni)",
  puan=[(20, "I'in doğru olduğunu belirtir."),
        (30, "II'nin yanlış olduğunu belirtir ve [EF]'nin kenar olduğunu yazar (ya da köşegen örneği verir)."),
        (20, "III'ün doğru olduğunu belirtir."),
        (30, "IV'ün yanlış olduğunu belirtir ve doğru bir isimlendirme yazar.")],
  s="A ve C ardışık olmayan köşelerdir; [AC] <b>köşegendir</b>. E ve F ardışık köşelerdir; [EF] bir <b>kenardır</b>. "
    "Bir çokgende dış açı sayısı iç açı sayısına eşittir; altıgende 6 iç ve 6 dış açı vardır. "
    "Çokgen isimlendirilirken köşeler <b>ardışık</b> okunur (ABCDEF, BCDEFA, FEDCBA gibi); ACEBDF ardışık değildir."),

 dict(k="MAT.5.3.6", d="Orta", fig=None, satir=7, zemin="çizgili",
  q="Üçgenler ile ilgili aşağıdaki ifadeler veriliyor:<br/>"
    "I. Dik açılı ikizkenar üçgen çizilebilir.<br/>II. Geniş açılı eşkenar üçgen çizilebilir.<br/>"
    "III. İki iç açısı dik açı olan bir üçgen çizilebilir.<br/>IV. Eşkenar üçgenin bütün iç açılarının ölçüsü 60°'dir.<br/><br/>"
    "Her ifadenin doğru mu yanlış mı olduğunu yazınız ve nedenini açıklayınız.",
  cevap="I doğru, II yanlış, III yanlış, IV doğru",
  puan=[(25, "I: Doğru; örnek verir (ör. 90°, 45°, 45°)."),
        (25, "II: Yanlış; eşkenar üçgenin açılarının 60° olduğunu belirtir."),
        (25, "III: Yanlış; iki dik açının toplamının 180° olduğunu, üçüncü açıya yer kalmadığını belirtir."),
        (25, "IV: Doğru; 180° ÷ 3 = 60° olduğunu belirtir."),],
  s="Üçgenin iç açılarının ölçüleri toplamı <b>180°</b>'dir. I: 90°, 45°, 45° açılı üçgen hem dik açılı hem ikizkenardır. "
    "II: Eşkenar üçgenin açıları 60° olduğundan geniş açısı olamaz. III: 90° + 90° = 180°; üçüncü açıya yer kalmaz. IV: 180° ÷ 3 = 60°."),

 dict(k="MAT.5.3.6", d="Zor", fig=(fig_q18, 165), satir=6, zemin="çizgili",
  q="ABC üçgeninde |AB| = |AC| ve m(AB̂C) = 50°'dir. [BC] doğru parçası C noktasından D yönünde uzatılmıştır.<br/>"
    "a) m(BÂC) kaç derecedir?<br/>b) C köşesindeki dış açının ölçüsü, m(AĈD) kaç derecedir?<br/>"
    "c) Bu iki açının ölçüleri toplamı kaç derecedir?",
  cevap="a) 80°  ·  b) 130°  ·  c) 210°",
  puan=[(20, "İkizkenar üçgende m(AĈB) = 50° olduğunu belirtir."),
        (30, "a) m(BÂC) = 180° − 50° − 50° = 80° bulur."),
        (30, "b) m(AĈD) = 180° − 50° = 130° bulur."),
        (20, "c) Toplamı 210° olarak bulur.")],
  s="İkizkenar üçgende eşit kenarları gören açılar eşittir: m(AĈB) = 50°. İç açılar toplamı 180° olduğundan m(BÂC) = 180° − 50° − 50° = <b>80°</b>. "
    "Dış açı, iç açının komşu bütünleridir: m(AĈD) = 180° − 50° = <b>130°</b>. Toplam: <b>210°</b>."),

 dict(k="MAT.5.3.7", d="Orta", fig=(fig_q19, 175), satir=6, zemin="çizgili",
  q="Yarıçapları 4 cm olan A ve B merkezli iki çember, her biri diğerinin merkezinden geçecek şekilde çizilmiştir. "
    "Çemberlerin kesişim noktalarından biri C'dir. A, B ve C noktaları birleştirilerek ABC üçgeni inşa edilmiştir.<br/>"
    "Ölçme aracı kullanmadan ABC üçgeninin kenar uzunluklarını bulunuz. Üçgenin kenarlarına göre çeşidini ve çevre uzunluğunu yazınız. Nasıl karar verdiğinizi açıklayınız.",
  cevap="|AB| = |BC| = |AC| = 4 cm; eşkenar üçgen; çevre 12 cm",
  puan=[(40, "Üç kenarın da yarıçap olduğunu açıklayarak 4 cm bulur ([AB]'nin yarıçap olduğunu açıklamak dahil)."),
        (30, "Üçgenin eşkenar olduğunu yazar."),
        (30, "Çevreyi 12 cm olarak bulur.")],
  s="[AC], A merkezli çemberin; [BC], B merkezli çemberin yarıçapıdır: 4 cm. B noktası A merkezli çemberin üzerinde olduğu için [AB] de bir yarıçaptır: 4 cm. "
    "Üç kenar eşit olduğundan üçgen <b>eşkenardır</b>; çevre 4 + 4 + 4 = <b>12 cm</b>."),

 dict(k="MAT.5.3.7", d="Zor", fig=(fig_q20, 160), satir=8, zemin="çizgili",
  q="Ahmet iki farklı çizim yapıyor:<br/>"
    "<b>I. çizim:</b> A merkezli 5 cm ve B merkezli 3 cm yarıçaplı çemberler. |AB| = 6 cm. Kesişim noktalarından biri C.<br/>"
    "<b>II. çizim:</b> K merkezli 5 cm ve L merkezli 5 cm yarıçaplı çemberler. |KL| = 6 cm. Kesişim noktalarından biri M.<br/>"
    "a) ABC ve KLM üçgenlerinin kenar uzunluklarını, kenarlarına göre çeşitlerini ve çevre uzunluklarını bulunuz.<br/>"
    "b) Ahmet, II. çizimde yarıçapları değiştirmeden eşkenar üçgen elde etmek istiyor. |KL| kaç cm olmalıdır? Nedenini açıklayınız.",
  cevap="a) ABC: 5, 3, 6 cm → çeşitkenar, çevre 14 cm; KLM: 5, 5, 6 cm → ikizkenar, çevre 16 cm  ·  b) |KL| = 5 cm",
  puan=[(30, "a) ABC'nin kenarlarını yarıçaplardan bulur, çeşitkenar olduğunu ve çevresinin 14 cm olduğunu yazar."),
        (30, "a) KLM'nin kenarlarını yarıçaplardan bulur, ikizkenar olduğunu ve çevresinin 16 cm olduğunu yazar."),
        (20, "b) |KL| = 5 cm bulur."),
        (20, "b) Üç kenarın eşit olması gerektiğini (çemberlerin birbirinin merkezinden geçmesi gerektiğini) açıklar.")],
  s="<b>I. çizim:</b> |AC| = 5 cm, |BC| = 3 cm, |AB| = 6 cm; üç kenar farklı → <b>çeşitkenar</b>, çevre <b>14 cm</b>. "
    "<b>II. çizim:</b> |KM| = |LM| = 5 cm, |KL| = 6 cm; iki kenar eşit → <b>ikizkenar</b>, çevre <b>16 cm</b>. "
    "Eşkenar için |KL| = 5 cm olmalıdır."),
]
