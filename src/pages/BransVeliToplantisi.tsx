// Öğrenciler → sınıf → Branş veli toplantısı: öğretmenin kendi dersi için her öğrencinin özeti (ödev, deneme, etüt,
// devamsızlık) ve derse özel gözlem formu. Form toplantı sonunda veliye kâğıt olarak teslim edilir; brans_toplanti_formlari
// tablosunda saklanır (0066). Sınıf sıralaması ve sınıf ortalaması yok (CLAUDE.md kural 3); öğretmenin iç notu çıktıya girmez.
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { fmt, signed } from '@/lib/analiz'
import { useClassAttendance, useClassHomework, useClasses, useCourses, useModules, useStudents } from '@/lib/data'
import { useEtutKatilimi } from '@/lib/etutData'
import { useExamContext } from '@/lib/sinavBaglami'
import { bransDersleri } from '@/lib/denemeSecimi'
import {
  ODEV_TR,
  UCLU,
  bransSorulari,
  cevapTemizle,
  denemeOzeti,
  dersSirala,
  formDolu,
  GRUP_BASLIK,
  odevCumlesi,
  odevOzeti,
  type DenemeOzeti,
  type OdevOzeti,
  type Soru,
} from '@/lib/bransToplanti'
import { initials, todayISO, trD } from '@/lib/format'
import { useSchoolInfo } from '@/lib/files'
import { useAyar } from '@/lib/ayarlar'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

interface BransForm {
  student_id: string
  cevaplar: Record<string, string | undefined>
  ic_not: string | null
}
const yilBasi = (t: string) => (Number(t.slice(5, 7)) >= 9 ? `${t.slice(0, 4)}-09-01` : `${Number(t.slice(0, 4)) - 1}-09-01`)
const bos = (sid: string): BransForm => ({ student_id: sid, cevaplar: {}, ic_not: null })
const dosyaAdi = (x: string) => x.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

function useFormlar(tarih: string, ders: string, uid: string | undefined, ids: string[]) {
  return useQuery({
    queryKey: ['brans-toplanti', tarih, ders, uid ?? '', ids.join(',')],
    enabled: ids.length > 0 && !!uid && !!ders && /^\d{4}-\d{2}-\d{2}$/.test(tarih),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brans_toplanti_formlari')
        .select('student_id, cevaplar, ic_not')
        .eq('toplanti_tarihi', tarih)
        .eq('ders', ders)
        .eq('teacher_id', uid!)
        .in('student_id', ids)
      if (error) throw new Error(error.message)
      return (data ?? []) as BransForm[]
    },
  })
}

interface Ozet {
  odev: OdevOzeti
  deneme: DenemeOzeti
  devamsiz: number
  etut: { cagrildi: number; geldi: number } | null
}

