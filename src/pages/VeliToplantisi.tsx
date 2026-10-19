// Öğrenciler → sınıf → Veli toplantısı: veliyle yüz yüze görüşürken her öğrencinin özeti ve öğretmenin dolduracağı form.
// Özet mevcut verilerden (deneme, görev, devamsızlık, görüşme) okunur; form veli_toplanti_formlari tablosuna yazılır (0053).
// Veliyle birlikte bakılacağı için sınıf sıralaması ve sınıf ortalaması yok: öğrenci kendisiyle kıyaslanır (CLAUDE.md kural 3).
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { fmt, outcomeCode, repeats, signed, type Subject } from '@/lib/analiz'
import { ATT_TR, useClassAttendance, useMeetings, useStudents, useTasks, type AttendanceStatus } from '@/lib/data'
import { useExamContext } from '@/lib/sinavBaglami'
import { sinifAnalizi, type OgrenciSatiri } from '@/lib/sinifAnalizi'
import { initials, todayISO, trD } from '@/lib/format'
import { useSchoolInfo } from '@/lib/files'
import { useAyar } from '@/lib/ayarlar'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

/** Gözlem maddeleri (anahtar veritabanında saklanır; metin değişebilir, anahtar değişmemeli). */
export const GOZLEMLER: [string, string][] = [
  ['odev', 'Ödevlerini düzenli yapıyor'],
  ['kaynak', 'Ek kaynak çözüyor'],
  ['soru_sorma', 'Anlamadığı soruları öğretmenine soruyor'],
  ['hazirlik', 'Derse hazırlıklı geliyor'],
  ['katilim', 'Derste dikkatli ve derse katılıyor'],
  ['program', 'Evde düzenli bir çalışma programı var'],
  ['yanlis_inceleme', 'Deneme sonrası yanlışlarını inceliyor'],
  ['kitap', 'Düzenli kitap okuyor'],
  ['ekran_uyku', 'Ekran süresi ve uyku düzeni dengeli (veli beyanı)'],
  ['uyum', 'Okula ve arkadaşlarına uyumu iyi'],
  ['motivasyon', 'Bir hedefi var, çalışma isteği yüksek'],
]
export type GozlemDeger = 'evet' | 'kismen' | 'hayir'
const DEGER_TR: Record<GozlemDeger, string> = { evet: 'Evet', kismen: 'Kısmen', hayir: 'Hayır' }

export interface VeliForm {
  id?: string
  student_id: string
  toplanti_tarihi: string
  gozlemler: Partial<Record<string, GozlemDeger>>
  katilan: string | null
  veli_gorusu: string | null
  kararlar: string | null
  notlar: string | null
  takip_tarihi: string | null
  updated_at?: string
}
const bos = (sid: string, tarih: string): VeliForm => ({ student_id: sid, toplanti_tarihi: tarih, gozlemler: {}, katilan: null, veli_gorusu: null, kararlar: null, notlar: null, takip_tarihi: null })
const yilBasi = (t: string) => (Number(t.slice(5, 7)) >= 9 ? `${t.slice(0, 4)}-09-01` : `${Number(t.slice(0, 4)) - 1}-09-01`)

function useFormlar(tarih: string, ids: string[]) {
  return useQuery({
    queryKey: ['veli-toplanti', tarih, ids.join(',')],
    enabled: ids.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(tarih),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veli_toplanti_formlari')
        .select('id, student_id, toplanti_tarihi, gozlemler, katilan, veli_gorusu, kararlar, notlar, takip_tarihi, updated_at')
        .eq('toplanti_tarihi', tarih)
        .in('student_id', ids)
      if (error) throw new Error(error.message)
      return (data ?? []) as VeliForm[]
    },
  })
}

/** Öğrencinin özet bilgisi (kart ve PDF ortak). */
export interface Ozet {
  denemeler: { ad: string; tarih: string; puan: string; net: string; degisim: number | null }[]
  dersler: { ad: string; net: string; onceki: string; fark: number | null; pct: number | null }[]
  guclu: string[]
  destek: string[]
  konular: string[]
  gorev: { acik: number; geciken: number }
  devamsizlik: [string, number][]
  gorusmeler: string[]
}

