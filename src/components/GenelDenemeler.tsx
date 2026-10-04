// 5–7 Deneme Analizi · 9–10 TYT · 11 AYT · 12 YKS (TYT/AYT sekmeleri). 8. sınıf LGS Atlas'ı ayrı ve değişmeden kalır.
// Son deneme kartı yalnız karşılaştırılabilir önceki denemeyle kıyaslar (TYT ↔ AYT, Genel ↔ TYT kıyaslanmaz).
import { useMemo, useState } from 'react'
import { profileFor, useExamItems, useExamProfiles, useExamTemplates, useGenelDataset, type GenelExam, type GenelResult } from '@/lib/denemeData'
import { academicYear, contextTitle, examFamily, isScore, lastExamDelta, outcomeAnalysis, outcomeTerm, profileRows, reportTitle, yksTabs, type Profile, type TemplateSection, type YksPart } from '@/lib/denemeGenel'
import { trD } from '@/lib/format'
import { Seg } from './Indicator'
import { LineChart } from './LineChart'

const n2 = (x: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
const sign = (x: number) => (x > 0 ? `+${n2(x)}` : n2(x))

/** Bir öğrencinin genel denemeleri (veli/öğrenci Özet, öğretmen öğrenci sayfası). */
export function GenelDenemeler({ studentId, grade, delay = 3 }: { studentId: string; grade: number | null | undefined; delay?: number }) {
  const ds = useGenelDataset()
  const tpls = useExamTemplates()
  const profiles = useExamProfiles()
  const tabs = yksTabs(grade)
  const [part, setPart] = useState<YksPart>('TYT')
  const title = contextTitle(grade)
  const mine = useMemo(() => {
    const res = new Map((ds.data?.results ?? []).filter((r) => r.student_id === studentId).map((r) => [r.exam_id, r]))
    const exams = (ds.data?.exams ?? []).filter((e) => res.has(e.id) && (!tabs.length || examFamily(e) === part))
    return { exams, res }
  }, [ds.data, studentId, tabs.length, part])
  const delta = lastExamDelta(mine.exams, new Map([...mine.res].map(([k, r]) => [k, { totalNet: r.total_net ?? 0, successPct: r.success_pct }])))
  const [sel, setSel] = useState<string | null>(null)
  const shown = mine.exams.find((e) => e.id === sel) ?? delta?.exam ?? null

  return (
    <section className="card a" style={{ ['--d' as string]: delay, padding: 20, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }} aria-label={title} data-testid="genel-denemeler">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="sec">{title}</h2>
        {tabs.length > 0 && <Seg label="YKS oturumu" value={part} onChange={(p) => (setPart(p), setSel(null))} options={tabs.map((t) => [t, t] as const)} />}
      </div>
      {ds.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !delta ? (
        <div className="empty">Henüz yayınlanmış {tabs.length ? `${part} ` : ''}deneme yok.</div>
      ) : (
        <>
          <div className="card" style={{ padding: 14, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }} data-testid="son-deneme">
            <div>
              <span className="label">Son deneme</span>
              <div><b>{delta.exam.name}</b> <span className="m" style={{ fontSize: 13 }}>{trD(delta.exam.exam_date)}</span></div>
            </div>
            <div><span className="label">Net</span><div className="big" style={{ fontSize: 26 }}>{n2(delta.totalNet)}</div></div>
            {delta.successPct !== null && <div><span className="label">Başarı</span><div className="big" style={{ fontSize: 26 }}>%{n2(delta.successPct)}</div></div>}
            <div style={{ fontSize: 13 }}>
              {delta.previous ? (
                <>
                  <span className={`chip ${(delta.deltaNet ?? 0) >= 0 ? 'up' : 'down'}`}>{sign(delta.deltaNet ?? 0)} net</span>{' '}
                  <span className="m">önceki {examFamily(delta.previous) === 'GENEL' ? '' : `${examFamily(delta.previous)} `}denemeye göre ({delta.previous.name})</span>
                </>
              ) : (
                <span className="m">Karşılaştırılabilir önceki deneme yok.</span>
              )}
            </div>
          </div>
          {mine.exams.length > 1 && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 420 }}>
                <LineChart values={mine.exams.map((e) => mine.res.get(e.id)!.total_net ?? 0)} labels={mine.exams.map((e) => e.name)} onSelect={(i) => setSel(mine.exams[i]!.id)} />
              </div>
            </div>
          )}
          {shown && (
            <Bolumler
              exam={shown}
              result={mine.res.get(shown.id)!}
              sections={tpls.data?.find((t) => t.id === shown.exam_template_id)?.sections ?? []}
              profile={profileFor(profiles.data ?? [], grade, Number(academicYear(shown.exam_date).slice(0, 4)))}
            />
          )}
        </>
      )}
    </section>
  )
}

