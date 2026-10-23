// Gruba etüt (0061): Sınıflar → konu analizi ya da öğrenci dosyasından. Seçilen kazanımları seçilen denemelerde yanlış yapan
// öğrenciler listelenir; öğretmen, Cumartesi ve 1–5. ders (Etüt programındaki saatlerle) seçilip tek adımda programa eklenir.
// Program yoksa taslak açılır; rehber öğretmen Etüt sayfasından kontrol edip yayınlar (yayındaysa öğrencilere bildirim gider).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { Seg } from './Indicator'
import { useToast } from './Toast'
import { useAssignments, useCourses, usePeople } from '@/lib/data'
import { useAyar } from '@/lib/ayarlar'
import { isTeacherP } from '@/lib/roles'
import { todayISO, trDW } from '@/lib/format'
import { DERSLER, KADEME_TR, VARSAYILAN_SAATLER, baslangicSaatleri, cumartesiler, type Kademe, type Saat } from '@/lib/etut'
import { etutGrupEkle, useEtutGunler, useEtutHucreler, useEtutRefresh } from '@/lib/etutData'
import { bransUyar, grupKonu, grupOgrencileri, type KonuKaynak } from '@/lib/etutGrup'

export function GrupEtut(p: {
  baslik: string // "7/A · Fen Bilimleri"
  kademe: Kademe
  dersAdi?: string
  classId?: string
  konular: KonuKaynak[]
  /** Başlangıçta seçili konu kodları */
  secili: string[]
  /** Kapsam seçimi için deneme adları (eskiden yeniye) */
  denemeler: string[]
  ogrenciAdi: (sid: string) => string
  /** Öğrenci dosyasından: öğrenci listesi sabit (konu seçimi yalnız etüt konusunu belirler) */
  sabitOgrenciler?: string[]
  /** Başlangıç kapsamı (son kaç deneme) */
  son?: number
  onClose: () => void
}) {
  const toast = useToast()
  const nav = useNavigate()
  const refresh = useEtutRefresh()
  const ayar = useAyar()
  const people = usePeople()
  const assignments = useAssignments()
  const courses = useCourses()
  const gunler = useEtutGunler()
  const today = todayISO()
  const sats = cumartesiler(today, 4)

  const [secili, setSecili] = useState(() => new Set(p.secili))
  const [ek, setEk] = useState('')
  const nEx = p.denemeler.length
  const kapsamlar = ([1, 3, nEx] as number[]).filter((n, i, a) => n >= 1 && n <= nEx && a.indexOf(n) === i)
  const [son, setSon] = useState(Math.min(p.son ?? 1, Math.max(1, nEx)))
  const [tekrar, setTekrar] = useState(false)
  const [cikar, setCikar] = useState<Set<string>>(new Set())
  const [tarih, setTarih] = useState(sats[0]!)
  const [ders, setDers] = useState<number | null>(null)
  const [ogretmenSec, setOgretmen] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Öğrenciler: konu + kapsamdan (ya da sabit liste)
  const aday = useMemo(
    () => (p.sabitOgrenciler ? p.sabitOgrenciler.map((sid) => ({ sid, kez: 0 })) : grupOgrencileri(p.konular, secili, son, tekrar ? 2 : 1, p.ogrenciAdi)),
    [p.sabitOgrenciler, p.konular, secili, son, tekrar, p.ogrenciAdi],
  )
  const ogrenciler = aday.filter((x) => !cikar.has(x.sid)).map((x) => x.sid)

  // Öğretmen: bu sınıfta bu derse giren (ders ataması) → branşı uyan → listedeki ilk
  const teachers = useMemo(
    () =>
      (people.data ?? [])
        .filter(isTeacherP)
        .map((t) => ({ id: t.id, name: t.full_name, branch: t.branch }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [people.data],
  )
  const onerilen = useMemo(() => {
    if (!p.dersAdi) return null
    const cname = new Map((courses.data ?? []).map((c) => [c.id, c.name]))
    const atanan = (assignments.data ?? []).filter((a) => a.class_id === p.classId && bransUyar(p.dersAdi!, cname.get(a.course_id))).map((a) => a.teacher_id)
    return teachers.find((t) => atanan.includes(t.id))?.id ?? teachers.find((t) => bransUyar(p.dersAdi!, t.branch))?.id ?? null
  }, [p.dersAdi, p.classId, courses.data, assignments.data, teachers])
  const ogretmen = ogretmenSec || onerilen || ''
  const tName = teachers.find((t) => t.id === ogretmen)?.name ?? ''

  // Seçilen Cumartesinin programı (varsa): saatler, öğretmenin o dersteki durumu, öğrenci çakışmaları
  const gun = (gunler.data ?? []).find((g) => g.tarih === tarih && g.kademe === p.kademe) ?? null
  const hucreler = useEtutHucreler(gun?.id)
  const ayarSaat = ayar.saatler(`etut.saatler_${p.kademe}`)
  const saatler: Saat[] = gun?.saatler ?? baslangicSaatleri(gunler.data ?? [], p.kademe, ayarSaat.length === 5 ? ayarSaat : VARSAYILAN_SAATLER[p.kademe])
  const dersDurum = (d: number) => {
    const hs = (hucreler.data ?? []).filter((h) => h.ders === d)
    const benim = hs.find((h) => h.teacher_id === ogretmen || h.teacher_name.toLocaleLowerCase('tr') === tName.toLocaleLowerCase('tr'))
    const sec = new Set(ogrenciler)
    const cakisan = hs.filter((h) => h !== benim).flatMap((h) => h.etut_ogrenciler.filter((o) => sec.has(o.student_id)).map((o) => o.student_id))
    return { mesgul: benim?.tur === 'mesgul' ? (benim.aciklama || 'Meşgul') : null, etut: benim?.tur === 'etut' ? benim : null, cakisan: new Set(cakisan) }
  }
  const secDurum = ders ? dersDurum(ders) : null

  const basliklar = p.konular.filter((k) => secili.has(k.code)).map((k) => k.title)
  const toggle = (code: string) =>
    setSecili((s) => {
      const n = new Set(s)
      if (n.has(code)) n.delete(code)
      else n.add(code)
      return n
    })

  async function kaydet() {
    setErr(null)
    const { konu, aciklama } = grupKonu(basliklar, ek)
    if (!konu) return setErr('En az bir konu seç ya da etüt konusunu yaz.')
    if (!ogrenciler.length) return setErr('En az bir öğrenci seç.')
    if (ogrenciler.length > 40) return setErr('Bir etüde en çok 40 öğrenci yazılabilir; kapsamı daralt ya da öğrenci çıkar.')
    if (!ogretmen) return setErr('Etüde girecek öğretmeni seç.')
    if (!ders) return setErr('Bir ders saati seç.')
    if (secDurum?.mesgul) return setErr(`${tName} bu derste meşgul (${secDurum.mesgul}). Başka bir ders saati seç.`)
    setBusy(true)
    try {
      const r = await etutGrupEkle({ tarih, kademe: p.kademe, ders, teacher_id: ogretmen, konu, aciklama, saatler, ogrenciler })
      refresh()
      const s = saatler[ders - 1]
      const ne = `${trDW(tarih)} · ${ders}. ders${s ? ` (${s.bas}–${s.bit})` : ''}`
      if (r.cakisan.length)
        toast(`${r.eklenen} öğrenci eklendi (${ne}). Aynı saatte başka etüdü olduğu için eklenmeyen: ${r.cakisan.join(', ')}`, 'warn')
      else toast(`${r.eklenen} öğrenci etüt programına eklendi · ${ne}${r.durum === 'taslak' ? ' · program taslak, Etüt sayfasından yayınla' : ''}`)
      p.onClose()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <Modal
      title="Etüt planla"
      sub={`${p.baslik} · ${KADEME_TR[p.kademe]} etüt programına eklenir`}
      width={640}
      onClose={() => !busy && p.onClose()}
      footer={
        <>
          <button className="btn" onClick={() => nav(`/etut?tarih=${tarih}&kademe=${p.kademe}`)} disabled={busy}>
            Etüt programını aç
          </button>
          <button className="btn" onClick={p.onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn gold" onClick={kaydet} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="cal" size={16} />} Programa ekle
          </button>
        </>
      }
    >
      {p.konular.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Konular</span>
          <div className="pick" role="group" aria-label="Konular" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {p.konular.map((k) => (
              <button type="button" key={k.code} aria-pressed={secili.has(k.code)} onClick={() => toggle(k.code)}>
                <span className={`box ${secili.has(k.code) ? 'on' : ''}`}>{secili.has(k.code) && <Icon name="check" size={13} stroke={3} />}</span>
                <span style={{ flex: 1 }}>{k.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="field" htmlFor="geEk">
        {p.konular.length ? 'Ek not / konu (isteğe bağlı)' : 'Etüt konusu'}
        <input id="geEk" value={ek} maxLength={120} onChange={(e) => setEk(e.target.value)} placeholder="Ör. Karışık soru çözümü" />
      </label>

      {!p.sabitOgrenciler && nEx > 1 && (
        <div className="kv" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Seg
            label="Denemeler"
            value={String(son)}
            onChange={(v) => setSon(Number(v))}
            options={kapsamlar.map((n) => [String(n), n === 1 ? 'Son deneme' : n === nEx ? `Hepsi (${n})` : `Son ${n} deneme`] as const)}
          />
          {son > 1 && (
            <label className="et-check">
              <input type="checkbox" checked={tekrar} onChange={(e) => setTekrar(e.target.checked)} /> Yalnız tekrar edenler (en az 2 denemede)
            </label>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <span className="label">
          Öğrenciler · {ogrenciler.length} seçili
          {!p.sabitOgrenciler && nEx > 0 && <span className="m" style={{ fontWeight: 400 }}> (seçilen konularda {son === 1 ? p.denemeler.at(-1) : `son ${son} denemede`} yanlış yapanlar)</span>}
        </span>
        {aday.length ? (
          <div className="pick" role="group" aria-label="Öğrenciler" style={{ maxHeight: 240, overflowY: 'auto' }} data-testid="grup-ogrenciler">
            {aday.map((x) => {
              const on = !cikar.has(x.sid)
              const ck = secDurum?.cakisan.has(x.sid)
              return (
                <button
                  type="button"
                  key={x.sid}
                  aria-pressed={on}
                  onClick={() =>
                    setCikar((s) => {
                      const n = new Set(s)
                      if (n.has(x.sid)) n.delete(x.sid)
                      else n.add(x.sid)
                      return n
                    })
                  }
                >
                  <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                  <span style={{ flex: 1 }}>{p.ogrenciAdi(x.sid)}</span>
                  {x.kez > 1 && <span className="chip down">↓ {x.kez} denemede</span>}
                  {ck && on && <span className="chip n">bu saatte başka etüdü var</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="m">{secili.size ? 'Seçilen konu ve denemelerde yanlış yapan öğrenci yok.' : 'Öğrencileri görmek için konu seç.'}</p>
        )}
      </div>

      <div className="grid2">
        <label className="field" htmlFor="geOgr">
          Öğretmen
          <select id="geOgr" value={ogretmen} onChange={(e) => setOgretmen(e.target.value)}>
            <option value="">Seç</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.branch ? ` · ${t.branch}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="geTarih">
          Cumartesi
          <select id="geTarih" value={tarih} onChange={(e) => (setTarih(e.target.value), setDers(null))}>
            {sats.map((d) => {
              const g = (gunler.data ?? []).find((x) => x.tarih === d && x.kademe === p.kademe)
              return (
                <option key={d} value={d}>
                  {trDW(d)}
                  {g ? (g.durum === 'yayinda' ? ' · program yayında' : ' · program taslak') : ''}
                </option>
              )
            })}
          </select>
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Ders saati ({KADEME_TR[p.kademe]} etüt programı)</span>
        <div className="btns" role="group" aria-label="Ders saati">
          {DERSLER.map((d) => {
            const s = saatler[d - 1]
            const du = ogretmen ? dersDurum(d) : null
            return (
              <button
                key={d}
                type="button"
                className={`btn ${ders === d ? 'soft' : ''}`}
                aria-pressed={ders === d}
                disabled={!!du?.mesgul}
                title={du?.mesgul ? `${tName}: ${du.mesgul}` : du?.etut ? `${tName} bu derste "${du.etut.konu}" etüdünde; öğrenciler ona eklenir` : undefined}
                onClick={() => setDers(d)}
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0, minWidth: 104 }}
              >
                <b>{d}. ders</b>
                <span className="m" style={{ fontSize: 12 }}>
                  {s ? `${s.bas}–${s.bit}` : ''}
                  {du?.mesgul ? ' · meşgul' : du?.etut ? ' · etüdü var' : ''}
                </span>
              </button>
            )
          })}
        </div>
        {secDurum?.etut && (
          <p className="m" style={{ fontSize: 13, margin: 0 }}>
            {tName} bu derste zaten “{secDurum.etut.konu}” etüdünde ({secDurum.etut.etut_ogrenciler.length} öğrenci). Seçilen öğrenciler bu etüde eklenir.
          </p>
        )}
        {!!secDurum?.cakisan.size && (
          <p className="m" style={{ fontSize: 13, margin: 0 }}>
            {secDurum.cakisan.size} öğrencinin bu saatte başka etüdü var; onlar eklenmez (listeden çıkarabilirsin).
          </p>
        )}
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
