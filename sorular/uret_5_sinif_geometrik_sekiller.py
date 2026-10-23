import math
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", F + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DVI", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVBI", F + "DejaVuSans-Bold.ttf"))
addMapping("DV", 0, 0, "DV"); addMapping("DV", 1, 0, "DVB")
addMapping("DV", 0, 1, "DVI"); addMapping("DV", 1, 1, "DVBI")

INK = HexColor("#1b2a2f"); MUTED = HexColor("#56636a"); PRIMARY = HexColor("#1f5f5b")
LINE = HexColor("#e3ddd0"); SUNK = HexColor("#f3efe6"); ACC = HexColor("#c0392b")
BLUE = HexColor("#2c5d8f"); ORANGE = HexColor("#d35400")
DIFF = {"Kolay": HexColor("#2e7d32"), "Orta": HexColor("#b26a00"), "Zor": HexColor("#b3261e")}
DOTS = {"Kolay": 1, "Orta": 2, "Zor": 3}

W, H = A4
M = 46
body = ParagraphStyle("b", fontName="DV", fontSize=11.2, leading=16, textColor=INK)
opt = ParagraphStyle("o", parent=body, leftIndent=18, firstLineIndent=-18, spaceAfter=2)
sol = ParagraphStyle("s", parent=body, fontSize=10.4, leading=15)
small = ParagraphStyle("sm", parent=body, fontSize=9, leading=12, textColor=MUTED)

KAZ = {
    "MAT.5.3.1": "Temel geometrik çizimler için matematiksel araç ve teknolojiden yararlanabilme",
    "MAT.5.3.2": "Temel geometrik çizimlere dayalı deneyimlerini yansıtabilme",
    "MAT.5.3.3": "Açıları ölçmek için matematiksel araç ve teknolojiden yararlanabilme",
    "MAT.5.3.4": "Düzlemde iki veya üç doğrunun birbirine göre durumuna bağlı olarak oluşabilecek açılara dair çıkarım yapabilme",
    "MAT.5.3.5": "Çokgenleri düzlemde ardışık olarak kesişen doğruların oluşturduğu kapalı şekiller olarak yorumlayabilme",
    "MAT.5.3.6": "Çokgenlerin özellikleri ile ilgili edindiği deneyimleri yansıtabilme",
    "MAT.5.3.7": "Matematiksel araç ve teknoloji yardımıyla düzlemde iki noktada kesişen çember çiftinin merkezleri ve kesişim noktalarından biri ile inşa edilen üçgenlere yönelik muhakeme yapabilme",
}


def para(c, text, x, y, w, style=body):
    p = Paragraph(text, style)
    _, h = p.wrap(w, 1000)
    p.drawOn(c, x, y - h)
    return y - h


def lbl(c, x, y, t, size=10.5, font="DVB", color=INK):
    c.setFont(font, size); c.setFillColor(color); c.drawString(x, y, t)


def dot(c, x, y, r=2.4, color=INK):
    c.setFillColor(color); c.circle(x, y, r, stroke=0, fill=1)


def arrow(c, x1, y1, x2, y2, size=7):
    a = math.atan2(y2 - y1, x2 - x1)
    p = c.beginPath(); p.moveTo(x2, y2)
    p.lineTo(x2 - size * math.cos(a - 0.4), y2 - size * math.sin(a - 0.4))
    p.lineTo(x2 - size * math.cos(a + 0.4), y2 - size * math.sin(a + 0.4)); p.close()
    c.setFillColor(c._strokeColorObj if hasattr(c, "_strokeColorObj") else INK)
    c.drawPath(p, stroke=0, fill=1)


def line_both(c, x1, y1, x2, y2):
    c.line(x1, y1, x2, y2); arrow(c, x2, y2, x2 + (x2 - x1) * 0.001, y2 + (y2 - y1) * 0.001)
    arrow(c, x1, y1, x1 - (x2 - x1) * 0.001, y1 - (y2 - y1) * 0.001)


def ray_end(c, x1, y1, x2, y2):
    c.line(x1, y1, x2, y2); arrow(c, x1, y1, x2, y2)


def arc_mark(c, cx, cy, r, a1, a2, color=ACC, w=1.2):
    c.setStrokeColor(color); c.setLineWidth(w)
    c.arc(cx - r, cy - r, cx + r, cy + r, a1, a2 - a1)
    c.setStrokeColor(INK); c.setLineWidth(1.1)


def right_mark(c, x, y, a, s=9):
    # a: direction of first arm (deg); second arm a+90
    u = (math.cos(math.radians(a)), math.sin(math.radians(a)))
    v = (math.cos(math.radians(a + 90)), math.sin(math.radians(a + 90)))
    p = c.beginPath(); p.moveTo(x + u[0] * s, y + u[1] * s)
    p.lineTo(x + u[0] * s + v[0] * s, y + u[1] * s + v[1] * s); p.lineTo(x + v[0] * s, y + v[1] * s)
    c.drawPath(p, stroke=1, fill=0)


def ctext(c, x, y, t, size=10, font="DVB", color=INK):
    c.setFont(font, size); c.setFillColor(color); c.drawCentredString(x, y, t)


# ---------------------------------------------------------------- figures
def fig_q1(c, x, y, w, h):
    c.setLineWidth(1.2); c.setStrokeColor(INK)
    rows = [y + h - 22, y + h / 2, y + 22]
    for i, ry in enumerate(rows):
        lbl(c, x + 10, ry - 4, ["I.", "II.", "III."][i], 11)
    x0, x1 = x + 90, x + 330
    ry = rows[0]; c.line(x0, ry, x1, ry); dot(c, x0, ry); dot(c, x1, ry)
    ctext(c, x0, ry + 9, "K"); ctext(c, x1, ry + 9, "L")
    ry = rows[1]; ray_end(c, x0, ry, x1 + 30, ry); dot(c, x0, ry); dot(c, x1, ry)
    ctext(c, x0, ry + 9, "M"); ctext(c, x1, ry + 9, "N")
    ry = rows[2]; line_both(c, x0 - 30, ry, x1 + 30, ry); dot(c, x0, ry); dot(c, x1, ry)
    ctext(c, x0, ry + 9, "P"); ctext(c, x1, ry + 9, "R")