const STATUS_TR = { olculmedi: 'Ölçülmedi (bu denemede yok)', uygulanmadi: 'Uygulanmadı (seçmeli)', profil_disi: '', olculdu: '' }

function Bolumler({ exam, result, sections, profile }: { exam: GenelExam; result: GenelResult; sections: TemplateSection[]; profile: Profile | null }) {
  const rows = profileRows(profile, exam, sections, result.subjects)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <div className="m" style={{ fontSize: 13, marginBottom: 4 }}>{reportTitle(exam)} · {exam.name}{exam.publisher ? ` · ${exam.publisher}` : ''}</div>
        <div className="tbl" tabIndex={0} role="region" aria-label={`${exam.name} bölüm sonuçları`}>
          <table>
            <thead><tr><th>Bölüm</th><th className="num">D</th><th className="num">Y</th><th className="num">B</th><th className="num">Net</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const v = r.value
                const label = r.subtest?.display_name ?? r.section?.label ?? ''
                return (
                  <tr key={i} data-testid="bolum-satiri">
                    <td>
                      {label}
                      {r.section?.question_count ? <span className="m" style={{ fontSize: 12 }}> · {r.section.question_count} soru</span> : null}
                      {r.subtest?.language_code === 'en' && <span className="m" style={{ fontSize: 12 }}> · İngilizce</span>}
                      {r.status === 'profil_disi' && <span className="chip n" style={{ marginLeft: 6, fontSize: 11 }}>profil dışı</span>}
                    </td>
                    {isScore(v) ? (
                      <><td className="num">{v.d}</td><td className="num">{v.y}</td><td className="num">{v.b}</td><td className="num"><b>{n2(v.net)}</b></td></>
                    ) : (
                      <td colSpan={4} className="m" style={{ fontSize: 13 }}>{STATUS_TR[r.status] || 'Sonuç yok'}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Analiz exam={exam} result={result} profile={profile} sections={sections} />
    </div>
  )
}

/** Öğrenme Çıktısı Analizi (TYMM) / Kazanım Analizi (eski program): yalnız soru düzeyinde ölçülmüş ve eşleşmiş sorular. */
function Analiz({ exam, result, profile, sections }: { exam: GenelExam; result: GenelResult; profile: Profile | null; sections: TemplateSection[] }) {
  const items = useExamItems(exam.id)
  if (items.isLoading || !items.data?.length) return null
  const a = outcomeAnalysis(items.data, result.answers)
  const label = (k: string) => sections.find((s) => s.key === k)?.label ?? k
  return (
    <div data-testid="kazanim-analizi">
      <h3 className="sec" style={{ fontSize: 15 }}>{outcomeTerm(profile)}</h3>
      {a.rows.length ? (
        <div className="tbl" tabIndex={0} role="region" aria-label={outcomeTerm(profile)}>
          <table>
            <thead><tr><th>{outcomeTerm(profile, 'tekil').replace(/^./, (c) => c.toLocaleUpperCase('tr'))}</th><th className="num">Soru</th><th className="num">D</th><th className="num">Y</th><th className="num">B</th></tr></thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 13 }}><span className="mono">{r.code ?? ''}</span> {r.title} <span className="m">· {r.sections.map(label).join(', ')}</span></td>
                  <td className="num">{r.n}</td><td className="num">{r.d}</td><td className="num">{r.y}</td><td className="num">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m" style={{ fontSize: 13 }}>Bu denemede {outcomeTerm(profile, 'tekil')} ile eşleşmiş soru verisi yok.</p>
      )}
      <p className="m" style={{ fontSize: 12 }}>
        Yalnız bu denemede ölçülen ve resmî {outcomeTerm(profile, 'cogul')} ile eşleşen sorular gösterilir; listede olmayan {outcomeTerm(profile, 'tekil')} ölçülmemiştir, eksik sayılmaz.
        {a.unresolved ? ` ${a.unresolved} soru henüz eşleşmediği için analiz dışı.` : ''}
        {a.skipped.length ? ` ${a.skipped.map(label).join(', ')}: soru verisi sonuçla tutmadığı için hesaplanmadı.` : ''}
      </p>
    </div>
  )
}

