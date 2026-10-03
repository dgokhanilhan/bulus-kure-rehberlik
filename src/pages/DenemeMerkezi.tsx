// Yönetim → Denemeler → Deneme Tanıma Merkezi: 5–12 destek durumu, yayınlar, biçimler (yayıncı ≠ biçim), şablonlar,
// kazanım kataloğu, eşleşmeyen kazanımlar, içe aktarım geçmişi, test laboratuvarı, arşiv.
// Yazma yetkisi veritabanında (RLS + RPC; yönetici aal2, içe aktarma/eşleştirme rehberlik+yönetici). Bu ekran yalnız arayüzdür.
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Seg } from '@/components/Indicator'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { EXAM_TYPE_TR, academicYear } from '@/lib/denemeGenel'
import { useCurriculumVersions, useExamImports, useExamTemplates, useExamsAdmin, useFormats, usePublishers, useTypeDefaults, versionFor, type ExamAdminRow } from '@/lib/denemeData'
import { trD } from '@/lib/format'
import { KatalogBolumu, EslesmeyenBolumu, SablonBolumu, TestLaboratuvari } from './DenemeMerkeziKatalog'

type Tab = 'genel' | 'yayinlar' | 'bicimler' | 'sablonlar' | 'katalog' | 'eslesmeyen' | 'gecmis' | 'test' | 'arsiv'
const TABS: [Tab, string][] = [
  ['genel', 'Genel bakış'], ['yayinlar', 'Yayınlar'], ['bicimler', 'Biçimler'], ['sablonlar', 'Şablonlar'], ['katalog', 'Kazanım kataloğu'],
  ['eslesmeyen', 'Eşleşmeyen kazanımlar'], ['gecmis', 'İçe aktarım geçmişi'], ['test', 'Test laboratuvarı'], ['arsiv', 'Arşiv'],
]
const FAMILY_TR: Record<string, string> = { LEGACY_DK: 'LGS motoru (mevcut)', HIZ_ORTAOKUL: 'Hız ortaokul karnesi', HIZ_LISE: 'Hız lise karnesi (TYT/AYT)', UNKNOWN: 'Ayrıştırıcı yok (yalnız tanır)' }
const SUBJECTS_BY_GRADE: Record<number, string[]> = {
  5: ['TUR', 'MAT', 'FEN', 'SOS', 'DIN', 'ING'], 6: ['TUR', 'MAT', 'FEN', 'SOS', 'DIN', 'ING'], 7: ['TUR', 'MAT', 'FEN', 'SOS', 'DIN', 'ING'], 8: ['TUR', 'MAT', 'FEN', 'INK', 'DIN', 'ING'],
  9: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'TAR', 'COG', 'DIN'], 10: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'TAR', 'COG', 'FEL', 'DIN'], 11: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'TAR', 'COG', 'FEL', 'DIN'], 12: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'COG', 'DIN', 'INK'],
}

export function DenemeMerkezi() {
  const [tab, setTab] = useState<Tab>('genel')
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        5–12 bütün denemeler tek altyapıdan geçer: PDF tanınır (yayın, sınıf, biçim, sınav türü), öğrenciler eşleşir, sonuçlar şablonun kurallarıyla doğrulanır ve <b>taslak</b> olarak kaydedilir; yayınlayınca
        veliye ve öğrenciye açılır. 8. sınıf LGS denemeleri mevcut LGS motoruyla okunur (sonuçlar değişmez).
      </p>
      <div className="a" style={{ overflowX: 'auto' }}>
        <Seg label="Deneme Tanıma Merkezi bölümü" value={tab} onChange={setTab} options={TABS} />
      </div>
      {tab === 'genel' && <GenelBakis />}
      {tab === 'yayinlar' && <Yayinlar />}
      {tab === 'bicimler' && <Bicimler />}
      {tab === 'sablonlar' && <SablonBolumu />}
      {tab === 'katalog' && <KatalogBolumu />}
      {tab === 'eslesmeyen' && <EslesmeyenBolumu />}
      {tab === 'gecmis' && <Gecmis />}
      {tab === 'test' && <TestLaboratuvari />}
      {tab === 'arsiv' && <Arsiv />}
    </>
  )
}