def fig_q3(c, x, y, w, h):
    gy = y + 25; ax = x + 250; ay = gy + 12 * 11.5
    c.setFillColor(SUNK); c.rect(ax - 40, gy, 80, ay - gy, stroke=0, fill=1)
    lbl(c, ax - 30, gy + 40, "Bina", 9, "DV", MUTED)
    c.setStrokeColor(INK); c.setLineWidth(1.4); c.line(x + 20, gy, x + w - 20, gy)
    lbl(c, x + w - 20, gy - 14, "zemin", 9, "DV", MUTED)
    dot(c, ax, ay); lbl(c, ax + 6, ay + 4, "A", 11)
    s = 11.5
    pts = [(-16, "1", "20 m"), (-5, "2", "13 m"), (0, "3", "12 m"), (9, "4", "15 m")]
    c.setStrokeColor(BLUE); c.setLineWidth(2.2)
    for dx, n, L in pts:
        bx = ax + dx * s; c.line(ax, ay, bx, gy)
        mx, my = (ax + bx) / 2, (ay + gy) / 2
        off = {-16: -34, -5: -38, 0: 5, 9: 8}[dx]
        lbl(c, mx + off, my - 2, L, 9.5, "DV", INK)
        c.setFillColor(white); c.setStrokeColor(BLUE); c.setLineWidth(1)
        c.circle(bx, gy - 14, 8, stroke=1, fill=1); ctext(c, bx, gy - 17.5, n, 9, "DVB", BLUE)
        c.setLineWidth(2.2)
    c.setStrokeColor(INK); c.setLineWidth(1.1)


def fig_q4(c, x, y, w, h):
    pts = {"A": (x + 140, y + h - 25), "B": (x + 330, y + h - 45), "C": (x + 380, y + 30), "D": (x + 170, y + 40)}
    for k, (px, py) in pts.items():
        dot(c, px, py, 3); lbl(c, px + 7, py + 4, k, 11)


def fig_q5(c, x, y, w, h):
    r = 40; ky = y + 40; kx = x + 50
    c.setStrokeColor(INK); c.setLineWidth(1.2)
    ray_end(c, kx, ky, kx + 5 * r + 70, ky)
    names = ["K", "P", "R", "S", "T", "U"]
    for i, n in enumerate(names):
        px = kx + i * r; dot(c, px, ky)
        ctext(c, px, ky - 16, n, 10.5)
    ctext(c, kx + 5 * r + 60, ky - 16, "L", 10.5)
    c.setStrokeColor(PRIMARY); c.setLineWidth(1); c.setDash(3, 2)
    c.circle(kx, ky, r, stroke=1, fill=0)
    for i in range(1, 5):
        cx = kx + i * r
        c.arc(cx - r, ky - r, cx + r, ky + r, -35, 70)
    c.setDash()
    c.setStrokeColor(INK)
    lbl(c, kx + 2, ky + r + 6, "1. çember (merkez K)", 8.5, "DV", MUTED)


def protractor(c, cx, cy, R):
    c.setStrokeColor(INK); c.setLineWidth(1.1)
    c.setFillColor(HexColor("#fbf7ee"))
    p = c.beginPath(); p.moveTo(cx - R, cy); p.arcTo(cx - R, cy - R, cx + R, cy + R, 0, 180); p.close()
    c.drawPath(p, stroke=1, fill=1)
    c.arc(cx - R * 0.55, cy - R * 0.55, cx + R * 0.55, cy + R * 0.55, 0, 180)
    for d in range(0, 181, 5):
        a = math.radians(d); L = 10 if d % 10 == 0 else 5
        c.line(cx + R * math.cos(a), cy + R * math.sin(a), cx + (R - L) * math.cos(a), cy + (R - L) * math.sin(a))
    for d in range(0, 181, 10):
        a = math.radians(d)
        ctext(c, cx + (R - 19) * math.cos(a), cy + (R - 19) * math.sin(a) - 3, str(d), 6.8, "DV")
        ctext(c, cx + (R - 34) * math.cos(a), cy + (R - 34) * math.sin(a) - 3, str(180 - d), 6.3, "DV", MUTED)
    dot(c, cx, cy, 2)


def fig_q6(c, x, y, w, h):
    cx, cy, R = x + w / 2, y + 25, 135
    protractor(c, cx, cy, R)
    c.setStrokeColor(ACC); c.setLineWidth(2)
    ray_end(c, cx, cy, cx + R + 45, cy)
    a = math.radians(50)
    ray_end(c, cx, cy, cx + (R + 45) * math.cos(a), cy + (R + 45) * math.sin(a))
    c.setStrokeColor(INK); c.setLineWidth(1.1)
    ctext(c, cx, cy - 15, "O", 10.5)
    lbl(c, cx + R + 40, cy - 15, "A", 10.5)
    lbl(c, cx + (R + 45) * math.cos(a) + 6, cy + (R + 45) * math.sin(a), "B", 10.5)


def fig_q7(c, x, y, w, h):
    cx, cy, R = x + w / 2, y + h / 2, h / 2 - 8
    c.setStrokeColor(INK); c.setLineWidth(2); c.setFillColor(white); c.circle(cx, cy, R, stroke=1, fill=1)
    c.setLineWidth(1)
    for i in range(60):
        a = math.radians(90 - i * 6); L = 8 if i % 5 == 0 else 3
        c.line(cx + R * math.cos(a), cy + R * math.sin(a), cx + (R - L) * math.cos(a), cy + (R - L) * math.sin(a))
    for n in range(1, 13):
        a = math.radians(90 - n * 30)
        ctext(c, cx + (R - 18) * math.cos(a), cy + (R - 18) * math.sin(a) - 4, str(n), 10.5)
    c.setLineWidth(3.2); a = math.radians(90 - 120); c.line(cx, cy, cx + R * 0.5 * math.cos(a), cy + R * 0.5 * math.sin(a))
    c.setLineWidth(2.2); c.line(cx, cy, cx, cy + R * 0.66)
    dot(c, cx, cy, 3.5)
    c.setLineWidth(1.1)


