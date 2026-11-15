// Görüşme hazırlık kartı, görüşme kararları ve veli haftalık özeti (0077).
// Kararlar ve özet yazımı yalnız rehberlik servisi/yönetim içindir; veli yalnız onaylanıp gönderilen özeti görür.
import { useEffect, useMemo, useState } from 'react'
import { signed, fmt } from '@/lib/analiz'
import type { Meeting, Task } from '@/lib/data'
import { useAttendance } from '@/lib/data'
import { ago, localDate, localHM, todayISO, trDM } from '@/lib/format'
import { haftalikOzet, hazirlikKararlari, ozetBosMu, sonDenemeler, type Karar, type OzetIcerik } from '@/lib/haftalik'
import { useKararEkle, useKararGuncelle, useKararlar, useKararSil, useVeliOzetGonder, useVeliOzetler, veliOzetOkundu } from '@/lib/gorusmeData'
import { WITH_SHORT } from './Meetings'
import { useToast } from './Toast'

export interface DenemeSatiri {
  ad: string
  tarih: string
  net: number
}

/** Net farkı: yükselme primary + ↑, düşüş signal + ↓ (renk tek başına anlam taşımaz) */
function Fark({ n }: { n: number | null }) {
  if (n == null) return <span className="chip n">İlk deneme</span>
  if (Math.abs(n) < 0.005) return <span className="chip n">→ aynı</span>
  return (
    <span className={`chip ${n > 0 ? 'up' : 'down'}`}>
      {n > 0 ? '↑' : '↓'} {signed(n, 2)} net
    </span>
  )
}

const DURUM_TR = { acik: 'Açık', yapildi: 'Yapıldı', yapilmadi: 'Yapılmadı' } as const

