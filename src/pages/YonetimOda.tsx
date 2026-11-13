// Yönetim → Öğretmenler Odası ve Günlük kontrol ayarları (0071).
// Öğretmenler Odası: bölümleri aç/kapat (kapalı bölümün verisi veritabanında da kapanır), sohbet saklama süresi, sohbet kanalları
// (hazır kanalları yeniden adlandır/açıkla/sırala/gizle; okula özel kanal aç: bütün öğretmenler ya da seçilenler).
// Günlük kontrol: maddeler (ad, veliye görünen cümle, sıra, açık/kapalı, yeni madde) ve veli uyarı aralığı.
// Yazma yetkisi veritabanında: ayarlar set_settings (yönetici + iki adımlı doğrulama), oda_kanal / gunluk_kontrol_madde yalnız yönetici.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useModules, usePeople } from '@/lib/data'
import { useAyar } from '@/lib/ayarlar'
import { isTeacherP } from '@/lib/roles'
import { kanalAciklama, kanalAdi, kanalSirala, ozelKanal, type KanalAyar } from '@/lib/oda'
import { maddeKodu, type MaddeTanim } from '@/lib/gunlukKontrol'
import { Modal } from '@/components/Modal'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { Check } from './YonetimMerkezi'

const hataMetni = (e: { code?: string; message?: string } | null) =>
  !e ? null : /row-level security|42501/i.test(`${e.code} ${e.message}`) ? 'Bu işlem için yönetici yetkisi (iki adımlı doğrulama) gerekir.' : (e.message ?? 'Kaydedilemedi.')

function useAyarYaz() {
  const qc = useQueryClient()
  const toast = useToast()
  return async (p: Record<string, unknown>, mesaj: string) => {
    const { error } = await supabase.rpc('set_settings', { p })
    if (error) {
      toast(hataMetni(error)!, 'warn')
      return false
    }
    qc.invalidateQueries({ queryKey: ['school_settings'] })
    toast(mesaj)
    return true
  }
}

/** Yukarı/aşağı taşıma düğmeleri */
function SiraDugmeleri({ ad, ilk, son, onTasi }: { ad: string; ilk: boolean; son: boolean; onTasi: (yon: -1 | 1) => void }) {
  return (
    <span className="btns" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <button type="button" className="btn sm" aria-label={`${ad}: yukarı taşı`} disabled={ilk} onClick={() => onTasi(-1)}>
        ↑
      </button>
      <button type="button" className="btn sm" aria-label={`${ad}: aşağı taşı`} disabled={son} onClick={() => onTasi(1)}>
        ↓
      </button>
    </span>
  )
}

// ================================================================ Öğretmenler Odası
const BOLUMLER: [string, string, string][] = [
  ['oda.takip', 'Öğrenci Takip', 'Seçilen sınıflarda net, ödev, devamsızlık, günlük kontrol ve notlar tek tabloda'],
  ['oda.sohbet', 'Sohbet', 'Öğretmenler arasında canlı sohbet; kapalıyken mesajlar okunamaz ve yazılamaz (silinmez)'],
  ['oda.pano', 'Pano', 'Pano notları, hızlı anket, teşekkür kartı, ders/nöbet değişimi'],
  ['oda.oyunlar', 'Oyunlar', 'Günün sudokusu, günün kelimesi, kısa oyunlar, skor tablosu ve haftalık lig'],
  ['oda.dogum_gunu', 'Doğum günleri', 'Öğretmenlerin isteğe bağlı paylaştığı doğum günleri "Bugün okulda" kartında'],
]

