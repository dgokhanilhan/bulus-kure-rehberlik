import os, re, shutil, subprocess, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from figs5 import *
from sorular5 import Q

OUT = sys.argv[1]
UP = os.path.join(OUT, "oyss-yukleme")
TMP = os.path.join(OUT, ".tmp")
shutil.rmtree(UP, ignore_errors=True); os.makedirs(UP); os.makedirs(TMP, exist_ok=True)

IW = 500            # görsel içerik genişliği (pt) ≈ 17,6 cm
PAD = 10
DPI = 200
crit = ParagraphStyle("c", parent=sol, fontSize=10.4, leading=14)


def plain(html):
    t = html.replace("<br/>", "\n")
    t = re.sub(r"<[^>]+>", "", t)
    return t.replace("&nbsp;", " ").strip()


def stem_height(q, w):
    h = 0
    if q["fig"]:
        h += q["fig"][1] + 10
    _, ph = Paragraph(q["q"], body).wrap(w, 2000)
    return h + ph


def draw_stem(c, q, x, y, w, frame=False):
    if q["fig"]:
        fn, fh = q["fig"]
        if frame:
            c.setStrokeColor(LINE); c.setLineWidth(0.8); c.roundRect(x, y - fh, w, fh, 6, stroke=1, fill=0)
        c.setStrokeColor(INK); c.setLineWidth(1.1)
        fn(c, x + (w - 491) / 2, y - fh + 4, 491, fh - 8)
        y -= fh + 10
    return para(c, q["q"], x, y, w)


def puan_rows(q):
    return [Paragraph(f"<b>%{p}</b>", crit) for p, _ in q["puan"]], [Paragraph(t, crit) for _, t in q["puan"]]


def puan_table(q, w):
    a, b = puan_rows(q)
    t = Table([[Paragraph("<b>Pay</b>", crit), Paragraph("<b>Ölçüt</b>", crit)]] + [[x, y] for x, y in zip(a, b)],
              colWidths=[52, w - 52])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, LINE), ("BACKGROUND", (0, 0), (-1, 0), SUNK),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    _, h = t.wrap(w, 2000)
    return t, h


def to_png(pdf, png_base):
    subprocess.run(["pdftoppm", "-r", str(DPI), "-png", "-singlefile", pdf, png_base], check=True)


def make_image(name, width, height, draw):
    pdf = os.path.join(TMP, name + ".pdf")
    c = canvas.Canvas(pdf, pagesize=(width, height))
    c.setFillColor(white); c.rect(0, 0, width, height, stroke=0, fill=1)
    draw(c)
    c.showPage(); c.save()
    return pdf


# ---------------------------------------------------------------- OYSS dosyaları
for n, q in enumerate(Q, 1):
    d = os.path.join(UP, f"soru-{n:02d}")
    os.makedirs(d)
    w = IW + 2 * PAD
    # 1) soru görseli: şekil + soru metni (numara, zorluk, cevap yok)
    h = stem_height(q, IW) + 2 * PAD
    to_png(make_image(f"s{n}", w, h, lambda c: draw_stem(c, q, PAD, h - PAD, IW)), os.path.join(d, "soru"))
    # 2) yalnız şekil
    if q["fig"]:
        fn, fh = q["fig"]
        def dr(c, fn=fn, fh=fh):
            c.setStrokeColor(INK); c.setLineWidth(1.1); fn(c, PAD + (IW - 491) / 2, PAD + 4, 491, fh - 8)
        to_png(make_image(f"f{n}", w, fh + 2 * PAD, dr), os.path.join(d, "sekil"))
    # 3) puanlama anahtarı görseli
    cp = Paragraph(f"<b>Cevap:</b> {q['cevap'].replace('  ·  ', '<br/>')}", sol)
    _, ch = cp.wrap(IW, 2000)
    t, th = puan_table(q, IW)
    head = 18
    h2 = head + ch + 10 + th + 2 * PAD
    def dp(c):
        y = h2 - PAD
        lbl(c, PAD, y - 12, "PUANLAMA ANAHTARI", 11, "DVB", PRIMARY)
        y -= head
        cp.drawOn(c, PAD, y - ch); y -= ch + 10
        t.drawOn(c, PAD, y - th)
    to_png(make_image(f"p{n}", w, h2, dp), os.path.join(d, "puanlama"))
    # 4) kopyala-yapıştır metni
    with open(os.path.join(d, "metin.txt"), "w", encoding="utf-8") as f:
        f.write(f"SORU {n}  |  {q['k']}  |  Zorluk: {q['d']}  |  Önerilen cevap alanı: {q['satir']} satır, {q['zemin']}\n")
        f.write(f"Öğrenme çıktısı: {KAZ[q['k']]}\n")
        if q["fig"]:
            f.write("(Şekil: aynı klasördeki sekil.png dosyasını soru metninin üstüne ekleyin.)\n")
        f.write("\n--- SORU METNİ ---\n" + plain(q["q"]) + "\n")
        f.write("\n--- PUANLAMA ANAHTARI ---\n")
        f.write("Cevap: " + q["cevap"].replace("  ·  ", "\n") + "\n\n")
        for p, tx in q["puan"]:
            f.write(f"%{p} — {plain(tx)}\n")
        f.write("\n--- ÇÖZÜM (öğretmen için) ---\n" + plain(q["s"]) + "\n")

