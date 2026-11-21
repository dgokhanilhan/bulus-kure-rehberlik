// Yönetim → Kişiler → Veri sağlığı: tekrar olabilecek öğrenciler, tutarsız ad yazımı, eksik okul no,
// velisi bağlı olmayan öğrenciler, sınıf öğretmeni olmayan sınıflar. Her sorunun yanında tek adımlı çözüm.
// Yazma işlemleri veritabanında yönetici + iki adımlı doğrulamayla sınırlı (0093 RPC'leri, students/classes RLS).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isTeacherP } from '@/lib/roles'
import type { ClassRow, Profile } from '@/lib/types'
import { Confirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { adBicimsiz, adYaz, TABLO_TR, tekrarAdaylari, tutulacak, type VsOgrenci } from '@/lib/veriSagligi'

interface Bag {
  parent_id: string
  student_id: string
}

const hataMetni = (e: { code?: string; message?: string } | null) => {
  if (!e) return null
  if (e.code === '42501') return 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir.'
  if (e.code === '23505') return 'Bu okul numarası başka bir öğrencide kayıtlı.'
  let m = e.message ?? 'İşlem yapılamadı.'
  for (const [k, v] of Object.entries(TABLO_TR)) m = m.replace(new RegExp(`\\b${k}\\b`, 'g'), v)
  return m
}

function useYenile() {
  const qc = useQueryClient()
  return () => {
    for (const k of ['yonetim', 'classes', 'students', 'people', 'veri-sagligi']) qc.invalidateQueries({ queryKey: [k] })
  }
}

export function VeriSagligi({ classes, profiles, students, links }: { classes: ClassRow[]; profiles: Profile[]; students: VsOgrenci[]; links: Bag[] }) {
  const farkli = useQuery({
    queryKey: ['veri-sagligi', 'farkli'],
    queryFn: async () => {
      const { data, error } = await supabase.from('veri_farkli_kisi').select('a, b')
      if (error) throw error
      return (data as { a: string; b: string }[]).map((r) => [r.a, r.b] as [string, string])
    },
  })
  const gruplar = useMemo(() => tekrarAdaylari(students, farkli.data ?? []), [students, farkli.data])
  const ids = gruplar.flatMap((g) => g.ogrenciler.map((o) => o.id))
  const sayilar = useQuery({
    queryKey: ['veri-sagligi', 'sayilar', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ogrenci_veri_sayilari', { p_ids: ids })
      if (error) throw error
      const m: Record<string, Record<string, number>> = {}
      for (const r of data as { student_id: string; tablo: string; adet: number }[]) (m[r.student_id] ??= {})[r.tablo] = Number(r.adet)
      return m
    },
  })

  const kisiler = profiles.filter((p) => p.status === 'approved')
  const bicimsizO = students.filter((s) => adBicimsiz(s.full_name))
  const bicimsizK = kisiler.filter((p) => adBicimsiz(p.full_name))
  const noYok = students.filter((s) => !s.school_no)
  const bagli = new Set(links.map((l) => l.student_id))
  const veliYok = students.filter((s) => !bagli.has(s.id))
  const ogretmensiz = classes.filter((c) => c.active !== false && !c.homeroom_teacher_id)
  const sorun = [gruplar.length, bicimsizO.length + bicimsizK.length, noYok.length, veliYok.length, ogretmensiz.length].filter(Boolean).length

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card a" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`chip ${sorun ? 'down' : 'up'}`}>{sorun ? `${sorun} başlıkta düzeltme bekliyor` : '✓ Her şey yolunda'}</span>
        <span className="m" style={{ fontSize: 14 }}>
          Yalnız etkin öğrenciler ve onaylı hesaplar taranır. Hiçbir düzeltme sen onaylamadan yapılmaz.
        </span>
      </div>
      <Tekrarlar gruplar={gruplar} sayilar={sayilar.data ?? {}} yukleniyor={sayilar.isLoading && ids.length > 0} links={links} profiles={profiles} />
      <AdYazimi ogrenciler={bicimsizO} kisiler={bicimsizK} />
      <OkulNo liste={noYok} />
      <div className="cols" style={{ ['--side' as string]: '380px' }}>
        <VeliYok liste={veliYok} />
        <Ogretmensiz siniflar={ogretmensiz} ogretmenler={profiles.filter((p) => p.status === 'approved' && isTeacherP(p))} />
      </div>
    </div>
  )
}

