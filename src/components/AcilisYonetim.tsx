// Duyurular → Açılış pencereleri (yönetici, 0096): girişte açılan duyuru / yeni özellik pencerelerini hazırla, önizle, yayınla.
// Taslak yalnız yöneticide görünür. "Kaç kişi gördü" sayısı onaylı hedef kitleye göredir.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useToast } from './Toast'
import { Modal } from './Modal'
import { ACILIS_ROL_TR, AcilisIcerik, type Acilis, type AcilisRol } from './AcilisPenceresi'

interface Kayit extends Acilis {
  roller: AcilisRol[]
  siniflar: number[] | null
  modul: string | null
  durum: 'taslak' | 'yayinda' | 'arsiv'
  bitis_at: string | null
  created_at: string
}
const DURUM_TR = { taslak: 'Taslak', yayinda: 'Yayında', arsiv: 'Arşivde' }
const MODUL_TR: Record<string, string> = { oda: 'Öğretmenler Odası', lgs: 'LGS', etut: 'Etüt', odev: 'Ödev', takvim: 'Takvim', mesaj: 'Mesajlaşma' }
const BOS = {
  id: '',
  tur: 'yenilik' as 'yenilik' | 'onemli',
  baslik: '',
  metin: '',
  gorsel: '',
  gorsel_alt: '',
  dugme_metin: '',
  dugme_rota: '',
  roller: ['veli', 'ogrenci'] as AcilisRol[],
  siniflar: [] as number[],
  modul: '',
  bitis: '',
}
type Form = typeof BOS

function useIstatistik(id: string, acik: boolean) {
  return useQuery({
    queryKey: ['acilis-istatistik', id],
    enabled: acik,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acilis_istatistik', { p_id: id })
      if (error) throw new Error(error.message)
      return ((data ?? []) as { hedef: number; goren: number; okuyan: number }[])[0] ?? null
    },
  })
}

function Satir({ k, onDuzenle, onOnizle }: { k: Kayit; onDuzenle: () => void; onOnizle: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const ist = useIstatistik(k.id, k.durum !== 'taslak')
  const degis = useMutation({
    mutationFn: async (durum: Kayit['durum'] | 'sil') => {
      const r =
        durum === 'sil'
          ? await supabase.from('acilis_pencereleri').delete().eq('id', k.id)
          : await supabase.from('acilis_pencereleri').update({ durum }).eq('id', k.id)
      if (r.error) throw new Error(r.error.message)
      return durum
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['acilis-yonetim'] })
      qc.invalidateQueries({ queryKey: ['acilis-bekleyen'] })
      toast(d === 'yayinda' ? 'Yayınlandı. Hedef kitle bir sonraki girişte görecek.' : d === 'sil' ? 'Taslak silindi.' : 'Arşive alındı.')
    },
    onError: (e: Error) => toast(e.message, 'warn'),
  })
  const kitle = `${k.roller.map((r) => ACILIS_ROL_TR[r]).join(', ')}${k.siniflar?.length ? ` · ${k.siniflar.join(', ')}. sınıf` : ''}${k.modul ? ` · ${MODUL_TR[k.modul] ?? k.modul} açıksa` : ''}`
  return (
    <li className="acl-ysatir" data-testid="acilis-kayit">
      <div style={{ minWidth: 0 }}>
        <b>{k.baslik}</b>
        <div className="m" style={{ fontSize: 12 }}>
          {k.tur === 'onemli' ? 'Önemli' : 'Yeni özellik'} · {kitle}
        </div>
        <div style={{ fontSize: 12, marginTop: 2 }}>
          <span className={`chip ${k.durum === 'yayinda' ? 'ok' : 'n'}`}>{DURUM_TR[k.durum]}</span>{' '}
          {ist.data && (
            <span className="m num" data-testid="acilis-istatistik">
              {ist.data.goren} / {ist.data.hedef} kişi gördü{k.tur === 'onemli' ? ` · ${ist.data.okuyan} okudu` : ''}
            </span>
          )}
          {k.durum === 'yayinda' && k.bitis_at && (
            <span className="m"> · {new Date(k.bitis_at).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} tarihine kadar açılır</span>
          )}
        </div>
      </div>
      <div className="acl-ydugme">
        <button type="button" className="btn sm ghost" onClick={onOnizle}>
          Önizle
        </button>
        {k.durum === 'taslak' && (
          <>
            <button type="button" className="btn sm ghost" onClick={onDuzenle}>
              Düzenle
            </button>
            <button type="button" className="btn sm ghost" disabled={degis.isPending} onClick={() => confirm('Taslak silinsin mi?') && degis.mutate('sil')}>
              Sil
            </button>
            <button
              type="button"
              className="btn sm pri"
              disabled={degis.isPending}
              onClick={() => confirm(`“${k.baslik}” yayınlansın mı? Hedef kitle bir sonraki girişte görecek.`) && degis.mutate('yayinda')}
            >
              Yayınla
            </button>
          </>
        )}
        {k.durum === 'yayinda' && (
          <button type="button" className="btn sm ghost" disabled={degis.isPending} onClick={() => degis.mutate('arsiv')}>
            Arşivle
          </button>
        )}
      </div>
    </li>
  )
}

