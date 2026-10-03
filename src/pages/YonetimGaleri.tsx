// Yönetim Merkezi → Galeri ayarları (0022): öğretmen yetkileri, onay, indirme, boyut sınırları ve kategoriler.
// Ayarlar set_settings ile (yönetici + aal2, doğrulama, işlem kaydı); kategoriler yalnız yöneticinin yazabildiği tabloda.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useSettings } from '@/lib/data'
import { useCategories } from '@/lib/galeri'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

const BOOLS: [string, string, string][] = [
  ['galeri.ogretmen_album', 'Öğretmen albüm oluşturabilir', 'Kendi albümünü açar ve yönetir; kitle izin verilen kapsamla sınırlı.'],
  ['galeri.ogretmen_yukleme', 'Öğretmen medya yükleyebilir', 'Kendi albümlerine fotoğraf ve video ekler.'],
  ['galeri.onay', 'Öğretmen yüklemeleri yönetici onayı gerektirir', 'Taslak → Onay bekliyor → Yayında. Onaylanmamış medya yalnız yöneticiye ve yükleyene görünür.'],
  ['galeri.indirme', 'Yeni albümlerde indirmeye izin ver (varsayılan)', 'Her albümde ayrıca açılıp kapatılabilir.'],
]

export function GaleriAyarlari() {
  const s = useSettings()
  const toast = useToast()
  const qc = useQueryClient()
  const [mb, setMb] = useState<{ foto?: string; video?: string }>({})
  const val = (k: string, d: boolean) => (typeof s.data?.[k] === 'boolean' ? (s.data[k] as boolean) : d)
  const kapsam = (s.data?.['galeri.ogretmen_kapsam'] as string | undefined) ?? 'sinif'
  const foto = mb.foto ?? String((s.data?.['galeri.max_foto_mb'] as number | undefined) ?? 15)
  const video = mb.video ?? String((s.data?.['galeri.max_video_mb'] as number | undefined) ?? 50)
  async function put(p: Record<string, unknown>, m: string) {
    const { error } = await supabase.rpc('set_settings', { p })
    if (error) return toast(error.message, 'warn')
    qc.invalidateQueries({ queryKey: ['school_settings'] })
    toast(m)
  }
  const defaults: Record<string, boolean> = { 'galeri.ogretmen_album': false, 'galeri.ogretmen_yukleme': false, 'galeri.onay': true, 'galeri.indirme': false }
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Galeri modülü <b>Modüller</b>'den açılır. Fotoğraf ve videolar özel depoda tutulur; yalnız albümün kitlesindeki kullanıcılar kısa süreli bağlantıyla görür. Varsayılan olarak albümleri yalnız yönetici yönetir.
      </p>
      <section className="card a" style={{ ['--d' as string]: 1, padding: 8 }} aria-label="Galeri yetkileri">
        {BOOLS.map(([k, l, h]) => {
          const on = val(k, defaults[k]!)
          return (
            <div key={k} style={{ padding: 8 }}>
              <button type="button" className="check" role="switch" aria-checked={on} onClick={() => put({ [k]: !on }, `${l}: ${on ? 'kapalı' : 'açık'}`)} style={{ alignItems: 'flex-start' }}>
                <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 14 }}>{l}</b>
                  <span className="m" style={{ fontSize: 12, fontWeight: 400 }}>
                    {h}
                  </span>
                </span>
              </button>
            </div>
          )
        })}
        <div style={{ padding: 8 }}>
          <label className="field" htmlFor="gKap" style={{ maxWidth: 320 }}>
            Öğretmen albümlerinin kitlesi
            <select id="gKap" value={kapsam} onChange={(e) => put({ 'galeri.ogretmen_kapsam': e.target.value }, 'Öğretmen kapsamı kaydedildi')}>
              <option value="sinif">Yalnız ders verdiği sınıflar / öğrencileri</option>
              <option value="kademe">Ders verdiği kademe</option>
              <option value="okul">Tüm okul</option>
            </select>
          </label>
        </div>
        <div style={{ padding: 8, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" htmlFor="gFoto" style={{ maxWidth: 200 }}>
            En büyük fotoğraf (MB)
            <input id="gFoto" type="number" min={1} max={25} value={foto} onChange={(e) => setMb((x) => ({ ...x, foto: e.target.value }))} />
          </label>
          <label className="field" htmlFor="gVideo" style={{ maxWidth: 200 }}>
            En büyük video (MB)
            <input id="gVideo" type="number" min={1} max={500} value={video} onChange={(e) => setMb((x) => ({ ...x, video: e.target.value }))} />
          </label>
          <button className="btn pri" disabled={mb.foto === undefined && mb.video === undefined} onClick={() => put({ 'galeri.max_foto_mb': Number(foto), 'galeri.max_video_mb': Number(video) }, 'Boyut sınırları kaydedildi').then(() => setMb({}))}>
            Kaydet
          </button>
          <span className="m" style={{ fontSize: 12, width: '100%' }}>
            Video sınırı Supabase planının tek dosya yükleme sınırını aşamaz (ücretsiz planda 50 MB).
          </span>
        </div>
      </section>
      <Kategoriler />
    </>
  )
}

