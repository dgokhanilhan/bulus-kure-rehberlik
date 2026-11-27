// BK Akıllı Yoklama — akıllı tahta ekranları.
// Akış: (ilk açılış) tahtayı okula bağla → sınıf hazır gelir → gelmeyene dokun → Gönder → kişisel PIN ya da telefonla QR onayı → kaydedildi.
// Bağlantı yoksa yoklama bekletilir (PIN yalnız bellekte), bağlantı gelince kendiliğinden gönderilir.
import { useCallback, useEffect, useRef, useState } from 'react'
import { PinEkrani } from './PinEkrani'
import { QrOnay } from './QrOnay'
import * as S from './lib/sunucu'
import * as M from './lib/masaustu'
import { version as SURUM } from '../src-tauri/tauri.conf.json'
import {
  bekleyenAyikla,
  bekleyenEkle,
  bildirimCumlesi,
  DURUMLAR,
  denetimZamani,
  dokunus,
  ETIKET,
  ISARET,
  istanbul,
  kayitHazirla,
  kodBicimle,
  kodTamam,
  kurulabilir,
  otomatikPencerede,
  saatYaz,
  sayac,
  type Bekleyen,
  type Durum,
  type Ogrenci,
} from './lib/yoklama'

type Basari = Extract<S.GonderSonuc, { ok: true }>
type Ekran =
  | { ad: 'yukleniyor' }
  | { ad: 'kurulum'; mesaj?: string }
  | { ad: 'ana' }
  | { ad: 'sinif' }
  | { ad: 'liste' }
  | { ad: 'bitti'; sonuc: Basari | null; sinifAd: string; bekleyenId?: string }

const PIN_SURE = 15 * 60_000
const YENIDEN_DENE = 20_000
const BITTI_SURE = 60_000
const SON_DENETIM = 'bk-tahta-guncelleme-denetim'
const GUN_ADI = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const kilitSaat = (k: string) => (k === 'infinity' ? null : new Date(k).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }))

