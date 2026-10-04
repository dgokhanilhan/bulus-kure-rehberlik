// MEB öğretim programı kaynakları (mufredat.meb.gov.tr, Talim ve Terbiye Kurulu Başkanlığı). Her kayıt: resmî dosya + beklenen
// SHA-256 (dosya değişirse araç durur: yeni program yeni sürüm olarak eklenir, eskinin üzerine yazılmaz) + sınıf → geçerlilik.
//
// Geçerlilik (year_from/year_to = eğitim yılının BAŞLANGIÇ yılı; 2025 = 2025–2026):
//   2025–2026: 5, 6, 9, 10 → TYMM (2024 sürümü dosyaları; Ağustos 2025'te yayımlandı) · 7, 8, 11, 12 → eski program
//   2026–2027: 5, 6, 7, 9, 10, 11 → TYMM (2026 sürümü) · 8, 12 → eski program
//   8 ve 12'nin TYMM bölümleri içe aktarılır ama PASİF (active=false): MEB uygulama yılını duyurunca tek satırla açılır.
// Ortaokul Matematik, Fen, Sosyal ve Din (TYMM) için 2024 sürümü sitede yok → 2025–2026'da 5–6 için bu derslerin
// kataloğu "Eksik" (2026 sürümü kendiliğinden geriye uygulanmaz; bkz. docs/meb-katalog-raporu.md).
//
// extractor: tymm (standart TYMM), turkce2026 / turkce2024 (Türkçe tabloları), tde (TYMM TDE), eng (TYMM İngilizce),
//            legacy (eski "KOD metin"), rotated (eski İngilizce, dikey kutular), tde2018.

const BASE = 'https://mufredat.meb.gov.tr/'
const T = (from, to = null, active = true) => ({ from, to, active })
const OFF = (from) => ({ from, to: null, active: false })

