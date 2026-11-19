// Günün Sudokusu: bulmaca, doğrulama ve süre sunucuda. Girilen rakamlar ve kalem notları cihazda saklanır (sayfa
// yenilenince kaybolmaz). Profesyonel oyun özellikleri: kalem notu, geri al, kalan rakam sayısı, aynı rakamı /
// satır-sütun-kutuyu vurgulama, çakışma uyarısı, rakam girince ilgili hücrelerdeki notların silinmesi, klavye.
// İpucu (0084): günde 3; sunucudan tek hücre gelir; her biri bitişte +30 sn (sayaca eklenmez, sonuçta parantezle görünür).
// Hile önlemleri (0084): her rakamın girildiği an ve sekmeden ayrılma sayısı bitişte sunucuya gider; alt süre ya da
// hamle ritmi tutmazsa çözüm kaydedilir ama yalnız o günün Sudoku sonucu lige girmez.
// Ayrılma sınırı (0088): sayfadan en fazla 5 kez ayrılınabilir; 6.'da o günün Sudokusu sona erer (sunucu kapatır).
// Kurallar penceresi ilk açılışta bir kez, oyun açılmadan çıkar; süre "Tamam"dan sonra başlar.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ipucuCezaYaz, SUDOKU_IPUCU_CEZA, SUDOKU_IPUCU_HAK, sudokuCakisma, sudokuDolu, sureYaz } from '@/lib/oyunlar'
import {
  useSudoku,
  useSudokuBitir,
  useSudokuIpucu,
  useSudokuKural,
  useSudokuKuralOnayla,
  useSudokuSekme,
  type SudokuKural,
  type SudokuSonuc,
} from '@/lib/oyunData'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'

const sureMetni = (sn: number) => (sn % 60 === 0 ? `${sn / 60} dakikadan` : `${sn} saniyeden`)
function KuralListesi({ k }: { k: SudokuKural }) {
  const kisa = k.alt_sure > 0 ? `${sureMetni(k.alt_sure)} kısa çözümler` : ''
  const ritim = k.ritim < 100 ? 'rakamların çoğu son dakikada girilen çözümler' : ''
  return (
    <ul className="sd-kural-liste">
      <li>Bütün okul aynı bulmacayı çözer. Süre bulmacayı ilk açtığında başlar ve sunucuda ölçülür.</li>
      <li>
        Günde {SUDOKU_IPUCU_HAK} ipucu hakkın var; her ipucu bitiş süresine {SUDOKU_IPUCU_CEZA} sn ekler.
      </li>
      {(kisa || ritim) && (
        <li>{`${[kisa, ritim].filter(Boolean).join(' ve ')} skor tablosuna ve lige girmez.`.replace(/^./, (c) => c.toLocaleUpperCase('tr'))}</li>
      )}
      {k.sinir != null && (
        <li>
          <b>Sayfadan en fazla {k.sinir} kez ayrılabilirsin</b> (başka sekmeye ya da uygulamaya geçmek, ekranı kilitlemek). {k.sinir + 1}. ayrılışta bugünkü
          Sudoku sona erer ve skor tablosuna girmez.
        </li>
      )}
      <li>Bu kurallar yalnız Sudoku içindir; diğer oyunlardaki puanların etkilenmez.</li>
    </ul>
  )
}

function oku(k: string): number[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as unknown
    return Array.isArray(v) && v.length === 81 ? (v as number[]) : null
  } catch {
    return null
  }
}
function notOku(k: string): number[][] {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as unknown
    if (Array.isArray(v) && v.length === 81) return v.map((x) => (Array.isArray(x) ? x.filter((n) => Number.isInteger(n) && n >= 1 && n <= 9) : []))
  } catch {
    /* bozuk kayıt */
  }
  return Array.from({ length: 81 }, () => [])
}
function sayiOku(k: string): number {
  try {
    const v = Number(localStorage.getItem(k) ?? 0)
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch {
    return 0
  }
}
function sakla(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* depolama kapalı */
  }
}
const satirOf = (i: number) => Math.floor(i / 9)
const sutunOf = (i: number) => i % 9
const kutuOf = (i: number) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)
const akraba = (a: number, b: number) => satirOf(a) === satirOf(b) || sutunOf(a) === sutunOf(b) || kutuOf(a) === kutuOf(b)
const bosZaman = () => Array(81).fill(0) as number[]

type Adim = { giris: number[]; notlar: number[][]; zaman: number[] }