export default function BransVeliToplantisi({ cls, grade, onBack }: { cls: string; grade: number | null; onBack: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const ayar = useAyar()
  const info = useSchoolInfo()
  const students = useStudents()
  const classes = useClasses()
  const courses = useCourses()
  const mods = useModules()
  const dsq = useExamContext(grade)
  const bugun = todayISO()
  const [tarih, setTarih] = useState(bugun)
  const sinif = useMemo(() => (students.data ?? []).filter((s) => s.class_name === cls).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')), [students.data, cls])
  const ids = useMemo(() => sinif.map((s) => s.id), [sinif])
  const att = useClassAttendance(ids, yilBasi(bugun))
  const hw = useClassHomework(ids, yilBasi(bugun))
  const etq = useEtutKatilimi(ids, yilBasi(bugun), mods.etut)

  // Dersler: bu kademenin dersleri; öğretmenin branşına uyan ders ilk sırada (varsayılan)
  const kademe = (classes.data ?? []).find((c) => c.name === cls)?.level
  const dersler = useMemo(
    () =>
      dersSirala(
        (courses.data ?? []).filter((c) => c.active !== false && (!c.levels?.length || !kademe || c.levels.includes(kademe as 'ortaokul'))),
        profile?.branch,
      ),
    [courses.data, kademe, profile?.branch],
  )
  const [dersSec, setDers] = useState<string | null>(null)
  const ders = dersler.find((d) => d.id === dersSec) ?? dersler[0] ?? null
  const dersAdi = ders?.name ?? ''
  const sorular = useMemo(() => bransSorulari(dersAdi), [dersAdi])

  const formlar = useFormlar(tarih, dersAdi, profile?.id, ids)
  const [secili, setSecili] = useState<string | null>(null)
  const sid = secili && ids.includes(secili) ? secili : (ids[0] ?? null)
  const [taslak, setTaslak] = useState<BransForm | null>(null)
  const [busy, setBusy] = useState(false)
  const kayitli = (s: string) => formlar.data?.find((f) => f.student_id === s) ?? null
  useEffect(() => {
    if (!sid || formlar.isLoading) return
    setTaslak(kayitli(sid) ?? bos(sid))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, tarih, dersAdi, formlar.data])

  // Denemede bu dersin karşılığı (ör. "Matematik" → MAT); yoksa deneme bölümü gösterilmez
  const codes = useMemo(() => (dsq.data && dersAdi ? bransDersleri(dsq.data.subjects, dersAdi) : []), [dsq.data, dersAdi])
  const ozetler = useMemo(() => {
    const m = new Map<string, Ozet>()
    for (const s of sinif) {
      const odevler = (hw.data ?? [])
        .filter((x) => x.student_id === s.id && x.homework.course_id === ders?.id)
        .map((x) => ({ baslik: x.homework.title, verilis: x.homework.assigned_on, teslim: x.homework.due_on, durum: x.status }))
      const et = (etq.data ?? []).filter((x) => x.student_id === s.id && x.etut_gunler && x.etut_gunler.tarih <= bugun)
      m.set(s.id, {
        odev: odevOzeti(odevler),
        deneme: denemeOzeti(dsq.data, s.id, codes),
        devamsiz: (att.data ?? []).filter((x) => x.student_id === s.id && x.status === 'devamsiz').length,
        etut: mods.etut && et.length ? { cagrildi: et.length, geldi: et.filter((x) => x.yoklama === 'geldi').length } : null,
      })
    }
    return m
  }, [sinif, hw.data, etq.data, att.data, dsq.data, codes, ders?.id, mods.etut, bugun])

  const ekSatir = (o: Ozet) =>
    [o.etut ? `Etüt: ${o.etut.cagrildi} etüdün ${o.etut.geldi}'ine katıldı` : '', `Devamsızlık: ${o.devamsiz} gün`].filter(Boolean)

  async function kaydet(sonraki: boolean) {
    if (!taslak || !ders) return
    setBusy(true)
    const r = await supabase.from('brans_toplanti_formlari').upsert(
      {
        student_id: taslak.student_id,
        teacher_id: profile?.id,
        school_id: profile?.school_id,
        ders: dersAdi,
        toplanti_tarihi: tarih,
        cevaplar: cevapTemizle(dersAdi, taslak.cevaplar),
        ic_not: taslak.ic_not?.trim() || null,
      },
      { onConflict: 'student_id,teacher_id,ders,toplanti_tarihi' },
    )
    setBusy(false)
    if (r.error) return toast('Kaydedilemedi. Tekrar dene.', 'warn')
    toast('Form kaydedildi.')
    await qc.invalidateQueries({ queryKey: ['brans-toplanti'] })
    if (sonraki) {
      const i = ids.indexOf(taslak.student_id)
      if (i >= 0 && i < ids.length - 1) setSecili(ids[i + 1]!)
    }
  }

  async function pdf(hepsi: boolean, yalnizForm: boolean) {
    if (!ders) return
    setBusy(true)
    try {
      const { bransToplantiPdfBlob } = await import('@/lib/pdf')
      const rs = hepsi ? sinif : sinif.filter((s) => s.id === sid)
      const soru = (q: Soru) => ({ k: q.k, metin: q.metin, ...(q.tur === 'secim' ? { secenekler: q.secenekler.map(([a, b]) => [a, b] as [string, string]) } : {}) })
      const blob = await bransToplantiPdfBlob({
        school: info.data?.name ?? 'Buluş Küre Koleji',
        logo: ayar.bool('rapor.logo'),
        sinif: cls,
        tarih: trD(tarih),
        ders: dersAdi,
        ogretmen: profile?.full_name ?? '',
        yalnizForm,
        uclu: UCLU.map(([a, b]) => [a, b] as [string, string]),
        bolumler: [
          { baslik: 'Ders içi', sorular: sorular.dersIci.filter((q) => q.tur !== 'yazi').map(soru) },
          { baslik: GRUP_BASLIK[sorular.grup] === 'Derse özel' ? 'Derse özel' : `${dersAdi} dersine özel`, sorular: sorular.ozel.filter((q) => q.tur !== 'yazi').map(soru) },
        ],
        yazi: [...sorular.ozel, ...sorular.yazi].flatMap((q) => (q.tur === 'yazi' ? [{ k: q.k, metin: q.metin, satir: q.satir }] : [])),
        ogrenciler: rs.map((s) => {
          const o = ozetler.get(s.id)!
          const f = (s.id === taslak?.student_id ? taslak : kayitli(s.id)) ?? bos(s.id)
          return {
            ad: s.full_name,
            no: s.school_no ?? '',
            ozet: {
              odev: odevCumlesi(o.odev),
              odevler: o.odev.son.map((x) => ({ baslik: x.baslik, tarih: trD(x.verilis), durum: ODEV_TR[x.durum] })),
              denemeler: o.deneme.denemeler.slice(-4).map((x) => ({ ad: x.ad, tarih: trD(x.tarih), net: `${fmt(x.net)}${x.soru ? ` / ${x.soru}` : ''}`, degisim: x.degisim })),
              egilim:
                o.deneme.egilim !== null && o.deneme.denemeler.length > 1
                  ? `${o.deneme.denemeler.length} denemede net ${fmt(o.deneme.denemeler[0]!.net)} → ${fmt(o.deneme.denemeler.at(-1)!.net)}`
                  : null,
              konular: o.deneme.konular.map((k) => k.baslik),
              ek: ekSatir(o),
            },
            cevaplar: cevapTemizle(dersAdi, f.cevaplar),
          }
        }),
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${yalnizForm ? 'gozlem-formu' : 'brans-veli-toplantisi'}-${dosyaAdi(dersAdi)}-${dosyaAdi(cls)}${hepsi ? '' : '-' + dosyaAdi(rs[0]?.full_name ?? '')}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    } catch {
      toast('PDF oluşturulamadı.', 'warn')
    }
    setBusy(false)
  }

  if (!students.data || !courses.data)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  const ogr = sinif.find((s) => s.id === sid)
  const oz = ogr ? ozetler.get(ogr.id) : null
  const cevap = (k: string, v: string, tekrarSil = true) =>
    setTaslak((t) => (t ? { ...t, cevaplar: { ...t.cevaplar, [k]: tekrarSil && t.cevaplar[k] === v ? undefined : v } } : t))
  const esit = (a: BransForm, b: BransForm) =>
    JSON.stringify(cevapTemizle(dersAdi, a.cevaplar)) === JSON.stringify(cevapTemizle(dersAdi, b.cevaplar)) && (a.ic_not?.trim() || '') === (b.ic_not?.trim() || '')
  const degisti = !!taslak && !esit(taslak, kayitli(taslak.student_id) ?? bos(taslak.student_id))

  const soruSatiri = (q: Soru) => {
    if (!taslak) return null
    if (q.tur === 'yazi')
      return (
        <label key={q.k} className="field">
          {q.metin}
          <textarea rows={q.satir} maxLength={600} value={taslak.cevaplar[q.k] ?? ''} onChange={(e) => cevap(q.k, e.target.value, false)} />
        </label>
      )
    const sec = q.tur === 'uclu' ? UCLU : q.secenekler
    return (
      <div key={q.k} className="vt-madde" role="group" aria-label={q.metin}>
        <span style={{ flex: '1 1 220px' }}>{q.metin}</span>
        <span className="vt-secim" style={{ flexWrap: 'wrap' }}>
          {sec.map(([v, t], i) => (
            <button
              key={v}
              type="button"
              className={`vt-d ${q.tur === 'uclu' ? `vt-${['evet', 'kismen', 'hayir'][i]}` : 'vt-kismen'} ${taslak.cevaplar[q.k] === v ? 'on' : ''}`}
              style={{ padding: '0 12px', whiteSpace: 'nowrap' }}
              aria-pressed={taslak.cevaplar[q.k] === v}
              onClick={() => cevap(q.k, v)}
            >
              {t}
            </button>
          ))}
        </span>
      </div>
    )
  }

  return (
    <>
      <div className="head a">
        <div>
          <button type="button" className="btn ghost sm" onClick={onBack} style={{ marginBottom: 6 }}>
            <Icon name="back" size={16} stroke={2} /> Öğrenciler
          </button>
          <h1 className="hd">
            {cls} · Branş veli toplantısı{dersAdi ? ` · ${dersAdi}` : ''}
          </h1>
          <p className="m" style={{ fontSize: 14, margin: '4px 0 0' }}>
            Yalnız bu dersin verileri: ödevler, ders içi gözlem ve varsa denemeler. Çıktı toplantı sonunda veliye verilir; sınıf sıralaması yoktur.
          </p>
        </div>
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <label className="field" htmlFor="btDers" style={{ minWidth: 170 }}>
            <span className="label">Ders</span>
            <select id="btDers" value={ders?.id ?? ''} onChange={(e) => setDers(e.target.value)}>
              {dersler.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="btTarih">
            <span className="label">Toplantı tarihi</span>
            <input id="btTarih" type="date" value={tarih} onChange={(e) => e.target.value && setTarih(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={() => pdf(true, false)} disabled={busy || !sinif.length || !ders}>
            <Icon name="doc" size={16} /> Tüm sınıf PDF
          </button>
          <button type="button" className="btn" onClick={() => pdf(true, true)} disabled={busy || !sinif.length || !ders}>
            <Icon name="doc" size={16} /> Gözlem formları PDF
          </button>
        </div>
      </div>

      {!ders ? (
        <div className="empty a">Bu kademe için tanımlı ders yok. Dersler Yönetim bölümünden eklenir.</div>
      ) : (
        <div className="vt-grid a" style={{ ['--d' as string]: 1 }}>
          <nav className="card vt-liste" aria-label="Öğrenciler">
            {sinif.map((x) => (
              <button key={x.id} type="button" className={`vt-ogr ${x.id === sid ? 'on' : ''}`} aria-current={x.id === sid ? 'true' : undefined} onClick={() => setSecili(x.id)}>
                <span className="av" aria-hidden="true">
                  {initials(x.full_name)}
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>{x.full_name}</span>
                {formDolu(kayitli(x.id)?.cevaplar) && (
                  <span className="chip up" style={{ fontSize: 11 }}>
                    ✓ dolduruldu
                  </span>
                )}
              </button>
            ))}
            {!sinif.length && <p className="m">Bu sınıfta öğrenci yok.</p>}
          </nav>

          {ogr && oz && taslak && (
            <div style={{ display: 'grid', gap: 14, minWidth: 0 }} data-testid="bt-kart">
              <section className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <h2 className="sec" style={{ margin: 0 }}>
                    {ogr.full_name}
                  </h2>
                  <span className="m">
                    {cls}
                    {ogr.school_no ? ` · No ${ogr.school_no}` : ''} · {dersAdi}
                  </span>
                </div>
                <div className="vt-ozet">
                  <div data-testid="bt-odev">
                    <b>Ödevler</b>
                    <p style={{ margin: '4px 0' }}>{odevCumlesi(oz.odev)}</p>
                    {oz.odev.son.length > 0 && (
                      <table className="vt-tablo">
                        <thead>
                          <tr>
                            <th>Ödev</th>
                            <th>Veriliş</th>
                            <th>Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {oz.odev.son.map((x, i) => (
                            <tr key={i}>
                              <td>{x.baslik}</td>
                              <td>{trD(x.verilis)}</td>
                              <td>{ODEV_TR[x.durum]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p className="m" style={{ margin: '8px 0 0', fontSize: 13 }}>
                      {ekSatir(oz).join(' · ')}
                    </p>
                  </div>
                  <div data-testid="bt-deneme">
                    <b>Denemelerde {dersAdi}</b>
                    {oz.deneme.denemeler.length ? (
                      <>
                        <table className="vt-tablo">
                          <thead>
                            <tr>
                              <th>Deneme</th>
                              <th className="num">Net</th>
                              <th className="num">Değişim</th>
                            </tr>
                          </thead>
                          <tbody>
                            {oz.deneme.denemeler.slice(-6).map((d) => (
                              <tr key={d.ad + d.tarih}>
                                <td>
                                  {d.ad} <span className="m">{trD(d.tarih)}</span>
                                </td>
                                <td className="num">
                                  {fmt(d.net)}
                                  {d.soru ? <span className="m"> / {d.soru}</span> : null}
                                </td>
                                <td className="num">
                                  {d.degisim === null ? (
                                    '—'
                                  ) : (
                                    <span style={{ color: d.degisim >= 0 ? 'var(--primary)' : 'var(--signal-ink, var(--signal))' }}>
                                      {d.degisim >= 0 ? '↑' : '↓'} {signed(d.degisim)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {oz.deneme.konular.length > 0 && (
                          <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                            <b>Üzerinde durulacak konular:</b> {oz.deneme.konular.map((k) => `${k.baslik} (${k.kez} deneme)`).join(' · ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="m" style={{ margin: '4px 0' }}>
                        Bu derste deneme sonucu yok; değerlendirme ödev ve ders içi gözleme dayanır.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="card" style={{ padding: '16px 20px' }} aria-labelledby="btForm" data-testid="bt-form">
                <h2 className="sec" id="btForm" style={{ marginTop: 0 }}>
                  Gözlem formu · {dersAdi}
                </h2>
                <p className="m" style={{ fontSize: 13, margin: '0 0 6px' }}>
                  İşaretlediklerin ve yazdıkların veliye verilen çıktıda yer alır. Boş bırakılan alanlar çıktıda elle doldurulmak üzere boş kalır.
                </p>
                <b>Ders içi</b>
                {sorular.dersIci.map(soruSatiri)}
                <b style={{ display: 'block', marginTop: 14 }}>{sorular.grup === 'diger' ? 'Derse özel' : `${dersAdi} dersine özel`}</b>
                {sorular.ozel.filter((q) => q.tur !== 'yazi').map(soruSatiri)}
                <div className="vt-alanlar" style={{ marginTop: 14 }}>
                  {[...sorular.ozel.filter((q) => q.tur === 'yazi'), ...sorular.yazi].map(soruSatiri)}
                </div>
                <label className="field" style={{ marginTop: 12 }}>
                  Kendime not (veliye verilen çıktıda yer almaz)
                  <textarea rows={2} maxLength={2000} value={taslak.ic_not ?? ''} onChange={(e) => setTaslak((t) => (t ? { ...t, ic_not: e.target.value } : t))} />
                </label>
                <div className="btns" style={{ marginTop: 12 }}>
                  <button type="button" className="btn pri" onClick={() => kaydet(false)} disabled={busy || !degisti}>
                    <Icon name="check" size={16} /> Kaydet
                  </button>
                  <button type="button" className="btn" onClick={() => kaydet(true)} disabled={busy || !degisti}>
                    Kaydet ve sonraki öğrenci
                  </button>
                  <button type="button" className="btn" onClick={() => pdf(false, false)} disabled={busy}>
                    <Icon name="doc" size={16} /> Bu öğrenci PDF
                  </button>
                  <button type="button" className="btn" onClick={() => pdf(false, true)} disabled={busy}>
                    <Icon name="doc" size={16} /> Yalnız gözlem formu
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </>
  )
}