export function App() {
  const [ekran, setEkran] = useState<Ekran>({ ad: 'yukleniyor' })
  const [token, setToken] = useState<string | null>(null)
  const [durum, setDurum] = useState<S.TahtaDurum | null>(null)
  const [cevrimici, setCevrimici] = useState(true)
  const [simdi, setSimdi] = useState(() => new Date())
  const [sinif, setSinif] = useState<{ id: string; ad: string } | null>(null)
  const [liste, setListe] = useState<Ogrenci[]>([])
  const [menu, setMenu] = useState<string | null>(null)
  // kayit: PIN ekranı açılırken alınan liste (QR onayı bu listeyi sunucuya bırakır; ekran açıkken değişmez)
  const [pinAcik, setPinAcik] = useState<null | { tur: 'gonder'; kayit: Record<string, Durum> } | { tur: 'bekleyen'; id: string }>(null)
  const [bekleyen, setBekleyen] = useState<Bekleyen[]>(() => M.bekleyenOku<Bekleyen>())
  const [eskimis, setEskimis] = useState<Bekleyen[]>([])
  const [uyari, setUyari] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const pinBellek = useRef<{ pin: string; son: number } | null>(null)
  const bekleyenPin = useRef<Record<string, string>>({})
  const { gun, dakika } = istanbul(simdi)

  // ---------- Açılış ----------
  const yenile = useCallback(async (t: string) => {
    try {
      const d = await S.durumAl(t)
      setDurum(d)
      setCevrimici(true)
      return d
    } catch (e) {
      if (S.baglantiKaldirildi(e)) {
        await M.anahtarSil()
        setToken(null)
        setDurum(null)
        setEkran({ ad: 'kurulum', mesaj: "Bu tahtanın okulla bağlantısı kaldırılmış. İdareden yeni eşleştirme kodu iste." })
      } else if (e instanceof S.BaglantiYok) setCevrimici(false)
      else setUyari((e as Error).message)
      return null
    }
  }, [])

  useEffect(() => {
    void (async () => {
      if ((await M.otomatikMi()) && !otomatikPencerede(istanbul().dakika)) return M.kapat()
      const t = await M.anahtarOku()
      if (!t) return setEkran({ ad: 'kurulum' })
      setToken(t)
      setEkran({ ad: 'ana' })
      await yenile(t)
    })()
  }, [yenile])

  useEffect(() => {
    const i = setInterval(() => setSimdi(new Date()), 15_000)
    return () => clearInterval(i)
  }, [])

  // Eski güne kalan bekleyen yoklama gönderilmez (sunucu "bugün"e yazar); öğretmene söylenir.
  useEffect(() => {
    const { gecerli, eskimis: e } = bekleyenAyikla(bekleyen, gun)
    if (e.length) {
      setEskimis((x) => [...x, ...e])
      setBekleyen(gecerli)
    }
  }, [gun, bekleyen])
  useEffect(() => M.bekleyenYaz(bekleyen), [bekleyen])

  // ---------- Bekleyenleri gönder ----------
  const bekleyenGonder = useCallback(
    async (b: Bekleyen, pin: string): Promise<'tamam' | 'pin' | 'ag' | string> => {
      if (!token) return 'ag'
      try {
        const r = await S.gonder(token, pin, b.sinifId, b.kayit)
        setCevrimici(true)
        if (r.ok) {
          delete bekleyenPin.current[b.id]
          setBekleyen((l) => l.filter((x) => x.id !== b.id))
          void yenile(token)
          return 'tamam'
        }
        delete bekleyenPin.current[b.id]
        return r.hata === 'pin' ? 'pin' : 'Tahta kilitli; daha sonra tekrar dene.'
      } catch (e) {
        if (e instanceof S.BaglantiYok) {
          setCevrimici(false)
          return 'ag'
        }
        delete bekleyenPin.current[b.id]
        setBekleyen((l) => l.filter((x) => x.id !== b.id))
        return `${b.sinifAd} yoklaması gönderilemedi: ${(e as Error).message}`
      }
    },
    [token, yenile],
  )

  useEffect(() => {
    if (!token) return
    const i = setInterval(async () => {
      if (!durum) await yenile(token)
      for (const b of bekleyen) {
        const p = bekleyenPin.current[b.id]
        if (!p) continue
        const r = await bekleyenGonder(b, p)
        if (r !== 'tamam' && r !== 'ag' && r !== 'pin') setUyari(r)
        if (r === 'ag') break
      }
    }, YENIDEN_DENE)
    return () => clearInterval(i)
  }, [token, durum, bekleyen, bekleyenGonder, yenile])

  // Kaydedildi ekranı 60 sn sonra kendini temizler (öğrenci listesi tahtada açık kalmaz).
  useEffect(() => {
    if (ekran.ad !== 'bitti') return
    const z = setTimeout(anaya, BITTI_SURE)
    return () => clearTimeout(z)
  }, [ekran])

  function anaya() {
    setListe([])
    setSinif(null)
    setMenu(null)
    setEkran({ ad: 'ana' })
  }

  // ---------- Otomatik güncelleme ----------
  // Açılışta ve günde bir kez sessizce bakılır; yeni sürüm arka planda indirilir. Kurulum yalnız program boştayken
  // (ana ekran, 1 dk dokunulmamış, PIN/QR ekranı kapalı, gönderim ve bekleyen yoklama yok) yapılır.
  // İnternet yoksa ya da kontrol başarısızsa hiçbir şey gösterilmez.
  const [yeniSurum, setYeniSurum] = useState<string | null>(null)
  const [kuruluyor, setKuruluyor] = useState(false)
  const sonEtkilesim = useRef(Date.now())
  useEffect(() => {
    if (!M.masaustunde) return
    let ilk = true
    const bak = async () => {
      let son: number | null = null
      try {
        son = Number(localStorage.getItem(SON_DENETIM)) || null
      } catch {
        /* depo kapalı */
      }
      if (!ilk && !denetimZamani(son, Date.now())) return
      ilk = false
      try {
        const v = await M.guncellemeHazirla()
        try {
          localStorage.setItem(SON_DENETIM, String(Date.now()))
        } catch {
          /* depo kapalı */
        }
        if (v) setYeniSurum(v)
      } catch {
        /* sessiz: bir saat sonra yeniden denenir */
      }
    }
    void bak()
    const i = setInterval(bak, 60 * 60_000)
    return () => clearInterval(i)
  }, [])
  useEffect(() => {
    const dokundu = () => {
      sonEtkilesim.current = Date.now()
    }
    window.addEventListener('pointerdown', dokundu, true)
    window.addEventListener('keydown', dokundu, true)
    return () => {
      window.removeEventListener('pointerdown', dokundu, true)
      window.removeEventListener('keydown', dokundu, true)
    }
  }, [])

  // ---------- Kurulum ----------
  const [kod, setKod] = useState('')
  async function bagla() {
    setMesgul(true)
    setUyari('')
    try {
      const r = await S.eslestir(kod)
      await M.anahtarYaz(r.token)
      await M.acilistaBaslat()
      setToken(r.token)
      setKod('')
      setEkran({ ad: 'ana' })
      await yenile(r.token)
    } catch (e) {
      setUyari(e instanceof S.BaglantiYok ? 'İnternet bağlantısı yok. Bağlantıyı kontrol edip tekrar dene.' : (e as Error).message)
    } finally {
      setMesgul(false)
    }
  }
  const [baglantiSor, setBaglantiSor] = useState(false)

  const bos = ekran.ad === 'ana' && !pinAcik && !mesgul && !baglantiSor && bekleyen.length === 0
  useEffect(() => {
    if (!yeniSurum || !bos || kuruluyor) return
    sonEtkilesim.current = Date.now()
    const i = setInterval(() => {
      if (!kurulabilir(true, sonEtkilesim.current, Date.now())) return
      clearInterval(i)
      setKuruluyor(true)
      // Mesaj görünsün diye kısa bekleme; kurulum programı bu programı kapatıp yeni sürümü açar.
      setTimeout(() => {
        M.guncellemeKur().catch(() => {
          setKuruluyor(false)
          setYeniSurum(null)
        })
      }, 2000)
    }, 5000)
    return () => clearInterval(i)
  }, [yeniSurum, bos, kuruluyor])
  async function baglantiyiDegistir() {
    await M.anahtarSil()
    setToken(null)
    setDurum(null)
    setBaglantiSor(false)
    setEkran({ ad: 'kurulum' })
  }

  // ---------- Liste ----------
  async function listeAc(id: string) {
    if (!token) return
    setMesgul(true)
    setUyari('')
    try {
      const l = await S.listeAl(token, id)
      setSinif(l.sinif)
      setListe(l.ogrenciler)
      setMenu(null)
      setEkran({ ad: 'liste' })
    } catch (e) {
      if (S.baglantiKaldirildi(e)) return void yenile(token)
      setUyari(e instanceof S.BaglantiYok ? 'İnternet bağlantısı yok; liste yüklenemedi. Bağlantı gelince tekrar dene.' : (e as Error).message)
      if (e instanceof S.BaglantiYok) setCevrimici(false)
    } finally {
      setMesgul(false)
    }
  }
  const isaretle = (id: string, d: Durum) => setListe((l) => l.map((o) => (o.id === id && !o.kilitli ? { ...o, durum: d } : o)))

  function gonderBas() {
    const p = pinBellek.current
    if (p && p.son > Date.now()) return void pinIle(p.pin, true)
    setPinAcik({ tur: 'gonder', kayit: kayitHazirla(liste) })
  }

  /** Listeyi PIN'le gönderir. Hata metni dönerse PIN ekranı yeniden sorar. */
  async function pinIle(pin: string, bellekten = false): Promise<string | null> {
    if (!token || !sinif) return null
    const kayit = kayitHazirla(liste)
    try {
      const r = await S.gonder(token, pin, sinif.id, kayit)
      setCevrimici(true)
      if (!r.ok) {
        pinBellek.current = null
        if (bellekten) setPinAcik({ tur: 'gonder', kayit })
        if (r.hata === 'pin') return `PIN eşleşmedi. ${r.kalan} hakkın kaldı.`
        const s = kilitSaat(r.kilit)
        return s ? `Çok sayıda yanlış PIN girildi. Tahta ${s}'e kadar kilitli; idareye haber verildi.` : 'Bu tahta kilitlendi. İdarenin kilidi açması gerekiyor.'
      }
      pinBellek.current = { pin, son: Date.now() + PIN_SURE }
      setPinAcik(null)
      setEkran({ ad: 'bitti', sonuc: r, sinifAd: sinif.ad })
      void yenile(token)
      return null
    } catch (e) {
      if (e instanceof S.BaglantiYok) {
        const b: Bekleyen = { id: crypto.randomUUID(), gun, sinifId: sinif.id, sinifAd: sinif.ad, dakika, kayit }
        setBekleyen((l) => bekleyenEkle(l, b))
        bekleyenPin.current[b.id] = pin
        setCevrimici(false)
        setPinAcik(null)
        setEkran({ ad: 'bitti', sonuc: null, sinifAd: sinif.ad, bekleyenId: b.id })
        return null
      }
      if (S.baglantiKaldirildi(e)) {
        setPinAcik(null)
        void yenile(token)
        return null
      }
      if (e instanceof S.SunucuHatasi && e.kod === '22023') {
        setPinAcik(null)
        setUyari(`${e.message} Liste yenilendi; işaretlerini kontrol et.`)
        void listeAc(sinif.id)
        return null
      }
      return (e as Error).message
    }
  }

  async function bekleyenPinIle(id: string, pin: string): Promise<string | null> {
    const b = bekleyen.find((x) => x.id === id)
    if (!b) return null
    const r = await bekleyenGonder(b, pin)
    if (r === 'tamam') {
      setPinAcik(null)
      setUyari(`${b.sinifAd} yoklaması gönderildi.`)
      return null
    }
    if (r === 'pin') return 'PIN eşleşmedi.'
    if (r === 'ag') {
      bekleyenPin.current[id] = pin
      setPinAcik(null)
      return null
    }
    setPinAcik(null)
    setUyari(r)
    return null
  }

  /** Telefonla QR onayı geldi: sunucu yoklamayı işledi. */
  function qrOnaylandi(r: Basari) {
    if (!sinif || !token) return
    setCevrimici(true)
    setPinAcik(null)
    setEkran({ ad: 'bitti', sonuc: r, sinifAd: sinif.ad })
    void yenile(token)
  }
  function bekleyenQrOnaylandi(id: string) {
    const b = bekleyen.find((x) => x.id === id)
    delete bekleyenPin.current[id]
    setBekleyen((l) => l.filter((x) => x.id !== id))
    setPinAcik(null)
    if (b) setUyari(`${b.sinifAd} yoklaması telefondan onaylanıp gönderildi.`)
    if (token) void yenile(token)
  }
  function qrHata(e: S.SunucuHatasi, sinifId: string | null) {
    setPinAcik(null)
    if (S.baglantiKaldirildi(e)) return void (token && yenile(token))
    if (e.kod === '22023' && sinifId) {
      setUyari(`${e.message} Liste yenilendi; işaretlerini kontrol et.`)
      return void listeAc(sinifId)
    }
    setUyari(e.message)
  }

  // ---------- Görünüm ----------
  const kendiSinif = durum?.siniflar.find((c) => c.id === durum.tahta.sinif_id) ?? null
  const pinsizBekleyen = bekleyen.filter((b) => !bekleyenPin.current[b.id])
  const c = sayac(liste)
  const gecGonderildi = ekran.ad === 'bitti' && !!ekran.bekleyenId && !bekleyen.some((b) => b.id === ekran.bekleyenId)

  return (
    <div className="uygulama">
      <header className="ust">
        <span className="baslik">BK Akıllı Yoklama</span>
        <span className="bilgi">
          <span>
            <i className={`nokta ${cevrimici ? 'acik' : 'kapali'}`} aria-hidden="true" />
            {cevrimici ? 'İnternet bağlı' : 'Bağlantı yok'}
          </span>
          {durum && (
            <span>
              Bu tahta: <b>{durum.tahta.ad}</b>
            </span>
          )}
          <span className="sayi">{saatYaz(dakika)}</span>
        </span>
      </header>

      {(uyari || eskimis.length > 0 || bekleyen.length > 0) && (
        <div className="seritler">
          {uyari && (
            <div className="serit" role="status">
              <span>{uyari}</span>
              <button className="bag" onClick={() => setUyari('')}>
                Tamam
              </button>
            </div>
          )}
          {eskimis.map((b) => (
            <div key={b.id} className="serit dikkat" role="alert">
              <span>
                ↓ {b.sinifAd} için {b.gun.split('-').reverse().join('.')} {saatYaz(b.dakika)} yoklaması gönderilemedi. İdareye bildir; siteden girilmesi gerekiyor.
              </span>
              <button className="bag" onClick={() => setEskimis((l) => l.filter((x) => x.id !== b.id))}>
                Tamam
              </button>
            </div>
          ))}
          {bekleyen.map((b) => (
            <div key={b.id} className="serit dikkat" role="status">
              <span>
                {b.sinifAd} yoklaması ({saatYaz(b.dakika)}) bu tahtada bekliyor.{' '}
                {bekleyenPin.current[b.id] ? 'Bağlantı gelince kendiliğinden gönderilecek.' : "Göndermek için PIN'ini gir."}
              </span>
              {pinsizBekleyen.some((x) => x.id === b.id) && (
                <button className="bag" onClick={() => setPinAcik({ tur: 'bekleyen', id: b.id })}>
                  PIN gir ve gönder
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <main className="govde">
        {ekran.ad === 'yukleniyor' && <p className="soluk ortala">Açılıyor…</p>}

        {ekran.ad === 'kurulum' && (
          <section className="orta" aria-labelledby="kurulum-baslik">
            <div className="kurulum">
              <h1 id="kurulum-baslik">Bu tahtayı okula bağla</h1>
              {ekran.mesaj && <p className="serit dikkat">{ekran.mesaj}</p>}
              <p className="soluk">
                İdare, buluskurementor.com'da <b>Yönetim → Yoklama ayarları → Akıllı tahtalar</b>'dan bu sınıf için bir eşleştirme kodu alır. Kodu buraya yaz. Bu bir kez yapılır.
              </p>
              <label className="alan" htmlFor="kod">
                Eşleştirme kodu
                <input
                  id="kod"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="XXXX-XXXX"
                  value={kod}
                  onChange={(e) => setKod(kodBicimle(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && kodTamam(kod) && !mesgul && bagla()}
                />
              </label>
              <button className="buyuk" disabled={!kodTamam(kod) || mesgul} onClick={bagla}>
                {mesgul ? 'Bağlanıyor…' : 'Bağla'}
              </button>
              <p className="soluk kucuk sayi">Sürüm {SURUM}</p>
            </div>
          </section>
        )}

        {ekran.ad === 'ana' && (
          <section className="orta" aria-label="Başlangıç">
            <div className="karsilama">
              <span className="etiket">{GUN_ADI.format(simdi)}</span>
              <div className="saat">{saatYaz(dakika)}</div>
              {!durum ? (
                <p className="soluk">{cevrimici ? 'Sınıf bilgisi yükleniyor…' : 'İnternet bağlantısı yok. Bağlantı gelince sınıf listesi kendiliğinden yüklenecek.'}</p>
              ) : (
                <>
                  <div className="selam">Günaydın, yoklama zamanı.</div>
                  {durum.kilit && (
                    <p className="cip asagi">
                      ↓ Çok sayıda yanlış PIN girildi.{' '}
                      {kilitSaat(durum.kilit) ? `Tahta ${kilitSaat(durum.kilit)}'e kadar kilitli.` : 'İdarenin kilidi açması gerekiyor.'}
                    </p>
                  )}
                  {kendiSinif?.alindi ? (
                    <span className="cip yukari">
                      ✓ {kendiSinif.ad} yoklaması alındı · {kendiSinif.alindi.saat} · {kendiSinif.alindi.kim ?? '—'}
                    </span>
                  ) : kendiSinif && dakika > 9 * 60 + 40 ? (
                    <span className="cip asagi">↓ {kendiSinif.ad} yoklaması henüz alınmadı</span>
                  ) : null}
                  {kendiSinif && (
                    <button className="buyuk genis" disabled={mesgul} onClick={() => listeAc(kendiSinif.id)}>
                      {kendiSinif.alindi ? `${kendiSinif.ad} yoklamasını düzelt` : `${kendiSinif.ad} yoklamasını al`}
                    </button>
                  )}
                  {durum.siniflar.length > 1 && (
                    <button className="bag" onClick={() => setEkran({ ad: 'sinif' })}>
                      Başka sınıf seç
                    </button>
                  )}
                </>
              )}
            </div>
            <footer className="alt">
              <span>
                {durum && <>{durum.okul} · </>}
                <span className="sayi">Sürüm {SURUM}</span>
              </span>
              {baglantiSor ? (
                <span>
                  Bu tahtanın okulla bağlantısı silinsin mi? Yeniden bağlamak için idareden kod gerekir.{' '}
                  <button className="bag" onClick={baglantiyiDegistir}>
                    Evet, sil
                  </button>{' '}
                  <button className="bag" onClick={() => setBaglantiSor(false)}>
                    Vazgeç
                  </button>
                </span>
              ) : (
                <button className="bag kucuk" onClick={() => setBaglantiSor(true)}>
                  Bağlantıyı değiştir
                </button>
              )}
            </footer>
          </section>
        )}

        {ekran.ad === 'sinif' && durum && (
          <section aria-labelledby="sinif-baslik" className="yigin">
            <div className="liste-ust">
              <h1 id="sinif-baslik">Hangi sınıfın yoklamasını alıyorsun?</h1>
              <button className="bag sag" onClick={anaya}>
                Geri
              </button>
            </div>
            <div className="siniflar">
              {durum.siniflar.map((s) => (
                <button key={s.id} className={`sinif-kart ${s.id === durum.tahta.sinif_id ? 'bu' : ''}`} onClick={() => listeAc(s.id)} disabled={mesgul}>
                  <b>{s.ad}</b>
                  <span className="soluk">{s.id === durum.tahta.sinif_id ? 'bu tahta' : ' '}</span>
                  {s.alindi ? (
                    <span className="cip yukari">
                      ✓ Alındı {s.alindi.saat} · {s.alindi.kim ?? '—'}
                    </span>
                  ) : (
                    <span className="cip">Henüz alınmadı</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {ekran.ad === 'liste' && sinif && (
          <section aria-labelledby="liste-baslik" className="yigin dolu">
            <div className="liste-ust">
              <h1 id="liste-baslik">
                {sinif.ad} · {liste.length} öğrenci
              </h1>
              <span className="soluk">Gelmeyen öğrenciye dokun. Diğer durumlar için ⋯</span>
              <button className="ince sag" onClick={() => setListe((l) => l.map((o) => (o.kilitli ? o : { ...o, durum: 'geldi' })))}>
                Hepsi geldi
              </button>
              <button className="bag" onClick={anaya}>
                Vazgeç
              </button>
            </div>
            {liste.length === 0 ? (
              <p className="soluk">Bu sınıfta kayıtlı öğrenci yok.</p>
            ) : (
              <ul className="ogrenciler">
                {liste.map((o) => (
                  <li key={o.id} className="ogr-kap">
                    <button
                      className={`ogr d-${o.durum}`}
                      aria-disabled={o.kilitli}
                      aria-label={`${o.ad}: ${ETIKET[o.durum]}${o.kilitli ? ', idare girdi' : ''}`}
                      onClick={() => !o.kilitli && isaretle(o.id, dokunus(o.durum))}
                    >
                      <span className="ad">{o.ad}</span>
                      <span className="no">{o.no ?? ''}</span>
                      <span className="durum">
                        {ISARET[o.durum]} {ETIKET[o.durum]}
                        {o.kilitli ? ' · idare girdi' : ''}
                      </span>
                    </button>
                    {!o.kilitli && (
                      <button className="diger" aria-label={`${o.ad} için diğer durumlar`} aria-expanded={menu === o.id} onClick={() => setMenu(menu === o.id ? null : o.id)}>
                        ⋯
                      </button>
                    )}
                    {menu === o.id && (
                      <div className="menu" role="menu">
                        {DURUMLAR.map((d) => (
                          <button
                            key={d}
                            role="menuitem"
                            onClick={() => {
                              isaretle(o.id, d)
                              setMenu(null)
                            }}
                          >
                            {ISARET[d]} {ETIKET[d]}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="liste-alt">
              <div className="cipler">
                {DURUMLAR.filter((d) => c[d]).map((d) => (
                  <span key={d} className={`cip ${d === 'geldi' ? 'yukari' : d === 'devamsiz' ? 'asagi' : ''}`}>
                    {ETIKET[d]} {c[d]}
                  </span>
                ))}
              </div>
              <button className="buyuk sag" onClick={gonderBas} disabled={liste.length === 0}>
                Yoklamayı gönder
              </button>
            </div>
          </section>
        )}

        {ekran.ad === 'bitti' && (
          <section className="orta" aria-labelledby="bitti-baslik">
            <div className="karsilama">
              <div className={`halka ${ekran.sonuc || gecGonderildi ? '' : 'bekle'}`} aria-hidden="true">
                {ekran.sonuc || gecGonderildi ? '✓' : '◷'}
              </div>
              <h1 id="bitti-baslik">
                {ekran.sonuc ? `${ekran.sinifAd} yoklaması kaydedildi` : gecGonderildi ? `${ekran.sinifAd} yoklaması gönderildi` : `${ekran.sinifAd} yoklaması bekliyor`}
              </h1>
              {gecGonderildi ? (
                <p className="kutu">Bağlantı geldi; bekleyen yoklama buluskurementor.com'a işlendi.</p>
              ) : ekran.sonuc ? (
                <>
                  <p className="soluk">
                    {ekran.sonuc.saat} · {ekran.sonuc.ogretmen} · buluskurementor.com'a işlendi
                  </p>
                  <p className="kutu">{bildirimCumlesi(ekran.sonuc.bildirim_saati, ekran.sonuc.bekliyor, ekran.sonuc.bildirilecek)}</p>
                </>
              ) : (
                <p className="kutu">İnternet bağlantısı yok. Yoklama bu tahtada bekliyor; bağlantı gelince kendiliğinden gönderilecek. Programı kapatmazsan PIN tekrar sorulmaz.</p>
              )}
              <div className="sira">
                {ekran.sonuc && sinif && (
                  <button className="ince" onClick={() => listeAc(sinif.id)}>
                    Düzelt
                  </button>
                )}
                {durum && durum.siniflar.length > 1 && (
                  <button className="ince" onClick={() => setEkran({ ad: 'sinif' })}>
                    Başka sınıf
                  </button>
                )}
                <button className="buyuk" onClick={anaya}>
                  Bitti
                </button>
              </div>
              <p className="soluk kucuk">Bu ekran 1 dakika sonra kendiliğinden kapanır; öğrenci listesi tahtada açık kalmaz.</p>
            </div>
          </section>
        )}
      </main>

      {kuruluyor && (
        <div className="perde" role="alertdialog" aria-modal="true" aria-labelledby="guncelleme-baslik">
          <div className="kurulum ortala">
            <h2 id="guncelleme-baslik">Yeni sürüm kuruluyor</h2>
            <p className="soluk">
              BK Yoklama {yeniSurum} sürümüne geçiyor. Program birkaç saniye içinde kendiliğinden yeniden açılacak; bir şey yapman gerekmiyor.
            </p>
          </div>
        </div>
      )}

      {pinAcik?.tur === 'gonder' && sinif && (
        <PinEkrani
          baslik={`${sinif.ad} yoklamasını gönder`}
          onPin={(p) => pinIle(p)}
          onKapat={() => setPinAcik(null)}
          yan={token && <QrOnay token={token} sinifId={sinif.id} kayit={pinAcik.kayit} onOnay={qrOnaylandi} onHata={(e) => qrHata(e, sinif.id)} />}
        />
      )}
      {pinAcik?.tur === 'bekleyen' && (
        <PinEkrani
          baslik="Bekleyen yoklamayı gönder"
          aciklama="Program kapanıp açıldığı için PIN'in tekrar gerekiyor."
          onPin={(p) => bekleyenPinIle(pinAcik.id, p)}
          onKapat={() => setPinAcik(null)}
          yan={(() => {
            const b = bekleyen.find((x) => x.id === pinAcik.id)
            return token && b ? <QrOnay token={token} sinifId={b.sinifId} kayit={b.kayit} onOnay={() => bekleyenQrOnaylandi(b.id)} onHata={(e) => qrHata(e, null)} /> : null
          })()}
        />
      )}
    </div>
  )
}
