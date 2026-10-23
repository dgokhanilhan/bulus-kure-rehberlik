// Etüt programını görselden / Excel'den / PDF'ten içe aktarma penceresi. Okuma tarayıcıda; öğrenciler sınıf ve adla eşleşir,
// belirsiz olanlar önizlemede seçilir (uydurulmaz). Sonuç taslağa yazılır; rehber öğretmen kontrol edip kaydeder.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { DERSLER, KADEME_TR, type Hucre, type Kademe, type Saat } from '@/lib/etut'
import { hucreCoz, hucreHazirla, katla, ogretmenEsle, sayfaSec, sayfaTarihi, type AdSecim, type HamTablo, type HucreOkuma, type OgrenciLite, type SinifGrubu } from '@/lib/etutIceAktar'
import { excelOku, excelSayfalari, gorselOku, kaynakOf, pdfOku } from '@/lib/etutOku'
import { trDW } from '@/lib/format'
import { orderProgramCorners, rectifyProgram, validCorners, type Point } from '@/lib/programImage'
import { PDF_OKUMA } from '@/lib/platform'

interface Hucre2 {
  okuma: HucreOkuma
  konu: string
  adlar: AdSecim[]
  siniflar: SinifGrubu[]
}
/** Öğretmen seçimi: teacher id; '' = atla; ADIYLA = sistemde kayıtlı değil, okunan adıyla eklenir */
const ADIYLA = '__adiyla'
interface Satir2 {
  ham: string
  ogretmen: string
  secenekler: string[]
  hucreler: Hucre2[]
}
/** "EMRE" → "Emre" (kayıtsız öğretmen satır adı) */
const baslikHarf = (s: string) => s.toLocaleLowerCase('tr').replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('tr'))

