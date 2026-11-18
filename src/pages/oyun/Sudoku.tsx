// Günün Sudokusu: bulmaca, doğrulama ve süre sunucuda (puanlama değişmedi). Girilen rakamlar ve kalem notları cihazda
// saklanır (sayfa yenilenince kaybolmaz). Profesyonel oyun özellikleri: kalem notu, geri al, kalan rakam sayısı, aynı
// rakamı / satır-sütun-kutuyu vurgulama, çakışma uyarısı, rakam girince ilgili hücrelerdeki notların silinmesi, klavye.
import { useEffect, useMemo, useRef, useState } from 'react'
import { sudokuCakisma, sudokuDolu, sureYaz } from '@/lib/oyunlar'
import { useSudoku, useSudokuBitir } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

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

type Adim = { giris: number[]; notlar: number[][] }

export default function Sudoku() {
  const q = useSudoku(true)
  const bitir = useSudokuBitir()
  const toast = useToast()
  const d = q.data
  const anahtar = d ? `oda.sudoku.${d.gun}` : ''
  const notAnahtar = d ? `oda.sudoku.${d.gun}.not` : ''
  const [giris, setGiris] = useState<number[] | null>(null)
  const [notlar, setNotlar] = useState<number[][]>(() => Array.from({ length: 81 }, () => []))
  const [kalem, setKalem] = useState(false)
  const [gecmis, setGecmis] = useState<Adim[]>([])
  const [sec, setSec] = useState<number | null>(null)
  const [simdi, setSimdi] = useState(Date.now())
  const denendi = useRef('')

  useEffect(() => {
    if (d && !giris) {
      setGiris(d.cozum ?? oku(anahtar) ?? d.ipucu)
      setNotlar(notOku(notAnahtar))
    }
  }, [d, giris, anahtar, notAnahtar])
  useEffect(() => {
    if (!d || d.bitti) return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [d])

  const a = giris ?? d?.ipucu ?? []
  const cakisma = useMemo(() => sudokuCakisma(a), [a])
  const sayac = useMemo(() => {
    const s = Array(10).fill(0) as number[]
    for (const v of a) if (v) s[v]!++
    return s
  }, [a])
  const bitti = !!d?.bitti

  const kaydet = (yeniGiris: number[], yeniNot: number[][]) => {
    setGecmis((g) => [...g.slice(-99), { giris: a, notlar }])
    setGiris(yeniGiris)
    setNotlar(yeniNot)
    sakla(anahtar, yeniGiris)
    sakla(notAnahtar, yeniNot)
  }
  const yaz = (i: number, v: number) => {
    if (!d || bitti || d.ipucu[i]) return
    if (kalem && v) {
      if (a[i]) return toast('Önce hücredeki rakamı sil', 'warn')
      const n = notlar.map((x) => [...x])
      n[i] = n[i]!.includes(v) ? n[i]!.filter((x) => x !== v) : [...n[i]!, v].sort()
      return kaydet(a, n)
    }
    if (a[i] === v && v) v = 0 // aynı rakama tekrar basmak siler
    const yeni = [...a]
    yeni[i] = v
    const n = notlar.map((x, k) => (k === i && v ? [] : v && akraba(k, i) ? x.filter((y) => y !== v) : x))
    if (!v && !a[i] && notlar[i]!.length) n[i] = [] // boş hücrede Sil: notları temizler
    kaydet(yeni, n)
  }
  const geriAl = () => {
    const son = gecmis.at(-1)
    if (!son || bitti) return
    setGecmis((g) => g.slice(0, -1))
    setGiris(son.giris)
    setNotlar(son.notlar)
    sakla(anahtar, son.giris)
    sakla(notAnahtar, son.notlar)
  }

  // Tahta dolu ve çakışma yoksa sunucuya gönder (aynı tahtayı iki kez gönderme)
  useEffect(() => {
    if (!d || bitti || !sudokuDolu(a) || cakisma.size) return
    const imza = a.join('')
    if (denendi.current === imza) return
    denendi.current = imza
    bitir.mutate(a, {
      onSuccess: (r) => (r.dogru ? toast(`Tebrikler! ${sureYaz(r.puan ?? 0)}`) : toast('Henüz değil: ipuçlarıyla uyuşmayan bir yer var', 'warn')),
      onError: (e) => toast((e as Error).message, 'warn'),
    })
  }, [a, cakisma, d, bitti, bitir, toast])

  if (q.isLoading) return <p className="m">Bulmaca hazırlanıyor…</p>
  if (q.isError || !d) return <div className="empty">Bulmaca açılamadı. Sayfayı yenile.</div>

  const gecen = bitti ? (d.puan ?? 0) : Math.max(0, Math.floor((simdi - new Date(d.basladi).getTime()) / 1000))
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
  const kilitli = sec == null || d.ipucu[sec]! > 0

  return (
    <div className="oy-sudoku" onKeyDown={tus}>
      <div className="sd-ust">
        <span className="chip n mono" aria-live="off">
          ⏱ {sureYaz(gecen)}
        </span>
        {bitti ? (
          <span className="chip up">✓ Çözüldü</span>
        ) : (
          <span className="m" style={{ fontSize: 13 }}>
            {bos} boş hücre
          </span>
        )}
      </div>
      <div className={`sd-tahta${bitti ? ' cozuldu' : ''}`} role="grid" aria-label="Sudoku tahtası">
        {Array.from({ length: 9 }, (_, r) => (
          <div role="row" key={r} className="sd-satir">
            {Array.from({ length: 9 }, (_, c) => {
              const i = r * 9 + c
              const sabit = d.ipucu[i]! > 0
              const v = a[i] ?? 0
              const ilgili = sec != null && sec !== i && akraba(sec, i)
              const not = v ? [] : (notlar[i] ?? [])
              return (
                <button
                  key={c}
                  id={`sd-${i}`}
                  role="gridcell"
                  type="button"
                  className={`sd-h${sabit ? ' sabit' : ''}${sec === i ? ' sec' : ilgili ? ' ilgili' : ''}${v && v === secDeger && sec !== i ? ' esit' : ''}${cakisma.has(i) && !sabit ? ' cakis' : ''}`}
                  aria-label={`Satır ${r + 1}, sütun ${c + 1}: ${v || 'boş'}${sabit ? ' (ipucu)' : ''}${cakisma.has(i) ? ', çakışıyor' : ''}${not.length ? `, notlar ${not.join(' ')}` : ''}`}
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
            Klavye: 1–9 rakam · Sil · oklar · N not · Ctrl+Z geri al. Süre bulmacayı ilk açtığında başladı.
          </p>
        </>
      )}
      {bitir.isPending && <p className="m">Kontrol ediliyor…</p>}
    </div>
  )
}
