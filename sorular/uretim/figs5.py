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
    circles_tri(c, x + 85, y + h / 2 + 6, 5, 3, 6, s, "ABC")
    ctext(c, x + 85 + 3 * s, y + 2, "I. çizim", 10, "DVB", INK)
    circles_tri(c, x + w / 2 + 60, y + h / 2 + 6, 5, 5, 6, s, "KLM")
    ctext(c, x + w / 2 + 60 + 3 * s, y + 2, "II. çizim", 10, "DVB", INK)


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