export function AcilisYonetim() {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Form | null>(null)
  const [onizle, setOnizle] = useState<Acilis | null>(null)
  const [dosya, setDosya] = useState<File | null>(null)
  const list = useQuery({
    queryKey: ['acilis-yonetim'],
    queryFn: async () => {
      const { data, error } = await supabase.from('acilis_pencereleri').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(error.message)
      return (data ?? []) as Kayit[]
    },
  })
  const kaydet = useMutation({
    mutationFn: async (f: Form) => {
      let gorsel = f.gorsel.trim() || null
      if (dosya) {
        const uzanti = dosya.type === 'image/png' ? 'png' : dosya.type === 'image/webp' ? 'webp' : 'jpg'
        const ad = `${crypto.randomUUID()}.${uzanti}`
        const up = await supabase.storage.from('acilis').upload(ad, dosya, { contentType: dosya.type })
        if (up.error) throw new Error('Görsel yüklenemedi: ' + up.error.message)
        gorsel = `acilis/${ad}`
      }
      const row = {
        tur: f.tur,
        baslik: f.baslik.trim(),
        metin: f.metin.trim(),
        gorsel,
        gorsel_alt: f.gorsel_alt.trim() || null,
        dugme_metin: f.dugme_metin.trim() || null,
        dugme_rota: f.dugme_metin.trim() ? f.dugme_rota.trim() || null : null,
        roller: f.roller,
        siniflar: f.siniflar.length ? f.siniflar : null,
        modul: f.modul || null,
        bitis_at: f.bitis ? `${f.bitis}T23:59:00+03:00` : null,
      }
      const r = f.id ? await supabase.from('acilis_pencereleri').update(row).eq('id', f.id) : await supabase.from('acilis_pencereleri').insert(row)
      if (r.error)
        throw new Error(
          r.error.message.includes('check') ? 'Alanları kontrol et: başlık 3–90, metin 3–1200 karakter; düğme varsa adresi / ile başlamalı.' : r.error.message,
        )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acilis-yonetim'] })
      setForm(null)
      setDosya(null)
      toast('Taslak kaydedildi. Önizleyip yayınlayabilirsin.')
    },
    onError: (e: Error) => toast(e.message, 'warn'),
  })

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const onizleFormdan = (f: Form): Acilis => ({
    id: 'onizle',
    tur: f.tur,
    baslik: f.baslik || 'Başlık',
    metin: f.metin || 'Metin',
    gorsel: dosya ? null : f.gorsel || null,
    gorsel_alt: f.gorsel_alt || null,
    dugme_metin: f.dugme_metin || null,
    dugme_rota: f.dugme_rota || null,
  })
  const gecerli =
    form &&
    form.baslik.trim().length >= 3 &&
    form.metin.trim().length >= 3 &&
    form.roller.length > 0 &&
    (!form.dugme_metin.trim() || /^\//.test(form.dugme_rota.trim()))

  return (
    <section
      className="card a"
      style={{ ['--d' as string]: 1, padding: 16, display: 'grid', gap: 10 }}
      aria-labelledby="acl-ynt-b"
      data-testid="acilis-yonetim"
    >
      <div className="kv">
        <h2 id="acl-ynt-b" style={{ fontSize: 16, margin: 0 }}>
          Açılış pencereleri
        </h2>
        <button type="button" className="btn sm pri" onClick={() => setForm({ ...BOS })}>
          Yeni pencere
        </button>
      </div>
      <p className="m" style={{ margin: 0, fontSize: 13 }}>
        Giriş yapınca bir kez açılan duyuru ya da yeni özellik tanıtımı. Önemli duyuru “Okudum” denene kadar her girişte açılır; yeni özellik 30 gün açılır,
        sonra Duyurular → Yenilikler’de kalır. Bir girişte en çok 3 pencere açılır.
      </p>
      {list.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : list.isError ? (
        <p className="m">Liste yüklenemedi.</p>
      ) : !list.data?.length ? (
        <p className="m">Henüz pencere yok.</p>
      ) : (
        <ul className="acl-yliste">
          {list.data.map((k) => (
            <Satir
              key={k.id}
              k={k}
              onOnizle={() => setOnizle(k)}
              onDuzenle={() =>
                setForm({
                  id: k.id,
                  tur: k.tur,
                  baslik: k.baslik,
                  metin: k.metin,
                  gorsel: k.gorsel ?? '',
                  gorsel_alt: k.gorsel_alt ?? '',
                  dugme_metin: k.dugme_metin ?? '',
                  dugme_rota: k.dugme_rota ?? '',
                  roller: k.roller,
                  siniflar: k.siniflar ?? [],
                  modul: k.modul ?? '',
                  bitis: k.bitis_at ? k.bitis_at.slice(0, 10) : '',
                })
              }
            />
          ))}
        </ul>
      )}

      {form && (
        <Modal
          title={form.id ? 'Pencereyi düzenle' : 'Yeni açılış penceresi'}
          width={640}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setOnizle(onizleFormdan(form))}>
                Önizle
              </button>
              <button type="button" className="btn pri" disabled={!gecerli || kaydet.isPending} onClick={() => kaydet.mutate(form)}>
                Taslak olarak kaydet
              </button>
            </>
          }
        >
          <div className="acl-form">
            <fieldset>
              <legend>Tür</legend>
              <label>
                <input type="radio" name="acl-tur" checked={form.tur === 'yenilik'} onChange={() => set('tur', 'yenilik')} /> Yeni özellik (kapatılabilir)
              </label>
              <label>
                <input type="radio" name="acl-tur" checked={form.tur === 'onemli'} onChange={() => set('tur', 'onemli')} /> Önemli (“Okudum” gerekir)
              </label>
            </fieldset>
            <label>
              Başlık
              <input value={form.baslik} maxLength={90} onChange={(e) => set('baslik', e.target.value)} />
            </label>
            <label>
              Metin <span className="m">({form.metin.length}/1200)</span>
              <textarea rows={6} value={form.metin} maxLength={1200} onChange={(e) => set('metin', e.target.value)} />
            </label>
            <fieldset>
              <legend>Kimler görsün</legend>
              {(Object.keys(ACILIS_ROL_TR) as AcilisRol[]).map((r) => (
                <label key={r}>
                  <input
                    type="checkbox"
                    checked={form.roller.includes(r)}
                    onChange={(e) => set('roller', e.target.checked ? [...form.roller, r] : form.roller.filter((x) => x !== r))}
                  />{' '}
                  {ACILIS_ROL_TR[r]}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Sınıf düzeyi (veli ve öğrenci için; seçilmezse hepsi)</legend>
              <div className="acl-siniflar">
                {[5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                  <label key={g}>
                    <input
                      type="checkbox"
                      checked={form.siniflar.includes(g)}
                      onChange={(e) => set('siniflar', e.target.checked ? [...form.siniflar, g].sort((a, b) => a - b) : form.siniflar.filter((x) => x !== g))}
                    />{' '}
                    {g}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Yalnız şu modül açıksa
              <select value={form.modul} onChange={(e) => set('modul', e.target.value)}>
                <option value="">Her zaman</option>
                {Object.entries(MODUL_TR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Görsel (PNG, WEBP ya da JPG, en çok 2 MB)
              <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(e) => setDosya(e.target.files?.[0] ?? null)} />
            </label>
            {form.gorsel && !dosya && (
              <p className="m" style={{ margin: 0, fontSize: 12 }}>
                Mevcut görsel: {form.gorsel}{' '}
                <button type="button" className="btn sm ghost" onClick={() => set('gorsel', '')}>
                  Görseli kaldır
                </button>
              </p>
            )}
            <label>
              Görsel açıklaması (ekran okuyucu için)
              <input value={form.gorsel_alt} maxLength={200} onChange={(e) => set('gorsel_alt', e.target.value)} />
            </label>
            <div className="acl-iki">
              <label>
                Düğme yazısı (isteğe bağlı)
                <input value={form.dugme_metin} maxLength={30} placeholder="Örn. Hedefleri gör" onChange={(e) => set('dugme_metin', e.target.value)} />
              </label>
              <label>
                Düğme adresi
                <input value={form.dugme_rota} placeholder="/ozet" onChange={(e) => set('dugme_rota', e.target.value)} />
              </label>
            </div>
            <label>
              Son açılış günü (boşsa yeni özellik 30 gün, önemli süresiz)
              <input type="date" value={form.bitis} onChange={(e) => set('bitis', e.target.value)} />
            </label>
          </div>
        </Modal>
      )}

      {onizle && (
        <Modal title="Önizleme" width={520} onClose={() => setOnizle(null)}>
          <div data-testid="acilis-onizleme">
            <AcilisIcerik a={onizle} />
            <div className="acl-alt" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <span className="btn" aria-hidden="true">
                {onizle.tur === 'onemli' ? 'Okudum' : 'Kapat'}
              </span>
              {onizle.dugme_metin && (
                <span className="btn pri" aria-hidden="true">
                  {onizle.dugme_metin}
                </span>
              )}
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