export const SOURCES = [
  // ---------------- TYMM · ortaokul · 2026 sürümü (2026–2027'den itibaren 5–7) ----------------
  { id: 'tymm-ortaokul-matematik-2026', pid: 2340, type: 'TYMM', subject: 'MAT', title: 'Ortaokul Matematik Dersi Öğretim Programı (5-8) (2026)', path: 'Dosyalar/202681491243620-Matematik (5-8) DÖP.pdf', sha256: '75f52f93672c8991eabe102adb37ab4d16de63f35fe8488fc29cdedae9155734', extractor: { kind: 'tymm', prefix: 'MAT' }, grades: { 5: T(2026), 6: T(2026), 7: T(2026), 8: OFF(2026) } },
  { id: 'tymm-fen-bilimleri-2026', pid: 2334, type: 'TYMM', subject: 'FEN', title: 'Fen Bilimleri Dersi Öğretim Programı (3-8) (2026)', path: 'Dosyalar/20268149031570-Fen Bilimleri (3-8) DÖP.pdf', sha256: 'a56aab9c648f8293341be3f70c0b49e644ecb1d56be9fcaa200d6419bf1eeb97', extractor: { kind: 'tymm', prefix: 'FB' }, grades: { 5: T(2026), 6: T(2026), 7: T(2026), 8: OFF(2026) } },
  { id: 'tymm-sosyal-bilgiler-2026', pid: 2347, type: 'TYMM', subject: 'SOS', title: 'Sosyal Bilgiler Dersi Öğretim Programı (4-7) (2026)', path: 'Dosyalar/20268149286708-Sosyal Bilgiler DÖP.pdf', sha256: '3e1b956f9bfa0e561046cb10d1d3aaaecdde4a87b46bdc094297662d6558d9ca', extractor: { kind: 'tymm', prefix: 'SB' }, grades: { 5: T(2026), 6: T(2026), 7: T(2026) } },
  { id: 'tymm-ortaokul-turkce-2026', pid: 2352, type: 'TYMM', subject: 'TUR', title: 'Ortaokul Türkçe Dersi Öğretim Programı (5-8) (2026)', path: 'Dosyalar/202681493819891-Türkçe (5-8) DÖP.pdf', sha256: 'f9c44b1059a0d5a7a5aa4e0de3dce6821fce3d873c256ca86219e2347f07497a', extractor: { kind: 'turkce2026' }, grades: { 5: T(2026), 6: T(2026), 7: T(2026), 8: OFF(2026) } },
  { id: 'tymm-din-kulturu-4-8-2026', pid: 2150, type: 'TYMM', subject: 'DIN', title: 'Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (4-8) (2026)', path: 'Dosyalar/202631310725635-dkab48.pdf', sha256: '6025541032f33036ffd4a8394a02587bf252fa9c4785d864cbfefa207d15997d', extractor: { kind: 'tymm', prefix: 'DKAB' }, grades: { 5: T(2026), 6: T(2026), 7: T(2026), 8: OFF(2026) } },
  { id: 'tymm-ingilizce-2-8-2025', pid: 1903, type: 'TYMM', subject: 'ING', title: 'İngilizce Dersi Öğretim Programı (2-8) (2025)', path: 'Dosyalar/202591011405337-26-08-ekli-english-regular.pdf', sha256: '38cc26d455c178e4366fdc0abf522c7ad6eb7883ebc8a8971fea390def2c2034', extractor: { kind: 'eng' }, grades: { 5: T(2025), 6: T(2025), 7: T(2026), 8: OFF(2025) } },
  { id: 'tymm-inkilap-8-2024', pid: 1974, type: 'TYMM', subject: 'INK', title: 'T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (8. Sınıf) (2024)', path: 'Dosyalar/2025825154713595-inkılap 8.pdf', sha256: 'e9bb195ae94919ec9bb022c718cb911d087b6e1b5e5b78ab3b433512bbfd4235', extractor: { kind: 'tymm', prefix: 'İTA' }, grades: { 8: OFF(2024) } },

  // ---------------- TYMM · ortaokul Türkçe · 2024 sürümü (2025–2026'da 5–6) ----------------
  { id: 'tymm-ortaokul-turkce-2024', pid: 1979, type: 'TYMM', subject: 'TUR', title: 'Ortaokul Türkçe Dersi Öğretim Programı (5-8) (2024)', path: 'Dosyalar/202582516532361-ortaokul türkçe.pdf', sha256: '7aa679b8f8f33790d99a7eca98f2712f16951b56a2ed4a608ec3ad0e5ebc0970', extractor: { kind: 'turkce2024' }, grades: { 5: T(2024, 2025), 6: T(2025, 2025), 7: OFF(2024), 8: OFF(2024) } },

  // ---------------- TYMM · lise · 2024 sürümü (2025–2026'da 9–10) ----------------
  ...[
    ['biyoloji', 1983, 'BIY', 'BİY', 'Biyoloji Dersi Öğretim Programı (9-12) (2024)', 'Dosyalar/202582694327111-biyoloji.pdf', 'cdead5c32e91360df121252429c0704629375ad50e68d0624266868aa76f8450'],
    ['cografya', 1984, 'COG', 'COĞ', 'Coğrafya Dersi Öğretim Programı (9-12) (2024)', 'Dosyalar/202582694459330-coğrafya.pdf', '5c9d441a42ed6a1d64f3190e92e218c32a0adc262228c0371ebd7b99b07585a6'],
    ['din-kulturu-9-12', 1985, 'DIN', 'DKAB', 'Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (9-12) (2024)', 'Dosyalar/202582694611611-din kültürü 9_12.pdf', '119fae5b432daa0e4579f5b73d90b04cd4281d833311cb95241bc1c34f4e194f'],
    ['fizik', 1987, 'FIZ', 'FİZ', 'Fizik Dersi Öğretim Programı (9-12) (2024)', 'Dosyalar/202582694751283-fizik.pdf', '8b17e6daf4385803f15eb1a4dcd4792249f0028791640ff195070b6143df7433'],
    ['kimya', 1989, 'KIM', 'KİM', 'Kimya Dersi Öğretim Programı (9-12) (2024)', 'Dosyalar/20258269501949-kimya.pdf', 'bbf53d598fa1c743af5de7d31d76bf5f1b960e78458a3f70ae60ca086dce4f31'],
    ['matematik', 1991, 'MAT', 'MAT', 'Matematik Dersi Öğretim Programı (Hazırlık, 9-12) (2024)', 'Dosyalar/202582695225533-matematik.pdf', 'f5743677f675db23e6c08a4503c6c3f0a307bbdd6deb8e01256895eb5d3e452e'],
  ].map(([n, pid, subject, prefix, title, path, sha256]) => ({ id: `tymm-lise-${n}-2024`, pid, type: 'TYMM', subject, title, path, sha256, extractor: { kind: 'tymm', prefix }, grades: { 9: T(2024, 2025), 10: T(2025, 2025), 11: OFF(2024), 12: OFF(2024) } })),
  { id: 'tymm-lise-felsefe-2024', pid: 1986, type: 'TYMM', subject: 'FEL', title: 'Felsefe Dersi Öğretim Programı (10-11) (2024)', path: 'Dosyalar/20258269475986-felsefe.pdf', sha256: '8dbb0ea3fa9e3bd250fcc9fe03afa2107f3e3b386b376171e5de0e07873b5c73', extractor: { kind: 'tymm', prefix: 'FEL' }, grades: { 10: T(2025, 2025), 11: OFF(2024) } },
  { id: 'tymm-lise-tarih-2024', pid: 1993, type: 'TYMM', subject: 'TAR', title: 'Tarih Dersi Öğretim Programı (9-11) (2024)', path: 'Dosyalar/202582695425908-tarih.pdf', sha256: '8efaf646a1ff9848e9da3af85a6a2b4adc976c1a0190ffa7fe6469ee99f29876', extractor: { kind: 'tymm', prefix: 'TAR' }, grades: { 9: T(2024, 2025), 10: T(2025, 2025), 11: OFF(2024) } },
  { id: 'tymm-lise-tde-2024', pid: 1994, type: 'TYMM', subject: 'TDE', title: 'Türk Dili ve Edebiyatı Dersi Öğretim Programı (Hazırlık, 9-12) (2024)', path: 'Dosyalar/20258269564464-türk dili edebiyatı.pdf', sha256: '3202898bd5b9b02ec8569b16d293be5f0d378414288f73b3e168cdc71fdfbac7', extractor: { kind: 'tde' }, grades: { 9: T(2024, 2025), 10: T(2025, 2025), 11: OFF(2024), 12: OFF(2024) } },
  { id: 'tymm-lise-inkilap-12-2024', pid: 1988, type: 'TYMM', subject: 'INK', title: 'T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (12. Sınıf) (2024)', path: 'Dosyalar/202582694932783-inkılap 12.pdf', sha256: '16123f4bb62ed34132613634b19620ef4e6b4245c811194e8a61d0029160a129', extractor: { kind: 'tymm', prefix: 'İTA' }, grades: { 12: OFF(2024) } },

  // ---------------- TYMM · lise · 2026 sürümü (2026–2027'den itibaren 9–11) ----------------
  ...[
    ['biyoloji', 2250, 'BIY', 'BİY', 'Biyoloji Dersi Öğretim Programı (9-12) (2026)', 'Dosyalar/202651815105221-biyolojidöp.pdf', '758809eb508d40e0ffea01dd9b65f820d79e5a86d5c14a31e2b91b70cae60b7e'],
    ['cografya', 2251, 'COG', 'COĞ', 'Coğrafya Dersi Öğretim Programı (9-12) (2026)', 'Dosyalar/2026518151120283-cogdöp.pdf', '39aee8c83fb6775243ca06a67ae5c37bab7d96e0900d658bc7b8b6419f3f6773'],
    ['din-kulturu-9-12', 2153, 'DIN', 'DKAB', 'Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (9-12) (2026)', 'Dosyalar/2026313101155916-dkab912.pdf', 'c48c7083d24b106321ee5ba403ce05b54d9fc9b3a68ed1242bbf5989d5faa8c3'],
    ['fizik', 2254, 'FIZ', 'FİZ', 'Fizik Dersi Öğretim Programı (9-12) (2026)', 'Dosyalar/2026518151437471-fizikdöp.pdf', '119b158574ebc2a4b0590ca1c00a2dca69f78af76324c0fe272fd44eae3c6feb'],
    ['kimya', 2255, 'KIM', 'KİM', 'Kimya Dersi Öğretim Programı (9-12) (2026)', 'Dosyalar/2026518151539674-kimya.pdf', '8ebbc113d520eb118e254394ba4bde50c505bca38adafc178e553c73624a375f'],
    ['matematik', 2256, 'MAT', 'MAT', 'Matematik Dersi Öğretim Programı (Hazırlık, 9-12) (2026)', 'Dosyalar/2026518151640408-matedöp.pdf', '8e1b0c98f0e42b08b7ed1c01ffd03d95111153c16176a749f9e0100942f1dda1'],
  ].map(([n, pid, subject, prefix, title, path, sha256]) => ({ id: `tymm-lise-${n}-2026`, pid, type: 'TYMM', subject, title, path, sha256, extractor: { kind: 'tymm', prefix }, grades: { 9: T(2026), 10: T(2026), 11: T(2026), 12: OFF(2026) } })),
  { id: 'tymm-lise-felsefe-2026', pid: 2253, type: 'TYMM', subject: 'FEL', title: 'Felsefe Dersi Öğretim Programı (10-11) (2026)', path: 'Dosyalar/2026518151339111-felsefedöp.pdf', sha256: '26ada7a42aea65c5e2b1155a0b49c4fbf9d2fa30a59df46bfeeeaaf4cbb8b55f', extractor: { kind: 'tymm', prefix: 'FEL' }, grades: { 10: T(2026), 11: T(2026) } },
  { id: 'tymm-lise-tarih-2026', pid: 2271, type: 'TYMM', subject: 'TAR', title: 'Tarih Dersi Öğretim Programı (9-11) (2026)', path: 'Dosyalar/2026691344767-tarihdöp.pdf', sha256: '19340c05d40256afd3e4c6ebb73e00884485f7cd7eb60f56ecfe45bf0f896200', extractor: { kind: 'tymm', prefix: 'TAR' }, grades: { 9: T(2026), 10: T(2026), 11: T(2026) } },
  { id: 'tymm-lise-tde-2026', pid: 2252, type: 'TYMM', subject: 'TDE', title: 'Türk Dili ve Edebiyatı Dersi Öğretim Programı (Hazırlık, 9-12) (2026)', path: 'Dosyalar/2026518151228236-edebiyatdöp.pdf', sha256: 'a04e1444eae5495ac9a4aef3c4644aa118381b78748c543cc64d27739dcdd13a', extractor: { kind: 'tde' }, grades: { 9: T(2026), 10: T(2026), 11: T(2026), 12: OFF(2026) } },
  { id: 'tymm-lise-inkilap-12-2026', pid: 2270, type: 'TYMM', subject: 'INK', title: 'T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (12. Sınıf) (2026)', path: 'Dosyalar/2026716114859749-ınkılaptarihi.pdf', sha256: '3b36236c47d80a05edd1e06caf97121eb22a4731f9588a71919a5fd190f8f0cc', extractor: { kind: 'tymm', prefix: 'İTA' }, grades: { 12: OFF(2026) } },
  { id: 'tymm-lise-ingilizce-9-12-2025', pid: 1906, type: 'TYMM', subject: 'ING', title: 'Ortaöğretim İngilizce Dersi Öğretim Programı (9-12) (2025)', path: 'Dosyalar/202591214813382-ingilizce912.pdf', sha256: 'aa708a0c2bd9d5e20b047838317940f6e4a511e13b93b5acdc96191c8bb104e0', extractor: { kind: 'eng' }, grades: { 9: T(2025), 10: T(2025), 11: T(2026), 12: OFF(2025) } },

  // ---------------- Eski programlar · ortaokul 7 (2025–2026'nın sonuna kadar) ----------------
  // 8. sınıf eski katalog 0025'te mevcut (outcomes'tan); burada yeniden eklenmez, test aynı dosyalardan birebir üretildiğini doğrular.
  { id: 'eski-matematik-2018', pid: 329, type: 'LEGACY', subject: 'MAT', title: 'Matematik Dersi Öğretim Programı (2018)', path: 'Dosyalar/201813017165445-MATEMATİK ÖĞRETİM PROGRAMI 2018v.pdf', sha256: 'ca94096da33478c822772425b1384bacdbe40548b0813302257fec7e8c9f9c8b', extractor: { kind: 'legacy', re: '(M\\.(\\d{1,2})\\.\\d\\.\\d{1,2}\\.\\d{1,2})' }, grades: { 7: T(2018, 2025) }, verify8: 'MAT' },
  { id: 'eski-fen-bilimleri-2018', pid: 325, type: 'LEGACY', subject: 'FEN', title: 'Fen Bilimleri Dersi Öğretim Programı (2018)', path: 'Dosyalar/201812312311937-FEN BİLİMLERİ ÖĞRETİM PROGRAMI2018.pdf', sha256: '3a8aa21327083bf15c33b9c404f299ff784b11d26024522a8c24b61387c8c0c1', extractor: { kind: 'legacy', re: '(F\\.(\\d{1,2})\\.\\d{1,2}\\.\\d{1,2}\\.\\d{1,2})' }, grades: { 7: T(2018, 2025) }, verify8: 'FEN' },
  { id: 'eski-turkce-2019', pid: 663, type: 'LEGACY', subject: 'TUR', title: 'Türkçe Dersi Öğretim Programı (2019)', path: 'Dosyalar/20195716392253-02-Türkçe Öğretim Programı 2019.pdf', sha256: '10e55d403a708d35abc192710977a47df933210a0c54a15e86ea7b9d09401633', extractor: { kind: 'legacy', re: '(T\\.(\\d{1,2})\\.\\d\\.\\d{1,2})' }, grades: { 7: T(2019, 2025) }, verify8: 'TUR' },
  { id: 'eski-din-kulturu-4-8-2018', pid: 318, type: 'LEGACY', subject: 'DIN', title: 'Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (4-8) (2018)', path: 'Dosyalar/20221229134650712-DKAB_(4-8. Sınıf)_DOP_ 2018.pdf', sha256: 'baace330fd3b7c5b5dde6061bbd0af3b885382d6eb5e7049095a30db8c075608', extractor: { kind: 'legacy', re: '((\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' }, grades: { 7: T(2018, 2025) }, verify8: 'DIN' },
  { id: 'eski-ingilizce-2-8-2018', pid: 327, type: 'LEGACY', subject: 'ING', title: 'İngilizce Dersi Öğretim Programı (2-8) (2018)', path: 'Dosyalar/201812411191321-İNGİLİZCE ÖĞRETİM PROGRAMI Klasörü.pdf', sha256: 'e976ae163c83bb1b3bcf79d7d77ce8cb8308dbdc97a630b941951b9b57653279', extractor: { kind: 'rotated', re: '(E(\\d{1,2})\\.\\d{1,2}\\.(?:L|SI|SP|R|W)\\d{1,2})' }, grades: { 7: T(2018, 2025) }, verify8: 'ING' },
  { id: 'eski-inkilap-8-2018', pid: 355, type: 'LEGACY', subject: 'INK', title: 'T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (8) (2018)', path: 'Dosyalar/201812104016155-İNKILAP TARİHİ VE ATATÜRKÇÜLÜK ÖĞRETİM PROGRAMI.pdf', sha256: '38a24b11191f7ebca2fc85831d787e7187eca70e82f0bd36e7de5c81524357d5', extractor: { kind: 'legacy', re: '(İTA\\.(\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' }, grades: {}, verify8: 'INK' },
  { id: 'eski-sosyal-bilgiler-2023', pid: 1264, type: 'LEGACY', subject: 'SOS', title: 'Sosyal Bilgiler Dersi Öğretim Programı (2023-2024 eğitim öğretim yılından itibaren)', path: 'Dosyalar/2023428142532575-2023_sosyal_bilgiler.pdf', sha256: 'de0ca9aea3993041060cf6814cdf42eeb714e2fb01d4997941f67c92c6b610ff', extractor: { kind: 'legacy', re: '(SB\\.(\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' }, grades: { 7: T(2023, 2025) } },

  // ---------------- Eski programlar · lise 11 (2025–2026'nın sonuna kadar) ve 12 (hâlâ geçerli) ----------------
  ...[
    ['matematik-2018', 343, 'MAT', 'Matematik Dersi Öğretim Programı (Ortaöğretim, 2018)', 'Dosyalar/201821102727101-OGM MATEMATİK PRG 20.01.2018.pdf', '43f68f4e03e61ab677cac24400d3e89f18f364c72291577b4ebac603de4afbe7', 4],
    ['fizik-2018', 351, 'FIZ', 'Fizik Dersi Öğretim Programı (Ortaöğretim, 2018)', 'Dosyalar/201812103112910-ortaöğretim_fizik_son.pdf', '6f0adf395fc98c961da08cbb10fa72fda04573aab8e796049f64388117a0f051', 4],
    ['kimya-2018', 350, 'KIM', 'Kimya Dersi Öğretim Programı (Ortaöğretim, 2018)', 'Dosyalar/201812102955190-19.01.2018 Kimya Dersi Öğretim Programı.pdf', 'fb17e88c798f42670c047e7023bbbde8525a8ce253370b05f67dc89364149fc4', 4],
    ['biyoloji-2018', 361, 'BIY', 'Biyoloji Dersi Öğretim Programı (Ortaöğretim, 2018)', 'Dosyalar/20182215535566-Biyoloji döp.pdf', '187254fb4e173c95e767060f0c2f92f4d6abb36ab55dd47589b47a612fedf3d8', 4],
    ['cografya-2018', 336, 'COG', 'Coğrafya Dersi Öğretim Programı (Ortaöğretim, 2018)', 'Dosyalar/2018120203724482-Cografya dop pdf.pdf', '074713f34edfd638dc59b99dc03350afb2f75d67c27fa4c953a7d6f8c7584df8', 3],
    ['din-kulturu-9-12-2018', 319, 'DIN', 'Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (9-12) (2018)', 'Dosyalar/20221229134742302-DKAB_(9-12. Sınıf)_DOP_ 2018.pdf', 'da31fb7e62fa40f7ef7bbdb67582557ade943dd1e562d914e7be6b56ad915594', 3],
  ].map(([n, pid, subject, title, path, sha256, depth]) => ({
    id: `eski-lise-${n}`, pid, type: 'LEGACY', subject, title, path, sha256,
    extractor: { kind: 'legacy', re: depth === 4 ? '((\\d{1,2})\\.\\d{1,2}\\.\\d{1,2}\\.\\d{1,2})' : '((\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' },
    grades: { 11: T(2018, 2025), 12: T(2018) },
  })),
  { id: 'eski-lise-felsefe-2018', pid: 338, type: 'LEGACY', subject: 'FEL', title: 'Felsefe Dersi Öğretim Programı (Ortaöğretim, 2018)', path: 'Dosyalar/2018122175632591-Felsefe döp pdf.pdf', sha256: '71f2b77e209fdc924efbb559744af8c67e91ddb1928a4888a4c07aa5d69654cb', extractor: { kind: 'legacy', re: '((\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' }, grades: { 11: T(2018, 2025) } },
  { id: 'eski-lise-tarih-2023', pid: 1265, type: 'LEGACY', subject: 'TAR', title: 'Tarih Dersi Öğretim Programı (9-11) (2023)', path: 'Dosyalar/2023428142759840-2023_tarih.pdf', sha256: '6b020e0e2bdbd2dda009e22125a8f7d0c650823a87ae86134c458f129d3f0c35', extractor: { kind: 'legacy', re: '((\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' }, grades: { 11: T(2023, 2025) }, note: 'Resmî kazanım sayısı tablosu görsel olarak basılmış (metin katmanında yok): numara bütünlüğüyle doğrulandı.' },
  { id: 'eski-lise-tde-2018', pid: 353, type: 'LEGACY', subject: 'TDE', title: 'Türk Dili ve Edebiyatı Dersi Öğretim Programı (Ortaöğretim, 2018)', path: 'Dosyalar/20221229132522794-Türk Dili ve Edebiyatı Dersi Öğretim Programı.pdf', sha256: '26165bf1bde7c1372805b5e8bf5f5e3f1720f25bf5f1f9f969a9e0bedf0de105', extractor: { kind: 'tde2018' }, grades: { 11: T(2018, 2025), 12: T(2018) } },
  { id: 'eski-lise-inkilap-12-2018', pid: 346, type: 'LEGACY', subject: 'INK', title: 'T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (Ortaöğretim 12)', path: 'Dosyalar/20221229131923491-T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı.pdf', sha256: '0eeb61d5eef4c9ff65e709ca2043e2404e05d6f0926a4c4f011677387c4ea7f2', extractor: { kind: 'legacy', re: '((\\d{1,2})\\.\\d{1,2})', fixedGrade: 12, from: 21 }, grades: { 12: T(2018) } },
].map((s) => ({ ...s, url: BASE + encodeURI(s.path) }))

// Resmî sayı tablosuyla doğrulanan kaynaklarda okunan = resmî olmalı; aşağıdakiler farklı yolla doğrulanır (rapor yazar).
export const OFFICIAL_COUNTS = {
  'eski-lise-tde-2018': { 'A.1': 13, 'A.2': 16, 'A.3': 14, 'A.4': 15, B: 12, 'C.1': 17, 'C.2': 8 },
  'eski-lise-inkilap-12-2018': { 12: 33 },
  // s.14 tablosu dört sınıfı tek TOPLAM satırında yan yana verir (4: 33, 5: 33, 6: 34, 7: 31); genel okuyucu sütunu ayırt edemez.
  'eski-sosyal-bilgiler-2023': { 7: 31 },
}
