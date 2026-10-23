// Etüt → Öğrenci grupları (0062): "8'ler 1. Grup" gibi farklı sınıflardan öğrencilerden adlı gruplar. Rehber öğretmen /
// yönetici oluşturur, düzenler, siler. İçe aktarmada grup adı tanınır; hücre düzenlemede "Gruptan ekle" ile kullanılır.
import { useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { KADEME_TR, type Kademe } from '@/lib/etut'
import { grupKaydet, grupSil, useGrupYenile } from '@/lib/etutData'
import type { EtutGrubu } from '@/lib/etutGruplari'
import { fold } from '@/lib/format'

type Ogr = { id: string; full_name: string; class_name: string }

export function EtutGruplariBolum(p: { kademe: Kademe; gruplar: EtutGrubu[]; ogrenciler: Ogr[] }) {
  const toast = useToast()
  const yenile = useGrupYenile()
  const [duzen, setDuzen] = useState<EtutGrubu | 'yeni' | null>(null)
  const ad = useMemo(() => new Map(p.ogrenciler.map((s) => [s.id, s.full_name])), [p.ogrenciler])

  async function sil(g: EtutGrubu) {
    if (!window.confirm(`"${g.ad}" grubu silinsin mi? Etüt programındaki kayıtlar değişmez.`)) return
    try {
      await grupSil(g.id)
      await yenile()
      toast('Grup silindi')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }

  return (
    <section className="card et-card" aria-label="Öğrenci grupları">
      <div className="kv" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 className="sec" style={{ margin: 0 }}>
          Öğrenci grupları <span className="chip n">{p.gruplar.length}</span>
        </h2>
        <button className="btn sm pri" onClick={() => setDuzen('yeni')}>
          <Icon name="plus" size={15} /> Grup oluştur
        </button>
      </div>
      <p className="m" style={{ fontSize: 13 }}>
        Farklı sınıflardan öğrencilerle seviye grubu oluştur (ör. “8'ler 1. Grup”). İçe aktarılan programda “Sekizler birinci grup”, “8. sınıf 1. grup” gibi
        yazımlar bu gruba bağlanır; hücreye öğrenci eklerken “Gruptan ekle”yi kullanabilirsin.
      </p>
      {p.gruplar.length ? (
        <ul className="et-talepler" data-testid="etut-gruplari">
          {p.gruplar.map((g) => {
            const adlar = g.ogrenciler.map((id) => ad.get(id)).filter(Boolean) as string[]
            return (
              <li key={g.id}>
                <div>
                  <b>{g.ad}</b> · {adlar.length} öğrenci
                  <span className="m">
                    {adlar.slice(0, 8).join(', ')}
                    {adlar.length > 8 ? ` ve ${adlar.length - 8} öğrenci daha` : ''}
                  </span>
                </div>
                <div className="btns">
                  <button className="btn sm" onClick={() => setDuzen(g)} aria-label={`${g.ad} düzenle`}>
                    <Icon name="pen" size={14} /> Düzenle
                  </button>
                  <button className="btn sm" onClick={() => sil(g)} aria-label={`${g.ad} sil`}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="m">{KADEME_TR[p.kademe]} için grup yok.</p>
      )}
      {duzen && <GrupModal kademe={p.kademe} grup={duzen === 'yeni' ? null : duzen} ogrenciler={p.ogrenciler} onClose={() => setDuzen(null)} />}
    </section>
  )
}

function GrupModal(p: { kademe: Kademe; grup: EtutGrubu | null; ogrenciler: Ogr[]; onClose: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const yenile = useGrupYenile()
  const [ad, setAd] = useState(p.grup?.ad ?? '')
  const [sel, setSel] = useState<string[]>(p.grup?.ogrenciler ?? [])
  const [sinif, setSinif] = useState('')
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const siniflar = useMemo(
    () => [...new Set(p.ogrenciler.map((s) => s.class_name))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })),
    [p.ogrenciler],
  )
  const igne = fold(q.trim())
  const liste = p.ogrenciler
    .filter((s) => (!sinif || s.class_name === sinif) && (!igne || fold(s.full_name).includes(igne)))
    .sort((a, b) => a.class_name.localeCompare(b.class_name, 'tr', { numeric: true }) || a.full_name.localeCompare(b.full_name, 'tr'))
  const adOf = (id: string) => p.ogrenciler.find((s) => s.id === id)
  const secili = new Set(sel)
  const hepsi = liste.length > 0 && liste.every((s) => secili.has(s.id))

  async function kaydet() {
    setErr(null)
    if (ad.trim().length < 2) return setErr('Grup adı en az 2 harf olmalı.')
    if (!sel.length) return setErr('En az bir öğrenci seç.')
    if (sel.length > 80) return setErr('Bir grupta en çok 80 öğrenci olabilir.')
    setBusy(true)
    try {
      await grupKaydet({ id: p.grup?.id, school_id: profile!.school_id!, kademe: p.kademe, ad, ogrenciler: sel })
      await yenile()
      toast(p.grup ? 'Grup güncellendi' : 'Grup oluşturuldu')
      p.onClose()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <Modal
      title={p.grup ? 'Grubu düzenle' : 'Grup oluştur'}
      sub={`${KADEME_TR[p.kademe]} · ${sel.length} öğrenci seçili`}
      width={620}
      onClose={() => !busy && p.onClose()}
      footer={
        <>
          <button className="btn" onClick={p.onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={kaydet} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Kaydet
          </button>
        </>
      }
    >
      <label className="field" htmlFor="grAd">
        Grup adı
        <input id="grAd" value={ad} maxLength={60} onChange={(e) => setAd(e.target.value)} placeholder="Ör. 8'ler 1. Grup" />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="grSinif">
          Sınıf
          <select id="grSinif" value={sinif} onChange={(e) => setSinif(e.target.value)}>
            <option value="">Bütün sınıflar</option>
            {siniflar.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="grAra">
          Öğrenci ara
          <input id="grAra" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad" />
        </label>
      </div>
      <div className="btns">
        <button
          type="button"
          className="btn sm"
          disabled={!liste.length}
          onClick={() => setSel(hepsi ? sel.filter((id) => !liste.some((s) => s.id === id)) : [...new Set([...sel, ...liste.map((s) => s.id)])])}
        >
          {hepsi ? 'Listedekileri çıkar' : `Listedekilerin hepsini ekle (${liste.length})`}
        </button>
      </div>
      <div className="pick" role="group" aria-label="Öğrenciler" style={{ maxHeight: 260, overflowY: 'auto' }}>
        {liste.map((s) => {
          const on = secili.has(s.id)
          return (
            <button type="button" key={s.id} aria-pressed={on} onClick={() => setSel(on ? sel.filter((x) => x !== s.id) : [...sel, s.id])}>
              <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
              <span style={{ flex: 1 }}>{s.full_name}</span>
              <span className="m" style={{ fontSize: 13 }}>
                {s.class_name}
              </span>
            </button>
          )
        })}
        {!liste.length && <span className="m">Bu filtrede öğrenci yok.</span>}
      </div>
      {sel.length > 0 && (
        <div className="et-sel">
          {sel.map((id) => (
            <span key={id} className="chip up">
              {adOf(id)?.full_name ?? 'Öğrenci'}
              <button className="xbtn" aria-label={`${adOf(id)?.full_name ?? 'Öğrenci'} çıkar`} onClick={() => setSel(sel.filter((x) => x !== id))}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
