// Görev takip tablosu (0094): öğrenci dosyası → Görevler → "Takip tablosu". Her göreve 3 kontrol (tarih + çözülen).
// Karekoddan gelen telefon görünümü "hızlı giriş"tir. Excel ve A4 takip formu (PDF) aynı satırlardan üretilir.
// Kontroller yalnız personele görünür; veli ve öğrenci yalnız görevin toplam ilerlemesini (tasks.solved) görür.
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAyar } from '@/lib/ayarlar'
import type { Task } from '@/lib/data'
import type { GorevEtki } from '@/lib/analiz'
import { todayISO } from '@/lib/format'
import { DURUM_TR, beklenen, etkiKisa, formGorevleri, gg, kontrolFarki, oneriTarihleri, takipDurumu, verilisGunu, type Kontrol } from '@/lib/gorevTakip'
import type { FormOgrenci } from '@/lib/gorevTakipPdf'
import { SUBJECT_SHORT } from './Tasks'
import { useToast } from './Toast'
import { Icon } from './Icon'

export interface TakipOgrenci {
  id: string
  full_name: string
  class_name: string
  school_no: string | null
}

export function useGorevKontrolleri(taskIds: string[]) {
  const key = taskIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['gorev-kontrol', key],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const out: Kontrol[] = []
      for (let i = 0; i < taskIds.length; i += 200) {
        const { data, error } = await supabase
          .from('gorev_kontrol')
          .select('task_id, sira, tarih, cozulen')
          .in('task_id', taskIds.slice(i, i + 200))
        if (error) throw new Error(error.message)
        out.push(...((data ?? []) as Kontrol[]))
      }
      return out
    },
  })
}

export const hizliGirisUrl = (sid: string) => `${window.location.origin}/ogrenciler/${sid}?sekme=gorevler&takip=hizli`
const ders = (t: Task) => SUBJECT_SHORT[t.subject] ?? t.subject

/** Bir öğrencinin form verisi (PDF ve toplu PDF ortak). */
export function formOgrencisi(
  s: TakipOgrenci,
  tasks: Task[],
  kontroller: Kontrol[],
  etki: ((t: Task) => GorevEtki | null) | undefined,
  bugun: string,
): FormOgrenci {
  const l = formGorevleri(tasks, bugun)
  const satirlar = l.map((t) => {
    const oneri = oneriTarihleri(t)
    const ks = [1, 2, 3].map((sira, i) => {
      const k = kontroller.find((x) => x.task_id === t.id && x.sira === sira)
      return {
        dolu: k ? { tarih: gg(k.tarih), cozulen: k.cozulen, geride: kontrolFarki(t, k).geride } : null,
        oneri: gg(oneri[i]!),
        beklenen: beklenen(t, oneri[i]!),
      }
    }) as FormOgrenci['satirlar'][number]['kontroller']
    return { ders: ders(t), konu: t.topic, soru: t.question_count, sonGun: gg(t.due_date), kontroller: ks, durum: takipDurumu(t), etki: etkiKisa(etki?.(t)) }
  })
  const bas = l.map((t) => verilisGunu(t.created_at)).sort()[0]
  const son = l
    .map((t) => t.due_date)
    .sort()
    .at(-1)
  return {
    ad: s.full_name,
    sinif: s.class_name,
    no: s.school_no,
    url: hizliGirisUrl(s.id),
    donem: bas && son ? `${gg(bas)} – ${gg(son)}` : '—',
    satirlar,
    cozulen: l.reduce((a, t) => a + Math.min(t.solved, t.question_count), 0),
    toplam: l.reduce((a, t) => a + t.question_count, 0),
    biten: l.filter((t) => takipDurumu(t) === 'bitti').length,
  }
}

export function useOkulAdi() {
  const q = useQuery({
    queryKey: ['school-name'],
    queryFn: async () => (await supabase.from('schools').select('name').maybeSingle()).data?.name as string | undefined,
  })
  return q.data || 'Buluş Küre Koleji'
}