export default function VeliToplantisi({ cls, grade, onBack }: { cls: string; grade: number | null; onBack: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const ayar = useAyar()
  const info = useSchoolInfo()
  const students = useStudents()
  const tasks = useTasks()
  const meetings = useMeetings()
  const dsq = useExamContext(grade)
  const bugun = todayISO()
  const [tarih, setTarih] = useState(bugun)
  const sinif = useMemo(() => (students.data ?? []).filter((s) => s.class_name === cls).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')), [students.data, cls])
  const ids = useMemo(() => sinif.map((s) => s.id), [sinif])
  const att = useClassAttendance(ids, yilBasi(bugun))
  const formlar = useFormlar(tarih, ids)
  const [secili, setSecili] = useState<string | null>(null)
  const sid = secili && ids.includes(secili) ? secili : (ids[0] ?? null)
  const [taslak, setTaslak] = useState<VeliForm | null>(null)
  const [busy, setBusy] = useState(false)

  const A = useMemo(
    () => (dsq.data && students.data ? sinifAnalizi(dsq.data, sinif, { bugun, gorevler: tasks.data ?? [], gorusmeler: meetings.data ?? [], devamsizlik: att.data ?? [] }) : null),
    [dsq.data, students.data, sinif, tasks.data, meetings.data, att.data, bugun],
  )
  const kayitli = (s: string) => formlar.data?.find((f) => f.student_id === s) ?? null
  // Seçili öğrencinin formu: kayıtlı form ya da boş; öğrenci/tarih değişince taslak yeniden yüklenir
  useEffect(() => {
    if (!sid || formlar.isLoading) return
    setTaslak(kayitli(sid) ?? bos(sid, tarih))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, tarih, formlar.data])

  function ozetOf(r: OgrenciSatiri): Ozet {
    const ds = dsq.data!
    const son = r.hucreler.map((h, i) => ({ h, e: A!.denemeler[i]! })).filter((x) => x.h.net !== null)
    const sonR = son.at(-1)
    const ders = ds.subjects.map((d) => {
      const idx = (eid: string) => ds.results.find((x) => x.exam_id === eid && x.student_id === r.student.id)
      const a = sonR ? idx(sonR.e.id)?.subjects[d.code] : undefined
      const b = son.at(-2) ? idx(son.at(-2)!.e.id)?.subjects[d.code] : undefined
      return { ad: d.ad, net: a ? fmt(a.net) : '—', onceki: b ? fmt(b.net) : '—', fark: a && b ? a.net - b.net : null, pct: r.dersYuzde[d.code as Subject] ?? null }
    })
    const sirali = ders.filter((d) => d.pct !== null).sort((a, b) => b.pct! - a.pct!)
    const durum = (st: AttendanceStatus) => (att.data ?? []).filter((x) => x.student_id === r.student.id && x.status === st).length
    return {
      denemeler: son.slice(-5).map(({ h, e }, i, arr) => ({
        ad: e.name,
        tarih: trD(e.exam_date),
        puan: h.score != null ? fmt(h.score) : '—',
        net: fmt(h.net!),
        degisim: i > 0 ? h.net! - arr[i - 1]!.h.net! : null,
      })),
      dersler: ders,
      guclu: sirali.slice(0, 2).map((d) => d.ad),
      destek: sirali.length > 2 ? sirali.slice(-2).reverse().map((d) => d.ad) : [],
      konular: r.katildigi ? repeats(ds, r.student.id).slice(0, 5).map((x) => `${outcomeCode(x.outcome)} ${x.outcome.title}`) : [],
      gorev: { acik: r.acikGorev, geciken: r.gecikenGorev },
      devamsizlik: (['devamsiz', 'gec', 'izinli', 'raporlu'] as AttendanceStatus[]).map((st) => [ATT_TR[st], durum(st)]),
      gorusmeler: (meetings.data ?? [])
        .filter((m) => m.student_id === r.student.id)
        .slice(0, 3)
        .map((m) => `${trD(m.starts_at.slice(0, 10))} · ${m.with_whom === 'veli' ? 'Veli' : m.with_whom === 'ogrenci' ? 'Öğrenci' : 'Veli ve öğrenci'}${m.note ? ` · ${m.note}` : ''}`),
    }
  }

  async function kaydet(sonraki: boolean) {
    if (!taslak) return
    setBusy(true)
    const { id: _id, updated_at: _u, ...veri } = taslak
    const temiz = { ...veri, katilan: veri.katilan?.trim() || null, veli_gorusu: veri.veli_gorusu?.trim() || null, kararlar: veri.kararlar?.trim() || null, notlar: veri.notlar?.trim() || null }
    const r = await supabase.from('veli_toplanti_formlari').upsert({ ...temiz, school_id: profile?.school_id }, { onConflict: 'student_id,toplanti_tarihi' })
    setBusy(false)
    if (r.error) return toast('Kaydedilemedi. Tekrar dene.', 'warn')
    toast('Form kaydedildi.')
    await qc.invalidateQueries({ queryKey: ['veli-toplanti'] })
    if (sonraki) {
      const i = ids.indexOf(taslak.student_id)
      if (i >= 0 && i < ids.length - 1) setSecili(ids[i + 1]!)
    }
  }

  async function pdf(hepsi: boolean) {
    if (!A) return
    setBusy(true)
    try {
      const { veliToplantiPdfBlob } = await import('@/lib/pdf')
      const rs = hepsi ? A.satirlar : A.satirlar.filter((r) => r.student.id === sid)
      const blob = await veliToplantiPdfBlob({
        school: info.data?.name ?? 'Buluş Küre Koleji',
        logo: ayar.bool('rapor.logo'),
        sinif: cls,
        tarih: trD(tarih),
        gozlemler: GOZLEMLER,
        ogrenciler: rs.map((r) => {
          const f = (r.student.id === taslak?.student_id ? taslak : kayitli(r.student.id)) ?? bos(r.student.id, tarih)
          return { ad: r.student.full_name, no: r.student.school_no ?? '', ozet: ozetOf(r), form: f }
        }),
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `veli-toplantisi-${cls.replace(/[^\p{L}\p{N}]+/gu, '-')}${hepsi ? '' : '-' + (rs[0]?.student.full_name ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '-')}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    } catch {
      toast('PDF oluşturulamadı.', 'warn')
    }
    setBusy(false)
  }

  if (!A || !students.data)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  const r = A.satirlar.find((x) => x.student.id === sid)
  const oz = r ? ozetOf(r) : null
  const set = (k: keyof VeliForm, v: string | null) => setTaslak((t) => (t ? { ...t, [k]: v } : t))
  const gozlem = (k: string, v: GozlemDeger) => setTaslak((t) => (t ? { ...t, gozlemler: { ...t.gozlemler, [k]: t.gozlemler[k] === v ? undefined : v } } : t))
  const degisti = !!taslak && JSON.stringify(taslak) !== JSON.stringify(kayitli(taslak.student_id) ?? bos(taslak.student_id, tarih))

  return (
    <>
      <div className="head a">
        <div>
          <button type="button" className="btn ghost sm" onClick={onBack} style={{ marginBottom: 6 }}>
            <Icon name="back" size={16} stroke={2} /> Öğrenciler
          </button>
          <h1 className="hd">{cls} · Veli toplantısı</h1>
          <p className="m" style={{ fontSize: 14, margin: '4px 0 0' }}>
            Veliyle birlikte bakılır: sınıf sıralaması yok, öğrenci kendi gelişimiyle kıyaslanır. Form yalnız öğretmenlere görünür.
          </p>
        </div>
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <label className="field" htmlFor="vtTarih">
            <span className="label">Toplantı tarihi</span>
            <input id="vtTarih" type="date" value={tarih} onChange={(e) => e.target.value && setTarih(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={() => pdf(true)} disabled={busy || !A.satirlar.length}>
            <Icon name="doc" size={16} /> Tüm sınıf PDF
          </button>
        </div>
      </div>

      <div className="vt-grid a" style={{ ['--d' as string]: 1 }}>
        <nav className="card vt-liste" aria-label="Öğrenciler">
          {A.satirlar.map((x) => {
            const ok = !!kayitli(x.student.id)
            return (
              <button key={x.student.id} type="button" className={`vt-ogr ${x.student.id === sid ? 'on' : ''}`} aria-current={x.student.id === sid ? 'true' : undefined} onClick={() => setSecili(x.student.id)} data-testid="vt-ogrenci">
                <span className="av" aria-hidden="true">
                  {initials(x.student.full_name)}
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>{x.student.full_name}</span>
                {ok && (
                  <span className="chip up" style={{ fontSize: 11 }}>
                    ✓ dolduruldu
                  </span>
                )}
              </button>
            )
          })}
          {!A.satirlar.length && <p className="m">Bu sınıfta öğrenci yok.</p>}
        </nav>

        {r && oz && taslak && (
          <div style={{ display: 'grid', gap: 14, minWidth: 0 }} data-testid="vt-kart">
            <section className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <h2 className="sec" style={{ margin: 0 }}>
                  {r.student.full_name}
                </h2>
                <span className="m">
                  {cls}
                  {r.student.school_no ? ` · No ${r.student.school_no}` : ''}
                </span>
              </div>
              <div className="vt-ozet">
                <div>
                  <b>Deneme gelişimi</b>
                  {oz.denemeler.length ? (
                    <table className="vt-tablo">
                      <thead>
                        <tr>
                          <th>Deneme</th>
                          <th className="num">Puan</th>
                          <th className="num">Net</th>
                          <th className="num">Değişim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oz.denemeler.map((d) => (
                          <tr key={d.ad + d.tarih}>
                            <td>
                              {d.ad} <span className="m">{d.tarih}</span>
                            </td>
                            <td className="num">{d.puan}</td>
                            <td className="num">{d.net}</td>
                            <td className="num">
                              {d.degisim === null ? '—' : <span style={{ color: d.degisim >= 0 ? 'var(--primary)' : 'var(--signal-ink, var(--signal))' }}>{d.degisim >= 0 ? '↑' : '↓'} {signed(d.degisim)}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="m">Bu dönem deneme sonucu yok.</p>
                  )}
                </div>
                <div>
                  <b>Dersler (son deneme)</b>
                  <table className="vt-tablo">
                    <tbody>
                      {oz.dersler.map((d) => (
                        <tr key={d.ad}>
                          <td>{d.ad}</td>
                          <td className="num">{d.net}</td>
                          <td className="num">{d.fark === null ? '' : <span style={{ color: d.fark >= 0 ? 'var(--primary)' : 'var(--signal-ink, var(--signal))' }}>{d.fark >= 0 ? '↑' : '↓'} {signed(d.fark)}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="vt-ozet" style={{ marginTop: 10 }}>
                <div>
                  {oz.guclu.length > 0 && (
                    <p style={{ margin: '0 0 4px' }}>
                      <b>Güçlü:</b> {oz.guclu.join(', ')}
                    </p>
                  )}
                  {oz.destek.length > 0 && (
                    <p style={{ margin: '0 0 4px' }}>
                      <b>Desteğe ihtiyaç:</b> {oz.destek.join(', ')}
                    </p>
                  )}
                  <b>Tekrar eden hatalı konular</b>
                  {oz.konular.length ? (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {oz.konular.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m" style={{ margin: '4px 0 0' }}>
                      Tekrar eden hatalı konu yok.
                    </p>
                  )}
                </div>
                <div>
                  <p style={{ margin: '0 0 4px' }}>
                    <b>Görevler:</b> {oz.gorev.acik} açık{oz.gorev.geciken ? `, ${oz.gorev.geciken} gecikmiş` : ''}
                  </p>
                  <p style={{ margin: '0 0 4px' }}>
                    <b>Devamsızlık (bu yıl):</b> {oz.devamsizlik.map(([k, v]) => `${k} ${v}`).join(' · ')}
                  </p>
                  <b>Son görüşmeler</b>
                  {oz.gorusmeler.length ? (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {oz.gorusmeler.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m" style={{ margin: '4px 0 0' }}>
                      Kayıtlı görüşme yok.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="card" style={{ padding: '16px 20px', display: 'grid', gap: 12 }} aria-label="Görüşme formu">
              <b>Gözlemler</b>
              <div style={{ display: 'grid', gap: 6 }}>
                {GOZLEMLER.map(([k, t]) => (
                  <div key={k} className="vt-madde" role="group" aria-label={t}>
                    <span>{t}</span>
                    <span className="vt-secim">
                      {(Object.keys(DEGER_TR) as GozlemDeger[]).map((v) => (
                        <button key={v} type="button" className={`vt-d vt-${v} ${taslak.gozlemler[k] === v ? 'on' : ''}`} aria-pressed={taslak.gozlemler[k] === v} onClick={() => gozlem(k, v)}>
                          {taslak.gozlemler[k] === v ? '✓ ' : ''}
                          {DEGER_TR[v]}
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="vt-alanlar">
                <label className="field" htmlFor="vtKatilan">
                  <span className="label">Görüşmeye katılan</span>
                  <input id="vtKatilan" placeholder="ör. Anne, baba" maxLength={200} value={taslak.katilan ?? ''} onChange={(e) => set('katilan', e.target.value)} />
                </label>
                <label className="field" htmlFor="vtTakip">
                  <span className="label">Takip görüşmesi</span>
                  <input id="vtTakip" type="date" value={taslak.takip_tarihi ?? ''} onChange={(e) => set('takip_tarihi', e.target.value || null)} />
                </label>
              </div>
              {(
                [
                  ['veli_gorusu', 'Velinin görüşü / isteği', 'vtGorus'],
                  ['kararlar', 'Birlikte alınan kararlar', 'vtKarar'],
                  ['notlar', 'Öğretmen notu', 'vtNot'],
                ] as const
              ).map(([k, t, id]) => (
                <label key={k} className="field" htmlFor={id}>
                  <span className="label">{t}</span>
                  <textarea id={id} rows={2} maxLength={4000} value={taslak[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                </label>
              ))}
              <div className="btns">
                <button type="button" className="btn pri" onClick={() => kaydet(false)} disabled={busy || !degisti}>
                  Kaydet
                </button>
                <button type="button" className="btn" onClick={() => kaydet(true)} disabled={busy || !degisti}>
                  Kaydet ve sonraki öğrenci
                </button>
                <button type="button" className="btn ghost" onClick={() => pdf(false)} disabled={busy}>
                  <Icon name="doc" size={16} /> Bu öğrencinin PDF'i
                </button>
                {degisti && (
                  <span className="m" role="status" style={{ alignSelf: 'center', fontSize: 13 }}>
                    Kaydedilmemiş değişiklik var.
                  </span>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  )
}
