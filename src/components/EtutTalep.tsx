// Sınıflar → "Etüt talep et" (branş öğretmeni): seçilen konularda yanlış yapan öğrenciler için etüt talebi.
// Etüt doğrudan açılmaz: talep yönetime ve rehberliğe düşer (etut_talepler, 0051); onlar programa yerleştirir ya da gerekçeyle
// reddeder. Talep gelince yönetim/rehberlik, yanıtlanınca öğretmen bildirim alır (sunucuda).
import { useMemo, useState } from 'react'
import { DERSLER, cumartesiler } from '@/lib/etut'
import { etutTalepEkle, useEtutRefresh } from '@/lib/etutData'
import { todayISO, trDW } from '@/lib/format'
import { talepKonusu } from '@/lib/denemeSecimi'
import { Icon } from '@/components/Icon'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'

export const TALEP_EN_COK = 40 // etut_talepler.ogrenciler sınırı

export function EtutTalep(p: {
  baslik: string
  dersAdi: string
  /** Konular ve o konuda (analiz kapsamındaki denemelerde) yanlış yapan öğrenciler */
  konular: { code: string; title: string; wrong: string[] }[]
  secili: string[]
  ogrenciAdi: (sid: string) => string
  onClose: () => void
}) {
  const toast = useToast()
  const refresh = useEtutRefresh()
  const today = todayISO()
  const [secili, setSecili] = useState(() => new Set(p.secili))
  const [cikar, setCikar] = useState<Set<string>>(new Set())
  const [ek, setEk] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [istTarih, setIstTarih] = useState('')
  const [istDers, setIstDers] = useState('')
  const [busy, setBusy] = useState(false)

  const aday = useMemo(() => {
    const ids = new Set<string>()
    for (const k of p.konular) if (secili.has(k.code)) for (const s of k.wrong) ids.add(s)
    return [...ids].sort((a, b) => p.ogrenciAdi(a).localeCompare(p.ogrenciAdi(b), 'tr'))
  }, [p, secili])
  const ogrenciler = aday.filter((s) => !cikar.has(s))
  const konu = talepKonusu(p.dersAdi, p.konular.filter((k) => secili.has(k.code)).map((k) => k.title), ek)
  const degis = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }

  async function gonder() {
    if (!secili.size && ek.trim().length < 2) return toast('En az bir konu seç ya da konuyu yaz.', 'warn')
    if (!ogrenciler.length) return toast('Seçilen konularda yanlış yapan öğrenci yok.', 'warn')
    if (ogrenciler.length > TALEP_EN_COK) return toast(`Bir talepte en çok ${TALEP_EN_COK} öğrenci olabilir; konu sayısını azalt ya da öğrenci çıkar.`, 'warn')
    setBusy(true)
    try {
      await etutTalepEkle({ konu, aciklama: aciklama.trim(), ogrenciler, istenen_tarih: istTarih || null, istenen_ders: istDers ? Number(istDers) : null })
      await refresh()
      toast('Etüt talebin yönetime ve rehberliğe iletildi')
      p.onClose()
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
    setBusy(false)
  }

  return (
    <Modal
      title="Etüt talep et"
      sub={p.baslik}
      onClose={p.onClose}
      footer={
        <>
          <button className="btn" onClick={p.onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={gonder} disabled={busy}>
            <Icon name="right" size={16} /> Talebi gönder
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="m" style={{ margin: 0, fontSize: 14 }}>
          Talebin yönetime ve rehberliğe düşer; onlar etüt programına yerleştirir. Sonuç sana bildirim olarak gelir ve Etüt sayfasındaki “Taleplerim”de görünür.
        </p>
        <div role="group" aria-label="Konular" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <b>Konular</b>
          {p.konular.map((k) => (
            <label key={k.code} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={secili.has(k.code)} onChange={() => setSecili(degis(secili, k.code))} />
              <span style={{ flex: 1 }}>{k.title}</span>
              <span className="m" style={{ fontSize: 13 }}>
                {k.wrong.length} öğrenci
              </span>
            </label>
          ))}
        </div>
        <label className="field">
          Ek konu (isteğe bağlı)
          <input value={ek} maxLength={60} onChange={(e) => setEk(e.target.value)} placeholder="Ör. karışık tekrar" />
        </label>
        <div>
          <b>
            Öğrenciler <span className="chip n">{ogrenciler.length}</span>
          </b>
          {aday.length ? (
            <div role="group" aria-label="Öğrenciler" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {aday.map((sid) => (
                <label key={sid} className={`chip ${cikar.has(sid) ? 'n' : 'up'}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!cikar.has(sid)} onChange={() => setCikar(degis(cikar, sid))} />
                  {p.ogrenciAdi(sid)}
                </label>
              ))}
            </div>
          ) : (
            <p className="m" style={{ margin: '6px 0 0' }}>
              {secili.size ? 'Seçilen konularda yanlış yapan öğrenci yok.' : 'Öğrencileri görmek için konu seç.'}
            </p>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label className="field">
            İstenen Cumartesi (isteğe bağlı)
            <select value={istTarih} onChange={(e) => setIstTarih(e.target.value)}>
              <option value="">Fark etmez</option>
              {cumartesiler(today, 6).map((t) => (
                <option key={t} value={t}>
                  {trDW(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            İstenen ders (isteğe bağlı)
            <select value={istDers} onChange={(e) => setIstDers(e.target.value)}>
              <option value="">Fark etmez</option>
              {DERSLER.map((d) => (
                <option key={d} value={d}>
                  {d}. ders
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Açıklama (isteğe bağlı)
          <input value={aciklama} maxLength={500} onChange={(e) => setAciklama(e.target.value)} />
        </label>
      </div>
    </Modal>
  )
}
