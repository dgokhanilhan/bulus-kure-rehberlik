// Yaklaşan deneme (0091): yayınevinin önceden gönderdiği kazanım listesi. Rehberlik ekler; takvimdeki denemeye bağlanır;
// sonuç PDF'i yüklenince eksik kazanımları tamamlar (sonuçlara dokunmaz). Veli/öğrenci takvimden konu listesini görür.
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useClasses, useDataset, useStudents } from '@/lib/data'
import { SUBJECT, studentExams, type LgsSubject } from '@/lib/analiz'
import { addDays, todayISO, trD } from '@/lib/format'
import { LEVEL_TR } from '@/lib/roles'
import {
  dersSayilari,
  kazanimlariEsle,
  kazanimTablosuOku,
  konuGruplari,
  planOlustur,
  tekrarKonulari,
  type KatalogKazanim,
  type KazanimDosyasi,
  type KonuSorusu,
  type Plan,
  type TekrarKonusu,
  type YaklasanSoru,
} from '@/lib/yaklasan'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { ConfirmDelete } from '@/components/ConfirmDelete'

export interface YaklasanRow {
  id: string
  name: string
  exam_date: string
  grade: number
  publisher: string | null
  calendar_event_id: string | null
  exam_id: string | null
  soru: number
  eslesen: number
  takvim: { title: string; starts_on: string } | null
}

export function useYaklasanlar(enabled = true) {
  return useQuery({
    queryKey: ['yaklasan'],
    enabled,
    queryFn: async () => {
      const [y, s] = await Promise.all([
        supabase
          .from('yaklasan_denemeler')
          .select('id, name, exam_date, grade, publisher, calendar_event_id, exam_id, calendar_events(title, starts_on)')
          .order('exam_date', { ascending: false }),
        supabase.from('yaklasan_deneme_sorulari').select('deneme_id, match'),
      ])
      if (y.error) throw y.error
      const n = new Map<string, [number, number]>()
      for (const r of s.data ?? []) {
        const c = n.get(r.deneme_id) ?? [0, 0]
        n.set(r.deneme_id, [c[0] + 1, c[1] + Number(r.match !== 'none')])
      }
      return (y.data ?? []).map(({ calendar_events: t, ...r }) => ({
        ...r,
        soru: n.get(r.id)?.[0] ?? 0,
        eslesen: n.get(r.id)?.[1] ?? 0,
        takvim: (Array.isArray(t) ? t[0] : t) ?? null,
      })) as YaklasanRow[]
    },
  })
}

/** Seçilen yaklaşan denemenin planı (ders|kitapçık|soru → güvenilir kazanım). */
export function useYaklasanPlan(id: string | null) {
  return useQuery({
    queryKey: ['yaklasan-plan', id],
    enabled: !!id,
    queryFn: async (): Promise<Plan> => {
      const { data, error } = await supabase.from('yaklasan_deneme_sorulari').select('subject, q_no, q_b, q_c, q_d, outcome_code, match').eq('deneme_id', id!)
      if (error) throw error
      return planOlustur((data ?? []) as Parameters<typeof planOlustur>[0])
    },
  })
}

// ---------- Ekleme ----------
/** .field içindeki seçim kutusu metin kutusu gibi genişlemesin; dokunma hedefi satırın tamamı (label). */
const SECIM = { width: 20, height: 20, minHeight: 0, flex: 'none', margin: 0 } as const
type Takvim = { mode: 'bagla'; event_id: string } | { mode: 'yeni'; target: 'okul' | 'kademe' | 'sinif'; level: string; class_ids: string[] }
interface TakvimAday {
  id: string
  title: string
  starts_on: string
  target: string
  level: string | null
  class_id: string | null
  class_ids: string[] | null
}

