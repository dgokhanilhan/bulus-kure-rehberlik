// Kullanım panosu, KVKK başvuruları ve öğrenci KVKK dosyası (0078).
import { useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useStudents } from '@/lib/data'
import { ago, localDate, trDM } from '@/lib/format'
import { ACIK_RIZA_VERSION, KVKK_GECERLI_ESKI, KVKK_VERSION } from '@/lib/kvkk'
import {
  kalanGun,
  KVKK_DURUM_TR,
  KVKK_SURE_GUN,
  KVKK_TUR_TR,
  useKullanimOzeti,
  useKvkkBasvur,
  useKvkkDosya,
  useKvkkTalepler,
  useKvkkYanitla,
  type KvkkTalep,
  type KvkkTur,
} from '@/lib/kvkkData'
import { Seg } from './Indicator'
import { useToast } from './Toast'

const ROL_TR: Record<string, string> = { admin: 'Yönetici', rehber: 'Rehber öğretmen', ogretmen: 'Öğretmen', veli: 'Veli', ogrenci: 'Öğrenci' }
const ROL_SIRA = ['admin', 'rehber', 'ogretmen', 'veli', 'ogrenci']
const MODUL_TR: Record<string, string> = {
  gorev: 'Görev atama',
  gorusme: 'Görüşme planlama',
  rapor: 'Gönderilen raporlar',
  not: 'Öğretmen notları',
  odev: 'Ödevler',
  duyuru: 'Duyurular',
  mesaj: 'Mesajlar',
  yoklama: 'Yoklama kayıtları',
  gunluk_kontrol: 'Günlük kontrol',
  deneme: 'Yayınlanan denemeler',
  etut: 'Etüt günleri',
  oda: 'Öğretmenler Odası mesajları',
  soru: 'Çözemedim soruları',
  veli_ozet: 'Veli haftalık özetleri',
}
const yuzde = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** Değişim: artış primary + ↑, azalış signal + ↓ */
function Degisim({ son, once }: { son: number; once: number }) {
  if (son === once) return <span className="chip n">→ aynı</span>
  const up = son > once
  return (
    <span className={`chip ${up ? 'up' : 'down'}`}>
      {up ? '↑' : '↓'} {Math.abs(son - once)}
    </span>
  )
}