function Kategoriler() {
  const { profile } = useAuth()
  const cats = useCategories()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [edit, setEdit] = useState<Record<string, string>>({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['gallery_categories'] })
  const err = (e: { code?: string; message: string }) => toast(e.code === '23505' ? 'Bu adla bir kategori zaten var.' : e.message, 'warn')
  async function add() {
    if (!profile || name.trim().length < 2) return
    const { error } = await supabase.from('gallery_categories').insert({ school_id: profile.school_id, name: name.trim(), sort_order: (cats.data?.length ?? 0) + 1 })
    if (error) return err(error)
    setName('')
    toast('Kategori eklendi')
    refresh()
  }
  async function upd(id: string, row: Record<string, unknown>, m: string) {
    const { error } = await supabase.from('gallery_categories').update(row).eq('id', id)
    if (error) return err(error)
    toast(m)
    refresh()
  }
  return (
    <section className="card a" style={{ ['--d' as string]: 2, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Galeri kategorileri">
      <h3 style={{ fontSize: 16 }}>Kategoriler</h3>
      {(cats.data ?? []).map((c) => (
        <div key={c.id} className="btns" style={{ alignItems: 'center', opacity: c.active ? 1 : 0.6 }}>
          <label className="field" style={{ flex: 1, minWidth: 180 }}>
            <input aria-label={`${c.name} kategori adı`} value={edit[c.id] ?? c.name} maxLength={60} onChange={(e) => setEdit((x) => ({ ...x, [c.id]: e.target.value }))} />
          </label>
          {edit[c.id] !== undefined && edit[c.id] !== c.name && (
            <button className="btn sm pri" onClick={() => upd(c.id, { name: edit[c.id]!.trim() }, 'Kategori adı kaydedildi').then(() => setEdit((x) => ({ ...x, [c.id]: undefined as unknown as string })))}>
              Kaydet
            </button>
          )}
          <button type="button" className="btn sm" role="switch" aria-checked={c.active} aria-label={`${c.name} kategorisi ${c.active ? 'kullanımda' : 'kapalı'}`} onClick={() => upd(c.id, { active: !c.active }, c.active ? 'Kategori kapatıldı' : 'Kategori açıldı')}>
            {c.active ? 'Kullanımda' : 'Kapalı'}
          </button>
        </div>
      ))}
      <div className="btns" style={{ alignItems: 'flex-end' }}>
        <label className="field" htmlFor="gNewCat" style={{ flex: 1, minWidth: 200 }}>
          Yeni kategori
          <input id="gNewCat" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="ör. Bilim Şenliği" />
        </label>
        <button className="btn" disabled={name.trim().length < 2} onClick={add}>
          <Icon name="plus" size={15} /> Ekle
        </button>
      </div>
    </section>
  )
}