export function ligDisiMetni(neden: SudokuSonuc['neden']) {
  if (neden === 'sekme')
    return 'Bugünkü Sudoku sona erdi. Sayfadan izin verilenden fazla ayrıldığın için bu oyun kabul edilmedi; skor tablosuna ve lige girmez. Diğer oyunlardaki puanların aynen duruyor. Yarın yeni bulmaca seni bekliyor.'
  return neden === 'ritim'
    ? 'Rakamların çoğu son dakikada girildiği için bu çözüm bugünkü skor tablosuna ve lige eklenmedi. Diğer oyunların puanları aynen sayılır.'
    : 'Çözüm süresi lig sınırının altında kaldığı için bu çözüm bugünkü skor tablosuna ve lige eklenmedi. Diğer oyunların puanları aynen sayılır.'
}

export default function Sudoku() {
  const kural = useSudokuKural()
  const onayla = useSudokuKuralOnayla()
  // Kurallar onaylanmadan oyun açılmaz (süre başlamaz); kural bilgisi alınamazsa oyun eskisi gibi açılır
  const onayGerek = !!kural.data && kural.data.sinir != null && !kural.data.onay
  const q = useSudoku(kural.isError || (!!kural.data && !onayGerek))
  const bitir = useSudokuBitir()
  const ipucuAl = useSudokuIpucu()
  const sekmeBildir = useSudokuSekme()
  const toast = useToast()
  const d = q.data
  const anahtar = d ? `oda.sudoku.${d.gun}` : ''
  const notAnahtar = d ? `oda.sudoku.${d.gun}.not` : ''
  const zamanAnahtar = d ? `oda.sudoku.${d.gun}.zaman` : ''
  const sekmeAnahtar = d ? `oda.sudoku.${d.gun}.sekme` : ''
  const [giris, setGiris] = useState<number[] | null>(null)
  const [notlar, setNotlar] = useState<number[][]>(() => Array.from({ length: 81 }, () => []))
  const [zaman, setZaman] = useState<number[]>(bosZaman)
  const [kalem, setKalem] = useState(false)
  const [gecmis, setGecmis] = useState<Adim[]>([])
  const [sec, setSec] = useState<number | null>(null)
  const [simdi, setSimdi] = useState(Date.now())
  const [sonuc, setSonuc] = useState<SudokuSonuc | null>(null)
  const denendi = useRef('')

  useEffect(() => {
    if (d && !giris) {
      setGiris(d.cozum ?? oku(anahtar) ?? d.ipucu)
      setNotlar(notOku(notAnahtar))
      setZaman(oku(zamanAnahtar) ?? bosZaman())
    }
  }, [d, giris, anahtar, notAnahtar, zamanAnahtar])
  useEffect(() => {
    if (!d || d.bitti || d.sona_erdi) return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [d])
  // Sayfadan ayrılma sayısı: cihazda sayılır; sınırlı günlerde her ayrılışta ve dönüşte sunucuya bildirilir
  // (sayfa gizlenirken istek gitmeyebilir, dönüşte yeniden gönderilir). Sunucu en yüksek değeri tutar.
  const [ayrilma, setAyrilma] = useState(0)
  const sinirli = !!d && d.sinir != null && !d.bitti && !d.sona_erdi
  const bildir = sekmeBildir.mutate
  useEffect(() => {
    if (sekmeAnahtar) setAyrilma(sayiOku(sekmeAnahtar))
  }, [sekmeAnahtar])
  useEffect(() => {
    if (!d || d.bitti || d.sona_erdi || !sekmeAnahtar) return
    const f = () => {
      if (document.visibilityState === 'hidden') {
        const n = sayiOku(sekmeAnahtar) + 1
        sakla(sekmeAnahtar, n)
        setAyrilma(n)
        if (sinirli) bildir(n)
      } else if (sinirli) bildir(sayiOku(sekmeAnahtar))
    }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [d, sekmeAnahtar, sinirli, bildir])

  // Alınan ipuçları tahtada sabit
  const alinan = useMemo(() => new Map((d?.ipuclari ?? []).map((x) => [x.i, x.v])), [d?.ipuclari])
  const a = useMemo(() => {
    const b = [...(giris ?? d?.ipucu ?? [])]
    for (const [i, v] of alinan) b[i] = v
    return b
  }, [giris, d?.ipucu, alinan])
  const cakisma = useMemo(() => sudokuCakisma(a), [a])
  const sayac = useMemo(() => {
    const s = Array(10).fill(0) as number[]
    for (const v of a) if (v) s[v]!++
    return s
  }, [a])
  // Sona eren oyun (0088) bitmiş gibi kilitlenir ama çözüm gösterilmez
  const bitti = !!d?.bitti || !!d?.sona_erdi
  const kilit = (i: number) => !d || d.ipucu[i]! > 0 || alinan.has(i)

  const kaydet = (yeniGiris: number[], yeniNot: number[][], yeniZaman: number[]) => {
    setGecmis((g) => [...g.slice(-99), { giris: a, notlar, zaman }])
    setGiris(yeniGiris)
    setNotlar(yeniNot)
    setZaman(yeniZaman)
    sakla(anahtar, yeniGiris)
    sakla(notAnahtar, yeniNot)
    sakla(zamanAnahtar, yeniZaman)
  }
  const yaz = (i: number, v: number) => {
    if (!d || bitti || kilit(i)) return
    if (kalem && v) {
      if (a[i]) return toast('Önce hücredeki rakamı sil', 'warn')
      const n = notlar.map((x) => [...x])
      n[i] = n[i]!.includes(v) ? n[i]!.filter((x) => x !== v) : [...n[i]!, v].sort()
      return kaydet(a, n, zaman)
    }
    if (a[i] === v && v) v = 0 // aynı rakama tekrar basmak siler
    const yeni = [...a]
    yeni[i] = v
    const n = notlar.map((x, k) => (k === i && v ? [] : v && akraba(k, i) ? x.filter((y) => y !== v) : x))
    if (!v && !a[i] && notlar[i]!.length) n[i] = [] // boş hücrede Sil: notları temizler
    const z = [...zaman]
    z[i] = v ? Math.max(1, Date.now() - new Date(d.basladi).getTime()) : 0
    kaydet(yeni, n, z)
  }
  const geriAl = () => {
    // İpucuyla gelen hücre geri alınmaz (sunucuda kayıtlı)
    const son = gecmis.at(-1)
    if (!son || bitti) return
    setGecmis((g) => g.slice(0, -1))
    setGiris(son.giris)
    setNotlar(son.notlar)
    setZaman(son.zaman)
    sakla(anahtar, son.giris)
    sakla(notAnahtar, son.notlar)
    sakla(zamanAnahtar, son.zaman)
  }
  const hak = d?.ipucu_hak ?? SUDOKU_IPUCU_HAK
  const ipucuIste = () => {
    if (!d || bitti || hak <= 0 || ipucuAl.isPending) return
    ipucuAl.mutate(
      { hucre: sec != null && !kilit(sec) ? sec : null, giris: a },
      {
        onSuccess: (r) => {
          const yeni = [...a]
          yeni[r.hucre] = r.deger
          const n = notlar.map((x, k) => (k === r.hucre ? [] : akraba(k, r.hucre) ? x.filter((y) => y !== r.deger) : x))
          const z = [...zaman]
          z[r.hucre] = 0
          setGiris(yeni)
          setNotlar(n)
          setZaman(z)
          sakla(anahtar, yeni)
          sakla(notAnahtar, n)
          sakla(zamanAnahtar, z)
          setGecmis([]) // ipucundan önceki adımlara dönülmez
          setSec(r.hucre)
          toast(`İpucu: ${r.deger}. Bitişte +${SUDOKU_IPUCU_CEZA} sn eklenecek · ${r.ipucu_hak} hakkın kaldı`)
        },
        onError: (e) => toast((e as Error).message, 'warn'),
      },
    )
  }

  // Tahta dolu ve çakışma yoksa sunucuya gönder (aynı tahtayı iki kez gönderme)
  useEffect(() => {
    if (!d || bitti || !sudokuDolu(a) || cakisma.size) return
    const imza = a.join('')
    if (denendi.current === imza) return
    denendi.current = imza
    bitir.mutate(
      { p: a, hamle: zaman, sekme: sayiOku(sekmeAnahtar) },
      {
        onSuccess: (r) => {
          if (r.sona_erdi) return void q.refetch()
          if (!r.dogru) return toast('Henüz değil: ipuçlarıyla uyuşmayan bir yer var', 'warn')
          setSonuc(r)
          if (r.lig_disi) toast(ligDisiMetni(r.neden), 'warn')
          else toast(`Tebrikler! ${sureYaz(r.ham ?? r.puan ?? 0)}${r.ipucu ? ` (${ipucuCezaYaz(r.ipucu)} ipucu)` : ''}`)
        },
        onError: (e) => toast((e as Error).message, 'warn'),
      },
    )
  }, [a, cakisma, d, bitti, bitir, toast, zaman, sekmeAnahtar])

  const tamam = () => {
    if (!onayla.isPending) onayla.mutate(undefined, { onError: (e) => toast((e as Error).message, 'warn') })
  }
  if (onayGerek && kural.data) {
    return (
      <>
        <p className="m">Kuralları okuyup “Tamam”a bastığında bulmaca açılır ve süre başlar.</p>
        <Modal
          title="🧩 Sudoku kuralları"
          width={440}
          onClose={tamam}
          footer={
            <button type="button" className="btn pri sd-tamam" onClick={tamam} disabled={onayla.isPending}>
              Tamam
            </button>
          }
        >
          <KuralListesi k={kural.data} />
          <p className="m" style={{ margin: 0, fontSize: 13 }}>
            Kuralları istediğin zaman sayfanın en altında da bulabilirsin.
          </p>
        </Modal>
      </>
    )
  }
  if (kural.isLoading || q.isLoading || (!d && q.isFetching)) return <p className="m">Bulmaca hazırlanıyor…</p>
  if (q.isError || !d) return <div className="empty">Bulmaca açılamadı. Sayfayı yenile.</div>

  const sonaErdi = !!d.sona_erdi
  const ayrilan = Math.max(ayrilma, d.sekme ?? 0)
  const alinanSayi = d.ipuclari?.length ?? 0
  // Sayaç cezasız akar; bitince çözüm süresi + parantezde ipucu cezası
  const ham = bitti ? Math.max(0, (d.puan ?? 0) - alinanSayi * SUDOKU_IPUCU_CEZA) : Math.max(0, Math.floor((simdi - new Date(d.basladi).getTime()) / 1000))
  const ligDisi = bitti && (d.lig_disi || sonuc?.lig_disi)
  const bos = a.filter((v) => !v).length
  const tus = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') return (e.preventDefault(), geriAl())
    if (e.key === 'n' || e.key === 'N') return (e.preventDefault(), setKalem((k) => !k))
    if (sec == null) return
    if (/^[1-9]$/.test(e.key)) return (e.preventDefault(), yaz(sec, Number(e.key)))
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return (e.preventDefault(), yaz(sec, 0))
    const yon: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }
    if (yon[e.key] != null) {
      e.preventDefault()
      const n = sec + yon[e.key]!
      if (n >= 0 && n < 81) {
        setSec(n)
        document.getElementById(`sd-${n}`)?.focus()
      }
    }
  }
  const secDeger = sec != null ? a[sec] : 0
  const kilitli = sec == null || kilit(sec)

  return (
    <div className="oy-sudoku" onKeyDown={tus}>
      <div className="sd-ust">
        {!sonaErdi && (
          <span className="chip n mono" aria-live="off" data-testid="sd-sure">
            ⏱ {sureYaz(ham)}
            {bitti && alinanSayi > 0 && <span className="sd-ceza"> ({ipucuCezaYaz(alinanSayi)} ipucu)</span>}
          </span>
        )}
        {d.sinir != null && !d.bitti && (
          <span
            className={`chip mono ${sonaErdi ? 'down' : 'n'}`}
            data-testid="sd-ayrilma"
            aria-label={sonaErdi ? 'Sayfadan ayrılma sınırı aşıldı, oyun sona erdi' : `Sayfadan ayrılma: ${ayrilan} / ${d.sinir}`}
          >
            ↗ {sonaErdi ? `${ayrilan}/${d.sinir} · Sona erdi` : `Ayrılma ${ayrilan}/${d.sinir}`}
          </span>
        )}
        {d.bitti ? (
          <span className="chip up">✓ Çözüldü</span>
        ) : sonaErdi ? null : (
          <span className="m" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
            {bos} boş hücre
          </span>
        )}
      </div>
      {(ligDisi || sonaErdi) && (
        <p className="sd-uyari" role="status" data-testid="sd-lig-disi">
          {ligDisiMetni(sonaErdi ? 'sekme' : (sonuc?.neden ?? d.neden ?? null))}
        </p>
      )}
      <div className={`sd-tahta${d.bitti ? ' cozuldu' : sonaErdi ? ' sona-erdi' : ''}`} role="grid" aria-label="Sudoku tahtası">
        {Array.from({ length: 9 }, (_, r) => (
          <div role="row" key={r} className="sd-satir">
            {Array.from({ length: 9 }, (_, c) => {
              const i = r * 9 + c
              const sabit = d.ipucu[i]! > 0
              const verilen = alinan.has(i)
              const v = a[i] ?? 0
              const ilgili = sec != null && sec !== i && akraba(sec, i)
              const not = v ? [] : (notlar[i] ?? [])
              return (
                <button
                  key={c}
                  id={`sd-${i}`}
                  role="gridcell"
                  type="button"
                  className={`sd-h${sabit ? ' sabit' : ''}${verilen ? ' verilen' : ''}${sec === i ? ' sec' : ilgili ? ' ilgili' : ''}${v && v === secDeger && sec !== i ? ' esit' : ''}${cakisma.has(i) && !sabit && !verilen ? ' cakis' : ''}`}
                  aria-label={`Satır ${r + 1}, sütun ${c + 1}: ${v || 'boş'}${sabit ? ' (ipucu)' : ''}${verilen ? ' (alınan ipucu)' : ''}${cakisma.has(i) ? ', çakışıyor' : ''}${not.length ? `, notlar ${not.join(' ')}` : ''}`}
                  aria-selected={sec === i}
                  onClick={() => setSec(i)}
                >
                  {v ? (
                    v
                  ) : not.length ? (
                    <span className="sd-not" aria-hidden="true">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <span key={n} className={secDeger === n ? 'esit' : ''}>
                          {not.includes(n) ? n : ''}
                        </span>
                      ))}
                    </span>
                  ) : (
                    ''
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {!bitti && (
        <>
          <div className="sd-araclar" role="group" aria-label="Araçlar">
            <button type="button" className="sd-arac" onClick={geriAl} disabled={!gecmis.length} title="Geri al (Ctrl+Z)">
              <span aria-hidden="true">↶</span>
              Geri al
            </button>
            <button
              type="button"
              className="sd-arac"
              disabled={kilitli || (!a[sec!] && !notlar[sec!]?.length)}
              onClick={() => sec != null && yaz(sec, 0)}
              title="Sil (Delete)"
            >
              <span aria-hidden="true">⌫</span>
              Sil
            </button>
            <button type="button" className={`sd-arac${kalem ? ' acik' : ''}`} aria-pressed={kalem} onClick={() => setKalem((k) => !k)} title="Kalem notu (N)">
              <span aria-hidden="true">✎</span>
              Not {kalem ? 'açık' : 'kapalı'}
            </button>
            <button
              type="button"
              className="sd-arac"
              onClick={ipucuIste}
              disabled={hak <= 0 || ipucuAl.isPending}
              aria-label={hak > 0 ? `İpucu al, ${hak} hakkın var; her ipucu bitişte ${SUDOKU_IPUCU_CEZA} saniye ekler` : 'İpucu hakkın bitti'}
              title={`Seçili boş hücrenin doğru rakamı (seçili değilse en kolay hücre). Bitişte +${SUDOKU_IPUCU_CEZA} sn.`}
            >
              <span aria-hidden="true">💡</span>
              {hak > 0 ? `İpucu (${hak})` : 'Hak bitti'}
            </button>
          </div>
          <div className="sd-tuslar" role="group" aria-label={kalem ? 'Not ekle' : 'Rakam gir'}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
              const kalan = 9 - (sayac[n] ?? 0)
              return (
                <button
                  key={n}
                  type="button"
                  className={`sd-rakam${kalan <= 0 ? ' tamam' : ''}${kalem ? ' kalem' : ''}`}
                  disabled={kilitli}
                  onClick={() => sec != null && yaz(sec, n)}
                  aria-label={`${n}${kalem ? ' notu' : ''}, ${kalan > 0 ? `${kalan} tane kaldı` : 'hepsi yerleşti'}`}
                >
                  <span className="sd-rakam-n">{n}</span>
                  <span className="sd-rakam-k mono" aria-hidden="true">
                    {kalan > 0 ? kalan : '✓'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="m" style={{ fontSize: 12, margin: 0, textAlign: 'center' }}>
            Klavye: 1–9 rakam · Sil · oklar · N not · Ctrl+Z geri al. Süre bulmacayı ilk açtığında başladı. İpucu başına bitişte +{SUDOKU_IPUCU_CEZA} sn.
          </p>
        </>
      )}
      {bitir.isPending && <p className="m">Kontrol ediliyor…</p>}
      {kural.data && (
        <section className="sd-kurallar" aria-labelledby="sd-kurallar-b">
          <h3 id="sd-kurallar-b">Sudoku kuralları</h3>
          <KuralListesi k={kural.data} />
        </section>
      )}
    </div>
  )
}