def fig_q8(c, x, y, w, h):
    for i, (n, name) in enumerate([(8, "Elif: 8 eş dilim"), (16, "Can: 16 eş dilim")]):
        cx = x + w * (0.27 + 0.46 * i); cy = y + h / 2 + 8; R = h / 2 - 22
        c.setFillColor(HexColor("#fbf7ee")); c.setStrokeColor(INK); c.setLineWidth(1.2)
        c.circle(cx, cy, R, stroke=1, fill=1)
        c.setStrokeColor(MUTED); c.setLineWidth(0.7); c.setDash(2, 2)
        for k in range(n // 2):
            a = math.radians(k * 360 / n)
            c.line(cx - R * math.cos(a), cy - R * math.sin(a), cx + R * math.cos(a), cy + R * math.sin(a))
        c.setDash()
        c.setFillColor(HexColor("#d9ebe8"))
        p = c.beginPath(); p.moveTo(cx, cy); p.arcTo(cx - R, cy - R, cx + R, cy + R, 0, 360 / n); p.close()
        c.setStrokeColor(PRIMARY); c.drawPath(p, stroke=1, fill=1)
        ctext(c, cx, y + 4, name, 9.5, "DV", INK)
    c.setStrokeColor(INK)


def grid(c, x, y, cols, rows, s):
    c.setStrokeColor(HexColor("#bcd9e6")); c.setLineWidth(0.5)
    for i in range(cols + 1):
        c.line(x + i * s, y, x + i * s, y + rows * s)
    for j in range(rows + 1):
        c.line(x, y + j * s, x + cols * s, y + j * s)
    c.setStrokeColor(INK); c.setLineWidth(1.2)


def fig_q9(c, x, y, w, h):
    s = 20; gx = x + (w - 16 * s) / 2; gy = y + 5
    grid(c, gx, gy, 16, 8, s)
    P = lambda i, j: (gx + i * s, gy + j * s)
    def L(p, q, n1, n2, ext=0.0):
        (x1, y1), (x2, y2) = P(*p), P(*q)
        line_both(c, x1, y1, x2, y2); dot(c, *P(*(p[0] + (q[0]-p[0]) * 0.15, p[1] + (q[1]-p[1]) * 0.15)))
    # AB  (y=6), CD (y=2), EF (x=4), GH diagonal
    for (p, q, a, b, pa, pb) in [((0.5, 6), (15.5, 6), "A", "B", (2, 6), (6, 6)),
                                 ((0.5, 2), (15.5, 2), "C", "D", (9, 2), (13, 2)),
                                 ((4, 0.3), (4, 7.7), "E", "F", (4, 1), (4, 4)),
                                 ((9, 0.3), (15.5, 6.8), "G", "H", (11, 2.3), (14, 5.3))]:
        (x1, y1), (x2, y2) = P(*p), P(*q); line_both(c, x1, y1, x2, y2)
        for nm, pp in ((a, pa), (b, pb)):
            px, py = P(*pp); dot(c, px, py); c.setFillColor(white); c.rect(px + 3, py + 3, 11, 12, stroke=0, fill=1)
            lbl(c, px + 4, py + 5, nm, 10)


def fig_q10(c, x, y, w, h):
    cx, cy = x + w / 2, y + h / 2; L = 150
    c.setStrokeColor(INK); c.setLineWidth(1.3)
    line_both(c, cx - L, cy, cx + L, cy)
    a = math.radians(65); l2 = 95
    line_both(c, cx - l2 * math.cos(a), cy - l2 * math.sin(a), cx + l2 * math.cos(a), cy + l2 * math.sin(a))
    arc_mark(c, cx, cy, 22, 0, 65); arc_mark(c, cx, cy, 26, 65, 180, BLUE); arc_mark(c, cx, cy, 22, 180, 245, ORANGE)
    lbl(c, cx + 26, cy + 14, "65°", 10.5)
    lbl(c, cx - 30, cy + 32, "x", 12, "DVBI", BLUE)
    lbl(c, cx - 38, cy - 22, "y", 12, "DVBI", ORANGE)


def three_lines(c, cx, cy, s, ang):
    pts = {}
    c.setStrokeColor(INK); c.setLineWidth(1.2)
    for (a, n1, n2, ln) in ang:
        r = math.radians(a)
        line_both(c, cx - ln * math.cos(r), cy - ln * math.sin(r), cx + ln * math.cos(r), cy + ln * math.sin(r))
    return pts


def fig_q11(c, x, y, w, h):
    cx, cy = x + w / 2, y + h / 2
    c.setStrokeColor(INK); c.setLineWidth(1.2)
    line_both(c, cx - 170, cy, cx + 170, cy)
    line_both(c, cx, cy - 75, cx, cy + 75)
    a = math.radians(32); L = 165
    line_both(c, cx - L * math.cos(a), cy - L * math.sin(a), cx + L * math.cos(a), cy + L * math.sin(a))
    right_mark(c, cx, cy, 90, 8)
    for nm, (px, py), (ox, oy) in [("A", (cx - 110, cy), (-4, -16)), ("C", (cx + 110, cy), (-4, -16)),
                                   ("H", (cx, cy + 55), (-16, 0)), ("E", (cx, cy - 55), (6, -6)),
                                   ("F", (cx + 120 * math.cos(a), cy + 120 * math.sin(a)), (-4, 8)),
                                   ("D", (cx - 120 * math.cos(a), cy - 120 * math.sin(a)), (-4, -18))]:
        dot(c, px, py); lbl(c, px + ox, py + oy, nm, 10.5)
    lbl(c, cx + 6, cy - 16, "B", 10.5)
    arc_mark(c, cx, cy, 40, 0, 32); lbl(c, cx + 45, cy + 6, "32°", 9.5, "DVB", ACC)


def fig_q12(c, x, y, w, h):
    y1, y2 = y + h - 40, y + 40; L1, L2 = x + 40, x + w - 40
    c.setStrokeColor(INK); c.setLineWidth(1.3)
    line_both(c, L1, y1, L2, y1); line_both(c, L1, y2, L2, y2)
    lbl(c, L2 - 10, y1 + 8, "d₁", 11, "DVBI"); lbl(c, L2 - 10, y2 + 8, "d₂", 11, "DVBI")
    a = math.radians(70); xa = x + w / 2 + 25; xb = xa - (y1 - y2) / math.tan(a)
    dx, dy = math.cos(a) * 40, math.sin(a) * 40
    line_both(c, xb - dx, y2 - dy, xa + dx, y1 + dy)
    lbl(c, xa + dx + 6, y1 + dy - 8, "k", 11, "DVBI")
    arc_mark(c, xa, y1, 20, 0, 70); lbl(c, xa + 22, y1 + 8, "70°", 10)
    lbl(c, x + 40, y + h / 2 - 4, "d₁ // d₂", 10.5, "DV", MUTED)


def fig_q13(c, x, y, w, h):
    cx, cy, R = x + w / 2, y + h / 2 - 4, 62
    V = [(cx + R * math.cos(math.radians(90 + 72 * i + 10)), cy + R * math.sin(math.radians(90 + 72 * i + 10))) for i in range(5)]
    c.setFillColor(HexColor("#d9ebe8"))
    p = c.beginPath(); p.moveTo(*V[0])
    for v in V[1:]:
        p.lineTo(*v)
    p.close(); c.drawPath(p, stroke=0, fill=1)
    c.setStrokeColor(INK); c.setLineWidth(1.2)
    for i in range(5):
        (x1, y1), (x2, y2) = V[i], V[(i + 1) % 5]
        e = 0.45
        X1, Y1 = x1 - (x2 - x1) * e, y1 - (y2 - y1) * e; X2, Y2 = x2 + (x2 - x1) * e, y2 + (y2 - y1) * e
        line_both(c, X1, Y1, X2, Y2)
    for v in V:
        dot(c, *v)


def fig_q16(c, x, y, w, h):
    cx, cy, R = x + w / 2, y + h / 2, 70
    names = "ABCDEF"
    V = [(cx + R * math.cos(math.radians(120 - 60 * i)), cy + R * math.sin(math.radians(120 - 60 * i))) for i in range(6)]
    c.setStrokeColor(INK); c.setLineWidth(1.3)
    p = c.beginPath(); p.moveTo(*V[0])
    for v in V[1:]:
        p.lineTo(*v)
    p.close(); c.drawPath(p, stroke=1, fill=0)
    for (vx, vy), n in zip(V, names):
        dot(c, vx, vy); ox = (vx - cx) / R * 14; oy = (vy - cy) / R * 14
        ctext(c, vx + ox, vy + oy - 4, n, 11)


def fig_q18(c, x, y, w, h):
    bx, by = x + 110, y + 30; cxp = x + 290
    ax = (bx + cxp) / 2; ay = by + (cxp - bx) / 2 * math.tan(math.radians(50))
    c.setStrokeColor(INK); c.setLineWidth(1.3)
    p = c.beginPath(); p.moveTo(ax, ay); p.lineTo(bx, by); p.lineTo(cxp, by); p.close(); c.drawPath(p, stroke=1, fill=0)
    ray_end(c, cxp, by, cxp + 110, by)
    for (x1, y1, x2, y2) in [(ax, ay, bx, by), (ax, ay, cxp, by)]:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2; ang = math.atan2(y2 - y1, x2 - x1) + math.pi / 2
        c.line(mx - 5 * math.cos(ang), my - 5 * math.sin(ang), mx + 5 * math.cos(ang), my + 5 * math.sin(ang))
    for (px, py, n, ox, oy) in [(ax, ay, "A", -4, 8), (bx, by, "B", -14, -6), (cxp, by, "C", -4, -16), (cxp + 95, by, "D", -2, -16)]:
        dot(c, px, py); lbl(c, px + ox, py + oy, n, 11)
    arc_mark(c, bx, by, 24, 0, 50); lbl(c, bx + 28, by + 6, "50°", 10)
    arc_mark(c, cxp, by, 20, 0, 130, BLUE); lbl(c, cxp + 14, by + 24, "?", 12, "DVB", BLUE)


def circles_tri(c, ax, ay, r1, r2, d, s, names, show_len=True):
    bx = ax + d * s
    xi = (d * d + r1 * r1 - r2 * r2) / (2 * d); yi = math.sqrt(r1 * r1 - xi * xi)
    cxp, cyp = ax + xi * s, ay + yi * s
    c.setStrokeColor(PRIMARY); c.setLineWidth(1)
    c.circle(ax, ay, r1 * s, stroke=1, fill=0); c.circle(bx, ay, r2 * s, stroke=1, fill=0)
    c.setStrokeColor(ACC); c.setLineWidth(1.8)
    p = c.beginPath(); p.moveTo(ax, ay); p.lineTo(bx, ay); p.lineTo(cxp, cyp); p.close(); c.drawPath(p, stroke=1, fill=0)
    c.setStrokeColor(INK); c.setLineWidth(1.1)
    dot(c, ax, ay); dot(c, bx, ay); dot(c, cxp, cyp)
    lbl(c, ax - 6, ay - 16, names[0], 11); lbl(c, bx - 4, ay - 16, names[1], 11); lbl(c, cxp - 4, cyp + 7, names[2], 11)


def fig_q19(c, x, y, w, h):
    s = 20; circles_tri(c, x + w / 2 - 2 * s, y + h / 2 - 10, 4, 4, 4, s, "ABC")


def fig_q20(c, x, y, w, h):
    s = 12
    circles_tri(c, x + 85, y + h / 2 - 8, 5, 3, 6, s, "ABC")
    ctext(c, x + 85 + 3 * s, y + 2, "I. çizim", 10, "DVB", INK)
    circles_tri(c, x + w / 2 + 60, y + h / 2 - 8, 5, 5, 6, s, "KLM")
    ctext(c, x + w / 2 + 60 + 3 * s, y + 2, "II. çizim", 10, "DVB", INK)


# ---------------------------------------------------------------- questions
Q = [
 dict(k="MAT.5.3.1", d="Kolay", fig=(fig_q1, 130),
  q="Yukarıda I, II ve III numaralı temel geometrik çizimler verilmiştir. Bu çizimlerin sembolle gösterimleri aşağıdakilerin hangisinde <b>doğru</b> olarak verilmiştir?",
  o=[t.replace("  ", "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;") for t in ["I: [KL]  II: [MN  III: PR", "I: KL  II: [MN]  III: [PR", "I: [KL]  II: [NM  III: PR", "I: [KL  II: MN  III: [PR]"]], a="A",
  s="I. çizimin iki ucu da noktayla bitmiştir; bu bir <b>doğru parçasıdır</b> ve [KL] ile gösterilir. II. çizim M noktasından başlayıp N yönünde sonsuza gider; bu bir <b>ışındır</b>. Işın başlangıç noktasından yazılır: [MN. ([NM yazılsaydı ışın N'den başlayıp M yönüne giderdi.) III. çizim iki yönde de sonsuza gider; bu bir <b>doğrudur</b> ve PR ile gösterilir."),

 dict(k="MAT.5.3.1", d="Orta", fig=None,
  q="Öğretmen, öğrencilerinden kâğıtlarına sırasıyla şu üç çizimi yapmalarını istiyor:<br/>"
    "1) Bir noktayı merkez alan bir çember<br/>2) Bir doğruya, dışındaki bir noktadan dikme<br/>3) Ölçüsü 70° olan bir açı<br/><br/>"
    "Öğrencilerin yanındaki araçlar şunlardır:<br/>"
    "<b>Ali:</b> Pergel – Açıölçer – Çizgeç<br/><b>Bora:</b> Gönye – Pergel – Çizgeç<br/><b>Cem:</b> Çizgeç – Açıölçer – Gönye<br/><b>Deniz:</b> Pergel – Gönye – Açıölçer<br/><br/>"
    "Buna göre hangi öğrenci, başka bir araca ihtiyaç duymadan üç çizimi de <b>tek başına</b> yapabilir?",
  o=["Ali", "Bora", "Cem", "Deniz"], a="D",
  s="Her çizim için gereken araç: çember → <b>pergel</b>; dikme → <b>gönye</b>; ölçüsü verilen açı → <b>açıölçer</b>.<br/>"
    "Ali'de gönye yok, dikme çizemez. Bora'da açıölçer yok, 70° açı çizemez. Cem'de pergel yok, çember çizemez. "
    "Pergel, gönye ve açıölçerin üçü de yalnızca <b>Deniz</b>'de vardır. (Gönye ve açıölçerin düz kenarı çizgeç yerine kullanılabilir.)"),

 dict(k="MAT.5.3.2", d="Kolay", fig=(fig_q3, 190),
  q="Mühendis Zeynep Hanım, atık suyu binanın çatısındaki A noktasından zemine taşımak için 4 boru planlamıştır. Boruların uzunlukları şekilde verilmiştir. "
    "Atık su zemine <b>en kısa yoldan</b> taşınmak isteniyor.<br/>Buna göre kullanılması gereken boru ve bu borunun zeminle yaptığı açı aşağıdakilerden hangisidir?",
  o=["2 numaralı boru – dar açı", "3 numaralı boru – dar açı", "4 numaralı boru – dik açı", "3 numaralı boru – dik açı"], a="D",
  s="Bir doğruya dışındaki bir noktadan çizilen doğru parçalarının <b>en kısası dikmedir</b>. Boruların en kısası 12 m uzunluğundaki 3 numaralı borudur. "
    "Bu boru zemine diktir, yani zeminle <b>dik açı (90°)</b> yapar. Bir doğruya dışındaki bir noktadan yalnız bir dikme çizilebildiği için dik olan başka boru yoktur."),

 dict(k="MAT.5.3.2", d="Orta", fig=(fig_q4, 150),
  q="Şekilde A, B, C ve D noktaları verilmiştir. Bu noktaların herhangi üçü aynı doğru üzerinde değildir.<br/>"
    "Bu noktalardan <b>en az ikisinden</b> geçen kaç farklı doğru çizilebilir?",
  o=["4", "6", "8", "Sonsuz sayıda"], a="B",
  s="İki noktadan <b>yalnız bir doğru</b> geçer. Bu yüzden her nokta ikilisi için bir doğru vardır. İkilileri tek tek yazalım:<br/>"
    "AB, AC, AD, BC, BD, CD → <b>6 doğru</b>.<br/>"
    "(Bir noktadan sonsuz sayıda doğru geçer; ancak soru en az iki noktadan geçen doğruları sorduğu için \"sonsuz\" seçeneği doğru değildir.)"),

 dict(k="MAT.5.3.2", d="Orta", fig=(fig_q5, 120),
  q="Betül, pergelinin açıklığını hiç değiştirmeden KL ışını üzerine çemberler çiziyor. İlk çemberin merkezi K noktasıdır. "
    "Sonraki her çemberin merkezi, bir önceki çemberin ışını kestiği yeni noktadır. Böylece ışın üzerinde sırasıyla P, R, S, T ve U noktaları oluşuyor.<br/>"
    "|KU| = 15 cm olduğuna göre |KS| kaç santimetredir?",
  o=["6", "9", "12", "15"], a="B",
  s="Pergelin açıklığı değişmediği için bütün çemberlerin yarıçapı eşittir. Bu yüzden [KP], [PR], [RS], [ST] ve [TU] <b>eşit uzunluktadır</b>.<br/>"
    "K'den U'ya 5 eş doğru parçası vardır: 15 ÷ 5 = 3 cm (pergel açıklığı).<br/>"
    "K'den S'ye 3 eş doğru parçası vardır: |KS| = 3 × 3 = <b>9 cm</b>."),

 dict(k="MAT.5.3.3", d="Kolay", fig=(fig_q6, 175),
  q="Yukarıda AOB açısı açıölçer ile ölçülmektedir. Açının köşesi açıölçerin merkezine, [OA ışını ise açıölçerdeki 0 çizgisine yerleştirilmiştir.<br/>"
    "Buna göre m(AÔB) kaç derecedir?",
  o=["40", "50", "130", "140"], a="B",
  s="Açıölçerde iki ölçek vardır. [OA ışını <b>dış ölçeğin 0</b> çizgisi üzerindedir. Bu yüzden ölçüm dış ölçekten okunur: [OB ışını dış ölçekte <b>50</b>'yi gösterir.<br/>"
    "Kontrol: AOB açısı dik açıdan küçüktür, yani dar açıdır. 130 dar açı olamaz; 130, iç ölçekten yanlış okunan değerdir. m(AÔB) = <b>50°</b>."),

 dict(k="MAT.5.3.3", d="Orta", fig=(fig_q7, 170),
  q="Saat 4.00'ü gösteren yukarıdaki saatte akrep ile yelkovan arasındaki <b>küçük</b> açının ölçüsü ve çeşidi aşağıdakilerden hangisidir?",
  o=["90°, dik açı", "120°, dar açı", "150°, geniş açı", "120°, geniş açı"], a="D",
  s="Yelkovan bir tam tur atınca <b>tam açı (360°)</b> oluşur. Saat kadranı 12 eş parçaya bölünmüştür. İki sayı arasındaki açı 360° ÷ 12 = <b>30°</b>'dir.<br/>"
    "Saat 4.00'te yelkovan 12'de, akrep 4'tedir. Aralarında 4 aralık vardır: 4 × 30° = <b>120°</b>.<br/>"
    "120°, 90°'den büyük ve 180°'den küçük olduğu için <b>geniş açıdır</b>."),

 dict(k="MAT.5.3.3", d="Zor", fig=(fig_q8, 150),
  q="Elif, daire şeklindeki bir kâğıdı ortadan 3 kez katlayarak 8 eş dilim elde ediyor ve bir dilimi kendi açı ölçme birimi olarak kullanıyor. "
    "Can ise aynı büyüklükteki bir kâğıdı ortadan 4 kez katlayarak 16 eş dilim elde ediyor.<br/>"
    "Elif, dolap kapağının açıklığını kendi birimiyle <b>3 birim</b> olarak ölçüyor.<br/>"
    "Buna göre Can aynı açıyı kendi birimiyle kaç birim olarak ölçer?",
  o=["3", "4", "6", "12"], a="C",
  s="Bir tam açı Elif'te 8, Can'da 16 eş dilime bölünmüştür. 16, 8'in 2 katıdır. Bu yüzden Elif'in <b>1 dilimi</b>, Can'ın <b>2 dilimine</b> eşittir.<br/>"
    "Elif'in 3 birimi = 3 × 2 = <b>6 Can birimi</b>.<br/>"
    "Derece ile kontrol: Elif'in birimi 360° ÷ 8 = 45°'dir. Kapağın açısı 3 × 45° = 135°'dir. Bu bir geniş açıdır. "
    "Bu örnek, herkesin kendi birimiyle farklı sonuç bulduğunu gösterir. Bu yüzden ortak bir ölçme birimine (dereceye) ihtiyaç vardır."),

 dict(k="MAT.5.3.4", d="Kolay", fig=(fig_q9, 175),
  q="Kareli zemin üzerine AB, CD, EF ve GH doğruları çizilmiştir.<br/>Bu doğruların birbirine göre durumu ile ilgili aşağıdakilerden hangisi <b>yanlıştır</b>?",
  o=["AB // CD", "EF ⊥ AB", "GH ile CD kesişen doğrulardır.", "EF // GH"], a="D",
  s="AB ve CD yatay doğrulardır ve aralarındaki uzaklık değişmez: <b>AB // CD</b> (doğru).<br/>"
    "EF dikey doğrudur. Yatay AB ile kesiştiği yerde 90° oluşur: <b>EF ⊥ AB</b> (doğru).<br/>"
    "GH eğik doğrudur ve CD ile bir noktada kesişir (doğru).<br/>"
    "EF ile GH aynı doğrultuda değildir; uzatıldıklarında kesişirler. Bu yüzden paralel <b>değildir</b>. Yanlış olan ifade D'dir."),

 dict(k="MAT.5.3.4", d="Kolay", fig=(fig_q10, 170),
  q="İki doğrunun kesişmesiyle oluşan açılardan birinin ölçüsü 65°'dir.<br/>Buna göre şekildeki x ve y açılarının ölçüleri aşağıdakilerden hangisidir?",
  o=["x = 115°, y = 65°", "x = 65°, y = 115°", "x = 115°, y = 115°", "x = 25°, y = 65°"], a="A",
  s="x açısı 65°'lik açının <b>komşu bütünler</b> açısıdır (birlikte doğru açı oluştururlar): x = 180° − 65° = <b>115°</b>.<br/>"
    "y açısı 65°'lik açının <b>ters açısıdır</b>. Ters açıların ölçüleri eşittir: y = <b>65°</b>.<br/>"
    "Kontrol: İki doğrunun kesişiminde iki dar (65°, 65°) ve iki geniş (115°, 115°) açı oluşur."),

 dict(k="MAT.5.3.4", d="Orta", fig=(fig_q11, 175),
  q="Asaf, defterine B noktasında kesişen AC, DF ve EH doğrularını çizmiştir. EH ⊥ AC ve m(FB̂C) = 32°'dir.<br/>"
    "Buna göre aşağıdakilerden hangisi <b>yanlıştır</b>?",
  o=["m(HB̂F) = 58°", "m(AB̂D) = 32°", "HBF ve FBC açıları komşu tümler açılardır.", "ABF ve FBC açıları tümler açılardır."], a="D",
  s="HBC dik açıdır (90°). m(HB̂F) = 90° − 32° = 58° → A doğru.<br/>"
    "ABD açısı, FBC açısının ters açısıdır: m(AB̂D) = 32° → B doğru.<br/>"
    "HBF ve FBC komşudur ve toplamları 58° + 32° = 90°'dir; komşu tümlerdir → C doğru.<br/>"
    "ABF açısı 180° − 32° = 148°'dir. 148° + 32° = <b>180°</b> olduğu için bu açılar <b>bütünler</b> açılardır, tümler değildir → <b>D yanlış</b>."),

 dict(k="MAT.5.3.4", d="Zor", fig=(fig_q12, 170),
  q="Birbirine paralel d₁ ve d₂ doğruları, k doğrusu ile kesilmiştir. Kesişim noktalarında oluşan açılardan biri 70°'dir.<br/>"
    "Oluşan 8 açıdan <b>geniş açıların</b> ölçüleri toplamı ile <b>dar açıların</b> ölçüleri toplamı arasındaki fark kaç derecedir?",
  o=["40", "140", "160", "180"], a="C",
  s="İki paralel doğruyu kesen bir doğru, <b>4 dar ve 4 geniş açı</b> oluşturur. Her kesişim noktasında 70°'lik açının ters açısı da 70°'dir. Komşu bütünleri ise 180° − 70° = 110°'dir.<br/>"
    "Paralel doğrularda iki kesişim noktasındaki açılar aynıdır (üst üste konunca çakışırlar).<br/>"
    "Dar açılar: 4 × 70° = 280°. Geniş açılar: 4 × 110° = 440°.<br/>Fark: 440° − 280° = <b>160°</b>."),

 dict(k="MAT.5.3.5", d="Kolay", fig=(fig_q13, 175),
  q="İbrahim, halı deseni için doğrular çiziyor. Çizdiği son doğru ilk doğruyla kesişiyor ve yukarıdaki boyalı kapalı şekil oluşuyor.<br/>"
    "Bu kapalı şekli oluşturan doğru sayısı ve şeklin adı aşağıdakilerin hangisinde doğru verilmiştir?",
  o=["5 doğru – beşgen", "10 doğru – beşgen", "5 doğru – altıgen", "4 doğru – dörtgen"], a="A",
  s="Şekilde her kenar, iki yönde uzayan bir doğrunun parçasıdır. Doğrular sayıldığında <b>5 doğru</b> olduğu görülür.<br/>"
    "En az üç doğrunun ardışık kesişmesiyle (ilk doğru son doğruyla kesişmek şartıyla) oluşan kapalı şekle <b>çokgen</b> denir. "
    "Çokgenin kenar sayısı onu oluşturan doğru sayısına eşittir. 5 kenarlı çokgen <b>beşgendir</b>."),

 dict(k="MAT.5.3.5", d="Orta", fig=None,
  q="Düzlemde doğrularla kapalı şekiller oluşturma ile ilgili aşağıdaki ifadelerden hangisi <b>doğrudur</b>?",
  o=["İki doğrunun kesişmesiyle bir kapalı şekil oluşturulabilir.",
     "Birbirine paralel üç doğru ile bir üçgen oluşturulabilir.",
     "Altı doğru, ilk doğru son doğruyla kesişecek şekilde ardışık olarak kesiştiğinde bir altıgen oluşur.",
     "Bir çokgenin kenar sayısı, onu oluşturan doğru sayısından fazladır."], a="C",
  s="A yanlıştır: İki doğru en fazla bir noktada kesişir ve bir bölgeyi kapatamaz. Kapalı şekil için <b>en az üç doğru</b> gerekir.<br/>"
    "B yanlıştır: Paralel doğrular hiç kesişmez, kapalı şekil oluşturamaz.<br/>"
    "C doğrudur: Altı doğrunun ardışık kesişimi, ilk ve son doğru da kesişirse <b>altı kenarlı</b> bir kapalı şekil, yani altıgen oluşturur.<br/>"
    "D yanlıştır: Kenar sayısı, doğru sayısına <b>eşittir</b>."),

 dict(k="MAT.5.3.6", d="Kolay", fig=None,
  q="Aşağıdaki çokgenlerden hangisi <b>düzgün çokgen değildir</b>?",
  o=["Kenarları 5 cm olan kare",
     "Bütün kenarları 4 cm olan eşkenar üçgen",
     "Kenarları 4 cm, 6 cm, 4 cm, 6 cm ve bütün iç açıları 90° olan dikdörtgen",
     "Bütün kenarları 3 cm ve bütün iç açıları 120° olan altıgen"], a="C",
  s="Bütün kenar uzunlukları <b>ve</b> bütün iç açılarının ölçüleri eşit olan çokgene düzgün çokgen denir.<br/>"
    "Karenin kenarları ve açıları (90°) eşittir. Eşkenar üçgenin kenarları ve açıları (60°) eşittir. D'deki altıgenin kenarları ve açıları eşittir.<br/>"
    "Dikdörtgenin açıları eşittir ama <b>kenarları eşit değildir</b> (4 cm ≠ 6 cm). Bu yüzden düzgün çokgen değildir."),

 dict(k="MAT.5.3.6", d="Orta", fig=(fig_q16, 175),
  q="Yukarıda ABCDEF altıgeni verilmiştir. Bu altıgen ile ilgili aşağıdaki ifadeler veriliyor:<br/>"
    "I. [AC] bu altıgenin bir köşegenidir.<br/>II. [EF] bu altıgenin bir köşegenidir.<br/>"
    "III. Altıgenin 6 iç açısı ve 6 dış açısı vardır.<br/>IV. Bu çokgen \"ACEBDF altıgeni\" diye isimlendirilebilir.<br/><br/>"
    "Bu ifadelerden hangileri <b>doğrudur</b>?",
  o=["I ve II", "I ve III", "II ve IV", "III ve IV"], a="B",
  s="I doğrudur: A ve C ardışık olmayan köşelerdir. Onları birleştiren doğru parçası <b>köşegendir</b>.<br/>"
    "II yanlıştır: E ve F ardışık köşelerdir; [EF] bir <b>kenardır</b>.<br/>"
    "III doğrudur: Bir çokgende dış açı sayısı iç açı sayısına eşittir. Altıgenin 6 iç açısı ve 6 dış açısı vardır.<br/>"
    "IV yanlıştır: Çokgen isimlendirilirken köşeler <b>ardışık</b> okunur (ABCDEF, BCDEFA, FEDCBA gibi). ACEBDF ardışık değildir."),

 dict(k="MAT.5.3.6", d="Orta", fig=None,
  q="Üçgenler ile ilgili aşağıdaki ifadeler doğru ise \"D\", yanlış ise \"Y\" ile işaretleniyor.<br/>"
    "I. Dik açılı ikizkenar üçgen çizilebilir.<br/>II. Geniş açılı eşkenar üçgen çizilebilir.<br/>"
    "III. İki iç açısı dik açı olan bir üçgen çizilebilir.<br/>IV. Eşkenar üçgenin bütün iç açılarının ölçüsü 60°'dir.<br/><br/>"
    "Yapılan işaretlemeler sırasıyla aşağıdakilerden hangisi gibi olmalıdır?",
  o=["D, Y, Y, D", "D, D, Y, D", "Y, Y, D, D", "D, Y, D, Y"], a="A",
  s="Üçgenin iç açılarının ölçüleri toplamı <b>180°</b>'dir.<br/>"
    "I – D: 90°, 45°, 45° açılı üçgen hem dik açılı hem ikizkenardır.<br/>"
    "II – Y: Eşkenar üçgenin açıları 60° olduğundan geniş açısı olamaz.<br/>"
    "III – Y: İki dik açının toplamı 90° + 90° = 180°'dir. Üçüncü açıya yer kalmaz.<br/>"
    "IV – D: Eşkenar üçgende 180° ÷ 3 = 60°."),

 dict(k="MAT.5.3.6", d="Zor", fig=(fig_q18, 165),
  q="ABC üçgeninde |AB| = |AC| ve m(AB̂C) = 50°'dir. [BC] doğru parçası C noktasından D yönünde uzatılmıştır.<br/>"
    "Buna göre üçgenin A köşesindeki iç açısı ile C köşesindeki dış açısının (ACD) ölçüleri toplamı kaç derecedir?",
  o=["180", "200", "210", "230"], a="C",
  s="İkizkenar üçgende eşit kenarları gören açılar eşittir: m(AĈB) = m(AB̂C) = 50°.<br/>"
    "İç açılar toplamı 180°: m(BÂC) = 180° − 50° − 50° = <b>80°</b>.<br/>"
    "Dış açı, iç açının komşu bütünleridir: m(AĈD) = 180° − 50° = <b>130°</b>.<br/>"
    "Toplam: 80° + 130° = <b>210°</b>."),

 dict(k="MAT.5.3.7", d="Orta", fig=(fig_q19, 175),
  q="Yarıçapları 4 cm olan A ve B merkezli iki çember, her biri diğerinin merkezinden geçecek şekilde çizilmiştir. "
    "Çemberlerin kesişim noktalarından biri C'dir. A, B ve C noktaları birleştirilerek ABC üçgeni inşa edilmiştir.<br/>"
    "Buna göre ABC üçgeninin çevre uzunluğu ve kenarlarına göre çeşidi aşağıdakilerden hangisidir?",
  o=["8 cm, ikizkenar üçgen", "12 cm, eşkenar üçgen", "12 cm, çeşitkenar üçgen", "16 cm, eşkenar üçgen"], a="B",
  s="[AC], A merkezli çemberin yarıçapıdır: |AC| = 4 cm. [BC], B merkezli çemberin yarıçapıdır: |BC| = 4 cm.<br/>"
    "B noktası A merkezli çemberin üzerinde olduğu için [AB] de bir yarıçaptır: |AB| = 4 cm.<br/>"
    "Üç kenar eşit olduğundan üçgen <b>eşkenardır</b>. Çevre = 4 + 4 + 4 = <b>12 cm</b>. "
    "(Ölçme aracı kullanmadan, yalnızca yarıçaplara bakarak karar verdik.)"),

 dict(k="MAT.5.3.7", d="Zor", fig=(fig_q20, 165),
  q="Ahmet iki farklı çizim yapıyor:<br/>"
    "<b>I. çizim:</b> A merkezli 5 cm ve B merkezli 3 cm yarıçaplı çemberler. |AB| = 6 cm. Kesişim noktalarından biri C.<br/>"
    "<b>II. çizim:</b> K merkezli 5 cm ve L merkezli 5 cm yarıçaplı çemberler. |KL| = 6 cm. Kesişim noktalarından biri M.<br/>"
    "Buna göre ABC ve KLM üçgenleri için aşağıdakilerden hangisi <b>doğrudur</b>?",
  o=["ABC çeşitkenar, KLM ikizkenar; çevreleri 14 cm ve 16 cm",
     "ABC ikizkenar, KLM eşkenar; çevreleri 14 cm ve 16 cm",
     "ABC çeşitkenar, KLM eşkenar; çevreleri 14 cm ve 15 cm",
     "ABC ikizkenar, KLM ikizkenar; çevreleri 14 cm ve 16 cm"], a="A",
  s="<b>I. çizim:</b> |AC| = 5 cm (A'nın yarıçapı), |BC| = 3 cm (B'nin yarıçapı), |AB| = 6 cm. Üç kenar da farklı → <b>çeşitkenar</b>. Çevre: 5 + 3 + 6 = <b>14 cm</b>.<br/>"
    "<b>II. çizim:</b> |KM| = 5 cm, |LM| = 5 cm (eşit yarıçaplar), |KL| = 6 cm. İki kenar eşit → <b>ikizkenar</b>. "
    "Eşkenar olması için |KL| de 5 cm olmalıydı; yani çemberler birbirinin merkezinden geçmeliydi. Çevre: 5 + 5 + 6 = <b>16 cm</b>."),
]


def badge(c, d, x_right, y_top):
    col = DIFF[d]; bw, bh = 98, 26
    x0 = x_right - bw
    c.setFillColor(col); c.roundRect(x0, y_top - bh, bw, bh, 13, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("DVB", 10.5); c.drawString(x0 + 12, y_top - 17.5, d.upper())
    for i in range(3):
        cx = x0 + bw - 36 + i * 10
        if i < DOTS[d]:
            c.setFillColor(white); c.circle(cx, y_top - bh / 2, 3.4, stroke=0, fill=1)
        else:
            c.setStrokeColor(white); c.setLineWidth(1); c.circle(cx, y_top - bh / 2, 3.4, stroke=1, fill=0)


def header_footer(c, page, total):
    c.setFillColor(PRIMARY); c.rect(0, H - 30, W, 30, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("DVB", 9.5)
    c.drawString(M, H - 19, "BULUŞ KÜRE KOLEJİ  ·  5. SINIF MATEMATİK")
    c.setFont("DV", 9.5); c.drawRightString(W - M, H - 19, "1. Tema: Geometrik Şekiller")
    c.setStrokeColor(LINE); c.setLineWidth(0.8); c.line(M, 36, W - M, 36)
    c.setFont("DV", 8); c.setFillColor(MUTED)
    c.drawString(M, 24, "Senaryo soruları · Soru + çözüm")
    c.drawRightString(W - M, 24, f"{page} / {total}")


def question_page(c, n, q, total):
    header_footer(c, n, total)
    top = H - 48
    # kazanım box (left) + difficulty badge (right corner)
    bx, bw = M, W - 2 * M - 112
    kp = Paragraph(f"<font color='#1f5f5b'><b>ÖĞRENME ÇIKTISI  {q['k']}</b></font><br/>{KAZ[q['k']]}", ParagraphStyle("k", parent=small, textColor=INK, fontSize=9, leading=12.5))
    _, kh = kp.wrap(bw - 20, 200)
    c.setFillColor(SUNK); c.setStrokeColor(LINE); c.roundRect(bx, top - kh - 14, bw, kh + 14, 6, stroke=1, fill=1)
    c.setFillColor(PRIMARY); c.rect(bx, top - kh - 14, 4, kh + 14, stroke=0, fill=1)
    kp.drawOn(c, bx + 12, top - kh - 7)
    lbl(c, W - M - 98, top - 2 + 0, "ZORLUK", 7.5, "DVB", MUTED)
    badge(c, q["d"], W - M, top - 6)
    y = top - kh - 32
    # question number
    c.setFillColor(INK); c.roundRect(M, y - 24, 30, 26, 5, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("DVB", 13); c.drawCentredString(M + 15, y - 17, str(n))
    lbl(c, M + 40, y - 17, "SORU", 11, "DVB", INK)
    y -= 36
    if q["fig"]:
        fn, fh = q["fig"]
        c.setStrokeColor(LINE); c.setLineWidth(0.8); c.roundRect(M, y - fh, W - 2 * M, fh, 6, stroke=1, fill=0)
        c.setStrokeColor(INK); c.setLineWidth(1.1)
        fn(c, M + 6, y - fh + 4, W - 2 * M - 12, fh - 8)
        y -= fh + 12
    y = para(c, q["q"], M, y, W - 2 * M) - 8
    for L, t in zip("ABCD", q["o"]):
        y = para(c, f"<b>{L})</b>  {t}", M + 6, y, W - 2 * M - 6, opt) - 1
    y -= 14
    # solution
    c.setStrokeColor(PRIMARY); c.setLineWidth(1.2); c.setDash(4, 3); c.line(M, y, W - M, y); c.setDash()
    c.setFillColor(white); c.rect(M + 0, y - 8, 70, 16, stroke=0, fill=1)
    lbl(c, M + 2, y - 4, "ÇÖZÜM", 10.5, "DVB", PRIMARY)
    y -= 16
    p = Paragraph(q["s"], sol); _, sh = p.wrap(W - 2 * M - 24, 1000)
    if y - sh - 50 < 44:
        raise SystemExit(f"Soru {n} sığmadı: {y - sh - 50:.0f}")
    c.setFillColor(HexColor("#f4f8f7")); c.setStrokeColor(HexColor("#cfe3df"))
    c.roundRect(M, y - sh - 52, W - 2 * M, sh + 56, 6, stroke=1, fill=1)
    p.drawOn(c, M + 12, y - sh - 2)
    y = y - sh - 12
    c.setFillColor(PRIMARY); c.roundRect(M + 12, y - 30, 150, 26, 5, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("DVB", 11.5); c.drawString(M + 24, y - 21.5, f"Doğru cevap: {q['a']}")
    c.showPage()


def answer_key(c, total):
    header_footer(c, total, total)
    y = H - 70
    lbl(c, M, y, "CEVAP ANAHTARI VE ÖĞRENME ÇIKTISI DAĞILIMI", 15, "DVB", PRIMARY)
    y -= 16
    data = [["Soru", "Öğrenme çıktısı", "Zorluk", "Cevap"]]
    for i, q in enumerate(Q, 1):
        data.append([str(i), Paragraph(f"<b>{q['k']}</b> – {KAZ[q['k']]}", ParagraphStyle("t", parent=small, textColor=INK, fontSize=8, leading=10)), q["d"], q["a"]])
    t = Table(data, colWidths=[38, 330, 70, 50])
    st = [("FONTNAME", (0, 0), (-1, -1), "DV"), ("FONTNAME", (0, 0), (-1, 0), "DVB"),
          ("FONTSIZE", (0, 0), (-1, -1), 9), ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
          ("TEXTCOLOR", (0, 0), (-1, 0), white), ("ALIGN", (0, 0), (0, -1), "CENTER"),
          ("ALIGN", (2, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("GRID", (0, 0), (-1, -1), 0.5, LINE), ("FONTNAME", (3, 1), (3, -1), "DVB"),
          ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, SUNK])]
    for i, q in enumerate(Q, 1):
        st.append(("TEXTCOLOR", (2, i), (2, i), DIFF[q["d"]])); st.append(("FONTNAME", (2, i), (2, i), "DVB"))
    t.setStyle(TableStyle(st))
    _, th = t.wrap(W - 2 * M, H)
    t.drawOn(c, M, y - th)
    y -= th + 20
    cnt = {d: sum(1 for q in Q if q["d"] == d) for d in DIFF}
    para(c, f"<b>Zorluk dağılımı:</b> Kolay {cnt['Kolay']} · Orta {cnt['Orta']} · Zor {cnt['Zor']}  (toplam {len(Q)} soru)", M, y, W - 2 * M, body)
    c.showPage()


out = "/home/user/bulus-kure-rehberlik/sorular/5-sinif-matematik-geometrik-sekiller-senaryo-sorulari.pdf"
import os
os.makedirs(os.path.dirname(out), exist_ok=True)
c = canvas.Canvas(out, pagesize=A4)
c.setTitle("5. Sınıf Matematik – Geometrik Şekiller Senaryo Soruları")
c.setAuthor("Buluş Küre Koleji")
total = len(Q) + 1
for i, q in enumerate(Q, 1):
    question_page(c, i, q, total)
answer_key(c, total)
c.save()
print("ok", out)