/** Görüşmeden önce tek bakış: son 3 deneme, açık görevler, önceki görüşmenin kararları */
export function GorusmeHazirlik({ sid, denemeler, tasks, meetings }: { sid: string; denemeler: DenemeSatiri[]; tasks: Task[]; meetings: Meeting[] }) {
  const kararlar = useKararlar(sid)
  const guncelle = useKararGuncelle(sid)
  const toast = useToast()
  const bugun = todayISO()
  const sira = meetings.filter((g) => !g.canceled_at && localDate(g.starts_at) >= bugun).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const son = sonDenemeler(denemeler)
  const acikG = tasks.filter((t) => !t.completed_at).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const geciken = acikG.filter((t) => t.due_date < bugun).length
  const { acik } = hazirlikKararlari(kararlar.data ?? [])
  const gorev = (id: string | null) => (id ? tasks.find((t) => t.id === id) : undefined)
  const isaretle = (k: Karar, durum: Karar['durum']) =>
    guncelle.mutate({ id: k.id, durum }, { onSuccess: () => toast('Kaydedildi'), onError: (e) => toast((e as Error).message, 'warn') })

  return (
    <section className="card a gh-kart" aria-label="Görüşme hazırlığı" data-testid="gorusme-hazirlik">
      <div className="kv">
        <h2 className="sec">Görüşme hazırlığı</h2>
        {sira && (
          <span className="chip up">
            Sıradaki: {trDM(localDate(sira.starts_at))} {localHM(sira.starts_at)} · {WITH_SHORT[sira.with_whom]}
          </span>
        )}
      </div>
      <div className="gh-izgara">
        <div className="gh-blok">
          <span className="label">Son denemeler</span>
          {!son.length ? (
            <p className="m">Henüz deneme yok.</p>
          ) : (
            <ul className="gh-liste">
              {son.map((d) => (
                <li key={d.ad + d.tarih}>
                  <span className="gh-ad">
                    <b>{d.ad}</b>
                    <span className="m">
                      {trDM(d.tarih)} · {fmt(d.net, 2)} net
                    </span>
                  </span>
                  <Fark n={d.fark} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="gh-blok">
          <span className="label">Açık görevler</span>
          {!acikG.length ? (
            <p className="m">Açık görev yok.</p>
          ) : (
            <>
              <p className="m" style={{ margin: 0 }}>
                {acikG.length} açık görev{geciken ? ` · ${geciken} tanesinin süresi geçti` : ''}
              </p>
              <ul className="gh-liste">
                {acikG.slice(0, 4).map((t) => (
                  <li key={t.id}>
                    <span className="gh-ad">
                      <b>{t.topic}</b>
                      <span className="m">
                        {t.solved}/{t.question_count} soru · son gün {trDM(t.due_date)}
                        {t.due_date < bugun ? ' · süresi geçti' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="gh-blok">
          <span className="label">Önceki kararlar — yapıldı mı?</span>
          {!acik.length ? (
            <p className="m">Bekleyen karar yok.</p>
          ) : (
            <ul className="gh-liste">
              {acik.map((k) => {
                const t = gorev(k.task_id)
                return (
                  <li key={k.id} data-testid="hazirlik-karar">
                    <span className="gh-ad">
                      <b>{k.metin}</b>
                      <span className="m">
                        {trDM(localDate(k.created_at))}
                        {t ? ` · görev ${t.completed_at ? 'tamamlandı ✓' : `açık (${t.solved}/${t.question_count})`}` : ''}
                      </span>
                    </span>
                    <span className="gh-islem">
                      <button type="button" className="btn sm soft" disabled={guncelle.isPending} onClick={() => isaretle(k, 'yapildi')}>
                        Yapıldı
                      </button>
                      <button type="button" className="btn sm" disabled={guncelle.isPending} onClick={() => isaretle(k, 'yapilmadi')}>
                        Yapılmadı
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/** Görüşme kararları: yaz, göreve çevir, durumunu işaretle */
export function GorusmeKararlari({ sid, meetings, tasks, onGoreve }: { sid: string; meetings: Meeting[]; tasks: Task[]; onGoreve: (k: Karar) => void }) {
  const kararlar = useKararlar(sid)
  const ekle = useKararEkle(sid)
  const guncelle = useKararGuncelle(sid)
  const sil = useKararSil(sid)
  const toast = useToast()
  const bugun = todayISO()
  const gecmis = useMemo(
    () => meetings.filter((g) => !g.canceled_at && localDate(g.starts_at) <= bugun).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    [meetings, bugun],
  )
  const [metin, setMetin] = useState('')
  const [gid, setGid] = useState<string>('')
  const secili = gid === '' ? (gecmis[0]?.id ?? 'yok') : gid
  const gAdi = (id: string | null) => {
    const g = id ? meetings.find((x) => x.id === id) : undefined
    return g ? `${trDM(localDate(g.starts_at))} görüşmesi` : 'Görüşmeye bağlı değil'
  }
  const gorev = (id: string | null) => (id ? tasks.find((t) => t.id === id) : undefined)

  const kaydet = () => {
    if (metin.trim().length < 2) return toast('Kararı yaz.', 'warn')
    ekle.mutate(
      { metin, meeting_id: secili === 'yok' ? null : secili },
      { onSuccess: () => (setMetin(''), toast('Karar eklendi')), onError: (e) => toast((e as Error).message, 'warn') },
    )
  }

  const liste = kararlar.data ?? []
  return (
    <section className="card a gh-kart" aria-label="Görüşme kararları" data-testid="gorusme-kararlari">
      <h2 className="sec">Görüşme kararları</h2>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        Görüşmede alınan kararları yaz; istersen göreve çevir. Bir sonraki görüşmede "yapıldı mı?" diye karşına çıkar. Veli ve öğrenci bu listeyi görmez.
      </p>
      <div className="gh-form">
        <label className="field" htmlFor="kararMetin" style={{ flex: 1, minWidth: 220 }}>
          Karar
          <input
            id="kararMetin"
            maxLength={300}
            placeholder="Örn. Her akşam 20 paragraf sorusu çözecek"
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && kaydet()}
          />
        </label>
        <label className="field" htmlFor="kararGorusme">
          Görüşme
          <select id="kararGorusme" value={secili} onChange={(e) => setGid(e.target.value)}>
            {gecmis.slice(0, 10).map((g) => (
              <option key={g.id} value={g.id}>
                {trDM(localDate(g.starts_at))} · {WITH_SHORT[g.with_whom]}
              </option>
            ))}
            <option value="yok">Görüşmeye bağlı değil</option>
          </select>
        </label>
        <button type="button" className="btn pri" disabled={ekle.isPending} onClick={kaydet}>
          Kararı ekle
        </button>
      </div>
      {!liste.length ? (
        <p className="m">Henüz karar yok.</p>
      ) : (
        <ul className="gh-liste">
          {liste.map((k) => {
            const t = gorev(k.task_id)
            return (
              <li key={k.id} className={k.durum !== 'acik' ? 'kapali' : ''} data-testid="karar-satir">
                <span className="gh-ad">
                  <b>{k.metin}</b>
                  <span className="m">
                    {gAdi(k.meeting_id)} · {DURUM_TR[k.durum]}
                    {k.kontrol_at ? ` (${trDM(localDate(k.kontrol_at))})` : ''}
                    {t ? ` · Görev: ${t.topic}${t.completed_at ? ' ✓' : ''}` : k.task_id ? ' · Görev silinmiş' : ''}
                  </span>
                </span>
                <span className="gh-islem">
                  {k.durum === 'acik' ? (
                    <>
                      {!k.task_id && (
                        <button type="button" className="btn sm soft" onClick={() => onGoreve(k)}>
                          Göreve çevir
                        </button>
                      )}
                      <button type="button" className="btn sm" disabled={guncelle.isPending} onClick={() => guncelle.mutate({ id: k.id, durum: 'yapildi' })}>
                        Yapıldı
                      </button>
                      <button type="button" className="btn sm" disabled={guncelle.isPending} onClick={() => guncelle.mutate({ id: k.id, durum: 'yapilmadi' })}>
                        Yapılmadı
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn sm ghost" disabled={guncelle.isPending} onClick={() => guncelle.mutate({ id: k.id, durum: 'acik' })}>
                      Geri al
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn sm ghost"
                    aria-label={`Kararı sil: ${k.metin}`}
                    disabled={sil.isPending}
                    onClick={() => window.confirm('Karar silinsin mi?') && sil.mutate(k.id, { onError: (e) => toast((e as Error).message, 'warn') })}
                  >
                    Sil
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------- Veli haftalık özeti ----------
const hafta = (o: OzetIcerik) => `${trDM(o.bas)} – ${trDM(o.bit)}`

/** Özetin kendisi: öğretmen önizlemesi ve veli ekranı aynı görünümü kullanır (veli tam olarak onaylananı görür) */
export function OzetGorunum({ icerik, notu }: { icerik: OzetIcerik; notu: string | null }) {
  const g = icerik.gorev
  const dv = icerik.devamsizlik
  const dvToplam = dv ? dv.gelmedi + dv.gec + dv.izinli + dv.raporlu : 0
  return (
    <div className="ho-govde">
      <div className="ho-blok">
        <span className="label">Denemeler</span>
        {!icerik.denemeler.length ? (
          <p className="m">Bu hafta deneme yok.</p>
        ) : (
          <ul className="gh-liste">
            {icerik.denemeler.map((d) => (
              <li key={d.ad + d.tarih}>
                <span className="gh-ad">
                  <b>{d.ad}</b>
                  <span className="m">
                    {trDM(d.tarih)} · {fmt(d.net, 2)} net
                  </span>
                </span>
                <Fark n={d.fark} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ho-blok">
        <span className="label">Görevler</span>
        <p style={{ margin: 0 }}>
          Bu hafta <b>{g.tamamSayi}</b> görev tamamlandı{g.yeni ? `, ${g.yeni} yeni görev verildi` : ''}.
          {g.acik ? ` Açık görev: ${g.acik}${g.geciken ? ` (${g.geciken} tanesinin süresi geçti)` : ''}.` : ' Açık görev yok.'}
        </p>
        {g.tamamlanan.length > 0 && (
          <ul className="ho-madde">
            {g.tamamlanan.map((t, i) => (
              <li key={i}>✓ {t}</li>
            ))}
          </ul>
        )}
      </div>
      {dv && (
        <div className="ho-blok">
          <span className="label">Devamsızlık</span>
          <p style={{ margin: 0 }}>
            {!dvToplam
              ? 'Bu hafta devamsızlık kaydı yok.'
              : [
                  dv.gelmedi && `${dv.gelmedi} gün gelmedi`,
                  dv.gec && `${dv.gec} kez geç geldi`,
                  dv.izinli && `${dv.izinli} gün izinli`,
                  dv.raporlu && `${dv.raporlu} gün raporlu`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>
      )}
      {notu && (
        <div className="ho-blok ho-not">
          <span className="label">Öğretmenin notu</span>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{notu}</p>
        </div>
      )}
    </div>
  )
}

/** Öğretmen: bu haftanın özetini önizle, not ekle, onayla ve gönder; geçmiş özetlerin okunma durumu */
export function HaftalikOzetKart({
  sid,
  denemeler,
  tasks,
  yoklama,
  hasParent,
}: {
  sid: string
  denemeler: DenemeSatiri[]
  tasks: Task[]
  yoklama: boolean
  hasParent: boolean | undefined
}) {
  const att = useAttendance({ student: yoklama ? sid : undefined })
  const ozetler = useVeliOzetler(sid)
  const gonder = useVeliOzetGonder(sid)
  const toast = useToast()
  const bugun = todayISO()
  const icerik = useMemo(
    () => haftalikOzet({ bugun, denemeler, gorevler: tasks, yoklama: yoklama ? (att.data ?? []) : null }),
    [bugun, denemeler, tasks, yoklama, att.data],
  )
  const buHafta = ozetler.data?.find((o) => o.hafta === icerik.bas)
  const [not, setNot] = useState<string | null>(null)
  const notDeger = not ?? buHafta?.notu ?? ''
  const hazir = !yoklama || !att.isLoading

  const gonderTikla = () =>
    gonder.mutate(
      { icerik, not: notDeger },
      { onSuccess: () => (setNot(null), toast('Özet veliye gönderildi')), onError: (e) => toast((e as Error).message, 'warn') },
    )

  return (
    <section className="card a gh-kart" aria-label="Veli haftalık özeti" data-testid="haftalik-ozet">
      <div className="kv">
        <h2 className="sec">Veli haftalık özeti</h2>
        <span className="chip n">{hafta(icerik)}</span>
      </div>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        Aşağıdaki özeti kontrol et; onaylayınca veliye tek sayfa olarak gider ve açtığında burada "okundu" görürsün. Sınıf sıralaması yer almaz; yalnız veliye
        açık görevler girer.
      </p>
      {ozetBosMu(icerik) && <p className="m">Bu hafta için henüz kayıt yok; yine de not ekleyip gönderebilirsin.</p>}
      <OzetGorunum icerik={icerik} notu={null} />
      <label className="field" htmlFor="ozetNot">
        Veliye kısa not (isteğe bağlı)
        <textarea
          id="ozetNot"
          maxLength={600}
          placeholder="Örn. Bu hafta paragraf çalışmasında çok emek verdi."
          value={notDeger}
          onChange={(e) => setNot(e.target.value)}
        />
      </label>
      {hasParent === false && <p className="m">Bu öğrencinin onaylı veli hesabı yok; özet kaydedilir ama bildirim gidecek veli bulunmuyor.</p>}
      <div className="btns">
        <button type="button" className="btn pri" disabled={gonder.isPending || !hazir} onClick={gonderTikla}>
          {buHafta ? 'Güncelle ve yeniden gönder' : 'Onayla ve veliye gönder'}
        </button>
        {buHafta && (
          <span className="m" data-testid="ozet-durum">
            {buHafta.okundu_at ? `Veli okudu · ${ago(buHafta.okundu_at)}` : `Gönderildi · ${ago(buHafta.gonderildi_at)} · henüz okunmadı`}
          </span>
        )}
      </div>
      {(ozetler.data ?? []).filter((o) => o.hafta !== icerik.bas).length > 0 && (
        <details>
          <summary>Önceki haftalar</summary>
          <ul className="gh-liste">
            {(ozetler.data ?? [])
              .filter((o) => o.hafta !== icerik.bas)
              .map((o) => (
                <li key={o.id}>
                  <span className="gh-ad">
                    <b>{hafta(o.icerik)}</b>
                    <span className="m">{o.okundu_at ? `Veli okudu · ${trDM(localDate(o.okundu_at))}` : 'Okunmadı'}</span>
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** Veli: son gönderilen haftalık özet. Ekranda gösterilince "okundu" yazılır. */
export function VeliHaftalikOzet({ sid }: { sid: string }) {
  const q = useVeliOzetler(sid, true, 1)
  const o = q.data?.[0]
  useEffect(() => {
    if (o && !o.okundu_at) veliOzetOkundu(o.id).catch(() => {})
  }, [o])
  if (!o) return null
  return (
    <section className="card a gh-kart" aria-label="Haftalık özet" data-testid="veli-haftalik-ozet">
      <div className="kv">
        <h2 className="sec">Haftalık özet</h2>
        <span className="chip n">{hafta(o.icerik)}</span>
      </div>
      <OzetGorunum icerik={o.icerik} notu={o.notu} />
    </section>
  )
}
