# veri.py içeriğini doğrular ve SQL veri bölümünü üretir:  python scripts/oyun-icerik/uret.py > cikti.sql
# Mini Bulmaca: 5×5 kafes. Yatay kelimeler 1., 3., 5. satırda; düşey kelimeler 1., 3., 5. sütunda; dokuz kesişim.
# Bulmacalar kelime listesinden programla kurulur; her kesişim kuruluşu gereği tutarlıdır.
import random
import sys
from veri import ILLER, SORULAR, GUN_SORULARI, KELIMELER

ALFABE = set('abcçdefgğhıijklmnoöprsştuüvyz')
BULMACA_SAYISI = 60


def q(s):
    return "'" + s.replace("'", "''") + "'"


def dizi(l):
    return 'array[' + ', '.join(q(x) for x in l) + ']'


def dogrula():
    assert len(ILLER) == 81 and sorted(p for p, *_ in ILLER) == list(range(1, 82))
    for plaka, ad, en, boy, ip in ILLER:
        assert 35.5 < en < 42.5 and 25.5 < boy < 45, ad
        assert len(ip) == 3 and all(3 <= len(x) <= 90 for x in ip), ad
        kok = ad.lower().replace('i̇', 'i')[:5]
        for x in ip:
            assert kok not in x.lower().replace('i̇', 'i'), (ad, x)
    for s, sec, d in SORULAR + [(s, sec, d) for _, _, s, sec, d in GUN_SORULARI]:
        assert len(sec) == 4 and len(set(sec)) == 4 and 1 <= d <= 4 and s.endswith('?'), s
    assert len({s for s, _, _ in SORULAR}) == len(SORULAR)
    assert len({(a, g) for a, g, *_ in GUN_SORULARI}) == len(GUN_SORULARI)
    for k, ipucu in KELIMELER.items():
        assert len(k) == 5 and set(k) <= ALFABE, k
        assert k not in ipucu.lower(), (k, ipucu)


def bulmacalar():
    rnd = random.Random(73)
    kelimeler = sorted(KELIMELER)
    dizin = {}
    for k in kelimeler:
        dizin.setdefault((k[0], k[2], k[4]), []).append(k)
    kullanim = {k: 0 for k in kelimeler}
    sonuc, gorulen = [], set()
    deneme = 0
    while len(sonuc) < BULMACA_SAYISI and deneme < 4_000_000:
        deneme += 1
        y = rnd.sample(kelimeler, 3)
        d = []
        for j in (0, 2, 4):
            aday = [k for k in dizin.get((y[0][j], y[1][j], y[2][j]), []) if k not in y and k not in d]
            if not aday:
                break
            d.append(min(aday, key=lambda k: (kullanim[k], rnd.random())))
        if len(d) < 3:
            continue
        hepsi = y + d
        if max(kullanim[k] for k in hepsi) >= 6 or frozenset(hepsi) in gorulen:
            continue
        gorulen.add(frozenset(hepsi))
        for k in hepsi:
            kullanim[k] += 1
        sonuc.append((y, d))
    assert len(sonuc) == BULMACA_SAYISI, len(sonuc)
    for y, d in sonuc:
        for i in range(3):
            for j in range(3):
                assert y[i][2 * j] == d[j][2 * i]
    return sonuc


def main():
    dogrula()
    out = []
    out.append('insert into oda_sehir (plaka, ad, enlem, boylam, ipuclari) values')
    out.append(',\n'.join(f"  ({p}, {q(ad)}, {en:.2f}, {boy:.2f}, {dizi(ip)})" for p, ad, en, boy, ip in ILLER) + ';')
    out.append('')
    out.append('insert into oda_soru (soru, secenekler, dogru, ay, gun) values')
    satir = [f"  ({q(s)}, {dizi(sec)}, {d}, null, null)" for s, sec, d in SORULAR]
    satir += [f"  ({q(s)}, {dizi(sec)}, {d}, {a}, {g})" for a, g, s, sec, d in GUN_SORULARI]
    out.append(',\n'.join(satir) + ';')
    out.append('')
    out.append('insert into oda_bulmaca (no, yatay, dusey, yatay_ipucu, dusey_ipucu) values')
    out.append(',\n'.join(
        f"  ({i}, {dizi(y)}, {dizi(d)}, {dizi([KELIMELER[k] for k in y])}, {dizi([KELIMELER[k] for k in d])})"
        for i, (y, d) in enumerate(bulmacalar())) + ';')
    sys.stdout.reconfigure(encoding='utf-8')
    print('\n'.join(out))
    print(f'-- {len(ILLER)} il, {len(SORULAR)} soru + {len(GUN_SORULARI)} güne özel, {BULMACA_SAYISI} bulmaca ({len(KELIMELER)} kelime)', file=sys.stderr)


if __name__ == '__main__':
    main()