export function YaklasanEkle({ onClose, bagliEtkinlikler }: { onClose: () => void; bagliEtkinlikler: string[] }) {
  const toast = useToast()
  const qc = useQueryClient()
  const classes = useClasses()
  const [dosya, setDosya] = useState<(KazanimDosyasi & { dosyaAdi: string }) | null>(null)
  const [ad, setAd] = useState('')
  const [tarih, setTarih] = useState('')
  const [takvim, setTakvim] = useState<Takvim | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const adaylar = useQuery({
    queryKey: ['yaklasan-takvim', tarih],
    enabled: !!tarih,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, starts_on, target, level, class_id, class_ids')
        .eq('type', 'deneme')
        .gte('starts_on', addDays(tarih, -7))
        .lte('starts_on', addDays(tarih, 7))
        .order('starts_on')
      if (error) throw error
      return ((data ?? []) as TakvimAday[]).filter((e) => !bagliEtkinlikler.includes(e.id))
    },
  })
  const sinifAdi = (id: string | null) => classes.data?.find((c) => c.id === id)?.name ?? 'Sınıf'
  const hedef = (e: TakvimAday) =>
    e.target === 'okul'
      ? 'Tüm okul'
      : e.target === 'kademe'
        ? LEVEL_TR[e.level as keyof typeof LEVEL_TR]
        : e.target === 'sinif'
          ? (e.class_ids?.length ? e.class_ids : [e.class_id]).map(sinifAdi).join(', ')
          : 'Kişiye özel'
  const sinifSec = (grade: number | null) => (classes.data ?? []).filter((c) => c.active !== false && c.grade === (grade ?? 8)).map((c) => c.id)

  // Varsayılan takvim seçimi: aynı güne en yakın deneme etkinliği; yoksa dosyadaki sınıf düzeyinin bütün şubeleri.
  const varsayilan = (list: TakvimAday[] | undefined, grade: number | null): Takvim => {
    const yakin = [...(list ?? [])].sort(
      (a, b) => Math.abs(Date.parse(a.starts_on) - Date.parse(tarih)) - Math.abs(Date.parse(b.starts_on) - Date.parse(tarih)),
    )[0]
    return yakin ? { mode: 'bagla', event_id: yakin.id } : { mode: 'yeni', target: 'sinif', level: 'ortaokul', class_ids: sinifSec(grade) }
  }
  const secim = takvim ?? (tarih && adaylar.data ? varsayilan(adaylar.data, dosya?.sinif ?? null) : null)

  async function oku(f: File) {
    setHata(null)
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new Error('Kazanım listesi Excel (.xlsx) dosyası olmalı.')
      const { default: readXlsxFile } = await import('read-excel-file')
      const rows = (await readXlsxFile(f)).map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))
      const d = kazanimTablosuOku(rows)
      if (!d.sorular.length) throw new Error('Bu dosyada soru-kazanım tablosu bulunamadı. Her ders "A KİTAPÇIĞI" sütunlu bir başlık satırıyla başlamalı.')
      const kat = await supabase.from('outcomes').select('code, subject, title, full_text')
      if (kat.error) throw kat.error
      setDosya({ ...d, sorular: kazanimlariEsle(d.sorular, (kat.data ?? []) as KatalogKazanim[]), dosyaAdi: f.name })
      setAd((a) => a || d.ad || f.name.replace(/\.xlsx$/i, ''))
    } catch (e) {
      setHata((e as Error).message)
    }
  }

  async function kaydet() {
    if (!dosya || !secim) return
    if (ad.trim().length < 2) return setHata('Deneme adını yaz.')
    if (!tarih) return setHata('Denemenin tarihini seç.')
    if (secim.mode === 'yeni' && secim.target === 'sinif' && !secim.class_ids.length) return setHata('Takvim için en az bir sınıf seç.')
    setBusy(true)
    const { error } = await supabase.rpc('yaklasan_deneme_kaydet', {
      p: {
        name: ad.trim(),
        // Takvimdeki denemeye bağlanırsa tarih etkinliğin tarihidir (ikisi ayrışmasın)
        exam_date: secim.mode === 'bagla' ? (adaylar.data?.find((e) => e.id === secim.event_id)?.starts_on ?? tarih) : tarih,
        grade: dosya.sinif ?? 8,
        source_name: dosya.dosyaAdi,
        items: dosya.sorular,
        takvim: secim,
      },
    })
    setBusy(false)
    if (error) return setHata(error.message || 'Kaydedilemedi.')
    qc.invalidateQueries({ queryKey: ['yaklasan'] })
    qc.invalidateQueries({ queryKey: ['calendar'] })
    toast(secim.mode === 'yeni' ? `${ad.trim()} eklendi ve takvime yazıldı` : `${ad.trim()} eklendi ve takvimdeki denemeye bağlandı`)
    onClose()
  }

  const sayilar = dosya ? dersSayilari(dosya.sorular) : {}
  return (
    <Modal
      title="Yaklaşan deneme ekle"
      sub="Yayınevinin gönderdiği kazanım listesi"
      width={640}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" disabled={!dosya || !secim || busy} onClick={kaydet}>
            Kaydet
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <p className="m" style={{ margin: 0, fontSize: 14 }}>
          Liste isteğe bağlıdır. Sonuç PDF'i yüklenirken PDF'te okunamayan konular bu listeden tamamlanır; puan ve netler değişmez. Veli ve öğrenciler
          takvimdeki denemeden konuları görür.
        </p>
        <label className="field" htmlFor="ykDosya">
          Kazanım listesi (.xlsx)
          <input
            id="ykDosya"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => (e.target.files?.[0] && oku(e.target.files[0]), (e.target.value = ''))}
          />
        </label>
        {hata && (
          <div className="card issue" role="alert">
            <b>{hata}</b>
          </div>
        )}
        {dosya && (
          <>
            <div className="card" style={{ padding: '10px 14px' }} data-testid="yk-onizleme">
              <b style={{ fontSize: 14 }}>
                {dosya.dosyaAdi} · {dosya.sorular.length} soru{dosya.sinif ? ` · ${dosya.sinif}. sınıf` : ''}
              </b>
              {(Object.keys(sayilar) as LgsSubject[]).map((d) => {
                const es = dosya.sorular.filter((s) => s.subject === d && s.match !== 'none').length
                return (
                  <div className="kv" key={d} style={{ fontSize: 14 }}>
                    <span>{SUBJECT[d].ad}</span>
                    <span className="m">
                      {sayilar[d]} soru ·{' '}
                      {es === sayilar[d] ? 'hepsi resmî listeyle eşleşti' : es ? `${es} tanesi resmî listeyle eşleşti` : 'yalnız konu adları alınacak'}
                    </span>
                  </div>
                )
              })}
              {dosya.uyarilar.map((u) => (
                <span key={u} className="m" style={{ fontSize: 13, display: 'block' }}>
                  {u}
                </span>
              ))}
            </div>
            <div className="grid2">
              <label className="field" htmlFor="ykAd">
                Deneme adı
                <input id="ykAd" value={ad} onChange={(e) => setAd(e.target.value)} />
              </label>
              <label className="field" htmlFor="ykTarih">
                Tarih
                <input id="ykTarih" type="date" value={tarih} min={addDays(todayISO(), -60)} onChange={(e) => (setTarih(e.target.value), setTakvim(null))} />
              </label>
            </div>
            {tarih && (
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} data-testid="yk-takvim">
                <legend>Takvim</legend>
                {(adaylar.data ?? []).map((e) => (
                  <label className="check" key={e.id} style={{ minHeight: 44, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="ykTakvim"
                      style={SECIM}
                      checked={secim?.mode === 'bagla' && secim.event_id === e.id}
                      onChange={() => setTakvim({ mode: 'bagla', event_id: e.id })}
                    />
                    <span>
                      Takvimdeki denemeyle eşleştir: <b>{e.title}</b> · {trD(e.starts_on)} · {hedef(e)}
                    </span>
                  </label>
                ))}
                <label className="check" style={{ minHeight: 44, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="ykTakvim"
                    style={SECIM}
                    checked={secim?.mode === 'yeni'}
                    onChange={() => setTakvim({ mode: 'yeni', target: 'sinif', level: 'ortaokul', class_ids: sinifSec(dosya.sinif) })}
                  />
                  <span>{adaylar.data?.length ? 'Hiçbiri; takvime yeni deneme olarak ekle' : 'Takvimde bu tarihe yakın deneme yok; takvime ekle'}</span>
                </label>
                {secim?.mode === 'yeni' && (
                  <div className="stack" style={{ gap: 6, paddingLeft: 30 }}>
                    <div className="btns" style={{ flexWrap: 'wrap' }}>
                      {(classes.data ?? [])
                        .filter((c) => c.active !== false && (c.grade === (dosya.sinif ?? 8) || secim.class_ids.includes(c.id)))
                        .map((c) => (
                          <label className="check" key={c.id} style={{ width: 'auto', minHeight: 44, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              style={SECIM}
                              checked={secim.class_ids.includes(c.id)}
                              onChange={(ev) =>
                                setTakvim({ ...secim, class_ids: ev.target.checked ? [...secim.class_ids, c.id] : secim.class_ids.filter((x) => x !== c.id) })
                              }
                            />
                            {c.name}
                          </label>
                        ))}
                    </div>
                    <span className="m" style={{ fontSize: 13 }}>
                      Takvime eklenince seçilen sınıfların veli ve öğrencilerine bildirim gider.
                    </span>
                  </div>
                )}
              </fieldset>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------- Rehberlik listesi ----------
export function YaklasanListesi({ onSonucYukle }: { onSonucYukle: (y: YaklasanRow) => void }) {
  const list = useYaklasanlar()
  const toast = useToast()
  const qc = useQueryClient()
  const [ekle, setEkle] = useState(false)
  const [sil, setSil] = useState<YaklasanRow | null>(null)
  const [konu, setKonu] = useState<YaklasanRow | null>(null)
  const today = todayISO()
  const rows = list.data ?? []
  return (
    <section
      className="card a"
      style={{ ['--d' as string]: 3, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
      data-testid="yaklasan-liste"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--primary-soft)',
            color: 'var(--primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="cal" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b>Yaklaşan denemeler</b>
          <div className="m" style={{ fontSize: 13 }}>
            Yayınevi kazanım listesini önceden gönderdiyse buraya ekle (isteğe bağlı).
          </div>
        </div>
        <button className="btn sm" onClick={() => setEkle(true)}>
          <Icon name="plus" size={14} /> Kazanım listesi ekle
        </button>
      </div>
      {rows.length > 0 && (
        <div className="tbl">
          <table>
            <tbody>
              {rows.map((y) => (
                <tr key={y.id} data-testid="yaklasan-satir">
                  <td>
                    <b>{y.name}</b>
                    <div className="m" style={{ fontSize: 12 }}>
                      {y.soru} soru · {y.eslesen} kazanım eşleşti{y.grade !== 8 ? ` · ${y.grade}. sınıf` : ''}
                    </div>
                  </td>
                  <td className="m">{trD(y.exam_date)}</td>
                  <td>
                    <span className={`chip ${y.exam_id ? 'up' : 'n'}`}>
                      {y.exam_id ? 'Sonucu yüklendi' : y.exam_date > today ? 'Yaklaşıyor' : 'Sonuç bekleniyor'}
                    </span>
                    {y.takvim ? (
                      <span className="chip n" style={{ marginLeft: 6 }} title={`Takvim: ${y.takvim.title}`}>
                        Takvimde
                      </span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!y.exam_id && y.exam_date <= today && y.grade === 8 && (
                      <button className="btn sm" onClick={() => onSonucYukle(y)} aria-label={`${y.name} sonucunu yükle`}>
                        Sonucu yükle
                      </button>
                    )}
                    <button className="btn sm ghost" onClick={() => setKonu(y)} aria-label={`${y.name} konularını gör`}>
                      Konular
                    </button>
                    <button className="btn sm ghost" style={{ color: 'var(--signal-ink)' }} onClick={() => setSil(y)} aria-label={`${y.name} listesini sil`}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ekle && <YaklasanEkle onClose={() => setEkle(false)} bagliEtkinlikler={rows.flatMap((r) => (r.calendar_event_id ? [r.calendar_event_id] : []))} />}
      {konu && <KonuPenceresi denemeId={konu.id} baslik={konu.name} tarih={konu.exam_date} onClose={() => setKonu(null)} />}
      {sil && (
        <ConfirmDelete
          title="Kazanım listesini sil"
          name={sil.name}
          onClose={() => setSil(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('yaklasan_denemeler').delete().eq('id', sil.id)
            if (error) return error.message || 'Silinemedi.'
            qc.invalidateQueries({ queryKey: ['yaklasan'] })
            toast(`${sil.name} listesi silindi`)
            setSil(null)
            return null
          }}
        >
          <b>{sil.name}</b> kazanım listesi silinecek. Takvimdeki etkinlik ve yüklenmiş sonuçlar olduğu gibi kalır.
        </ConfirmDelete>
      )}
    </section>
  )
}

/** Rehberlik için konu listesi (doğrudan tablodan). */
function KonuPenceresi({ denemeId, baslik, tarih, onClose }: { denemeId: string; baslik: string; tarih: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['yaklasan-konu', denemeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('yaklasan_deneme_sorulari')
        .select('subject, q_no, konu, outcome_code')
        .eq('deneme_id', denemeId)
        .order('subject')
        .order('q_no')
      if (error) throw error
      return (data ?? []).map((s) => ({ ders: s.subject, no: s.q_no, konu: s.konu, kod: s.outcome_code })) as KonuSorusu[]
    },
  })
  return (
    <Modal title="Çıkacak konular" sub={`${baslik} · ${trD(tarih)}`} onClose={onClose}>
      {q.data ? <KonuIcerik sorular={q.data} kim="ogretmen" /> : <span className="spinner" />}
    </Modal>
  )
}

// ---------- Konu listesi içeriği (takvim ve rehberlik ortak) ----------
/** "Elif" → "Elif'in", "Ayşe" → "Ayşe'nin" (Türkçe ilgi eki). */
export function ilgiEki(ad: string) {
  const s = ad.trim()
  const unluler = s.toLocaleLowerCase('tr').match(/[aeıioöuü]/g)
  const son = unluler?.[unluler.length - 1] ?? 'e'
  const ek = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' }[son]!
  return `${s}'${/[aeıioöuü]$/i.test(s.toLocaleLowerCase('tr')) ? 'n' : ''}${ek}`
}

export function KonuIcerik({
  sorular,
  kim,
  ad,
  tekrar,
  gecmisVar,
}: {
  sorular: KonuSorusu[]
  kim: 'veli' | 'ogrenci' | 'ogretmen'
  ad?: string
  tekrar?: TekrarKonusu[]
  gecmisVar?: boolean
}) {
  const gruplar = useMemo(() => konuGruplari(sorular, () => undefined), [sorular])
  const [acik, setAcik] = useState<string | null>(gruplar[0]?.ders ?? null)
  const veli = kim === 'veli'
  return (
    <div className="stack" style={{ gap: 14 }} data-testid="konu-icerik">
      {kim !== 'ogretmen' && tekrar && tekrar.length > 0 && (
        <div className="stack" style={{ gap: 8 }} data-testid="tekrar-konulari">
          <b style={{ fontSize: 16 }}>Önce bunlara göz atılabilir</b>
          <p className="m" style={{ fontSize: 14, margin: 0 }}>
            {veli
              ? `Bu denemede çıkacak ve ${ad ? ilgiEki(ad) : 'çocuğunuzun'} önceki denemelerinde zorlandığı konular. Deneme öncesinde birlikte kısa bir tekrar yapmanızı öneririz.`
              : 'Bu denemede çıkacak ve önceki denemelerinde zorlandığın konular. Deneme öncesinde kısa bir tekrar iyi gelir.'}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tekrar.map((t) => (
              <li key={t.kod} style={{ padding: 12, borderRadius: 12, background: 'var(--surface-sunken)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <b style={{ flex: 1, fontSize: 15 }}>{t.konu}</b>
                  <span className="chip n" style={{ whiteSpace: 'nowrap' }}>
                    {t.soru} soru
                  </span>
                </div>
                <span className="m" style={{ fontSize: 13 }}>
                  {SUBJECT[t.ders].ad} · Bu konudan soru gelen {t.girdigi} denemeden {t.yanlis} tanesinde {veli ? 'yanlış vardı' : 'yanlışın vardı'}.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {kim !== 'ogretmen' && tekrar && tekrar.length === 0 && gecmisVar && (
        <p className="m" style={{ fontSize: 14, margin: 0 }} data-testid="tekrar-yok">
          {veli ? 'Önceki denemelerde bu konulardan yanlış görünmüyor.' : 'Önceki denemelerinde bu konulardan yanlışın görünmüyor.'} Konuların tamamına aşağıdan
          göz {veli ? 'atabilirsiniz' : 'atabilirsin'}.
        </p>
      )}
      <div>
        <b style={{ fontSize: 16 }}>Konuların tamamı</b>
        {gruplar.map((g) => (
          <div key={g.ders} style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}>
            <button
              type="button"
              className="check"
              aria-expanded={acik === g.ders}
              onClick={() => setAcik(acik === g.ders ? null : g.ders)}
              style={{ minHeight: 44, fontWeight: 700, cursor: 'pointer', color: 'inherit' }}
            >
              <Icon name={acik === g.ders ? 'down' : 'right'} size={14} stroke={2.4} />
              <span style={{ flex: 1 }}>
                {SUBJECT[g.ders].ad} · {g.toplam} soru
              </span>
            </button>
            {acik === g.ders && (
              <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, fontSize: 14 }}>
                {g.konular.map((k) => (
                  <li key={k.konu} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
                    <span>{k.konu}</span>
                    <span className="m mono">{k.sayi}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="m" style={{ fontSize: 12, margin: 0 }}>
        Konu listesi yayınevinin gönderdiği listeden alındı; denemede küçük farklar olabilir.
      </p>
    </div>
  )
}

export type { YaklasanSoru }

// ---------- Takvim: deneme etkinliğinin konuları ----------
interface TakvimKonu {
  id: string
  ad: string
  tarih: string
  sonuc_var: boolean
  sorular: KonuSorusu[]
}
/** Etkinliğin konu listesi (yaklasan_deneme_konulari) + veli/öğrenci için tekrar etmesi iyi olacak konular (kendi denemelerinden). */
export function useTakvimKonulari(eventId: string | null) {
  const { profile, activeStudent } = useAuth()
  const q = useQuery({
    queryKey: ['yaklasan-takvim-konu', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('yaklasan_deneme_konulari', { p_event: eventId })
      if (error) throw error
      return (data ?? null) as TakvimKonu | null
    },
  })
  const rol = profile?.role
  const kim: 'veli' | 'ogrenci' | 'ogretmen' = rol === 'veli' ? 'veli' : rol === 'ogrenci' ? 'ogrenci' : 'ogretmen'
  const students = useStudents()
  const list = students.data ?? []
  const s =
    kim === 'ogrenci' ? list.find((x) => x.id === profile?.student_id) : kim === 'veli' ? (list.find((x) => x.id === activeStudent?.id) ?? list[0]) : undefined
  // Öğrenci yalnız kendisiyle karşılaştırılır; LGS verisi yalnız 8. sınıfta sorgulanır.
  const ds = useDataset(!!q.data && !!s && s.grade === 8)
  const tekrar = useMemo(() => (ds.data && s && q.data ? tekrarKonulari(ds.data, s.id, q.data.sorular) : undefined), [ds.data, s, q.data])
  const gecmisVar = !!(ds.data && s && studentExams(ds.data, s.id).length)
  return { konu: q.data ?? null, kim, ad: s?.full_name.split(' ')[0], tekrar, gecmisVar }
}

export function TakvimKonuKutusu({ eventId, onAc }: { eventId: string; onAc: () => void }) {
  const { konu, kim, ad, tekrar } = useTakvimKonulari(eventId)
  if (!konu) return null
  const ders = new Set(konu.sorular.map((s) => s.ders)).size
  return (
    <div
      style={{ marginTop: 12, padding: 14, borderRadius: 14, background: 'var(--primary-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}
      data-testid="takvim-konu-kutusu"
    >
      <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Icon name="book" size={18} /> Çıkacak konular hazır
      </b>
      <span style={{ fontSize: 14 }}>
        {konu.sorular.length} soru · {ders} ders
        {tekrar && tekrar.length > 0
          ? kim === 'veli'
            ? ` · ${ad ? ilgiEki(ad) : 'Çocuğunuzun'} tekrar etmesi iyi olacak ${tekrar.length} konu var`
            : ` · Tekrar etmen iyi olacak ${tekrar.length} konu var`
          : ''}
      </span>
      <button className="btn pri" style={{ width: '100%', minHeight: 44 }} onClick={onAc}>
        Konuları gör
      </button>
    </div>
  )
}

export function TakvimKonuPenceresi({ eventId, onBack, onClose }: { eventId: string; onBack: () => void; onClose: () => void }) {
  const { konu, kim, ad, tekrar, gecmisVar } = useTakvimKonulari(eventId)
  return (
    <Modal title="Çıkacak konular" sub={konu ? `${konu.ad} · ${trD(konu.tarih)} · ${konu.sorular.length} soru` : undefined} onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={onBack}>
          <Icon name="back" size={14} /> Etkinliğe dön
        </button>
        {konu ? <KonuIcerik sorular={konu.sorular} kim={kim} ad={ad} tekrar={tekrar} gecmisVar={gecmisVar} /> : <span className="spinner" />}
      </div>
    </Modal>
  )
}
