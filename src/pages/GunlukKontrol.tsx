// Öğrenciler → Günlük kontrol (0067): öğretmen gerektiğinde girer, yalnız eksik olanı işaretler, isterse detay yazar.
// Yoklamayla bağlantısı yoktur. Aynı maddenin ay içindeki her 3. eksikliğinde veliye uyarı bildirimi sunucuda gider.
// "Kayıtlar" görünümü kim, ne zaman, neyi işaretledi listesidir (öğretmen kendi sınıfları, rehberlik/yönetici tümü — RLS).
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useClasses, usePeople, useStudents } from '@/lib/data'
import { isFullAccess } from '@/lib/roles'
import { todayISO, trDM, trDW } from '@/lib/format'
import {
  DETAY_EN_COK,
  MADDELER,
  MADDE_TR,
  ayBasi,
  aySonu,
  donemBasi,
  farkBul,
  kacinci,
  taslakKur,
  uyariGider,
  type Kayit,
  type Madde,
  type Taslak,
} from '@/lib/gunlukKontrol'
import { useGunlukKontrol } from '@/lib/gunlukKontrolData'
import { Icon } from '@/components/Icon'
import { Seg } from '@/components/Indicator'
import { useToast } from '@/components/Toast'

type Gorunum = 'isaretle' | 'kayitlar'

export default function GunlukKontrol({ cls, onBack }: { cls: string; onBack: () => void }) {
  const tek = cls !== 'all'
  const [gor, setGor] = useState<Gorunum>(tek ? 'isaretle' : 'kayitlar')
  return (
    <>
      <div className="head a">
        <div>
          <button type="button" className="btn ghost sm" onClick={onBack} style={{ marginBottom: 6 }}>
            <Icon name="back" size={16} stroke={2} /> Öğrenciler
          </button>
          <h1 className="hd">{tek ? `${cls} · Günlük kontrol` : 'Günlük kontrol'}</h1>
          <p className="m" style={{ fontSize: 14, margin: '4px 0 0' }}>
            Gerektiğinde gir, yalnız eksik olanı işaretle. Yoklamayla bağlantısı yoktur. Aynı eksik ay içinde 3. kez olursa veliye uyarı bildirimi gider.
          </p>
        </div>
        {tek && (
          <Seg
            label="Görünüm"
            value={gor}
            onChange={setGor}
            options={[
              ['isaretle', 'İşaretle'],
              ['kayitlar', 'Kayıtlar'],
            ]}
          />
        )}
      </div>
      {gor === 'isaretle' && tek ? <Isaretle cls={cls} /> : <Kayitlar cls={cls} />}
    </>
  )
}