export function EtutIceAktar(p: {
  teachers: { id: string; name: string; branch?: string | null }[]
  kademeOgretmen: Set<string> | undefined
  ogrenciler: OgrenciLite[]
  /** Programın tarihi (YYYY-MM-DD) ve kademesi: Excel'de uyan sayfa seçilir, başlık uymazsa uyarılır */
  tarih?: string
  kademe?: Kademe
  onClose: () => void
  onApply: (r: { saatler: Saat[] | null; hucreler: Hucre[] }) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [points, setPoints] = useState<Point[]>([])
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [err, setErr] = useState('')
  const [tablo, setTablo] = useState<{ saatler: Saat[] | null; satirlar: Satir2[]; baslik?: string } | null>(null)
  const [sayfalar, setSayfalar] = useState<string[]>([])
  const [sayfa, setSayfa] = useState('')
  const [saatUygula, setSaatUygula] = useState(true)
  const imgRef = useRef<HTMLImageElement>(null)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  const ilkAdlar = useMemo(() => new Set(p.teachers.map((t) => katla(t.name).split(' ')[0]!)), [p.teachers])
  const ogrAd = useMemo(() => new Map(p.ogrenciler.map((s) => [s.id, `${s.full_name} (${s.class_name})`])), [p.ogrenciler])
  const kaynak = file ? kaynakOf(file) : null

  // Excel'in sayfaları: programın tarihine uyan sayfa (yoksa en son sayfa) seçili gelir
  useEffect(() => {
    setSayfalar([])
    setSayfa('')
    if (!file || kaynak !== 'excel') return
    let iptal = false
    excelSayfalari(file)
      .then((ss) => {
        if (iptal) return
        setSayfalar(ss)
        setSayfa(sayfaSec(ss, p.tarih) ?? '')
      })
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [file, kaynak, p.tarih])

  useEffect(() => {
    if (!file || kaynak !== 'gorsel') return setUrl('')
    const u = URL.createObjectURL(file)
    setUrl(u)
    setPoints([])
    return () => URL.revokeObjectURL(u)
  }, [file, kaynak])

  function hazirla(t: HamTablo) {
    const satirlar: Satir2[] = t.satirlar.map((r) => {
      const o = ogretmenEsle(r.ogretmen, p.teachers, p.kademeOgretmen)
      const hucreler = r.hucreler.map((h) => {
        const okuma = hucreCoz(h)
        return { okuma, ...hucreHazirla(okuma, p.ogrenciler) }
      })
      // Sistemde bu adla öğretmen yoksa satır atlanmaz: okunan adıyla eklenir (sonra değiştirilebilir)
      const dolu = hucreler.some((h) => h.okuma.tur !== 'bos')
      return { ham: r.ogretmen, ogretmen: o.id ?? (!o.secenekler.length && dolu ? ADIYLA : ''), secenekler: o.secenekler, hucreler }
    })
    setTablo({ saatler: t.saatler, satirlar, baslik: t.baslik })
  }

  async function oku() {
    if (!file || !kaynak) return
    setBusy(true)
    setErr('')
    setPct(0)
    ctrl.current = new AbortController()
    try {
      let t: HamTablo
      if (kaynak === 'excel') t = await excelOku(file, sayfa || undefined)
      else if (kaynak === 'pdf') t = await pdfOku(file, ilkAdlar, setPct, ctrl.current.signal)
      else {
        const img = imgRef.current!
        const src = points.length === 4 && validCorners(orderProgramCorners(points)) ? rectifyProgram(img, orderProgramCorners(points)) : file
        t = await gorselOku(src, ilkAdlar, setPct, ctrl.current.signal)
      }
      if (!t.satirlar.length) throw new Error('Tabloda öğretmen satırı bulunamadı.')
      hazirla(t)
    } catch (e) {
      setErr((e as Error).message || 'Dosya okunamadı.')
    }
    setBusy(false)
  }

  function aktar() {
    if (!tablo) return
    const hucreler: Hucre[] = []
    for (const r of tablo.satirlar) {
      if (!r.ogretmen) continue
      const t = r.ogretmen === ADIYLA ? { id: null, name: baslikHarf(r.ham), branch: null } : p.teachers.find((x) => x.id === r.ogretmen)!
      r.hucreler.forEach((h, i) => {
        if (h.okuma.tur === 'bos') return
        hucreler.push(
          h.okuma.tur === 'mesgul'
            ? { ders: i + 1, teacher_id: t.id, teacher_name: t.name, tur: 'mesgul', konu: null, salon: null, aciklama: h.okuma.aciklama, ogrenciler: [] }
            : {
                ders: i + 1,
                teacher_id: t.id,
                teacher_name: t.name,
                tur: 'etut',
                // Konu yazılmamışsa öğretmenin branşı ("12-SAY" → Matematik)
                konu: (h.konu.trim() || t.branch || 'Etüt').slice(0, 120),
                salon: h.okuma.salon,
                aciklama: null,
                ogrenciler: [...new Set([...h.adlar.map((a) => a.secim), ...h.siniflar.filter((g) => g.on).flatMap((g) => g.ids)].filter(Boolean))],
              },
        )
      })
    }
    p.onApply({ saatler: saatUygula ? tablo.saatler : null, hucreler })
  }

  const set = (ri: number, f: (r: Satir2) => Satir2) => setTablo((t) => (t ? { ...t, satirlar: t.satirlar.map((r, i) => (i === ri ? f(r) : r)) } : t))
  const setHucre = (ri: number, ci: number, f: (h: Hucre2) => Hucre2) => set(ri, (r) => ({ ...r, hucreler: r.hucreler.map((h, i) => (i === ci ? f(h) : h)) }))
  const eksik = tablo ? tablo.satirlar.reduce((n, r) => n + (r.ogretmen ? r.hucreler.reduce((m, h) => m + h.adlar.filter((a) => !a.secim).length, 0) : 0), 0) : 0
  const atlanan = tablo ? tablo.satirlar.filter((r) => !r.ogretmen && r.hucreler.some((h) => h.okuma.tur !== 'bos')).length : 0
  const kayitsiz = tablo ? tablo.satirlar.filter((r) => r.ogretmen === ADIYLA).length : 0
  // Başlıktaki tarih / kademe programla uyuşmuyorsa uyarı (yanlış sayfa ya da yanlış kademe)
  const bt = tablo?.baslik ? sayfaTarihi(tablo.baslik) : null
  const [, pa, pg] = (p.tarih ?? '').split('-').map(Number)
  const tarihUyari =
    bt && p.tarih && (bt.gun !== pg || bt.ay !== pa) ? `Okunan sayfa ${bt.gun}.${String(bt.ay).padStart(2, '0')} tarihli; program ${trDW(p.tarih)} için açık.` : ''
  const bk = katla(tablo?.baslik ?? '')
  const bkKademe: Kademe | null = /(?<![a-z])lise(?![a-z])/.test(bk) ? 'lise' : /ortaokul/.test(bk) ? 'ortaokul' : null
  const kademeUyari =
    bkKademe && p.kademe && bkKademe !== p.kademe
      ? `Bu tablo ${KADEME_TR[bkKademe]} programı gibi görünüyor; şu an ${KADEME_TR[p.kademe]} programı açık. Öğrenciler yalnız açık kademede aranır.`
      : ''

  return (
    <Modal
      title="Etüt programını içe aktar"
      sub={tablo ? 'Okunanları kontrol et; eşleşmeyenleri seç' : 'Excel, görsel ya da PDF'}
      width={tablo ? 1100 : 640}
      onClose={() => !busy && p.onClose()}
      footer={
        tablo ? (
          <>
            <button className="btn" onClick={() => setTablo(null)}>
              Geri
            </button>
            <button className="btn pri" onClick={aktar}>
              <Icon name="check" size={16} /> Programa aktar
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={p.onClose} disabled={busy}>
              Vazgeç
            </button>
            <button className="btn pri" onClick={oku} disabled={!file || !kaynak || busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="search" size={16} />} {busy ? `Okunuyor… ${pct ? `%${pct}` : ''}` : 'Oku'}
            </button>
          </>
        )
      }
    >
      {!tablo ? (
        <div className="stack" style={{ gap: 12 }}>
          <label className="field">
            Dosya
            <input
              type="file"
              accept={`.xlsx,.csv,image/*${PDF_OKUMA ? ',.pdf,application/pdf' : ''}`}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setErr('')
              }}
            />
          </label>
          <p className="m" style={{ fontSize: 13 }}>
            En güvenilir yol Excel'dir. Görselde tablonun düz ve net olması önemli; fotoğraf eğikse aşağıda tablonun dört köşesine dokun (sol üst, sağ üst,
            sağ alt, sol alt). Dosya ve öğrenci adları hiçbir sunucuya gönderilmez; okuma bu cihazda yapılır.
          </p>
          {sayfalar.length > 1 && (
            <label className="field" htmlFor="etImpSayfa">
              Excel sayfası
              <select id="etImpSayfa" value={sayfa} onChange={(e) => setSayfa(e.target.value)}>
                {sayfalar.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              <span className="m" style={{ fontWeight: 400, fontSize: 13 }}>
                {sayfalar.length} sayfa var; programın tarihine uyan sayfa (yoksa en son sayfa) seçildi.
              </span>
            </label>
          )}
          {file && !kaynak && <p className="err">Bu dosya türü okunamaz. Excel (.xlsx), CSV, görsel{PDF_OKUMA ? ' ya da PDF' : ''} seç.</p>}
          {url && (
            <div className="et-imp-img">
              <img
                ref={imgRef}
                src={url}
                alt="Yüklenen etüt programı"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  if (points.length >= 4) return
                  setPoints([...points, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }])
                }}
              />
              {points.map((pt, i) => (
                <span key={i} className="et-imp-pt" style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}>
                  {i + 1}
                </span>
              ))}
              <div className="btns" style={{ marginTop: 6 }}>
                <span className="m">{points.length}/4 köşe {points.length === 4 ? '· tablo düzleştirilecek' : '(isteğe bağlı)'}</span>
                {points.length > 0 && (
                  <button className="btn sm" onClick={() => setPoints([])}>
                    Köşeleri temizle
                  </button>
                )}
              </div>
            </div>
          )}
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className="kv" style={{ flexWrap: 'wrap' }}>
            <span className="m">
              {tablo.satirlar.length} öğretmen satırı okundu.{eksik ? ` ${eksik} ad eşleşmedi ya da belirsiz (seçilmezse eklenmez).` : ' Bütün adlar eşleşti.'}
              {atlanan ? ` ${atlanan} satırın öğretmeni seçilmedi (atlanır).` : ''}
              {kayitsiz ? ` ${kayitsiz} öğretmen sistemde kayıtlı değil; okunan adıyla eklenecek.` : ''}
            </span>
            {tablo.saatler && (
              <label className="et-check">
                <input type="checkbox" checked={saatUygula} onChange={(e) => setSaatUygula(e.target.checked)} /> Okunan saatleri uygula ({tablo.saatler.map((s) => s.bas).join(', ')})
              </label>
            )}
          </div>
          {(tarihUyari || kademeUyari) && (
            <div className="err" role="alert">
              {[tarihUyari, kademeUyari].filter(Boolean).join(' ')}
            </div>
          )}
          <div className="tbl et-imp-tbl">
            <table>
              <thead>
                <tr>
                  <th>Öğretmen</th>
                  {DERSLER.map((d) => (
                    <th key={d}>
                      {d}. ders{tablo.saatler?.[d - 1] ? <span className="et-th">{`${tablo.saatler[d - 1]!.bas}–${tablo.saatler[d - 1]!.bit}`}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tablo.satirlar.map((r, ri) => (
                  <tr key={ri}>
                    <td>
                      <span className="m" style={{ fontSize: 12 }}>
                        {r.ham}
                      </span>
                      <select aria-label={`${r.ham} öğretmeni`} value={r.ogretmen} onChange={(e) => set(ri, (x) => ({ ...x, ogretmen: e.target.value }))} className={r.ogretmen ? '' : 'bad'}>
                        <option value="">— Atla —</option>
                        {!r.secenekler.length && <option value={ADIYLA}>{baslikHarf(r.ham)} (sistemde kayıtlı değil, adıyla ekle)</option>}
                        {[...r.secenekler.map((id) => p.teachers.find((t) => t.id === id)!), ...p.teachers.filter((t) => !r.secenekler.includes(t.id))].map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {r.hucreler.map((h, ci) => (
                      <td key={ci} className={h.okuma.tur === 'mesgul' ? 'et-busytd' : ''} title={h.okuma.ham}>
                        {h.okuma.tur === 'bos' ? (
                          <span className="m">—</span>
                        ) : h.okuma.tur === 'mesgul' ? (
                          <span>{h.okuma.aciklama}</span>
                        ) : (
                          <div className="stack" style={{ gap: 4 }}>
                            {h.adlar.map((a, ai) => (
                              <select
                                key={ai}
                                aria-label={`${a.ad} öğrencisi`}
                                className={a.secim ? 'ok' : 'bad'}
                                value={a.secim}
                                onChange={(e) => setHucre(ri, ci, (x) => ({ ...x, adlar: x.adlar.map((y, j) => (j === ai ? { ...y, secim: e.target.value } : y)) }))}
                              >
                                <option value="">{a.ad} — {a.durum === 'belirsiz' ? 'birden çok öğrenci, seç' : 'eşleşmedi, seç'}</option>
                                {[...a.secenekler, ...(a.durum === 'eslesti' ? [a.secim] : [])].map((id) => (
                                  <option key={id} value={id}>
                                    {ogrAd.get(id)}
                                  </option>
                                ))}
                                <optgroup label="Bütün öğrenciler">
                                  {p.ogrenciler.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.full_name} ({s.class_name})
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            ))}
                            {h.siniflar.map((g, gi) => (
                              <label key={g.ad} className="et-check" title={`${g.ad} sınıfının bütün öğrencileri`}>
                                <input
                                  type="checkbox"
                                  checked={g.on}
                                  onChange={(e) => setHucre(ri, ci, (x) => ({ ...x, siniflar: x.siniflar.map((y, j) => (j === gi ? { ...y, on: e.target.checked } : y)) }))}
                                />{' '}
                                Tüm sınıf: {g.ad} ({g.ids.length})
                              </label>
                            ))}
                            <input aria-label="Konu" placeholder="Konu (sonra da yazılabilir)" value={h.konu} onChange={(e) => setHucre(ri, ci, (x) => ({ ...x, konu: e.target.value }))} />
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m" style={{ fontSize: 12 }}>Hücrenin üzerine gelince okunan ham metin görünür. Yalnız sınıf yazılan hücrelerde (ör. "12-SAY") sınıfın tamamı eklenir; kutudan kaldırabilirsin. Konusu yazılmayan etütte konu öğretmenin branşı olur. Aktarılan hücreler bu programdaki aynı öğretmen-ders hücrelerinin yerine geçer.</p>
        </div>
      )}
    </Modal>
  )
}
