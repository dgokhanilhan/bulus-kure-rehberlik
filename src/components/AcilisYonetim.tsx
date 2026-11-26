// Duyurular → Açılış pencereleri (yönetici, 0096, 0098): girişte açılan duyuru / yeni özellik pencerelerini hazırla, önizle, yayınla.
// Taslak yalnız yöneticide görünür. "Kaç kişi gördü" sayısı onaylı hedef kitleye göredir.
// Görsel: şablon kart (temaya uyar, yazılar elle) ya da yüklenen görsel ya da yok. Yayındaki pencere düzenlenebilir;
// arşiv = geri çek (kimse görmez, yeniden yayınlanabilir); kaldır = her yerden kalkar (kayıt silinmez).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useToast } from './Toast'
import { Modal } from './Modal'
import { ACILIS_ROL_TR, AcilisIcerik, KART_CIZIM_TR, type Acilis, type AcilisRol } from './AcilisPenceresi'

type Durum = 'taslak' | 'yayinda' | 'arsiv' | 'kaldirildi'
interface Kayit extends Acilis {
  roller: AcilisRol[]
  siniflar: number[] | null
  modul: string | null
  durum: Durum
  bitis_at: string | null
  created_at: string
}
const DURUM_TR: Record<Durum, string> = { taslak: 'Taslak', yayinda: 'Yayında', arsiv: 'Geri çekildi', kaldirildi: 'Kaldırıldı' }
const MODUL_TR: Record<string, string> = { oda: 'Öğretmenler Odası', lgs: 'LGS', etut: 'Etüt', odev: 'Ödev', takvim: 'Takvim', mesaj: 'Mesajlaşma' }
type GorselTur = 'kart' | 'dosya' | 'yok'
const BOS = {
  id: '',
  durum: 'taslak' as Durum,
  tur: 'yenilik' as 'yenilik' | 'onemli',
  baslik: '',
  metin: '',
  gorselTur: 'kart' as GorselTur,
  kart_etiket: '',
  kart_baslik: '',
  kart_aciklama: '',
  kart_cizim: '' as '' | 'hedef' | 'oda' | 'duyuru',
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

const MESAJ: Record<string, string> = {
  yayinda: 'Yayınlandı. Hedef kitle bir sonraki girişte görecek.',
  arsiv: 'Geri çekildi. Artık kimseye açılmaz ve Yenilikler’de görünmez.',
  kaldirildi: 'Kaldırıldı.',
  sil: 'Taslak silindi.',
}

function Satir({ k, onDuzenle, onOnizle }: { k: Kayit; onDuzenle: () => void; onOnizle: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const ist = useIstatistik(k.id, k.durum !== 'taslak')
  const degis = useMutation({
    mutationFn: async (durum: Durum | 'sil') => {
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
      qc.invalidateQueries({ queryKey: ['acilis-yenilikler'] })
      toast(MESAJ[d] ?? 'Kaydedildi.')
    },
    onError: (e: Error) => toast(e.message, 'warn'),
  })
  const kitle = `${k.roller.map((r) => ACILIS_ROL_TR[r]).join(', ')}${k.siniflar?.length ? ` · ${k.siniflar.join(', ')}. sınıf` : ''}${k.modul ? ` · ${MODUL_TR[k.modul] ?? k.modul} açıksa` : ''}`
  const yayinla = (metin: string) => confirm(metin) && degis.mutate('yayinda')
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
        <button type="button" className="btn sm ghost" onClick={onDuzenle}>
          Düzenle
        </button>
        {k.durum === 'taslak' && (
          <>
            <button type="button" className="btn sm ghost" disabled={degis.isPending} onClick={() => confirm('Taslak silinsin mi?') && degis.mutate('sil')}>
              Sil
            </button>
            <button
              type="button"
              className="btn sm pri"
              disabled={degis.isPending}
              onClick={() => yayinla(`“${k.baslik}” yayınlansın mı? Hedef kitle bir sonraki girişte görecek.`)}
            >
              Yayınla
            </button>
          </>
        )}
        {k.durum === 'yayinda' && (
          <button
            type="button"
            className="btn sm ghost"
            disabled={degis.isPending}
            onClick={() => confirm(`“${k.baslik}” geri çekilsin mi? Kimseye açılmaz, Yenilikler’den de kalkar.`) && degis.mutate('arsiv')}
          >
            Geri çek
          </button>
        )}
        {k.durum === 'arsiv' && (
          <button
            type="button"
            className="btn sm ghost"
            disabled={degis.isPending}
            onClick={() => yayinla(`“${k.baslik}” yeniden yayınlansın mı? Daha önce görenlere tekrar açılmaz.`)}
          >
            Yeniden yayınla
          </button>
        )}
        {(k.durum === 'yayinda' || k.durum === 'arsiv') && (
          <button
            type="button"
            className="btn sm ghost"
            disabled={degis.isPending}
            onClick={() => confirm(`“${k.baslik}” kaldırılsın mı? Her yerden kalkar ve bu listede de görünmez.`) && degis.mutate('kaldirildi')}
          >
            Kaldır
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
      const { data, error } = await supabase
        .from('acilis_pencereleri')
        .select('*')
        .neq('durum', 'kaldirildi')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw new Error(error.message)
      return (data ?? []) as Kayit[]
    },
  })
  const kaydet = useMutation({
    mutationFn: async (f: Form) => {
      let gorsel: string | null = f.gorselTur === 'dosya' ? f.gorsel.trim() || null : null
      if (f.gorselTur === 'dosya' && dosya) {
        const uzanti = dosya.type === 'image/png' ? 'png' : dosya.type === 'image/webp' ? 'webp' : 'jpg'
        const ad = `${crypto.randomUUID()}.${uzanti}`
        const up = await supabase.storage.from('acilis').upload(ad, dosya, { contentType: dosya.type })
        if (up.error) throw new Error('Görsel yüklenemedi: ' + up.error.message)
        gorsel = `acilis/${ad}`
      }
      const kart = f.gorselTur === 'kart'
      const row = {
        tur: f.tur,
        baslik: f.baslik.trim(),
        metin: f.metin.trim(),
        gorsel,
        gorsel_alt: f.gorselTur === 'dosya' ? f.gorsel_alt.trim() || null : null,
        kart_etiket: kart ? f.kart_etiket.trim() || null : null,
        kart_baslik: kart ? f.kart_baslik.trim() || null : null,
        kart_aciklama: kart ? f.kart_aciklama.trim() || null : null,
        kart_cizim: kart ? f.kart_cizim || null : null,
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
          r.error.message.includes('check')
            ? 'Alanları kontrol et: başlık 3–90, metin 3–1200, kart başlığı 3–60, kart açıklaması en çok 140 karakter; düğme varsa adresi / ile başlamalı.'
            : r.error.message,
        )
      return f
    },
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ['acilis-yonetim'] })
      qc.invalidateQueries({ queryKey: ['acilis-yenilikler'] })
      setForm(null)
      setDosya(null)
      toast(f.durum === 'yayinda' ? 'Değişiklik kaydedildi; yayındaki pencere güncellendi.' : 'Kaydedildi. Önizleyip yayınlayabilirsin.')
    },
    onError: (e: Error) => toast(e.message, 'warn'),
  })

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const onizleFormdan = (f: Form): Acilis => ({
    id: 'onizle',
    tur: f.tur,
    baslik: f.baslik || 'Başlık',
    metin: f.metin || 'Metin',
    gorsel: f.gorselTur === 'dosya' && !dosya ? f.gorsel || null : null,
    gorsel_alt: f.gorsel_alt || null,
    dugme_metin: f.dugme_metin || null,
    dugme_rota: f.dugme_rota || null,
    kart_etiket: f.kart_etiket || null,
    kart_baslik: f.gorselTur === 'kart' ? f.kart_baslik || 'Kart başlığı' : null,
    kart_aciklama: f.kart_aciklama || null,
    kart_cizim: f.kart_cizim || null,
  })
  const gecerli =
    form &&
    form.baslik.trim().length >= 3 &&
    form.metin.trim().length >= 3 &&
    form.roller.length > 0 &&
    (form.gorselTur !== 'kart' || form.kart_baslik.trim().length >= 3) &&
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
        Giriş yapınca bir kez açılan duyuru ya da yeni özellik tanıtımı. Önemli duyuru “Okudum” denene kadar her girişte açılır; yeni özellik 30 gün açılır ve
        yayında kaldıkça Duyurular → Yenilikler’de görünür. Geri çekilen pencere kimseye görünmez. Bir girişte en çok 3 pencere açılır.
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
                  durum: k.durum,
                  tur: k.tur,
                  baslik: k.baslik,
                  metin: k.metin,
                  gorselTur: k.kart_baslik ? 'kart' : k.gorsel ? 'dosya' : 'yok',
                  kart_etiket: k.kart_etiket ?? '',
                  kart_baslik: k.kart_baslik ?? '',
                  kart_aciklama: k.kart_aciklama ?? '',
                  kart_cizim: k.kart_cizim ?? '',
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
          sub={form.durum === 'yayinda' ? 'Yayında: kaydedince görenler için de güncellenir. Daha önce görenlere yeniden açılmaz.' : undefined}
          width={640}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setOnizle(onizleFormdan(form))}>
                Önizle
              </button>
              <button type="button" className="btn pri" disabled={!gecerli || kaydet.isPending} onClick={() => kaydet.mutate(form)}>
                {form.durum === 'taslak' ? 'Taslak olarak kaydet' : 'Değişikliği kaydet'}
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
              <legend>Görsel</legend>
              <label>
                <input type="radio" name="acl-gorsel" checked={form.gorselTur === 'kart'} onChange={() => set('gorselTur', 'kart')} /> Şablon kart (temaya uyar)
              </label>
              <label>
                <input type="radio" name="acl-gorsel" checked={form.gorselTur === 'dosya'} onChange={() => set('gorselTur', 'dosya')} /> Görsel yükle
              </label>
              <label>
                <input type="radio" name="acl-gorsel" checked={form.gorselTur === 'yok'} onChange={() => set('gorselTur', 'yok')} /> Görsel yok
              </label>
            </fieldset>
            {form.gorselTur === 'kart' && (
              <>
                <div className="acl-iki">
                  <label>
                    Kart etiketi <span className="m">(boşsa {form.tur === 'onemli' ? 'ÖNEMLİ' : 'YENİ ÖZELLİK'})</span>
                    <input value={form.kart_etiket} maxLength={24} onChange={(e) => set('kart_etiket', e.target.value)} />
                  </label>
                  <label>
                    Kart çizimi
                    <select value={form.kart_cizim} onChange={(e) => set('kart_cizim', e.target.value as Form['kart_cizim'])}>
                      <option value="">Yok (yalnız yazı)</option>
                      {Object.entries(KART_CIZIM_TR).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Kart başlığı <span className="m">({form.kart_baslik.length}/60)</span>
                  <input
                    value={form.kart_baslik}
                    maxLength={60}
                    placeholder="Örn. Hedef okulları artık siz seçin"
                    onChange={(e) => set('kart_baslik', e.target.value)}
                  />
                </label>
                <label>
                  Kart açıklaması <span className="m">({form.kart_aciklama.length}/140)</span>
                  <input value={form.kart_aciklama} maxLength={140} onChange={(e) => set('kart_aciklama', e.target.value)} />
                </label>
              </>
            )}
            {form.gorselTur === 'dosya' && (
              <>
                <label>
                  Görsel (PNG, WEBP ya da JPG, en çok 2 MB)
                  <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(e) => setDosya(e.target.files?.[0] ?? null)} />
                </label>
                {form.gorsel && !dosya && (
                  <p className="m" style={{ margin: 0, fontSize: 12 }}>
                    Mevcut görsel yüklü.{' '}
                    <button type="button" className="btn sm ghost" onClick={() => set('gorsel', '')}>
                      Görseli kaldır
                    </button>
                  </p>
                )}
                <label>
                  Görsel açıklaması (ekran okuyucu için)
                  <input value={form.gorsel_alt} maxLength={200} onChange={(e) => set('gorsel_alt', e.target.value)} />
                </label>
              </>
            )}
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
