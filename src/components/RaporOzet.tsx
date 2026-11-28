// Raporun ilk sayfası: veliye "Bir Bakışta" (siz dili), öğrenciye "Öğrenci Sürümü" (sen dili).
// Tam rapor hemen altında devam eder; tıklamaya gerek kalmadan aşağı kaydırınca görünür.
// Sınıf sıralaması yok: öğrenci yalnız kendi önceki denemeleriyle karşılaştırılır (CLAUDE.md §3).
import { fmt } from '@/lib/analiz'
import type { RaporOzet } from '@/lib/rapor'

export type OzetMod = 'veli' | 'ogrenci'

function Dersler({ o }: { o: RaporOzet }) {
  return (
    <div className="oz-ders">
      {o.dersler.map((d) => (
        <div key={d.ad} className="oz-ders-satir">
          <span className="oz-ders-ad">{d.ad}</span>
          <span className="oz-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(Math.max(0, Math.min(1, d.net / (d.soru || 1))) * 100)}%` }} />
          </span>
          <b className={`pnum${d.trend ? ` oz-${d.trend}` : ''}`}>
            {fmt(d.net, 2)}
            {d.trend === 'up' ? ' ↑' : d.trend === 'down' ? ' ↓' : ''}
          </b>
        </div>
      ))}
    </div>
  )
}

export function RaporOzetKagidi({ o, mod, ad, deneme, tarih, mentor }: { o: RaporOzet; mod: OzetMod; ad: string; deneme: string; tarih: string; mentor: string }) {
  const farkMetni =
    o.fark == null
      ? 'İlk deneme: bundan sonrakiler bu sonuçla karşılaştırılacak'
      : Math.abs(o.fark) < 0.05
        ? 'Önceki denemeyle aynı seviyede'
        : `${o.fark > 0 ? '↑' : '↓'} önceki denemeden ${fmt(Math.abs(o.fark))} net ${o.fark > 0 ? 'fazla' : 'az'}`
  if (mod === 'ogrenci')
    return (
      <article className="paper oz" data-testid="rapor-ozet" aria-label="Öğrenci özeti">
        <header className="oz-bas">
          <h2>Merhaba {ad.split(/\s+/)[0]}! İşte {deneme} sonucun</h2>
          <p>{tarih} · yalnız kendinle yarışıyorsun</p>
        </header>
        <div className="oz-rozet">
          {o.rozetler.map((r) => (
            <div key={r.baslik}>
              <b>{r.baslik}</b>
              <span>{r.metin}</span>
            </div>
          ))}
        </div>
        <section>
          <h3>Senin çizgin</h3>
          <Dersler o={o} />
        </section>
        <section>
          <h3>Sıradaki hedeflerin</h3>
          <div className="oz-hedef">
            {o.hedefler.map((h, i) => (
              <div key={i}>
                <b>
                  Hedef {i + 1} · {h.baslik}
                </b>
                <span>{h.metin}</span>
              </div>
            ))}
          </div>
        </section>
        <p className="oz-not">Bu sayfa yalnız senin önceki denemelerinle karşılaştırma yapar. Ayrıntılı raporun aşağıda devam ediyor ↓</p>
      </article>
    )
  return (
    <article className="paper oz" data-testid="rapor-ozet" aria-label="Bir bakışta">
      <header className="oz-bas">
        <h2>
          {ad} · {deneme}
        </h2>
        <p>Buluş Küre Koleji · {tarih} · Gelişim özeti</p>
      </header>
      <div className="oz-ust">
        <div className="oz-net">
          <span>Toplam net</span>
          <b className="pnum">{o.toplamNet}</b>
          <em className={o.fark != null && o.fark >= 0.05 ? 'oz-up' : o.fark != null && o.fark <= -0.05 ? 'oz-down' : ''}>{farkMetni}</em>
          {o.rekor && <em>Son {Math.min(o.denemeSayisi, 5)} denemenin en yüksek sonucu</em>}
        </div>
        <section className="oz-ust-ders">
          <h3>Dersler</h3>
          <Dersler o={o} />
        </section>
      </div>
      <section>
        <h3>Kısaca</h3>
        <p>{o.kisaca}</p>
      </section>
      {o.oncelikler.length > 0 && (
        <section>
          <h3>Önümüzdeki 2 haftanın {o.oncelikler.length === 3 ? '3 önceliği' : 'öncelikleri'}</h3>
          <ol className="oz-oncelik">
            {o.oncelikler.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        </section>
      )}
      <section>
        <h3>Evde yapabilecekleriniz</h3>
        <ul className="oz-evde">
          {o.evde.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </section>
      {mentor.trim() && (
        <section className="oz-mentor">
          <h3>Mentör öğretmenimizden</h3>
          <p>{mentor}</p>
        </section>
      )}
      <p className="oz-not">Öğrenci yalnız kendi önceki denemeleriyle karşılaştırılır; sınıf sıralaması kullanılmaz. Ayrıntılı rapor aşağıda devam ediyor ↓</p>
    </article>
  )
}