function Baslik({ ad, adet, children }: { ad: string; adet: number; children?: React.ReactNode }) {
  return (
    <div className="kv" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
      <h3 className="sec" style={{ margin: 0 }}>
        {ad}
      </h3>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <span className={`chip ${adet ? 'down' : 'up'}`}>{adet ? adet : '✓'}</span>
      </span>
    </div>
  )
}

function Tekrarlar({
  gruplar,
  sayilar,
  yukleniyor,
  links,
  profiles,
}: {
  gruplar: ReturnType<typeof tekrarAdaylari>
  sayilar: Record<string, Record<string, number>>
  yukleniyor: boolean
  links: Bag[]
  profiles: Profile[]
}) {
  const toast = useToast()
  const yenile = useYenile()
  const [birlestir, setBirlestir] = useState<{ tut: VsOgrenci; sil: VsOgrenci } | null>(null)
  const toplam = (id: string) => Object.values(sayilar[id] ?? {}).reduce((a, b) => a + b, 0)
  const ozet = (id: string) => {
    const s = Object.entries(sayilar[id] ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, n]) => `${n} ${TABLO_TR[t] ?? t}`)
    return s.length ? s.join(' · ') : 'veri yok'
  }
  const veli = (id: string) => links.filter((l) => l.student_id === id).length
  const hesap = (id: string) => profiles.some((p) => p.role === 'ogrenci' && p.student_id === id && p.status === 'approved')

  async function farkliKisi(g: (typeof gruplar)[number]) {
    for (let i = 0; i < g.ogrenciler.length; i++)
      for (let j = i + 1; j < g.ogrenciler.length; j++) {
        const { error } = await supabase.rpc('ogrenci_farkli_kisi', { p_a: g.ogrenciler[i]!.id, p_b: g.ogrenciler[j]!.id })
        if (error) return toast(hataMetni(error)!)
      }
    toast('Farklı kişiler olarak işaretlendi; bir daha sorulmayacak.')
    yenile()
  }

  return (
    <section className="card a" style={{ padding: 16 }} aria-labelledby="vs-tekrar">
      <Baslik ad="Tekrar olabilecek öğrenciler" adet={gruplar.length} />
      <p className="m" style={{ fontSize: 13, marginBottom: 8 }} id="vs-tekrar">
        Adı aynı olan kayıtlar. Verisi olmayan kayıt, verisi olana tek adımda birleştirilir; veli bağlantısı, öğrenci hesabı ve okul numarası taşınır.
      </p>
      {!gruplar.length && <div className="empty">Aynı adlı öğrenci kaydı yok.</div>}
      {gruplar.map((g) => {
        const veriler = Object.fromEntries(g.ogrenciler.map((o) => [o.id, toplam(o.id)]))
        const ana = g.ogrenciler.reduce((a, b) => tutulacak(a, b, veriler)[0])
        return (
          <div key={g.anahtar} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }} data-testid="vs-grup">
            <div className="kv" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              <b>{g.ogrenciler[0]!.full_name}</b>
              <span className={`chip ${g.ayniSinif ? 'down' : 'n'}`}>{g.ayniSinif ? 'aynı sınıfta' : 'farklı sınıflarda'}</span>
            </div>
            {g.ogrenciler.map((o) => {
              const bos = !yukleniyor && toplam(o.id) === 0 && o.id !== ana.id
              return (
                <div key={o.id} className="kv" style={{ padding: '6px 0', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ minWidth: 0 }}>
                    {o.full_name} · {o.class_name}
                    {o.school_no ? ` · no ${o.school_no}` : ' · okul no yok'}
                    <span className="m" style={{ display: 'block', fontSize: 13 }}>
                      {yukleniyor ? 'Veri sayılıyor…' : ozet(o.id)} · veli {veli(o.id)}
                      {hesap(o.id) ? ' · öğrenci hesabı var' : ''}
                    </span>
                  </span>
                  {bos && (
                    <button className="btn sm pri" onClick={() => setBirlestir({ tut: ana, sil: o })}>
                      {ana.class_name === o.class_name ? 'Birleştir' : `${ana.class_name} kaydına birleştir`}
                    </button>
                  )}
                </div>
              )
            })}
            {!yukleniyor && !g.ogrenciler.some((o) => o.id !== ana.id && toplam(o.id) === 0) && (
              <p className="m" style={{ fontSize: 13 }}>
                Kayıtların hepsinde veri var; otomatik birleştirme yapılmaz. Aynı kişiyse fazla kaydı Öğrenciler bölümünden kontrol et.
              </p>
            )}
            <button className="btn sm" style={{ marginTop: 4 }} onClick={() => farkliKisi(g)}>
              Farklı kişiler
            </button>
          </div>
        )
      })}
      {birlestir && (
        <Confirm
          title="Kayıtları birleştir"
          action="Birleştir"
          onClose={() => setBirlestir(null)}
          onConfirm={async () => {
            const { error } = await supabase.rpc('ogrenci_birlestir', { p_keep: birlestir.tut.id, p_drop: birlestir.sil.id })
            if (error) return hataMetni(error)
            toast(`${birlestir.tut.full_name} kayıtları birleştirildi`)
            setBirlestir(null)
            yenile()
          }}
        >
          <p>
            <b>
              {birlestir.sil.full_name} · {birlestir.sil.class_name}
            </b>{' '}
            kaydında deneme, yoklama ya da başka veri yok. Veli bağlantısı ve öğrenci hesabı{' '}
            <b>
              {birlestir.tut.full_name} · {birlestir.tut.class_name}
            </b>{' '}
            kaydına taşınır, boş kayıt silinir.
          </p>
        </Confirm>
      )}
    </section>
  )
}