export function dosyaIndir(blob: Blob, ad: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ad.replace(/[<>:"/\\|?*]/g, '-')
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const basimNo = (no: string | null, bugun: string) => `GT-${no ?? '0'}-${bugun.replace(/-/g, '')}`
const basimZaman = () => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

/** Takip formu PDF'i (bir ya da çok öğrenci, her biri ayrı sayfa). */
export async function takipFormuIndir(ogrenciler: FormOgrenci[], o: { okul: string; hazirlayan: string; logo: boolean; dosya: string; no: string | null }) {
  const { gorevTakipPdf } = await import('@/lib/gorevTakipPdf')
  const bugun = todayISO()
  const blob = await gorevTakipPdf({ okul: o.okul, hazirlayan: o.hazirlayan, basim: basimZaman(), formNo: basimNo(o.no, bugun), logo: o.logo, ogrenciler })
  dosyaIndir(blob, o.dosya)
}

export function GorevTakip({ s, tasks, etki, F }: { s: TakipOgrenci; tasks: Task[]; etki?: (t: Task) => GorevEtki | null; F: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const ayar = useAyar()
  const okul = useOkulAdi()
  const { profile } = useAuth()
  const bugun = todayISO()
  const liste = useMemo(() => formGorevleri(tasks, bugun), [tasks, bugun])
  const kq = useGorevKontrolleri(liste.map((t) => t.id))
  const kontroller = kq.data ?? []
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [taslak, setTaslak] = useState<Record<string, string>>({})
  const [tarih, setTarih] = useState(bugun)
  const [kaydediyor, setKaydediyor] = useState(false)
  const hizli = new URLSearchParams(window.location.search).get('takip') === 'hizli'

  const kontrol = (t: Task, sira: number) => kontroller.find((x) => x.task_id === t.id && x.sira === sira)
  const anahtar = (t: Task, sira: number) => `${t.id}|${sira}`
  const deger = (t: Task, sira: number) => taslak[anahtar(t, sira)] ?? kontrol(t, sira)?.cozulen.toString() ?? ''

  async function kaydet(t: Task, sira: number, ham: string, gun?: string): Promise<boolean> {
    const v = ham.trim() === '' ? null : Number(ham)
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > t.question_count)) {
      toast(`Çözülen soru 0 ile ${t.question_count} arasında olmalı.`)
      return false
    }
    if (v === (kontrol(t, sira)?.cozulen ?? null) && !gun) return true
    const { error } = await supabase.rpc('gorev_kontrol_kaydet', { p_task: t.id, p_sira: sira, p_cozulen: v, p_tarih: gun ?? null })
    if (error) {
      toast(error.message.includes('tarih') ? 'Kontrol tarihi görevin verildiği gün ile bugün arasında olmalı.' : 'Kaydedilemedi. Yeniden dene.')
      return false
    }
    return true
  }
  const tazele = () => {
    qc.invalidateQueries({ queryKey: ['gorev-kontrol'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  async function hucreKaydet(t: Task, sira: number) {
    const k = anahtar(t, sira)
    if (!(k in taslak)) return
    const ok = await kaydet(t, sira, taslak[k]!)
    setTaslak(({ [k]: _, ...r }) => r)
    if (ok) tazele()
  }
  async function hizliKaydet() {
    const degisen = Object.entries(taslak)
    if (!degisen.length) return toast('Değişiklik yok.')
    setKaydediyor(true)
    let n = 0
    for (const [k, v] of degisen) {
      const [id, sira] = k.split('|')
      const t = liste.find((x) => x.id === id)
      if (t && (await kaydet(t, Number(sira), v, v.trim() === '' ? undefined : tarih))) n++
    }
    setKaydediyor(false)
    setTaslak({})
    tazele()
    if (n) toast(`${n} kontrol kaydedildi.`)
  }

  async function indir(tur: 'pdf' | 'xlsx') {
    if (!liste.length) return toast('Forma girecek görev yok.')
    setBusy(tur)
    try {
      const fo = formOgrencisi(s, liste, kontroller, etki, bugun)
      if (tur === 'pdf') {
        await takipFormuIndir([fo], {
          okul,
          hazirlayan: profile?.full_name ?? '',
          logo: ayar.bool('rapor.logo'),
          dosya: `Görev takip formu - ${s.full_name}.pdf`,
          no: s.school_no,
        })
      } else {
        const { listExcel } = await import('@/lib/listExcel')
        const kolon = (id: string, title: string, width: number) => ({ id, source: id as never, title, width })
        const rows = fo.satirlar.map((r, i) => [
          String(i + 1),
          r.ders,
          r.konu,
          String(r.soru),
          r.sonGun,
          ...r.kontroller.map((k) => (k.dolu ? `${k.dolu.tarih}: ${k.dolu.cozulen}/${r.soru}${k.dolu.geride ? ` (${k.dolu.geride} geride)` : ''}` : '')),
          DURUM_TR[r.durum],
          r.etki,
        ])
        const blob = await listExcel(
          {
            title: `Görev takip · ${s.full_name} (${s.class_name})`,
            description: `Çözülen ${fo.cozulen}/${fo.toplam} soru · tamamlanan ${fo.biten}/${fo.satirlar.length} görev · dönem ${fo.donem}`,
            date: `Hazırlanma: ${basimZaman()}`,
            footer: '',
            signatures: '',
            orientation: 'landscape',
            rowHeight: 18,
            columns: [
              kolon('no', '#', 4),
              kolon('ders', 'Ders', 10),
              kolon('konu', 'Konu', 26),
              kolon('soru', 'Soru', 6),
              kolon('son', 'Son gün', 8),
              kolon('k1', '1. kontrol', 11),
              kolon('k2', '2. kontrol', 11),
              kolon('k3', '3. kontrol', 11),
              kolon('durum', 'Durum', 9),
              kolon('etki', 'Konu denemede', 10),
            ],
            classIds: [],
            studentIds: [],
            search: '',
            missingPhone: false,
            grouping: 'child',
            sort: 'name',
            excluded: [],
            entries: {},
          },
          rows,
          okul,
        )
        dosyaIndir(blob, `Görev takip - ${s.full_name}.xlsx`)
      }
    } catch {
      toast('Dosya hazırlanamadı. Yeniden dene.')
    } finally {
      setBusy(null)
    }
  }

  const ipucu = (t: Task, sira: number) => {
    const k = kontrol(t, sira)
    if (k) {
      const f = kontrolFarki(t, k)
      return (
        <span className="gt-ipucu" style={{ color: f.geride ? 'var(--signal-ink, var(--signal))' : 'var(--primary)' }}>
          {gg(k.tarih)} · {f.geride ? `↓ ${f.geride} soru geride` : '✓ yolunda'}
        </span>
      )
    }
    const o = oneriTarihleri(t)[sira - 1]!
    return (
      <span className="gt-ipucu m">
        öneri {gg(o)} · beklenen {beklenen(t, o)}
      </span>
    )
  }
  const durumChip = (t: Task) => {
    const d = takipDurumu(t)
    if (d === 'bitti') return <span className="chip up">✓ Tamamlandı</span>
    if (t.due_date < bugun) return <span className="chip down">↓ Gecikmiş</span>
    return <span className="chip n">{DURUM_TR[d]}</span>
  }
  const girdi = (t: Task, sira: number, buyuk = false) => (
    <input
      className={buyuk ? 'gt-girdi buyuk' : 'gt-girdi'}
      inputMode="numeric"
      aria-label={`${t.topic} ${sira}. kontrol, çözülen soru`}
      value={deger(t, sira)}
      disabled={!F}
      placeholder={`/ ${t.question_count}`}
      onChange={(e) => setTaslak((x) => ({ ...x, [anahtar(t, sira)]: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
      onBlur={hizli ? undefined : () => hucreKaydet(t, sira)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !hizli) (e.target as HTMLInputElement).blur()
      }}
    />
  )

  const ust = (
    <div className="kv" style={{ flexWrap: 'wrap', gap: 8 }}>
      <span className="m" style={{ fontSize: 13 }}>
        {liste.length ? `${liste.length} görev · açık olanlar ve son 14 günde tamamlananlar` : 'Forma girecek görev yok.'}
      </span>
      <div className="btns">
        <button type="button" className="btn sm" onClick={() => indir('xlsx')} disabled={busy !== null}>
          <Icon name="doc" size={16} /> {busy === 'xlsx' ? 'Hazırlanıyor…' : 'Excel'}
        </button>
        <button type="button" className="btn sm" onClick={() => indir('pdf')} disabled={busy !== null} data-testid="takip-formu-pdf">
          <Icon name="doc" size={16} /> {busy === 'pdf' ? 'Hazırlanıyor…' : 'Takip formu (PDF)'}
        </button>
      </div>
    </div>
  )

  if (hizli && F)
    return (
      <section className="card a" style={{ padding: 16, display: 'grid', gap: 12 }} aria-labelledby="gt-hizli-b" data-testid="hizli-giris">
        <div>
          <h2 id="gt-hizli-b" style={{ fontSize: 18, margin: 0 }}>
            Hızlı giriş · {s.full_name}
          </h2>
          <p className="m" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Formdaki sırayla, kâğıda yazdığın çözülen soru sayılarını gir.
          </p>
        </div>
        <label className="field" htmlFor="gtTarih" style={{ maxWidth: 220, margin: 0 }}>
          <span className="label">Kontrol tarihi</span>
          <input id="gtTarih" type="date" value={tarih} max={bugun} onChange={(e) => setTarih(e.target.value || bugun)} />
        </label>
        {liste.map((t, i) => (
          <div key={t.id} className="gt-kart" data-testid="hizli-gorev">
            <div>
              <span className="m" style={{ fontSize: 12 }}>
                {i + 1}. {ders(t)} · {t.question_count} soru · son gün {gg(t.due_date)}
              </span>
              <b style={{ display: 'block' }}>{t.topic}</b>
            </div>
            <div className="gt-uc">
              {[1, 2, 3].map((sira) => (
                <label key={sira} className="gt-k">
                  <span className="label">{sira}. kontrol</span>
                  {girdi(t, sira, true)}
                  {ipucu(t, sira)}
                </label>
              ))}
            </div>
          </div>
        ))}
        {liste.length > 0 && (
          <button type="button" className="btn pri" style={{ minHeight: 48 }} onClick={hizliKaydet} disabled={kaydediyor}>
            {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        )}
      </section>
    )

  return (
    <section className="card a" style={{ padding: 16, display: 'grid', gap: 10 }} aria-label="Görev takip tablosu" data-testid="takip-tablosu">
      {ust}
      {liste.length > 0 && (
        <div className="gt-kaydir">
          <table className="tbl gt-tablo">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th>Görev</th>
                <th style={{ width: 54 }}>Soru</th>
                <th style={{ width: 70 }}>Son gün</th>
                <th style={{ width: 120 }}>1. kontrol</th>
                <th style={{ width: 120 }}>2. kontrol</th>
                <th style={{ width: 120 }}>3. kontrol</th>
                <th style={{ width: 120 }}>Durum</th>
                <th style={{ width: 110 }}>Konu denemede</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((t, i) => (
                <tr key={t.id} data-testid="takip-satir">
                  <td>{i + 1}</td>
                  <td>
                    <span className="m" style={{ fontSize: 12 }}>
                      {ders(t)}
                    </span>
                    <br />
                    {t.topic}
                  </td>
                  <td className="mono">
                    {Math.min(t.solved, t.question_count)}/{t.question_count}
                  </td>
                  <td>{gg(t.due_date)}</td>
                  {[1, 2, 3].map((sira) => (
                    <td key={sira}>
                      {girdi(t, sira)}
                      {ipucu(t, sira)}
                    </td>
                  ))}
                  <td>{durumChip(t)}</td>
                  <td style={{ fontSize: 13 }}>{etkiKisa(etki?.(t))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {F && liste.length > 0 && (
        <p className="m" style={{ margin: 0, fontSize: 12 }}>
          Kontrole o güne kadar çözülen soru sayısını yaz; tarih kendiliğinden eklenir. Son kontrol, velinin gördüğü ilerlemeyi günceller. Kontroller veli ve
          öğrenciye görünmez.
        </p>
      )}
    </section>
  )
}

/** Sınıflar sayfası: şubenin bütün takip formları tek PDF'te (her öğrenci ayrı sayfa; formda görevi olmayan atlanır). */
export function SinifGorevFormlari({ cls, ogrenciler, etki }: { cls: string; ogrenciler: TakipOgrenci[]; etki?: (sid: string, t: Task) => GorevEtki | null }) {
  const toast = useToast()
  const ayar = useAyar()
  const okul = useOkulAdi()
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  async function yazdir() {
    setBusy(true)
    try {
      const ids = ogrenciler.map((o) => o.id)
      const tasks: Task[] = []
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .in('student_id', ids.slice(i, i + 200))
        if (error) throw new Error(error.message)
        tasks.push(...((data ?? []) as Task[]))
      }
      const bugun = todayISO()
      const acik = tasks.filter((t) => formGorevleri([t], bugun).length)
      const kontroller: Kontrol[] = []
      const tids = acik.map((t) => t.id)
      for (let i = 0; i < tids.length; i += 200) {
        const { data, error } = await supabase
          .from('gorev_kontrol')
          .select('task_id, sira, tarih, cozulen')
          .in('task_id', tids.slice(i, i + 200))
        if (error) throw new Error(error.message)
        kontroller.push(...((data ?? []) as Kontrol[]))
      }
      const formlar = ogrenciler
        .slice()
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'))
        .map((o) =>
          formOgrencisi(
            o,
            acik.filter((t) => t.student_id === o.id),
            kontroller,
            etki ? (t) => etki(o.id, t) : undefined,
            bugun,
          ),
        )
        .filter((f) => f.satirlar.length)
      if (!formlar.length) return toast(`${cls} sınıfında forma girecek görev yok.`)
      await takipFormuIndir(formlar, {
        okul,
        hazirlayan: profile?.full_name ?? '',
        logo: ayar.bool('rapor.logo'),
        dosya: `Görev takip formları - ${cls}.pdf`,
        no: null,
      })
      toast(`${formlar.length} öğrencinin formu hazırlandı.`)
    } catch {
      toast('Formlar hazırlanamadı. Yeniden dene.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className="btn" onClick={yazdir} disabled={busy || !ogrenciler.length} data-testid="sinif-takip-formlari">
      <Icon name="doc" size={16} /> {busy ? 'Hazırlanıyor…' : 'Görev takip formları'}
    </button>
  )
}