# ---------------------------------------------------------------- öğretmen kitapçığı
def header(c, page, total):
    c.setFillColor(PRIMARY); c.rect(0, H - 30, W, 30, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("DVB", 9.5)
    c.drawString(M, H - 19, "BULUŞ KÜRE KOLEJİ  ·  ÖĞRETMEN KİTAPÇIĞI")
    c.setFont("DV", 9.5); c.drawRightString(W - M, H - 19, "5. Sınıf Matematik · 1. Tema: Geometrik Şekiller")
    c.setStrokeColor(LINE); c.setLineWidth(0.8); c.line(M, 36, W - M, 36)
    c.setFont("DV", 8); c.setFillColor(MUTED)
    c.drawString(M, 24, "Açık uçlu sorular · OYSS için hazırlanmıştır")
    c.drawRightString(W - M, 24, f"{page} / {total}")


def teacher_page(c, n, q, total):
    header(c, n + 1, total)
    top = H - 48
    bw = W - 2 * M - 112
    kp = Paragraph(f"<font color='#1f5f5b'><b>ÖĞRENME ÇIKTISI  {q['k']}</b></font><br/>{KAZ[q['k']]}",
                   ParagraphStyle("k", parent=small, textColor=INK, fontSize=9, leading=12.5))
    _, kh = kp.wrap(bw - 20, 200)
    c.setFillColor(SUNK); c.setStrokeColor(LINE); c.roundRect(M, top - kh - 14, bw, kh + 14, 6, stroke=1, fill=1)
    c.setFillColor(PRIMARY); c.rect(M, top - kh - 14, 4, kh + 14, stroke=0, fill=1)
    kp.drawOn(c, M + 12, top - kh - 7)
    lbl(c, W - M - 98, top - 2, "ZORLUK", 7.5, "DVB", MUTED)
    badge(c, q["d"], W - M, top - 6)
    y = top - kh - 32
    c.setFillColor(INK); c.roundRect(M, y - 24, 30, 26, 5, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("DVB", 13); c.drawCentredString(M + 15, y - 17, str(n))
    lbl(c, M + 40, y - 17, "SORU", 11, "DVB", INK)
    lbl(c, M + 90, y - 17, f"Önerilen cevap alanı: {q['satir']} satır, {q['zemin']}  ·  Açık uçlu", 9, "DV", MUTED)
    y -= 36
    y = draw_stem(c, q, M, y, W - 2 * M, frame=True) - 16
    # cevap anahtarı + puanlama + çözüm
    iw = W - 2 * M - 24
    cp = Paragraph(f"<b>Cevap:</b> {q['cevap'].replace('  ·  ', '<br/>')}", sol); _, ch = cp.wrap(iw, 2000)
    t, th = puan_table(q, iw)
    sp = Paragraph(f"<b>Çözüm:</b> {q['s']}", sol); _, sh = sp.wrap(iw, 2000)
    box = 22 + ch + 8 + th + 10 + sh + 12
    if y - box < 44:
        raise SystemExit(f"Soru {n} sığmadı ({y - box:.0f})")
    c.setFillColor(HexColor("#f4f8f7")); c.setStrokeColor(HexColor("#cfe3df"))
    c.roundRect(M, y - box, W - 2 * M, box, 6, stroke=1, fill=1)
    lbl(c, M + 12, y - 16, "CEVAP ANAHTARI VE PUANLAMA", 10.5, "DVB", PRIMARY)
    yy = y - 22
    cp.drawOn(c, M + 12, yy - ch); yy -= ch + 8
    t.drawOn(c, M + 12, yy - th); yy -= th + 10
    sp.drawOn(c, M + 12, yy - sh)
    c.showPage()


def intro(c, total):
    header(c, 1, total)
    y = H - 70
    lbl(c, M, y, "GEOMETRİK ŞEKİLLER · 20 AÇIK UÇLU SORU", 15, "DVB", PRIMARY)
    y -= 14
    y = para(c, "Her soru için öğrenme çıktısı, zorluk düzeyi, önerilen cevap alanı, cevap anahtarı, puanlama ölçütleri ve çözüm verilmiştir. "
                "Puanlama ölçütleri yüzde olarak yazılmıştır; sorunun OYSS'de alacağı puan belirlendikten sonra o puana göre dağıtılır "
                "(ör. 10 puanlık soruda %30 = 3 puan).", M, y, W - 2 * M, sol) - 12
    data = [["Soru", "Öğrenme çıktısı", "Zorluk", "Cevap alanı"]]
    for i, q in enumerate(Q, 1):
        data.append([str(i), Paragraph(f"<b>{q['k']}</b> – {KAZ[q['k']]}", ParagraphStyle("t", parent=small, textColor=INK, fontSize=8, leading=10)),
                     q["d"], f"{q['satir']} satır"])
    t = Table(data, colWidths=[36, 338, 60, 66])
    st = [("FONTNAME", (0, 0), (-1, -1), "DV"), ("FONTNAME", (0, 0), (-1, 0), "DVB"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
          ("BACKGROUND", (0, 0), (-1, 0), PRIMARY), ("TEXTCOLOR", (0, 0), (-1, 0), white), ("ALIGN", (0, 0), (0, -1), "CENTER"),
          ("ALIGN", (2, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("GRID", (0, 0), (-1, -1), 0.5, LINE),
          ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, SUNK])]
    for i, q in enumerate(Q, 1):
        st += [("TEXTCOLOR", (2, i), (2, i), DIFF[q["d"]]), ("FONTNAME", (2, i), (2, i), "DVB")]
    t.setStyle(TableStyle(st)); _, th = t.wrap(W - 2 * M, H); t.drawOn(c, M, y - th)
    y -= th + 16
    cnt = {d: sum(1 for q in Q if q["d"] == d) for d in DIFF}
    para(c, f"<b>Zorluk dağılımı:</b> Kolay {cnt['Kolay']} · Orta {cnt['Orta']} · Zor {cnt['Zor']}", M, y, W - 2 * M, sol)
    c.showPage()


book = os.path.join(OUT, "ogretmen-kitapcigi-5-sinif-geometrik-sekiller.pdf")
c = canvas.Canvas(book, pagesize=A4)
c.setTitle("5. Sınıf Matematik – Geometrik Şekiller Açık Uçlu Sorular"); c.setAuthor("Buluş Küre Koleji")
total = len(Q) + 1
intro(c, total)
for i, q in enumerate(Q, 1):
    teacher_page(c, i, q, total)
c.save()

# ---------------------------------------------------------------- okubeni + zip
with open(os.path.join(UP, "OKUBENI.txt"), "w", encoding="utf-8") as f:
    f.write("""OYSS'YE SORU YÜKLEME — 5. SINIF MATEMATİK, GEOMETRİK ŞEKİLLER

Her soru-XX klasöründe şunlar var:
  soru.png       Sorunun tamamı (şekil + soru metni) tek görsel. Soru numarası, zorluk ve cevap içermez.
  sekil.png      Yalnız şekil (şekilli sorularda).
  puanlama.png   Cevap ve puanlama ölçütleri tek görsel.
  metin.txt      Soru metni, puanlama anahtarı ve çözüm düz metin olarak (kopyala-yapıştır için).

OYSS'de "Soru Yaz" panelinde iki yoldan biri kullanılabilir:
  Yol 1 (en hızlı): Soru alanına soru.png, puanlama anahtarı alanına puanlama.png görselini ekleyin.
  Yol 2 (düzenlenebilir): metin.txt içindeki soru metnini kopyalayıp yapıştırın, şekilli sorularda
        sekil.png görselini ekleyin; puanlama anahtarını da metin.txt'den yapıştırın.

Paneldeki "Cevap Satır Sayısı" için önerilen değer metin.txt'nin ilk satırında yazar.
Puanlama ölçütleri yüzde olarak verilmiştir; soru puanı belirlendikten sonra o puana göre dağıtın.
Senaryodaki iki öğrenme çıktısına uyan soruları öğrenme çıktısı koduna (MAT.5.3.x) göre seçin.
Görseller 200 dpi'dır; A4 sayfada yaklaşık 17,6 cm genişliğe denk gelir.
""")
zp = os.path.join(OUT, "oyss-yukleme-5-sinif-geometrik-sekiller.zip")
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(UP):
        for fn in sorted(files):
            p = os.path.join(root, fn); z.write(p, os.path.relpath(p, OUT))
shutil.rmtree(TMP)
print("ok")