// ---------- Kullanım panosu ----------
export function KullanimPanosu() {
  const q = useKullanimOzeti()
  const [rol, setRol] = useState<string>('hepsi')
  if (q.isLoading)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (q.isError || !q.data) return <div className="err">Kullanım bilgisi alınamadı: {(q.error as Error)?.message}</div>
  const roller = [...q.data.roller].sort((a, b) => ROL_SIRA.indexOf(a.rol) - ROL_SIRA.indexOf(b.rol))
  const pasif = q.data.pasif.filter((p) => rol === 'hepsi' || p.rol === rol)
  const moduller = [...q.data.moduller].sort((a, b) => b.son30 - a.son30)
  return (
    <div className="stack" data-testid="kullanim-panosu">
      <p className="m" style={{ margin: 0 }}>
        Son 30 günde kim giriş yaptı, hangi bölüm ne kadar kullanıldı. Yalnız sayılar ve hesap adları gösterilir; öğrenci verisi içermez.
      </p>
      <section className="kp-roller" aria-label="Giriş durumu">
        {roller.map((r) => (
          <div className="card kp-rol" key={r.rol}>
            <span className="label">{ROL_TR[r.rol] ?? r.rol}</span>
            <b className="kp-sayi">
              {r.son30}/{r.toplam}
            </b>
            <span className="m">son 30 günde girdi (%{yuzde(r.son30, r.toplam)})</span>
            <span className="m">
              Son 7 gün: {r.son7} · Hiç girmedi: <b>{r.hic}</b>
            </span>
          </div>
        ))}
      </section>

      <section className="card kp-kart" aria-label="Bölüm kullanımı">
        <h2 className="sec">Bölüm kullanımı</h2>
        <table className="kp-tablo">
          <thead>
            <tr>
              <th scope="col">Bölüm</th>
              <th scope="col">Son 30 gün</th>
              <th scope="col">Önceki 30 gün</th>
              <th scope="col">Değişim</th>
            </tr>
          </thead>
          <tbody>
            {moduller.map((m) => (
              <tr key={m.anahtar} className={m.son30 === 0 ? 'bos' : ''}>
                <td>{MODUL_TR[m.anahtar] ?? m.anahtar}</td>
                <td>
                  <b>{m.son30}</b>
                </td>
                <td>{m.onceki30}</td>
                <td>
                  <Degisim son={m.son30} once={m.onceki30} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          Hiç kullanılmayan bölümler soluk görünür; kapatmak ya da tanıtmak için Modüller sekmesine bakabilirsin.
        </p>
      </section>

      <section className="card kp-kart" aria-label="Girmeyen hesaplar" data-testid="pasif-hesaplar">
        <div className="kv">
          <h2 className="sec">Hiç girmeyen ya da 30 gündür girmeyen hesaplar</h2>
          <span className="chip n">{q.data.pasif.length} hesap</span>
        </div>
        <Seg
          label="Rol"
          value={rol}
          onChange={setRol}
          options={[
            ['hepsi', 'Hepsi'] as [string, string],
            ...ROL_SIRA.filter((r) => q.data.pasif.some((p) => p.rol === r)).map((r) => [r, ROL_TR[r]!] as [string, string]),
          ]}
        />
        {!pasif.length ? (
          <p className="m">Herkes son 30 günde giriş yapmış.</p>
        ) : (
          <ul className="gh-liste">
            {pasif.map((p) => (
              <li key={p.id}>
                <span className="gh-ad">
                  <b>{p.ad}</b>
                  <span className="m">
                    {ROL_TR[p.rol] ?? p.rol}
                    {p.brans && p.rol !== 'rehber' ? ` · ${p.brans}` : ''}
                  </span>
                </span>
                <span className={`chip ${p.son ? 'n' : 'gold'}`}>{p.son ? `Son giriş ${ago(p.son)}` : 'Hiç girmedi'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---------- KVKK başvuruları (yönetici) ----------
function TalepYanit({ t }: { t: KvkkTalep }) {
  const yanitla = useKvkkYanitla()
  const toast = useToast()
  const [metin, setMetin] = useState('')
  const kapali = t.durum === 'tamamlandi' || t.durum === 'reddedildi'
  const gonder = (durum: 'inceleniyor' | 'tamamlandi' | 'reddedildi') =>
    yanitla.mutate(
      { id: t.id, durum, yanit: metin },
      { onSuccess: () => (setMetin(''), toast('Başvuru güncellendi · başvurana bildirim gitti')), onError: (e) => toast((e as Error).message, 'warn') },
    )
  if (kapali) return t.yanit ? <p className="ds-yanit">{t.yanit}</p> : null
  return (
    <div className="stack" style={{ gap: 8, width: '100%' }}>
      {t.tur === 'silme' && (
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          Silme otomatik yapılmaz: öğrencinin sayfasındaki silme ya da Yeni dönem › arşiv akışıyla yap, sonra burada "Sonuçlandı" işaretle.
        </p>
      )}
      <label className="field" htmlFor={`kvy-${t.id}`}>
        Yanıt (başvurana gider)
        <textarea id={`kvy-${t.id}`} maxLength={1000} value={metin} onChange={(e) => setMetin(e.target.value)} />
      </label>
      <div className="btns">
        {t.durum === 'yeni' && (
          <button type="button" className="btn" disabled={yanitla.isPending} onClick={() => gonder('inceleniyor')}>
            İncelemeye al
          </button>
        )}
        <button type="button" className="btn pri" disabled={yanitla.isPending} onClick={() => gonder('tamamlandi')}>
          Sonuçlandı
        </button>
        <button type="button" className="btn" disabled={yanitla.isPending} onClick={() => gonder('reddedildi')}>
          Gerekçeyle reddet
        </button>
      </div>
    </div>
  )
}

export function KvkkBasvurulari() {
  const q = useKvkkTalepler()
  const [filtre, setFiltre] = useState<'acik' | 'hepsi'>('acik')
  const liste = (q.data ?? []).filter((t) => filtre === 'hepsi' || t.durum === 'yeni' || t.durum === 'inceleniyor')
  return (
    <section className="card kp-kart" aria-label="KVKK başvuruları" data-testid="kvkk-basvurulari">
      <h2 className="sec">KVKK başvuruları</h2>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        Veliler ve kullanıcılar Hesap ayarlarından bilgi, düzeltme ya da silme başvurusu yapar. Yasal yanıt süresi {KVKK_SURE_GUN} gündür. Her yanıt işlem
        kaydına yazılır.
      </p>
      <Seg
        label="Başvurular"
        value={filtre}
        onChange={setFiltre}
        options={[
          ['acik', 'Bekleyenler'],
          ['hepsi', 'Hepsi'],
        ]}
      />
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !liste.length ? (
        <p className="m">{filtre === 'acik' ? 'Bekleyen başvuru yok.' : 'Başvuru yok.'}</p>
      ) : (
        <ul className="gh-liste">
          {liste.map((t) => {
            const kalan = kalanGun(t)
            return (
              <li key={t.id} data-testid="kvkk-talep" style={{ alignItems: 'flex-start' }}>
                <span className="gh-ad">
                  <b>
                    {KVKK_TUR_TR[t.tur]}
                    {t.ogrenci ? ` · ${t.ogrenci.full_name} (${t.ogrenci.class_name})` : ''}
                  </b>
                  <span className="m">
                    {t.basvuran_p?.full_name ?? 'Silinmiş hesap'} · {trDM(localDate(t.created_at))} · {KVKK_DURUM_TR[t.durum]}
                  </span>
                  {t.aciklama && <span style={{ fontSize: 14 }}>{t.aciklama}</span>}
                </span>
                {kalan != null && <span className={`chip ${kalan <= 7 ? 'down' : 'n'}`}>{kalan > 0 ? `${kalan} gün kaldı` : `Süre ${-kalan} gün geçti`}</span>}
                <TalepYanit t={t} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------- Öğrenci KVKK dosyası (yönetici) ----------
const ERISIM_TR: Record<string, string> = { ogrenci: 'öğrenci sayfası', rehber_notlari: 'rehberlik notları', rapor: 'rapor' }

export function KvkkDosyasi({ sid }: { sid: string }) {
  const q = useKvkkDosya(sid)
  if (q.isLoading)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (q.isError || !q.data) return <div className="err">KVKK dosyası alınamadı: {(q.error as Error)?.message}</div>
  const d = q.data
  const guncel = (v: string | null, g: string) => (v === g ? 'up' : v ? 'gold' : 'n')
  return (
    <div className="stack" data-testid="kvkk-dosyasi">
      <section className="card kp-kart" aria-label="Rıza durumu">
        <h2 className="sec">Aydınlatma ve açık rıza</h2>
        {!d.hesaplar.length ? (
          <p className="m">Bu öğrenciye bağlı onaylı hesap yok.</p>
        ) : (
          <ul className="gh-liste">
            {d.hesaplar.map((h, i) => (
              <li key={i}>
                <span className="gh-ad">
                  <b>{h.ad}</b>
                  <span className="m">
                    {h.tur === 'veli' ? `Veli${h.yakinlik ? ` (${h.yakinlik})` : ''}` : 'Öğrenci hesabı'} ·{' '}
                    {h.son_giris ? `son giriş ${ago(h.son_giris)}` : 'hiç girmedi'}
                  </span>
                </span>
                <span className="gh-islem">
                  <span className={`chip ${KVKK_GECERLI_ESKI.includes(h.aydinlatma ?? '') ? 'up' : guncel(h.aydinlatma, KVKK_VERSION)}`}>
                    Aydınlatma:{' '}
                    {h.aydinlatma ? `${h.aydinlatma}${h.aydinlatma_at ? ` · ${trDM(localDate(h.aydinlatma_at))}` : ''}` : 'kayıt yok'}
                  </span>
                  <span className={`chip ${guncel(h.riza, ACIK_RIZA_VERSION)}`}>
                    Açık rıza: {h.riza ? `${h.riza}${h.riza_at ? ` · ${trDM(localDate(h.riza_at))}` : ''}` : 'verilmedi'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          Güncel sürümler: aydınlatma {KVKK_VERSION}, açık rıza {ACIK_RIZA_VERSION}. Açık rızası olmayan hesap ilk girişte onaya yönlendirilir.
        </p>
      </section>

      <section className="card kp-kart" aria-label="Erişim kaydı" data-testid="kvkk-erisim">
        <h2 className="sec">Bu öğrencinin verisini kim görüntüledi (son 180 gün)</h2>
        {!d.erisim.length ? (
          <p className="m">Kayıt yok.</p>
        ) : (
          <table className="kp-tablo">
            <thead>
              <tr>
                <th scope="col">Kişi</th>
                <th scope="col">Ne</th>
                <th scope="col">Görüntüleme</th>
                <th scope="col">Son</th>
              </tr>
            </thead>
            <tbody>
              {d.erisim.map((e, i) => (
                <tr key={i}>
                  <td>
                    <b>{e.ad}</b>
                    <span className="m" style={{ display: 'block', fontSize: 13 }}>
                      {ROL_TR[e.rol] ?? e.rol}
                      {e.brans && e.rol !== 'rehber' ? ` · ${e.brans}` : ''}
                    </span>
                  </td>
                  <td>{e.turler.map((t) => ERISIM_TR[t] ?? t).join(', ')}</td>
                  <td>{e.sayi}</td>
                  <td>{ago(e.son)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          Öğrenci sayfası kişi başına günde bir kez, rehberlik notu ve rapor her açılışta kaydedilir.
        </p>
      </section>

      <section className="card kp-kart" aria-label="Başvurular">
        <h2 className="sec">Bu öğrenci için KVKK başvuruları</h2>
        {!d.talepler.length ? (
          <p className="m">Başvuru yok.</p>
        ) : (
          <ul className="gh-liste">
            {d.talepler.map((t) => (
              <li key={t.id}>
                <span className="gh-ad">
                  <b>{KVKK_TUR_TR[t.tur]}</b>
                  <span className="m">
                    {t.basvuran ?? 'Silinmiş hesap'} · {trDM(localDate(t.created_at))} · {KVKK_DURUM_TR[t.durum]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          Yanıtlamak için Yönetim › KVKK başvuruları.
        </p>
      </section>
    </div>
  )
}

// ---------- Başvuru formu (Hesap ayarları) ----------
export function KvkkBasvuruFormu() {
  const { profile } = useAuth()
  const veli = profile?.role === 'veli'
  const cocuklar = useStudents(veli)
  const talepler = useKvkkTalepler()
  const basvur = useKvkkBasvur()
  const toast = useToast()
  const [tur, setTur] = useState<KvkkTur>('bilgi')
  const [kim, setKim] = useState<string>('')
  const [aciklama, setAciklama] = useState('')
  const secenekler = useMemo(() => (veli ? (cocuklar.data ?? []).map((c) => [c.id, c.full_name] as const) : []), [veli, cocuklar.data])
  const hedef = kim || (secenekler[0]?.[0] ?? 'ben')

  const gonder = () => {
    if (tur === 'silme' && !window.confirm('Silme başvurusu okul yönetimine iletilir. Sonuçlanınca bu verilere uygulamadan erişilemez. Gönderilsin mi?')) return
    basvur.mutate(
      { tur, student_id: hedef === 'ben' ? null : hedef, aciklama },
      { onSuccess: () => (setAciklama(''), toast('Başvuru okul yönetimine iletildi')), onError: (e) => toast((e as Error).message, 'warn') },
    )
  }
  return (
    <section className="card stack" style={{ padding: 20 }} data-testid="kvkk-basvuru">
      <h2>Kişisel veriler (KVKK) başvurusu</h2>
      <p className="m">
        Kişisel verilerle ilgili bilgi, düzeltme ya da silme başvurusu okul yönetimine iletilir ve en geç {KVKK_SURE_GUN} gün içinde yanıtlanır. Sonuç bildirim
        olarak gelir.
      </p>
      <label className="field" htmlFor="kvkkTur">
        Başvuru konusu
        <select id="kvkkTur" value={tur} onChange={(e) => setTur(e.target.value as KvkkTur)}>
          {(Object.keys(KVKK_TUR_TR) as KvkkTur[]).map((k) => (
            <option key={k} value={k}>
              {KVKK_TUR_TR[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor="kvkkKim">
        Kimin verileri
        <select id="kvkkKim" value={hedef} onChange={(e) => setKim(e.target.value)}>
          {secenekler.map(([id, ad]) => (
            <option key={id} value={id}>
              {ad} (çocuğum)
            </option>
          ))}
          <option value="ben">Kendi hesabım</option>
        </select>
      </label>
      <label className="field" htmlFor="kvkkAciklama">
        Açıklama (isteğe bağlı)
        <textarea id="kvkkAciklama" maxLength={1000} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      </label>
      <button type="button" className="btn pri" style={{ alignSelf: 'flex-start' }} disabled={basvur.isPending} onClick={gonder}>
        Başvuruyu gönder
      </button>
      {(talepler.data ?? []).some((t) => t.basvuran === profile?.id) && (
        <ul className="gh-liste" aria-label="Başvurularım">
          {(talepler.data ?? [])
            .filter((t) => t.basvuran === profile?.id)
            .map((t) => (
              <li key={t.id} data-testid="kvkk-basvurum">
                <span className="gh-ad">
                  <b>
                    {KVKK_TUR_TR[t.tur]}
                    {t.ogrenci ? ` · ${t.ogrenci.full_name}` : ''}
                  </b>
                  <span className="m">
                    {trDM(localDate(t.created_at))} · {KVKK_DURUM_TR[t.durum]}
                  </span>
                  {t.yanit && <span className="ds-yanit">{t.yanit}</span>}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