export function OdaAyarlari() {
  const ayar = useAyar()
  const mods = useModules()
  const yaz = useAyarYaz()
  const [gun, setGun] = useState<string | null>(null)
  const gunDeger = gun ?? String(ayar.num('oda.saklama_gun') || 30)
  const gunGecerli = /^\d+$/.test(gunDeger) && Number(gunDeger) >= 7 && Number(gunDeger) <= 365
  return (
    <>
      {!mods.oda && (
        <div className="card a" role="status" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="warn" size={18} />
          <span style={{ flex: 1 }}>Öğretmenler Odası modülü kapalı: menüde görünmez, öğretmenler verisine erişemez.</span>
          <Link className="btn sm" to="/yonetim?sekme=moduller">
            Modüller
          </Link>
        </div>
      )}
      <section className="card a" style={{ ['--d' as string]: 1, padding: 8 }} aria-label="Öğretmenler Odası bölümleri">
        <h2 className="sec" style={{ padding: '8px 8px 0' }}>
          Bölümler
        </h2>
        <p className="m" style={{ fontSize: 13, padding: '0 8px' }}>
          Kapalı bölüm öğretmenlerin ekranından kalkar; verisi silinmez, yönetici dışında kimse okuyamaz ve yazamaz. Açınca her şey geri gelir.
        </p>
        {BOLUMLER.map(([k, l, h]) => (
          <div key={k} style={{ padding: 8 }}>
            <Check on={ayar.bool(k)} onClick={() => yaz({ [k]: !ayar.bool(k) }, `${l}: ${ayar.bool(k) ? 'kapatıldı' : 'açıldı'}`)} label={l} hint={h} />
          </div>
        ))}
        <div style={{ padding: 8 }}>
          <Check
            on={ayar.bool('bildirim.oda')}
            onClick={() => yaz({ 'bildirim.oda': !ayar.bool('bildirim.oda') }, `Öğretmenler Odası bildirimleri ${ayar.bool('bildirim.oda') ? 'kapatıldı' : 'açıldı'}`)}
            label="Bildirimler"
            hint="Sohbette anılma, teşekkür kartı, değişim talebini birinin alması"
          />
        </div>
      </section>
      <section className="card a" style={{ ['--d' as string]: 2, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" htmlFor="odaGun" style={{ maxWidth: 280 }}>
          Sohbet mesajları kaç gün saklansın? (7–365)
          <input id="odaGun" type="number" min={7} max={365} value={gunDeger} onChange={(e) => setGun(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn pri"
          disabled={gun === null || !gunGecerli}
          onClick={() => yaz({ 'oda.saklama_gun': Number(gunDeger) }, 'Saklama süresi kaydedildi').then((ok) => ok && setGun(null))}
        >
          Kaydet
        </button>
        <span className="m" style={{ fontSize: 12 }}>
          Bu süreden eski mesajlar her gece kendiliğinden silinir. Süreyi kısaltmak eski mesajları ilk gece siler.
        </span>
      </section>
      <Kanallar />
    </>
  )
}

const kanalSor = () => supabase.from('oda_kanal').select('kanal, ad, aciklama, gizli, sira, uyeler')

function Kanallar() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['oda', 'kanal-yonetim'],
    queryFn: async () => {
      const [k, a] = await Promise.all([supabase.rpc('oda_kanallar_yonetim'), kanalSor()])
      if (k.error) throw new Error(k.error.message)
      if (a.error) throw new Error(a.error.message)
      const ayar = new Map(((a.data ?? []) as KanalAyar[]).map((x) => [x.kanal, x]))
      return { kanallar: kanalSirala((k.data ?? []) as string[], ayar), ayar }
    },
  })
  const [duzenle, setDuzenle] = useState<string | 'yeni' | null>(null)
  const [sil, setSil] = useState<string | null>(null)
  const yenile = () => qc.invalidateQueries({ queryKey: ['oda'] })
  const satir = (k: string): KanalAyar => q.data?.ayar.get(k) ?? { kanal: k, ad: null, aciklama: null, gizli: false, sira: null, uyeler: null }

  async function kaydet(rows: KanalAyar[]) {
    const { error } = await supabase.from('oda_kanal').upsert(
      rows.map((r) => ({ ...r, school_id: profile!.school_id })),
      { onConflict: 'school_id,kanal' },
    )
    if (error) return hataMetni(error)
    await yenile()
    return null
  }
  async function tasi(i: number, yon: -1 | 1) {
    const l = [...(q.data?.kanallar ?? [])]
    const j = i + yon
    ;[l[i], l[j]] = [l[j]!, l[i]!]
    const e = await kaydet(l.map((k, n) => ({ ...satir(k), sira: n + 1 })))
    if (e) toast(e, 'warn')
  }
  async function gizle(k: string) {
    const r = satir(k)
    const e = await kaydet([{ ...r, gizli: !r.gizli }])
    toast(e ?? `#${kanalAdi(k, r)} ${r.gizli ? 'yeniden açıldı' : 'gizlendi'}`, e ? 'warn' : undefined)
  }

  const liste = q.data?.kanallar ?? []
  return (
    <section className="card a" style={{ ['--d' as string]: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Sohbet kanalları">
      <div className="btns" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="sec" style={{ margin: 0 }}>
          Sohbet kanalları
        </h2>
        <button type="button" className="btn pri sm" onClick={() => setDuzenle('yeni')}>
          <Icon name="plus" size={16} /> Yeni kanal
        </button>
      </div>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        Genel, kademe ve zümre kanalları kendiliğinden oluşur (zümre: öğretmenin branşından). Adını, açıklamasını ve sırasını değiştirebilir, istemediğini gizleyebilirsin.
        Okula özel kanal (ör. "8. sınıf öğretmenleri", "İdare") bütün öğretmenlere ya da seçtiğin öğretmenlere açılır.
      </p>
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : q.isError ? (
        <p className="err" role="alert">
          Kanallar okunamadı: {(q.error as Error).message}
        </p>
      ) : (
        <ul className="ya-liste" data-testid="oda-kanal-liste">
          {liste.map((k, i) => {
            const r = satir(k)
            const ad = kanalAdi(k, r)
            return (
              <li key={k} className={r.gizli ? 'kapali' : undefined} data-testid="oda-kanal">
                <span className="ya-ad">
                  <b># {ad}</b>
                  <span className="m" style={{ fontSize: 12 }}>
                    {ozelKanal(k) ? `Özel kanal · ${r.uyeler ? `${r.uyeler.length} öğretmen` : 'bütün öğretmenler'}` : r.ad ? `Hazır kanal · asıl adı: ${kanalAdi(k)}` : 'Hazır kanal'}
                    {' · '}
                    {kanalAciklama(k, r)}
                  </span>
                </span>
                {r.gizli && <span className="chip n">Gizli</span>}
                <span className="ya-dugmeler">
                  <SiraDugmeleri ad={ad} ilk={i === 0} son={i === liste.length - 1} onTasi={(y) => tasi(i, y)} />
                  <button type="button" className="btn sm" onClick={() => gizle(k)}>
                    {r.gizli ? 'Göster' : 'Gizle'}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setDuzenle(k)}>
                    Düzenle
                  </button>
                  {ozelKanal(k) && (
                    <button type="button" className="btn sm warn" aria-label={`${ad} kanalını sil`} onClick={() => setSil(k)}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {duzenle && (
        <KanalModal
          r={duzenle === 'yeni' ? null : satir(duzenle)}
          sira={liste.length + 1}
          onKaydet={kaydet}
          onClose={() => setDuzenle(null)}
        />
      )}
      {sil && (
        <ConfirmDelete
          title="Kanalı sil"
          name={kanalAdi(sil, satir(sil))}
          onClose={() => setSil(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('oda_kanal').delete().eq('kanal', sil)
            if (error) return hataMetni(error)
            await yenile()
            toast('Kanal silindi')
            setSil(null)
            return null
          }}
        >
          Kanal ve içindeki bütün mesajlar silinir; geri alınamaz. Yalnız gizlemek istersen “Gizle”yi kullan.
        </ConfirmDelete>
      )}
    </section>
  )
}

function KanalModal({ r, sira, onKaydet, onClose }: { r: KanalAyar | null; sira: number; onKaydet: (rows: KanalAyar[]) => Promise<string | null>; onClose: () => void }) {
  const people = usePeople()
  const ogretmenler = useMemo(() => (people.data ?? []).filter((p) => isTeacherP(p)).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')), [people.data])
  const yeni = !r
  const ozel = yeni || ozelKanal(r.kanal)
  const [ad, setAd] = useState(r?.ad ?? '')
  const [aciklama, setAciklama] = useState(r?.aciklama ?? '')
  const [secili, setSecili] = useState<string[] | null>(r?.uyeler ?? null)
  const [ara, setAra] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [mesgul, setMesgul] = useState(false)
  const gecerli = ozel ? ad.trim().length >= 2 && (secili === null || secili.length > 0) : ad.trim().length === 0 || ad.trim().length >= 2

  async function kaydet() {
    setMesgul(true)
    const kanal = r?.kanal ?? `ozel:${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    const e = await onKaydet([
      {
        kanal,
        ad: ad.trim() || null,
        aciklama: aciklama.trim() || null,
        gizli: r?.gizli ?? false,
        sira: r?.sira ?? (yeni ? sira : null),
        uyeler: ozel ? secili : null,
      },
    ])
    setMesgul(false)
    if (e) return setHata(e)
    onClose()
  }
  const gorunen = ogretmenler.filter((o) => !ara.trim() || o.full_name.toLocaleLowerCase('tr').includes(ara.trim().toLocaleLowerCase('tr')))
  return (
    <Modal
      title={yeni ? 'Yeni sohbet kanalı' : `#${kanalAdi(r.kanal, r)} kanalı`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" disabled={!gecerli || mesgul} onClick={kaydet}>
            Kaydet
          </button>
        </>
      }
    >
      <label className="field">
        Kanal adı{!ozel && ' (boş bırakırsan asıl adı kullanılır)'}
        <input value={ad} maxLength={40} placeholder={ozel ? 'ör. 8. sınıf öğretmenleri' : kanalAdi(r!.kanal)} onChange={(e) => setAd(e.target.value)} />
      </label>
      <label className="field">
        Açıklama (isteğe bağlı)
        <input value={aciklama} maxLength={120} placeholder={r ? kanalAciklama(r.kanal, { aciklama: null, uyeler: r.uyeler }) : 'Kanalın konusu'} onChange={(e) => setAciklama(e.target.value)} />
      </label>
      {ozel && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Kimler görür?</span>
          <div className="btns" role="radiogroup" aria-label="Kimler görür">
            <button type="button" role="radio" aria-checked={secili === null} className={`btn sm ${secili === null ? 'pri' : ''}`} onClick={() => setSecili(null)}>
              Bütün öğretmenler
            </button>
            <button type="button" role="radio" aria-checked={secili !== null} className={`btn sm ${secili !== null ? 'pri' : ''}`} onClick={() => setSecili(secili ?? [])}>
              Seçtiğim öğretmenler
            </button>
          </div>
          {secili !== null && (
            <>
              <input aria-label="Öğretmen ara" placeholder="Öğretmen ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
              <div className="ya-secim" role="group" aria-label="Kanal üyeleri">
                {gorunen.map((o) => {
                  const on = secili.includes(o.id)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className="check"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => setSecili(on ? secili.filter((x) => x !== o.id) : [...secili, o.id])}
                    >
                      <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                      <span style={{ fontSize: 14 }}>
                        {o.full_name}
                        {o.branch && <span className="m"> · {o.branch}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
              <span className="m" style={{ fontSize: 12 }}>
                {secili.length} öğretmen seçili. Yöneticiler her kanalı görür.
              </span>
            </>
          )}
        </div>
      )}
      {hata && (
        <div className="err" role="alert">
          {hata}
        </div>
      )}
    </Modal>
  )
}

// ================================================================ Günlük kontrol
export function GunlukKontrolAyarlari() {
  const ayar = useAyar()
  const yaz = useAyarYaz()
  const qc = useQueryClient()
  const toast = useToast()
  const { profile } = useAuth()
  const [aralik, setAralik] = useState<string | null>(null)
  const aralikDeger = aralik ?? String(ayar.num('gunluk_kontrol.uyari_araligi'))
  const aralikGecerli = /^\d+$/.test(aralikDeger) && Number(aralikDeger) <= 10
  const q = useQuery({
    queryKey: ['gunluk-kontrol', 'maddeler'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gunluk_kontrol_madde').select('kod, ad, cumle, sira, aktif').order('sira').order('ad')
      if (error) throw new Error(error.message)
      return (data ?? []) as MaddeTanim[]
    },
  })
  const [duzenle, setDuzenle] = useState<MaddeTanim | 'yeni' | null>(null)
  const [sil, setSil] = useState<MaddeTanim | null>(null)
  const liste = q.data ?? []

  async function kaydet(rows: MaddeTanim[]) {
    const { error } = await supabase.from('gunluk_kontrol_madde').upsert(
      rows.map((r) => ({ ...r, school_id: profile!.school_id })),
      { onConflict: 'school_id,kod' },
    )
    if (error) return hataMetni(error)
    await qc.invalidateQueries({ queryKey: ['gunluk-kontrol', 'maddeler'] })
    return null
  }
  async function tasi(i: number, yon: -1 | 1) {
    const l = [...liste]
    const j = i + yon
    ;[l[i], l[j]] = [l[j]!, l[i]!]
    const e = await kaydet(l.map((m, n) => ({ ...m, sira: n + 1 })))
    if (e) toast(e, 'warn')
  }

  return (
    <>
      <section className="card a" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Günlük kontrol maddeleri">
        <div className="btns" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="sec" style={{ margin: 0 }}>
            Kontrol maddeleri
          </h2>
          <button type="button" className="btn pri sm" onClick={() => setDuzenle('yeni')}>
            <Icon name="plus" size={16} /> Yeni madde
          </button>
        </div>
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          Öğretmenler Öğrenciler → sınıf → Günlük kontrol'de yalnız açık maddeleri işaretler. Cümle veli ve öğrencinin gördüğü ve veli uyarısında yazan metindir.
          Kullanılmış madde silinmez; kapatırsan eski kayıtlar adıyla görünmeye devam eder.
        </p>
        {q.isLoading ? (
          <p className="m">Yükleniyor…</p>
        ) : (
          <ul className="ya-liste" data-testid="gk-madde-liste">
            {liste.map((m, i) => (
              <li key={m.kod} className={m.aktif ? undefined : 'kapali'} data-testid="gk-madde">
                <span className="ya-ad">
                  <b>{m.ad}</b>
                  <span className="m" style={{ fontSize: 12 }}>
                    Veliye: “{m.cumle}”
                  </span>
                </span>
                {!m.aktif && <span className="chip n">Kapalı</span>}
                <span className="ya-dugmeler">
                  <SiraDugmeleri ad={m.ad} ilk={i === 0} son={i === liste.length - 1} onTasi={(y) => tasi(i, y)} />
                  <button
                    type="button"
                    className="btn sm"
                    onClick={async () => {
                      const e = await kaydet([{ ...m, aktif: !m.aktif }])
                      toast(e ?? `${m.ad} ${m.aktif ? 'kapatıldı' : 'açıldı'}`, e ? 'warn' : undefined)
                    }}
                  >
                    {m.aktif ? 'Kapat' : 'Aç'}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setDuzenle(m)}>
                    Düzenle
                  </button>
                  <button type="button" className="btn sm warn" aria-label={`${m.ad} maddesini sil`} onClick={() => setSil(m)}>
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card a" style={{ ['--d' as string]: 1, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" htmlFor="gkAralik" style={{ maxWidth: 300 }}>
          Veliye uyarı: aynı eksik ay içinde kaçıncı kezde? (0 = uyarı yok)
          <input id="gkAralik" type="number" min={0} max={10} value={aralikDeger} onChange={(e) => setAralik(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn pri"
          disabled={aralik === null || !aralikGecerli}
          onClick={() => yaz({ 'gunluk_kontrol.uyari_araligi': Number(aralikDeger) }, 'Uyarı aralığı kaydedildi').then((ok) => ok && setAralik(null))}
        >
          Kaydet
        </button>
        <span className="m" style={{ fontSize: 12 }}>
          Ör. 3: aynı madde ayda 3., 6., 9. kez işaretlenince velilere uygulama içi uyarı gider.
        </span>
        <div style={{ flexBasis: '100%' }}>
          <Check
            on={ayar.bool('bildirim.gunluk_kontrol')}
            onClick={() =>
              yaz({ 'bildirim.gunluk_kontrol': !ayar.bool('bildirim.gunluk_kontrol') }, `Günlük kontrol bildirimi ${ayar.bool('bildirim.gunluk_kontrol') ? 'kapatıldı' : 'açıldı'}`)
            }
            label="Veli uyarı bildirimi"
            hint="Kapalıyken uyarı bildirimi hiç oluşmaz (kayıtlar yine tutulur)"
          />
        </div>
      </section>
      {duzenle && (
        <MaddeModal
          m={duzenle === 'yeni' ? null : duzenle}
          kodlar={liste.map((x) => x.kod)}
          sira={liste.length + 1}
          onKaydet={kaydet}
          onClose={() => setDuzenle(null)}
        />
      )}
      {sil && (
        <ConfirmDelete
          title="Maddeyi sil"
          name={sil.ad}
          onClose={() => setSil(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('gunluk_kontrol_madde').delete().eq('kod', sil.kod)
            if (error) return hataMetni(error)
            await qc.invalidateQueries({ queryKey: ['gunluk-kontrol', 'maddeler'] })
            toast('Madde silindi')
            setSil(null)
            return null
          }}
        >
          Yalnız hiç kullanılmamış madde silinebilir. Kullanılmışsa kapat; eski kayıtlar korunur.
        </ConfirmDelete>
      )}
    </>
  )
}

function MaddeModal(p: { m: MaddeTanim | null; kodlar: string[]; sira: number; onKaydet: (rows: MaddeTanim[]) => Promise<string | null>; onClose: () => void }) {
  const [ad, setAd] = useState(p.m?.ad ?? '')
  const [cumle, setCumle] = useState(p.m?.cumle ?? '')
  const [hata, setHata] = useState<string | null>(null)
  const [mesgul, setMesgul] = useState(false)
  const gecerli = ad.trim().length >= 2 && ad.trim().length <= 30 && cumle.trim().length >= 3
  async function kaydet() {
    setMesgul(true)
    const e = await p.onKaydet([
      { kod: p.m?.kod ?? maddeKodu(ad, p.kodlar), ad: ad.trim(), cumle: cumle.trim(), sira: p.m?.sira ?? p.sira, aktif: p.m?.aktif ?? true },
    ])
    setMesgul(false)
    if (e) return setHata(e)
    p.onClose()
  }
  return (
    <Modal
      title={p.m ? `${p.m.ad} maddesi` : 'Yeni kontrol maddesi'}
      onClose={p.onClose}
      footer={
        <>
          <button className="btn" onClick={p.onClose}>
            Vazgeç
          </button>
          <button className="btn pri" disabled={!gecerli || mesgul} onClick={kaydet}>
            Kaydet
          </button>
        </>
      }
    >
      <label className="field">
        Kısa ad (öğretmenin işaretlediği düğme)
        <input value={ad} maxLength={30} placeholder="ör. Saç / tıraş" onChange={(e) => setAd(e.target.value)} />
      </label>
      <label className="field">
        Veliye görünen cümle
        <input value={cumle} maxLength={120} placeholder="ör. Saç / tıraş kurallara uygun değildi" onChange={(e) => setCumle(e.target.value)} />
      </label>
      <span className="m" style={{ fontSize: 12 }}>
        Etiketleyici ifade kullanma; ne eksik olduğunu yalın yaz. Öğretmen işaretlerken ayrıca detay yazabilir.
      </span>
      {hata && (
        <div className="err" role="alert">
          {hata}
        </div>
      )}
    </Modal>
  )
}
