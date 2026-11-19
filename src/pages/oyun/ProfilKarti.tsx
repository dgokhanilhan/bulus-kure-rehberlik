// Haftalık ligde isme tıklanınca açılan profil kartı (0090): bu haftaki puan ve sıra, seri, kürsü, günlük puan grafiği,
// bugünkü sonuçlar ve kazanılan rozetler. Yalnız okur; sunucu gizli ya da başka okuldaki kişi için boş döner.
import { Modal } from '@/components/Modal'
import { KisiSimge } from '@/components/Avatar'
import { useOdaProfil, type OdaProfil } from '@/lib/oyunData'
import { OYUNLAR, ROZETLER, seri, skorYaz, type OyunId } from '@/lib/oyunlar'

const GUN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const GUN_UZUN = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const SIMGE: Partial<Record<OyunId, string>> = { sudoku: '🧩', kelime: '🔤', sehir: '🗺️', soru: '❓', bulmaca: '✏️' }

const gunEkle = (t: string, n: number) => {
  const d = new Date(`${t}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function unvan(rol: string, brans: string | null): string {
  if (rol === 'admin') return 'Yönetici'
  if (brans === 'Rehberlik') return 'Rehber öğretmen'
  return brans ? `${brans} öğretmeni` : 'Öğretmen'
}

export function ProfilKarti({ userId, ad, acik, onClose }: { userId: string; ad: string; acik: OyunId[]; onClose: () => void }) {
  const q = useOdaProfil(userId)
  const p = q.data
  return (
    <Modal
      title={p?.ad ?? ad}
      sub={p ? unvan(p.rol, p.brans) : undefined}
      simge={<KisiSimge ad={p?.ad ?? ad} avatar={p?.avatar} boyut={52} />}
      width={420}
      onClose={onClose}
    >
      {q.isLoading ? <p className="m">Yükleniyor…</p> : !p ? <p className="m">Bu profil görüntülenemiyor.</p> : <ProfilIcerik p={p} acik={acik} />}
    </Modal>
  )
}

function ProfilIcerik({ p, acik }: { p: OdaProfil; acik: OyunId[] }) {
  const s = seri(p.ist.gunler, p.bugun_gun)
  const puan = new Map(p.gunler.map((g) => [g.gun, g.puan]))
  const tavan = Math.max(p.tavan, 1)
  const gunluk = OYUNLAR.filter((o) => o.gunluk && acik.includes(o.id))
  const bugun = new Map(p.bugun.map((b) => [b.oyun, b.puan]))
  const rozetler = ROZETLER.filter((r) => (!r.oyun || acik.includes(r.oyun)) && r.kosul(p.ist, s, acik.length))
  const sira = p.lig?.sira
  return (
    <div className="pk">
      <div className="pk-kutular">
        <div className={`pk-kutu${sira === 1 ? ' bir' : ''}`} data-testid="pk-hafta">
          <span aria-hidden="true">{sira && sira <= 3 ? ['🥇', '🥈', '🥉'][sira - 1] : '🏅'}</span>
          <b className="mono">{p.lig?.puan ?? 0}</b>
          <span className="m">{sira ? `Bu hafta ${sira}.` : 'Bu hafta'}</span>
        </div>
        <div className="pk-kutu" data-testid="pk-seri">
          <span aria-hidden="true">🔥</span>
          <b className="mono">{s}</b>
          <span className="m">gün üst üste</span>
        </div>
        <div className="pk-kutu" data-testid="pk-kursu">
          <span aria-hidden="true">🏆</span>
          <b className="mono">{p.kursu.sayi}</b>
          <span className="m">kürsü</span>
        </div>
      </div>

      <section aria-label="Bu hafta günlük puan">
        <div className="kv">
          <b className="pk-bas">Bu hafta günlük puan</b>
          <span className="m" style={{ fontSize: 12 }}>
            en fazla {p.tavan}
          </span>
        </div>
        <ol className="pk-grafik">
          {GUN.map((g, i) => {
            const t = gunEkle(p.hafta, i)
            const v = puan.get(t)
            const bu = t === p.bugun_gun
            return (
              <li key={g} className={bu ? 'bugun' : ''}>
                <span className={`mono${v ? '' : ' m'}`} aria-hidden="true">
                  {v ?? '–'}
                </span>
                <span className="pk-cubuk" aria-hidden="true">
                  <span style={{ height: `${Math.min(100, ((v ?? 0) / tavan) * 100)}%` }} />
                </span>
                <span className="m" aria-hidden="true">
                  {g}
                </span>
                <span className="sr-only">
                  {GUN_UZUN[i]}: {v ? `${v} puan` : 'puan yok'}
                  {bu ? ' (bugün)' : ''}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-label="Bugünkü sonuçlar">
        <b className="pk-bas">Bugünkü sonuçlar</b>
        <ul className="pk-sonuc">
          {gunluk.map((o) => {
            const v = bugun.get(o.id)
            return (
              <li key={o.id}>
                <span aria-hidden="true">{SIMGE[o.id]}</span>
                <span style={{ flex: 1 }}>{o.ad}</span>
                <b className={`mono${v == null ? ' m' : ''}`}>{v == null ? '–' : skorYaz(o.id, v)}</b>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label="Rozetler">
        <b className="pk-bas">Rozetler</b>
        {rozetler.length ? (
          <ul className="pk-rozet">
            {rozetler.map((r) => (
              <li key={r.id} title={r.aciklama}>
                <span aria-hidden="true">{r.simge}</span>
                {r.ad}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m" style={{ margin: '6px 0 0', fontSize: 14 }}>
            Henüz rozet yok.
          </p>
        )}
      </section>
    </div>
  )
}