/** Öğretmen: sınıfın genel denemeleri — deneme başına katılım, ortalama net ve bölüm ortalamaları (yalnız aynı denemenin öğrencileri). */
export function GenelSinifAnalizi({ studentIds, grade }: { studentIds: string[]; grade: number | null | undefined }) {
  const ds = useGenelDataset()
  const tpls = useExamTemplates()
  const tabs = yksTabs(grade)
  const [part, setPart] = useState<YksPart>('TYT')
  const ids = useMemo(() => new Set(studentIds), [studentIds])
  const rows = useMemo(() => {
    const out: { exam: GenelExam; n: number; avgNet: number; avgPct: number | null; sec: Record<string, number> }[] = []
    for (const e of ds.data?.exams ?? []) {
      if (tabs.length && examFamily(e) !== part) continue
      const rs = (ds.data?.results ?? []).filter((r) => r.exam_id === e.id && ids.has(r.student_id))
      if (!rs.length) continue
      const sec: Record<string, number> = {}
      const keys = [...new Set(rs.flatMap((r) => Object.keys(r.subjects)))]
      for (const k of keys) {
        const vals = rs.map((r) => r.subjects[k] ?? null).filter(isScore)
        if (vals.length) sec[k] = vals.reduce((a, v) => a + v.net, 0) / vals.length
      }
      const pcts = rs.map((r) => r.success_pct).filter((x): x is number => x !== null)
      out.push({ exam: e, n: rs.length, avgNet: rs.reduce((a, r) => a + (r.total_net ?? 0), 0) / rs.length, avgPct: pcts.length ? pcts.reduce((a, x) => a + x, 0) / pcts.length : null, sec })
    }
    return out.reverse()
  }, [ds.data, ids, tabs.length, part])
  const label = (e: GenelExam, k: string) => tpls.data?.find((t) => t.id === e.exam_template_id)?.sections.find((s) => s.key === k)?.label ?? k
  return (
    <section className="card a" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label={`${contextTitle(grade)} sınıf analizi`} data-testid="genel-sinif">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="sec">{contextTitle(grade)} · sınıf</h2>
        {tabs.length > 0 && <Seg label="YKS oturumu" value={part} onChange={setPart} options={tabs.map((t) => [t, t] as const)} />}
      </div>
      {ds.isLoading ? <p className="m">Yükleniyor…</p> : !rows.length ? <div className="empty">Bu sınıfta yayınlanmış deneme sonucu yok.</div> : rows.map((r) => (
        <div key={r.exam.id} className="card" style={{ padding: 12 }} data-testid="genel-sinif-deneme">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b>{r.exam.name}</b>
            <span className="m" style={{ fontSize: 13 }}>{trD(r.exam.exam_date)} · {reportTitle(r.exam)} · {r.n} öğrenci</span>
            <span className="chip n">ort. net {n2(r.avgNet)}</span>
            {r.avgPct !== null && <span className="chip n">ort. başarı %{n2(r.avgPct)}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {Object.entries(r.sec).map(([k, v]) => <span key={k} className="chip" style={{ fontSize: 12 }}>{label(r.exam, k)}: {n2(v)}</span>)}
          </div>
        </div>
      ))}
    </section>
  )
}

/** Profil Gelişim: genel denemenin (5–7 / 9–12) son sonucu — profil sırasıyla bölümler ("ölçülmedi" dahil) ve Öğrenme Çıktısı / Kazanım Analizi. */
export function SonDenemeAnalizi({ examId, studentId, grade }: { examId: string; studentId: string; grade: number | null | undefined }) {
  const ds = useGenelDataset()
  const tpls = useExamTemplates()
  const profiles = useExamProfiles()
  const exam = ds.data?.exams.find((e) => e.id === examId)
  const result = ds.data?.results.find((r) => r.exam_id === examId && r.student_id === studentId)
  if (!exam || !result) return null
  return (
    <section className="card a" style={{ ['--d' as string]: 5, padding: 20, minWidth: 0 }} aria-label="Son deneme ayrıntısı" data-testid="son-deneme-analizi">
      <h2 className="sec" style={{ marginBottom: 8 }}>Son deneme · bölümler</h2>
      <Bolumler exam={exam} result={result} sections={tpls.data?.find((t) => t.id === exam.exam_template_id)?.sections ?? []}
        profile={profileFor(profiles.data ?? [], grade, Number(academicYear(exam.exam_date).slice(0, 4)))} />
    </section>
  )
}