// ---------------------------------------------------------------- genel bakış: 5–12 destek durumu
function GenelBakis() {
  const tpl = useExamTemplates(), fmt = useFormats(), def = useTypeDefaults(), cv = useCurriculumVersions()
  const year = Number(academicYear(new Date().toISOString().slice(0, 10)).slice(0, 4))
  if (tpl.isLoading || fmt.isLoading || def.isLoading || cv.isLoading) return <p className="m">Yükleniyor…</p>
  return (
    <section className="card a" style={{ overflow: 'hidden' }} aria-label="Sınıflara göre destek durumu">
      <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
        <table>
          <thead>
            <tr>
              <th>Sınıf</th>
              <th>Varsayılan tür</th>
              <th>Biçim</th>
              <th>Şablon</th>
              <th>Kazanım kataloğu ({year}–{year + 1})</th>
            </tr>
          </thead>
          <tbody>
            {[5, 6, 7, 8, 9, 10, 11, 12].map((g) => {
              const d = (def.data ?? []).filter((x) => x.grade === g).sort((a, b) => (a.school_id ? -1 : 1) - (b.school_id ? -1 : 1))[0]
              const fs = (fmt.data ?? []).filter((f) => f.supported_grades.includes(g) && f.status !== 'pasif')
              const ts = (tpl.data ?? []).filter((t) => t.grade === g && t.status !== 'pasif')
              const subj = SUBJECTS_BY_GRADE[g]!, have = subj.filter((s) => versionFor(cv.data ?? [], g, s, year))
              return (
                <tr key={g} data-testid="destek-satiri">
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <b>{g}. sınıf</b>
                  </td>
                  <td>{d ? `${EXAM_TYPE_TR[d.exam_type]}${d.yks_part ? ` · ${d.yks_part}` : ''}` : '—'}</td>
                  <td>
                    {fs.length ? fs.map((f) => <span key={f.id} className={`chip ${f.parser_family === 'UNKNOWN' ? 'down' : f.status === 'aktif' ? 'up' : 'n'}`} style={{ marginRight: 4 }} title={f.notes ?? undefined}>{f.name}{f.parser_family === 'UNKNOWN' ? ' (yalnız tanınır)' : f.status === 'test' ? ' (test)' : ''}</span>) : <span className="chip down">biçim yok</span>}
                  </td>
                  <td>{ts.length ? ts.map((t) => t.name).join(', ') : <span className="chip down">şablon bekliyor</span>}</td>
                  <td>
                    <span className={`chip ${have.length === subj.length ? 'up' : have.length ? 'n' : 'down'}`}>
                      {have.length}/{subj.length} ders
                    </span>
                    {have.length < subj.length && <span className="m" style={{ fontSize: 12 }}> eksik: {subj.filter((s) => !have.includes(s)).join(', ')}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="m" style={{ fontSize: 12, padding: '0 16px 14px' }}>
        Katalogdaki "eksik" ders: o eğitim yılı için resmî program kaynağı bulunamadı (ör. ortaokul Matematik/Fen/Sosyal/Din TYMM 2024 sürümü yayında değil). Kazanım uydurulmaz; sorular
        "Eşleşmeyen kazanımlar"a düşer. Ayrıntı: docs/meb-katalog-raporu.md.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------- yayınlar
function Yayinlar() {
  const { profile } = useAuth()
  const pubs = usePublishers(), fmts = useFormats()
  const qc = useQueryClient(), toast = useToast()
  const [name, setName] = useState('')
  const [series, setSeries] = useState('')
  async function add() {
    const n = name.trim().replace(/\s+/g, ' ')
    if (n.length < 2) return toast('Yayın adı en az 2 harf olmalı.', 'warn')
    const { error } = await supabase.from('publishers').insert({ school_id: profile!.school_id, name: n, series: series.split(',').map((s) => s.trim()).filter(Boolean) })
    if (error) return toast(error.code === '23505' ? 'Bu yayın zaten var.' : 'Yayın eklenemedi (yönetici yetkisi gerekir).', 'warn')
    setName(''); setSeries('')
    qc.invalidateQueries({ queryKey: ['publishers'] })
    toast(`${n} eklendi`)
  }
  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from('publishers').update({ active: !active }).eq('id', id)
    if (error) return toast('Değiştirilemedi.', 'warn')
    qc.invalidateQueries({ queryKey: ['publishers'] })
  }
  const formatsOf = (id: string) => (fmts.data ?? []).filter((f) => f.publisher_formats.some((p) => p.publisher_id === id))
  return (
    <>
      <section className="card a" style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }} aria-label="Yayın ekle">
        <label className="field" htmlFor="pubName" style={{ minWidth: 200, flex: 1 }}>
          Yayın adı
          <input id="pubName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="field" htmlFor="pubSeries" style={{ minWidth: 200, flex: 1 }}>
          Deneme serileri (virgülle, isteğe bağlı)
          <input id="pubSeries" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="ör. LGS Max, Süreç Değerlendirme" />
        </label>
        <button className="btn pri" onClick={add}>
          Yayın ekle
        </button>
      </section>
      <section className="card a" style={{ overflow: 'hidden' }} aria-label="Yayınlar">
        <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
          <table>
            <thead>
              <tr>
                <th>Yayın</th>
                <th>Seriler</th>
                <th>Biçim</th>
                <th>Durum</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {(pubs.data ?? []).map((p) => (
                <tr key={p.id} data-testid="yayin-satiri">
                  <td>
                    <b>{p.name}</b>
                    {!p.school_id && <span className="chip n" style={{ marginLeft: 6 }}>yerleşik</span>}
                  </td>
                  <td className="m" style={{ fontSize: 13 }}>{p.series.join(', ') || '—'}</td>
                  <td>{formatsOf(p.id).map((f) => f.name).join(', ') || <span className="m" style={{ fontSize: 13 }}>örnek PDF ile tanıtılmadı</span>}</td>
                  <td>{p.active ? <span className="chip up">Aktif</span> : <span className="chip n">Pasif</span>}</td>
                  <td>
                    {p.school_id && (
                      <button className="btn sm" onClick={() => toggle(p.id, p.active)}>
                        {p.active ? 'Pasif yap' : 'Aktif yap'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- biçimler (yayıncı ≠ biçim)
function Bicimler() {
  const { profile } = useAuth()
  const fmts = useFormats(), pubs = usePublishers()
  const qc = useQueryClient(), toast = useToast()
  const [link, setLink] = useState<{ format: string; publisher: string }>({ format: '', publisher: '' })
  const [nf, setNf] = useState(false)
  async function addLink() {
    if (!link.format || !link.publisher) return toast('Biçim ve yayın seç.', 'warn')
    // Yerleşik biçim kilitli: yayını ona bağlamak için okulun kendi biçim kaydı açılır (aynı ayrıştırıcı ailesi, test durumunda)
    const f = fmts.data!.find((x) => x.id === link.format)!, p = pubs.data!.find((x) => x.id === link.publisher)!
    let formatId = f.id
    if (f.builtin) {
      const code = `${f.code}_${p.name.toLocaleUpperCase('tr').normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, 16)}`.slice(0, 60)
      const { data, error } = await supabase.from('exam_format_profiles').insert({
        school_id: profile!.school_id, code, name: `${f.name} · ${p.name}`, parser_family: f.parser_family, supported_grades: f.supported_grades, supported_exam_types: f.supported_exam_types,
        detect: f.detect, status: 'test', notes: `${f.code} düzeninin ${p.name} tarafından kullanımı (yayıncı ≠ biçim).`,
      }).select('id').single()
      if (error) return toast(error.code === '23505' ? 'Bu bağlantı zaten var.' : 'Biçim kaydı açılamadı (yönetici yetkisi gerekir).', 'warn')
      formatId = data.id
    }
    const { error } = await supabase.from('publisher_formats').insert({ publisher_id: p.id, format_id: formatId })
    if (error && error.code !== '23505') return toast('Bağlantı kaydedilemedi.', 'warn')
    qc.invalidateQueries({ queryKey: ['exam_format_profiles'] })
    toast(`${p.name} → ${f.name}`)
    setLink({ format: '', publisher: '' })
  }
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Biçim, PDF'in düzenidir; aynı düzeni birden çok yayın kullanabilir (ör. Frekans AYT karnesi Hız lise düzenindedir). Yeni bir yayın bilinen bir düzeni kullanıyorsa yeni ayrıştırıcı gerekmez:
        burada bağlayın ve Test laboratuvarında örnek PDF ile doğrulayın. Hiçbir düzene uymayan PDF "desteklenmiyor" olarak kalır; elle ya da Excel ile girilebilir.
      </p>
      <section className="card a" style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }} aria-label="Yayını biçime bağla">
        <label className="field" htmlFor="lnkPub" style={{ minWidth: 200 }}>
          Yayın
          <select id="lnkPub" value={link.publisher} onChange={(e) => setLink((x) => ({ ...x, publisher: e.target.value }))}>
            <option value="">Seç</option>
            {(pubs.data ?? []).filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="lnkFmt" style={{ minWidth: 240 }}>
          Kullandığı biçim
          <select id="lnkFmt" value={link.format} onChange={(e) => setLink((x) => ({ ...x, format: e.target.value }))}>
            <option value="">Seç</option>
            {(fmts.data ?? []).filter((f) => f.parser_family !== 'UNKNOWN' && f.status !== 'pasif').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <button className="btn pri" onClick={addLink}>
          Bağla
        </button>
        <button className="btn" onClick={() => setNf(true)}>
          Yeni biçim kaydı
        </button>
      </section>
      <section className="card a" style={{ overflow: 'hidden' }} aria-label="Biçimler">
        <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
          <table>
            <thead>
              <tr>
                <th>Biçim</th>
                <th>Ayrıştırıcı</th>
                <th>Sınıflar</th>
                <th>Türler</th>
                <th>Yayınlar</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {(fmts.data ?? []).map((f) => (
                <tr key={f.id} data-testid="bicim-satiri">
                  <td>
                    <b>{f.name}</b>
                    <div className="m mono" style={{ fontSize: 12 }}>{f.code}</div>
                    {f.notes && <div className="m" style={{ fontSize: 12 }}>{f.notes}</div>}
                  </td>
                  <td>{FAMILY_TR[f.parser_family] ?? f.parser_family}</td>
                  <td>{f.supported_grades.join(', ')}</td>
                  <td>{f.supported_exam_types.join(', ')}</td>
                  <td>{(pubs.data ?? []).filter((p) => f.publisher_formats.some((x) => x.publisher_id === p.id)).map((p) => p.name).join(', ') || '—'}</td>
                  <td>
                    <span className={`chip ${f.status === 'aktif' ? 'up' : 'n'}`}>{f.status === 'aktif' ? 'Aktif' : f.status === 'test' ? 'Test' : 'Pasif'}</span>
                    {f.builtin && <span className="chip n" style={{ marginLeft: 4 }}>yerleşik</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {nf && <YeniBicim onClose={() => setNf(false)} />}
    </>
  )
}

function YeniBicim({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const qc = useQueryClient(), toast = useToast()
  const [f, setF] = useState({ code: '', name: '', family: 'HIZ_ORTAOKUL', grades: '', types: 'GENEL', keywords: '' })
  async function save() {
    const grades = f.grades.split(/[,\s]+/).map(Number).filter((g) => g >= 1 && g <= 12)
    if (!/^[A-Za-z0-9_]{3,60}$/.test(f.code) || f.name.trim().length < 3 || !grades.length) return toast('Kod (harf/rakam/_), ad ve en az bir sınıf gerekli.', 'warn')
    const { error } = await supabase.from('exam_format_profiles').insert({
      school_id: profile!.school_id, code: f.code, name: f.name.trim(), parser_family: f.family, supported_grades: grades, supported_exam_types: f.types.split(/[,\s]+/).filter(Boolean),
      detect: { keywords: f.keywords.split(',').map((k) => k.trim()).filter(Boolean) }, status: 'test',
    })
    if (error) return toast(error.code === '23505' ? 'Bu kod zaten var.' : 'Kaydedilemedi (yönetici yetkisi gerekir).', 'warn')
    qc.invalidateQueries({ queryKey: ['exam_format_profiles'] })
    toast('Biçim kaydı açıldı (test durumunda)')
    onClose()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal title="Yeni biçim kaydı" sub="Mevcut bir ayrıştırıcı ailesini kullanan biçim. Tamamen yeni bir düzen için ayrıştırıcı yazılması gerekir; o zamana kadar 'Ayrıştırıcı yok' seçilir." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn pri" onClick={save}>Kaydet</button></>}>
      <div className="grid2">
        <label className="field" htmlFor="nfCode">Kod<input id="nfCode" value={f.code} onChange={set('code')} placeholder="ORNEK_KARNE_V1" /></label>
        <label className="field" htmlFor="nfName">Ad<input id="nfName" value={f.name} onChange={set('name')} /></label>
      </div>
      <label className="field" htmlFor="nfFam">
        Ayrıştırıcı ailesi
        <select id="nfFam" value={f.family} onChange={set('family')}>
          {Object.entries(FAMILY_TR).filter(([k]) => k !== 'LEGACY_DK').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="grid2">
        <label className="field" htmlFor="nfGr">Sınıflar (virgülle)<input id="nfGr" value={f.grades} onChange={set('grades')} placeholder="5, 6, 7" /></label>
        <label className="field" htmlFor="nfTy">Sınav türleri<input id="nfTy" value={f.types} onChange={set('types')} placeholder="GENEL, KURUMSAL" /></label>
      </div>
      <label className="field" htmlFor="nfKw">Tanıma kelimeleri (PDF'te geçen, virgülle)<input id="nfKw" value={f.keywords} onChange={set('keywords')} /></label>
    </Modal>
  )
}

// ---------------------------------------------------------------- içe aktarım geçmişi
function Gecmis() {
  const imp = useExamImports()
  return (
    <section className="card a" style={{ overflow: 'hidden' }} aria-label="İçe aktarım geçmişi">
      {imp.data?.length ? (
        <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Dosya</th>
                <th>Deneme</th>
                <th>Sınıf / tür</th>
                <th className="num">Öğrenci</th>
                <th className="num">Kazanım</th>
                <th className="num">Eşleşmeyen</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {imp.data.map((r) => (
                <tr key={r.id} data-testid="aktarim-satiri">
                  <td style={{ whiteSpace: 'nowrap' }}>{trD(r.created_at.slice(0, 10))}</td>
                  <td className="m" style={{ fontSize: 13 }}>{r.filename ?? r.source_kind}</td>
                  <td>{r.exams?.name ?? '—'}</td>
                  <td>{r.grade ? `${r.grade}. sınıf` : '—'} {r.exam_type ? `· ${r.exam_type}` : ''}</td>
                  <td className="num">{r.result_count}</td>
                  <td className="num">{r.outcome_count}</td>
                  <td className="num">{r.unresolved_count}</td>
                  <td>
                    <span className={`chip ${r.status === 'basarili' ? 'up' : 'down'}`}>{r.status === 'basarili' ? 'Başarılı' : r.status === 'kismi' ? 'Kısmi' : 'Başarısız'}</span>
                    {r.exams && <span className="chip n" style={{ marginLeft: 4 }}>{r.exams.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty" style={{ margin: 16 }}>{imp.isLoading ? 'Yükleniyor…' : 'Henüz içe aktarım yok.'}</div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- arşiv
function Arsiv() {
  const ex = useExamsAdmin()
  const qc = useQueryClient(), toast = useToast()
  const [ask, setAsk] = useState<ExamAdminRow | null>(null)
  const list = useMemo(() => (ex.data ?? []).filter((e) => e.status === 'arsiv'), [ex.data])
  async function restore(e: ExamAdminRow, to: 'yayinda' | 'taslak') {
    const { error } = await supabase.rpc('set_exam_status', { p_exam: e.id, p_status: to })
    if (error) return toast('Geri alınamadı.', 'warn')
    for (const k of ['exams-admin', 'exams', 'dataset']) qc.invalidateQueries({ queryKey: [k] })
    toast(`${e.name} ${to === 'yayinda' ? 'yeniden yayında' : 'taslağa alındı'}`)
    setAsk(null)
  }
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>Arşivlenen deneme veliye, öğrenciye ve öğretmene görünmez; sonuçlar silinmez. Buradan geri alınabilir.</p>
      <section className="card a" style={{ overflow: 'hidden' }} aria-label="Arşivdeki denemeler">
        {list.length ? (
          <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
            <table>
              <thead><tr><th>Deneme</th><th>Tarih</th><th>Sınıf / tür</th><th>Arşivlendi</th><th aria-label="İşlemler" /></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} data-testid="arsiv-satiri">
                    <td><b>{e.name}</b></td>
                    <td>{trD(e.exam_date)}</td>
                    <td>{e.grade}. sınıf · {e.exam_type}{e.yks_part ? ` / ${e.yks_part}` : ''}</td>
                    <td>{e.archived_at ? trD(e.archived_at.slice(0, 10)) : '—'}</td>
                    <td><button className="btn sm" onClick={() => setAsk(e)} aria-label={`${e.name} arşivden çıkar`}>Geri al</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ margin: 16 }}>{ex.isLoading ? 'Yükleniyor…' : 'Arşivde deneme yok.'}</div>
        )}
      </section>
      {ask && (
        <Modal title="Denemeyi arşivden çıkar" onClose={() => setAsk(null)}
          footer={<><button className="btn" onClick={() => setAsk(null)}>Vazgeç</button><button className="btn" onClick={() => restore(ask, 'taslak')}>Taslağa al</button><button className="btn pri" onClick={() => restore(ask, 'yayinda')}>Yeniden yayınla</button></>}>
          <p style={{ fontSize: 14 }}><b>{ask.name}</b> taslağa alınırsa yalnız rehberlik ve yönetim görür; yeniden yayınlanırsa veliler ve öğrenciler görür.</p>
        </Modal>
      )}
    </>
  )
}