function Isaretle({ cls }: { cls: string }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile, role } = useAuth()
  const yonetim = isFullAccess(role!)
  const people = usePeople()
  const students = useStudents()
  const [tarih, setTarih] = useState(todayISO())
  const sinif = useMemo(
    () => (students.data ?? []).filter((s) => s.class_name === cls).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    [students.data, cls],
  )
  const ids = useMemo(() => sinif.map((s) => s.id), [sinif])
  const ay = useGunlukKontrol(ids, ayBasi(tarih), aySonu(tarih))
  const gun = useMemo(() => (ay.data ?? []).filter((k) => k.tarih === tarih), [ay.data, tarih])
  const [taslak, setTaslak] = useState<Taslak>({})
  const [busy, setBusy] = useState(false)
  // Kayıtlar gelince / gün değişince ekran kayıtlı durumdan başlar
  useEffect(() => setTaslak(taslakKur(gun)), [gun])

  const uid = profile?.id ?? ''
  const fark = farkBul(gun, taslak, tarih, uid, yonetim)
  const degisiklik = fark.ekle.length + fark.sil.length + fark.guncelle.length
  const ad = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name ?? 'Başka bir öğretmen'

  const degistir = (sid: string, m: Madde) => {
    const k = gun.find((x) => x.student_id === sid && x.madde === m)
    if (k && k.teacher_id !== uid && !yonetim) return toast(`Bu eksiği ${ad(k.teacher_id)} işaretledi; yalnız o kaldırabilir.`, 'warn')
    setTaslak((t) => {
      const s = { ...(t[sid] ?? {}) }
      if (m in s) delete s[m]
      else s[m] = k?.detay ?? ''
      return { ...t, [sid]: s }
    })
  }
  const detay = (sid: string, m: Madde, v: string) => setTaslak((t) => ({ ...t, [sid]: { ...(t[sid] ?? {}), [m]: v } }))

  const kaydet = async () => {
    if (!degisiklik) return
    setBusy(true)
    let uyari = 0
    try {
      if (fark.ekle.length) {
        const r = await supabase.from('gunluk_kontrol').insert(fark.ekle).select('veli_uyarildi')
        if (r.error) throw r.error
        uyari = (r.data ?? []).filter((x) => x.veli_uyarildi).length
      }
      if (fark.sil.length) {
        const r = await supabase.from('gunluk_kontrol').delete().in('id', fark.sil)
        if (r.error) throw r.error
      }
      for (const g of fark.guncelle) {
        const r = await supabase.from('gunluk_kontrol').update({ detay: g.detay }).eq('id', g.id)
        if (r.error) throw r.error
      }
      toast(uyari ? `Kaydedildi. ${uyari} öğrencinin velisine uyarı bildirimi gitti.` : 'Kaydedildi.')
    } catch {
      toast('Kaydedilemedi. Tekrar dene.', 'warn')
    } finally {
      setBusy(false)
      await qc.invalidateQueries({ queryKey: ['gunluk-kontrol'] })
    }
  }

  return (
    <section className="card a" style={{ ['--d' as string]: 1 }} data-testid="gk-isaretle">
      <div className="btns" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <label className="field" htmlFor="gkTarih">
          <span className="label">Tarih</span>
          <input id="gkTarih" type="date" value={tarih} max={todayISO()} onChange={(e) => e.target.value && setTarih(e.target.value)} />
        </label>
        <span className="m" style={{ fontSize: 13 }}>
          {trDW(tarih)} · Boş bırakılan öğrenci için kayıt oluşmaz. Detay veliye görünür.
        </span>
      </div>
      {!sinif.length ? (
        <div className="empty" style={{ marginTop: 12 }}>
          Bu sınıfta öğrenci yok.
        </div>
      ) : (
        sinif.map((s) => {
          const sec = taslak[s.id] ?? {}
          return (
            <div key={s.id} className="gk-satir" data-testid="gk-ogrenci">
              <span className="gk-ad">{s.full_name}</span>
              <div className="gk-maddeler">
                <div role="group" aria-label={`${s.full_name} eksikleri`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MADDELER.map(([m, t]) => {
                    const on = m in sec
                    const k = gun.find((x) => x.student_id === s.id && x.madde === m)
                    const kilitli = !!k && k.teacher_id !== uid && !yonetim
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`gk-m ${on ? 'on' : ''}`}
                        aria-pressed={on}
                        aria-disabled={kilitli || undefined}
                        title={k && k.teacher_id !== uid ? `İşaretleyen: ${ad(k.teacher_id)}` : undefined}
                        onClick={() => degistir(s.id, m)}
                      >
                        {on && <Icon name="x" size={14} stroke={2.4} />}
                        {t}
                      </button>
                    )
                  })}
                </div>
                {MADDELER.filter(([m]) => m in sec).map(([m, t]) => {
                  const k = gun.find((x) => x.student_id === s.id && x.madde === m)
                  const benim = !k || k.teacher_id === uid
                  const n = kacinci(ay.data ?? [], s.id, m, tarih)
                  return (
                    <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {benim ? (
                        <label className="field" style={{ gap: 2 }}>
                          <span className="label">
                            {t} · detay (isteğe bağlı)
                          </span>
                          <input
                            value={sec[m] ?? ''}
                            maxLength={DETAY_EN_COK}
                            placeholder="Matematik kitabı yanında değildi"
                            onChange={(e) => detay(s.id, m, e.target.value)}
                          />
                        </label>
                      ) : (
                        <span className="m" style={{ fontSize: 13 }}>
                          {t} · {ad(k!.teacher_id)} işaretledi{k!.detay ? `: ${k!.detay}` : ''}
                        </span>
                      )}
                      {uyariGider(n) && (
                        <span className="chip down" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }} data-testid="gk-uyari-onizleme">
                          <Icon name="warn" size={14} /> Bu ay {n}. kez ·{' '}
                          {k ? (k.veli_uyarildi ? 'veliye uyarı gönderildi' : 'velisi kayıtlı olmadığı için uyarı gitmedi') : 'kaydedince veliye uyarı bildirimi gidecek'}
                        </span>
                      )}
                      {!uyariGider(n) && n > 1 && (
                        <span className="m" style={{ fontSize: 12 }}>
                          Bu ay {n}. kez
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
      <div className="btns" style={{ marginTop: 12, alignItems: 'center' }}>
        <button type="button" className="btn pri" onClick={kaydet} disabled={busy || !degisiklik}>
          <Icon name="check" size={16} stroke={2.2} /> Kaydet{degisiklik ? ` (${degisiklik} değişiklik)` : ''}
        </button>
        {degisiklik > 0 && (
          <button type="button" className="btn ghost" onClick={() => setTaslak(taslakKur(gun))} disabled={busy}>
            Vazgeç
          </button>
        )}
      </div>
    </section>
  )
}

function Kayitlar({ cls }: { cls: string }) {
  const { role } = useAuth()
  const people = usePeople()
  const students = useStudents()
  const classes = useClasses()
  const bugun = todayISO()
  const [aralik, setAralik] = useState<'ay' | 'donem'>('ay')
  const [sinifSec, setSinifSec] = useState(cls)
  const [madde, setMadde] = useState<Madde | ''>('')
  const from = aralik === 'ay' ? ayBasi(bugun) : donemBasi(bugun)
  const sinif = cls !== 'all' ? cls : sinifSec
  const ids = useMemo(
    () => (sinif === 'all' ? null : (students.data ?? []).filter((s) => s.class_name === sinif).map((s) => s.id)),
    [students.data, sinif],
  )
  const q = useGunlukKontrol(ids, from, bugun)
  const ogr = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data])
  const gorunen = new Set((students.data ?? []).map((s) => s.class_name))
  const satirlar = (q.data ?? []).filter((k) => (!madde || k.madde === madde) && ogr.has(k.student_id))
  const kisi = (id: string | null) => {
    const p = people.data?.find((x) => x.id === id)
    return p ? `${p.full_name}${p.branch ? ` · ${p.branch}` : ''}` : '—'
  }
  return (
    <section className="card a" style={{ ['--d' as string]: 1 }} data-testid="gk-kayitlar">
      <div className="btns" style={{ alignItems: 'flex-end' }}>
        {cls === 'all' && (
          <label className="field" style={{ minWidth: 150 }}>
            <span className="label">Sınıf</span>
            <select value={sinifSec} onChange={(e) => setSinifSec(e.target.value)}>
              <option value="all">{isFullAccess(role!) ? 'Tüm sınıflar' : 'Tüm sınıflarım'}</option>
              {(classes.data ?? [])
                .filter((c) => gorunen.has(c.name))
                .map((c) => (
                  <option key={c.id}>{c.name}</option>
                ))}
            </select>
          </label>
        )}
        <label className="field" style={{ minWidth: 150 }}>
          <span className="label">Madde</span>
          <select value={madde} onChange={(e) => setMadde(e.target.value as Madde | '')}>
            <option value="">Tüm maddeler</option>
            {MADDELER.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <Seg
          label="Dönem"
          value={aralik}
          onChange={setAralik}
          options={[
            ['ay', 'Bu ay'],
            ['donem', 'Bu dönem'],
          ]}
        />
      </div>
      {q.isLoading ? (
        <div className="m" style={{ marginTop: 12 }}>
          Yükleniyor…
        </div>
      ) : !satirlar.length ? (
        <div className="empty" style={{ marginTop: 12 }}>
          Bu aralıkta işaretlenmiş eksik yok.
        </div>
      ) : (
        <div className="tbl" style={{ marginTop: 12 }}>
          <table style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Öğrenci</th>
                <th>Eksik · detay</th>
                <th>İşaretleyen</th>
                <th>Veli uyarısı</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((k: Kayit) => {
                const s = ogr.get(k.student_id)!
                return (
                  <tr key={k.id} data-testid="gk-kayit">
                    <td style={{ whiteSpace: 'nowrap' }}>{trDM(k.tarih)}</td>
                    <td>
                      <b>{s.full_name}</b> <span className="m">· {s.class_name}</span>
                    </td>
                    <td>
                      {MADDE_TR[k.madde]}
                      {k.detay && <span className="m"> · {k.detay}</span>}
                    </td>
                    <td>{kisi(k.teacher_id)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {k.veli_uyarildi ? <span className="chip gk-k">Gönderildi · {k.sira}.</span> : <span className="m">{k.sira}. kez</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
