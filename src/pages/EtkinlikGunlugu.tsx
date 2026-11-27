// Etkinlik günlüğü (0100): seçilen günde kimin girdiği, hangi sayfaları açtığı, ne yaptığı.
// Yalnız etkinlik_yetki tablosundaki yönetici görür (yetki veritabanında; menü bağlantısı da yalnız ona çıkar).
// İçerik gösterilmez: mesaj, not, görüşme metni yok; yalnız sayfa adı ve işin türü.
import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Icon } from '@/components/Icon'
import {
  bugunIst, CIHAZ_TR, gunKaydir, islemMetni, rolAnahtari, rolMetni, saatIst, sayfaAdi, useEtkinlikGun, useEtkinlikKisi, useEtkinlikYetki,
  type Giren,
} from '@/lib/etkinlik'

type RolSuz = 'hepsi' | 'ogretmen' | 'veli' | 'ogrenci' | 'admin'
const ROL_SECENEK: [RolSuz, string][] = [['hepsi', 'Tüm roller'], ['ogretmen', 'Öğretmen'], ['veli', 'Veli'], ['ogrenci', 'Öğrenci'], ['admin', 'Yönetici']]
const gunMetni = (g: string) =>
  new Date(`${g}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' })
const kucukHarf = (s: string) => s.toLocaleLowerCase('tr-TR')

export default function EtkinlikGunlugu() {
  const yetki = useEtkinlikYetki(true)
  if (yetki.isLoading) return <p className="m" style={{ padding: 20 }}>Yükleniyor…</p>
  if (!yetki.data) return <Navigate to="/" replace />
  return <Gunluk />
}

function Gunluk() {
  const bugun = bugunIst()
  const [gun, setGun] = useState(bugun)
  const [rol, setRol] = useState<RolSuz>('hepsi')
  const [ara, setAra] = useState('')
  const [mod, setMod] = useState<'giren' | 'girmeyen'>('giren')
  const [secili, setSecili] = useState<string | null>(null)
  const q = useEtkinlikGun(gun)
  const detayRef = useRef<HTMLElement>(null)

  const d = q.data
  const uygun = (r: string, ad: string) =>
    (rol === 'hepsi' || rolAnahtari(r) === rol) && (!ara.trim() || kucukHarf(ad).includes(kucukHarf(ara.trim())))
  const girenler = (d?.girenler ?? []).filter((g) => uygun(g.rol, g.ad))
  const girmeyenler = (d?.girmeyenler ?? []).filter((g) => uygun(g.rol, g.ad))
  const sayac = (k: RolSuz) => {
    const g = (d?.girenler ?? []).filter((x) => k === 'hepsi' || rolAnahtari(x.rol) === k).length
    const t = g + (d?.girmeyenler ?? []).filter((x) => k === 'hepsi' || rolAnahtari(x.rol) === k).length
    return { g, t }
  }
  const seciliKisi = d?.girenler.find((g) => g.id === secili) ?? null
  const kayitBasi = d?.kayit_basi ? d.kayit_basi.slice(0, 10) : null
  const kayitOncesi = !kayitBasi || gun < bugunIst(new Date(d!.kayit_basi!))

  const gunDegis = (g: string) => {
    setGun(g)
    setSecili(null)
  }
  const sec = (id: string) => {
    setSecili(id)
    // Telefonda döküm listenin altında: seçince görünür alana kaydır
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 860px)').matches) detayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <>
      <div className="head a">
        <div style={{ minWidth: 0 }}>
          <h1 className="hd">Etkinlik günlüğü</h1>
          <p className="m" style={{ margin: '4px 0 0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={14} /> Yalnız sen görürsün · sayfa kayıtları 90 gün saklanır · içerik görünmez
          </p>
        </div>
        <div className="etk-gun" role="group" aria-label="Gün">
          <button className="btn sm" aria-label="Önceki gün" onClick={() => gunDegis(gunKaydir(gun, -1))}>
            <Icon name="back" size={16} />
          </button>
          <label className="etk-tarih">
            <span className="sr-only">Gün seç</span>
            <input type="date" value={gun} max={bugun} onChange={(e) => e.target.value && gunDegis(e.target.value > bugun ? bugun : e.target.value)} />
          </label>
          <button className="btn sm" aria-label="Sonraki gün" disabled={gun >= bugun} onClick={() => gunDegis(gunKaydir(gun, 1))}>
            <Icon name="right" size={16} />
          </button>
        </div>
      </div>
      <p className="a" style={{ ['--d' as string]: 1, margin: 0, fontWeight: 600 }} data-testid="etk-gun-baslik">
        {gunMetni(gun)}
        {gun === bugun ? ' · bugün' : ''}
      </p>

      {q.isError && <p className="card" style={{ padding: 16, color: 'var(--signal)' }}>Günlük yüklenemedi: {(q.error as Error).message}</p>}

      <div className="etk-sayac a" style={{ ['--d' as string]: 2 }} aria-label="Giriş sayıları">
        {(['hepsi', 'ogretmen', 'veli', 'ogrenci'] as RolSuz[]).map((k) => {
          const s = sayac(k)
          return (
            <div key={k} className="etk-kutu">
              <span className="m">{k === 'hepsi' ? 'Giren' : ROL_SECENEK.find((r) => r[0] === k)![1]}</span>
              <b>
                {q.isLoading ? '…' : s.g}
                <small className="m"> / {q.isLoading ? '…' : s.t}</small>
              </b>
            </div>
          )
        })}
      </div>

      {kayitOncesi && !q.isLoading && (
        <p className="card etk-not" data-testid="etk-kayit-oncesi">
          <Icon name="warn" size={16} />
          <span>
            Sayfa kayıtları {kayitBasi ? `${gunMetni(bugunIst(new Date(d!.kayit_basi!)))} günü` : 'bu özellik yayına girince'} başladı. Bu gün için
            yalnız yapılan işler (ödev, görev, yoklama, mesaj…) görünür; yalnız bakıp çıkanlar görünmez.
          </span>
        </p>
      )}

      <div className="etk-suz a" style={{ ['--d' as string]: 3 }}>
        <label className="field" style={{ flex: '1 1 180px' }}>
          İsim ara
          <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ad soyad" />
        </label>
        <label className="field" style={{ flex: '0 1 170px' }}>
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value as RolSuz)}>
            {ROL_SECENEK.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Liste" style={{ alignSelf: 'flex-end' }}>
          <button aria-pressed={mod === 'giren'} onClick={() => setMod('giren')}>
            Girenler
          </button>
          <button aria-pressed={mod === 'girmeyen'} onClick={() => setMod('girmeyen')}>
            Girmeyenler
          </button>
        </div>
      </div>

      {mod === 'giren' ? (
        <div className="etk-izgara">
          <section className="card etk-liste" aria-label="O gün girenler">
            {q.isLoading ? (
              <p className="m" style={{ padding: 16 }}>Yükleniyor…</p>
            ) : girenler.length ? (
              <ul data-testid="etk-girenler">
                {girenler.map((g) => (
                  <li key={g.id}>
                    <KisiSatiri g={g} secili={g.id === secili} onSec={() => sec(g.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m" style={{ padding: 16 }}>Bu gün için kayıt yok.</p>
            )}
          </section>
          <section ref={detayRef} className="card etk-detay" aria-label="Kişinin günü" data-testid="etk-detay">
            {seciliKisi ? <KisiGunu g={seciliKisi} gun={gun} /> : <p className="m" style={{ margin: 0 }}>Dökümü görmek için listeden birini seç.</p>}
          </section>
        </div>
      ) : (
        <section className="card etk-liste" aria-label="O gün girmeyenler">
          {q.isLoading ? (
            <p className="m" style={{ padding: 16 }}>Yükleniyor…</p>
          ) : girmeyenler.length ? (
            <ul data-testid="etk-girmeyenler">
              {girmeyenler.map((g) => (
                <li key={g.id} className="etk-satir" style={{ cursor: 'default' }}>
                  <span style={{ minWidth: 0 }}>
                    <b>{g.ad}</b>
                    <small className="m">{rolMetni(g.rol, g.brans)}</small>
                  </span>
                  <small className="m" style={{ textAlign: 'right' }}>
                    {g.son_giris
                      ? `Son giriş ${new Date(g.son_giris).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' })}`
                      : 'Hiç girmedi'}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m" style={{ padding: 16 }}>Bu gün herkes girmiş.</p>
          )}
        </section>
      )}
    </>
  )
}