function AdYazimi({ ogrenciler, kisiler }: { ogrenciler: VsOgrenci[]; kisiler: Profile[] }) {
  const toast = useToast()
  const yenile = useYenile()
  const [acik, setAcik] = useState(false)
  const [haric, setHaric] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [geri, setGeri] = useState<{ o: { id: string; ad: string }[]; k: { id: string; ad: string }[] } | null>(null)
  const satirlar = [
    ...ogrenciler.map((s) => ({ id: s.id, ad: s.full_name, tur: s.class_name, o: true })),
    ...kisiler.map((p) => ({ id: p.id, ad: p.full_name, tur: 'hesap', o: false })),
  ]
  const secili = satirlar.filter((r) => !haric.has(r.id))

  async function calistir(o: { id: string; ad: string }[], k: { id: string; ad: string }[]) {
    setBusy(true)
    const { data, error } = await supabase.rpc('toplu_ad_duzelt', { p_ogrenciler: o, p_kisiler: k })
    setBusy(false)
    if (error) return (toast(hataMetni(error)!), null)
    yenile()
    return data as { ogrenci: number; kisi: number; atlanan: number }
  }

  return (
    <section className="card a" style={{ padding: 16 }}>
      <Baslik ad="Ad yazımı tutarsız" adet={satirlar.length} />
      {geri && (
        <div className="kv" style={{ background: 'var(--primary-soft)', borderRadius: 10, padding: 10, marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <span>✓ Adlar Türkçe kurallarıyla düzeltildi.</span>
          <button
            className="btn sm"
            disabled={busy}
            onClick={async () => {
              const r = await calistir(geri.o, geri.k)
              if (r) (toast(`${r.ogrenci + r.kisi} ad eski hâline döndü`), setGeri(null))
            }}
          >
            Geri al
          </button>
        </div>
      )}
      {!satirlar.length ? (
        <div className="empty">Tüm adlar tutarlı yazılmış.</div>
      ) : (
        <>
          <p className="m" style={{ fontSize: 13, marginBottom: 8 }}>
            Yalnız büyük/küçük harf ve fazla boşluk düzeltilir (I→ı, İ→i kurallarıyla); harfler değişmez. İstemediğin satırın işaretini kaldır.
          </p>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <span className="sr-only">Seç</span>
                  </th>
                  <th>Şu an</th>
                  <th>Düzeltilmiş</th>
                  <th>Kayıt</th>
                </tr>
              </thead>
              <tbody>
                {(acik ? satirlar : satirlar.slice(0, 6)).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${r.ad} düzeltilsin`}
                        checked={!haric.has(r.id)}
                        onChange={(e) =>
                          setHaric((h) => {
                            const n = new Set(h)
                            if (e.target.checked) n.delete(r.id)
                            else n.add(r.id)
                            return n
                          })
                        }
                        style={{ width: 20, height: 20 }}
                      />
                    </td>
                    <td className="mono" style={{ fontSize: 13 }}>
                      {r.ad}
                    </td>
                    <td>
                      <b>{adYaz(r.ad)}</b>
                    </td>
                    <td className="m">{r.o ? `öğrenci · ${r.tur}` : 'hesap'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btns" style={{ marginTop: 10 }}>
            {satirlar.length > 6 && (
              <button className="btn sm" onClick={() => setAcik(!acik)}>
                {acik ? 'Daha az göster' : `Tümünü gör (${satirlar.length})`}
              </button>
            )}
            <button
              className="btn pri"
              disabled={busy || !secili.length}
              onClick={async () => {
                const o = secili.filter((r) => r.o),
                  k = secili.filter((r) => !r.o)
                const r = await calistir(
                  o.map((x) => ({ id: x.id, ad: adYaz(x.ad) })),
                  k.map((x) => ({ id: x.id, ad: adYaz(x.ad) })),
                )
                if (!r) return
                setGeri({ o: o.map((x) => ({ id: x.id, ad: x.ad })), k: k.map((x) => ({ id: x.id, ad: x.ad })) })
                toast(`${r.ogrenci + r.kisi} ad düzeltildi${r.atlanan ? ` · ${r.atlanan} atlandı` : ''}`)
                setHaric(new Set())
              }}
            >
              {busy && <span className="spinner" aria-hidden="true" />} {secili.length} adı düzelt
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function OkulNo({ liste }: { liste: VsOgrenci[] }) {
  const toast = useToast()
  const yenile = useYenile()
  const [acik, setAcik] = useState(false)
  const [deger, setDeger] = useState<Record<string, string>>({})
  const [hata, setHata] = useState<Record<string, string>>({})
  async function kaydet(s: VsOgrenci) {
    const no = (deger[s.id] ?? '').replace(/\D/g, '').slice(0, 10)
    if (!no) return setHata((h) => ({ ...h, [s.id]: 'Okul numarasını yaz.' }))
    const { error } = await supabase.from('students').update({ school_no: no }).eq('id', s.id)
    if (error) return setHata((h) => ({ ...h, [s.id]: hataMetni(error)! }))
    toast(`${s.full_name}: okul no kaydedildi`)
    yenile()
  }
  return (
    <section className="card a" style={{ padding: 16 }}>
      <Baslik ad="Okul numarası eksik" adet={liste.length} />
      {!liste.length && <div className="empty">Tüm öğrencilerin okul numarası var.</div>}
      {(acik ? liste : liste.slice(0, 5)).map((s) => (
        <div key={s.id} className="kv" style={{ padding: '6px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
          <span>
            {s.full_name} · {s.class_name}
          </span>
          <span className="btns" style={{ alignItems: 'flex-start' }}>
            <label className="field" htmlFor={`vsno-${s.id}`} style={{ margin: 0 }}>
              <span className="sr-only">{s.full_name} okul no</span>
              <input
                id={`vsno-${s.id}`}
                inputMode="numeric"
                placeholder="Okul no"
                style={{ width: 120 }}
                value={deger[s.id] ?? ''}
                onChange={(e) => setDeger((d) => ({ ...d, [s.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && kaydet(s)}
              />
            </label>
            <button className="btn sm pri" onClick={() => kaydet(s)}>
              Kaydet
            </button>
          </span>
          {hata[s.id] && (
            <span className="err" role="alert" style={{ width: '100%' }}>
              {hata[s.id]}
            </span>
          )}
        </div>
      ))}
      {liste.length > 5 && (
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAcik(!acik)}>
          {acik ? 'Daha az göster' : `Tümünü gör (${liste.length})`}
        </button>
      )}
    </section>
  )
}

function VeliYok({ liste }: { liste: VsOgrenci[] }) {
  const siniflar = [...new Set(liste.map((s) => s.class_name))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }))
  return (
    <section className="card a" style={{ padding: 16 }}>
      <Baslik ad="Velisi bağlı olmayan öğrenciler" adet={liste.length} />
      {!liste.length ? (
        <div className="empty">Tüm öğrencilerin en az bir velisi bağlı.</div>
      ) : (
        <>
          <div className="stack" style={{ gap: 4, fontSize: 14 }}>
            {siniflar.slice(0, 8).map((c) => {
              const l = liste.filter((s) => s.class_name === c)
              return (
                <div key={c}>
                  <b>{c}</b> <span className="m">({l.length})</span>{' '}
                  {l
                    .slice(0, 4)
                    .map((s) => s.full_name)
                    .join(', ')}
                  {l.length > 4 ? ` ve ${l.length - 4} öğrenci` : ''}
                </div>
              )
            })}
            {siniflar.length > 8 && <span className="m">+{siniflar.length - 8} sınıf daha</span>}
          </div>
          <div className="btns" style={{ marginTop: 10 }}>
            <Link className="btn sm" to="/yonetim?sekme=veliler">
              Velileri yönet
            </Link>
            <Link className="btn sm" to="/yonetim?sekme=listeler">
              Davet listesi hazırla
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

function Ogretmensiz({ siniflar, ogretmenler }: { siniflar: ClassRow[]; ogretmenler: Profile[] }) {
  const toast = useToast()
  const yenile = useYenile()
  const sirali = [...siniflar].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section, 'tr'))
  return (
    <section className="card a" style={{ padding: 16 }}>
      <Baslik ad="Sınıf öğretmeni atanmamış" adet={siniflar.length} />
      {!siniflar.length && <div className="empty">Tüm etkin sınıfların sınıf öğretmeni var.</div>}
      {sirali.map((c) => (
        <div key={c.id} className="kv" style={{ padding: '6px 0', borderTop: '1px solid var(--line)', gap: 8 }}>
          <b>{c.name}</b>
          <label className="field" htmlFor={`vsog-${c.id}`} style={{ margin: 0, minWidth: 0, flex: '0 1 220px' }}>
            <span className="sr-only">{c.name} sınıf öğretmeni</span>
            <select
              id={`vsog-${c.id}`}
              defaultValue=""
              onChange={async (e) => {
                const v = e.target.value
                if (!v) return
                const { error } = await supabase.from('classes').update({ homeroom_teacher_id: v }).eq('id', c.id)
                if (error) return toast(hataMetni(error)!)
                toast(`${c.name} sınıf öğretmeni: ${ogretmenler.find((o) => o.id === v)?.full_name ?? ''}`)
                yenile()
              }}
            >
              <option value="">Öğretmen seç</option>
              {ogretmenler.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                  {o.branch ? ` · ${o.branch}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
    </section>
  )
}