function KisiSatiri({ g, secili, onSec }: { g: Giren; secili: boolean; onSec: () => void }) {
  return (
    <button className="etk-satir press" aria-pressed={secili} onClick={onSec}>
      <span style={{ minWidth: 0 }}>
        <b>{g.ad}</b>
        <small className="m">{rolMetni(g.rol, g.brans)}</small>
      </span>
      <span style={{ textAlign: 'right', display: 'grid', gap: 4, justifyItems: 'end' }}>
        <small>
          {g.cihaz ? `${CIHAZ_TR[g.cihaz]} · ` : ''}
          {saatIst(g.ilk)}–{saatIst(g.son)}
        </small>
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {g.kayitli && <span className="chip n">{g.sayfa} sayfa</span>}
          {g.islem > 0 && <span className="chip up">{g.islem} iş</span>}
        </span>
      </span>
    </button>
  )
}

function KisiGunu({ g, gun }: { g: Giren; gun: string }) {
  const q = useEtkinlikKisi(g.id, gun)
  return (
    <>
      <b style={{ fontSize: 16 }}>{g.ad}</b>
      <p className="m" style={{ margin: '2px 0 10px', fontSize: 13 }}>
        {rolMetni(g.rol, g.brans)} · {gunMetni(gun)}
      </p>
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : q.isError ? (
        <p style={{ color: 'var(--signal)' }}>Döküm yüklenemedi.</p>
      ) : (
        <ol className="etk-akis" data-testid="etk-akis">
          {(q.data ?? []).map((o, i) => {
            const sayfa = o.tur === 'sayfa'
            const giris = o.tur === 'giris'
            return (
              <li key={i} className={sayfa ? 'sayfa' : giris ? 'giris' : 'is'}>
                <time>{saatIst(o.at)}</time>
                <span aria-hidden="true" className="nokta" />
                <span>
                  {giris ? `Uygulamayı açtı${o.cihaz ? ` (${CIHAZ_TR[o.cihaz].toLocaleLowerCase('tr-TR')})` : ''}` : sayfa ? sayfaAdi(o.sayfa, o.ogrenci) : islemMetni(o.tur, o.adet)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="m" style={{ fontSize: 12, margin: '10px 0 0', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        Mesaj, not ve görüşme içerikleri burada görünmez.
      </p>
    </>
  )
}
