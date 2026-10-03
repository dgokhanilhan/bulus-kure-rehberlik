// MEB kazanım / öğrenme çıktısı kataloğu (0026): bütünlük denetimleri (istek §20), müfredat sürümü seçimi (§85),
// repodaki sürümlü veriyle (supabase/katalog/meb) veritabanının birebir aynı olması.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { service } from './helpers'

const svc = service()
const DIR = new URL('../supabase/katalog/meb/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8'))

async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from(table).select(cols).range(from, from + 999)
    if (error) throw error
    out.push(...(data as T[]))
    if (data!.length < 1000) return out
  }
}
type LO = { id: string; curriculum_version_id: string; grade: number; subject_code: string; code: string | null; title: string; theme: string | null; unit: string | null }
type CV = { id: string; curriculum_type: string; grade: number; subject_code: string; year_from: number; year_to: number | null; active: boolean; source_url: string; source_sha256: string | null }

describe('Katalog bütünlüğü', () => {
  it('boş kod / ders / sınıf / başlık yok; her kayıt bir sürüme ve kaynağa bağlı', async () => {
    const [los, cvs] = await Promise.all([all<LO>('learning_outcomes', 'id, curriculum_version_id, grade, subject_code, code, title, theme, unit'), all<CV>('curriculum_versions', '*')])
    expect(los.length).toBe(326 + manifest.totals.outcomes)
    const vid = new Map(cvs.map((v) => [v.id, v]))
    expect(los.filter((o) => !o.code)).toEqual([]) // resmî kaynakta kodsuz kazanım yok (TDE 2018 kodu "A.1.12" biçiminde resmî)
    expect(los.filter((o) => !o.subject_code || !o.grade || !o.title?.trim())).toEqual([])
    expect(los.filter((o) => !vid.has(o.curriculum_version_id))).toEqual([]) // sürümsüz kayıt yok
    expect(los.filter((o) => vid.get(o.curriculum_version_id)!.grade !== o.grade || vid.get(o.curriculum_version_id)!.subject_code !== o.subject_code)).toEqual([])
    expect(cvs.filter((v) => !v.source_url || !v.source_sha256)).toEqual([]) // kaynağı / hash'i olmayan sürüm yok (0025'teki 8. sınıf dahil)
    const subjects = new Set(((await svc.from('subjects').select('code')).data ?? []).map((s) => s.code))
    expect(los.filter((o) => !subjects.has(o.subject_code))).toEqual([]) // yetim ders yok
  })

  it('aynı bağlamda tekrar yok; aynı kod farklı bağlamda geçebilir (ör. TDE sınıflar arası) ve ayrı kimliktir', async () => {
    const los = await all<LO>('learning_outcomes', 'id, curriculum_version_id, grade, subject_code, code, title, theme, unit')
    const ctx = new Map<string, number>()
    for (const o of los) { const k = `${o.curriculum_version_id}|${o.code}|${o.theme ?? ''}|${o.unit ?? ''}`; ctx.set(k, (ctx.get(k) ?? 0) + 1) }
    expect([...ctx].filter(([, n]) => n > 1)).toEqual([])
    const tde = los.filter((o) => o.code === 'TDE1.2' && o.subject_code === 'TDE')
    expect(new Set(tde.map((o) => o.id)).size).toBe(tde.length)
    expect(tde.length).toBeGreaterThanOrEqual(5) // 2024: 9, 10 (+pasif 11, 12) · 2026: 9, 10, 11 (+pasif 12)
  })
})

describe('Müfredat sürümü seçimi', () => {
  const pick = async (g: number, s: string, y: number) => {
    const id = (await svc.rpc('curriculum_for', { p_grade: g, p_subject: s, p_year: y })).data as string | null
    return id ? ((await svc.from('curriculum_versions').select('curriculum_type, source_title').eq('id', id).single()).data as { curriculum_type: string; source_title: string }) : null
  }
  it('2025–2026 7. sınıf eski program, 2026–2027 7. sınıf TYMM (aynı müfredat sayılmaz)', async () => {
    expect((await pick(7, 'FEN', 2025))?.curriculum_type).toBe('LEGACY')
    expect((await pick(7, 'FEN', 2026))?.curriculum_type).toBe('TYMM')
    expect((await pick(7, 'TUR', 2025))?.source_title).toMatch(/2019/)
    expect((await pick(7, 'SOS', 2025))?.source_title).toMatch(/2023/)
  })
  it('2025–2026 11. sınıf eski program, 2026–2027 11. sınıf TYMM; 9–10 2025\'te TYMM 2024 sürümü', async () => {
    expect((await pick(11, 'BIY', 2025))?.curriculum_type).toBe('LEGACY')
    expect((await pick(11, 'BIY', 2026))?.curriculum_type).toBe('TYMM')
    expect((await pick(9, 'BIY', 2025))?.source_title).toMatch(/\(2024\)/)
    expect((await pick(9, 'BIY', 2026))?.source_title).toMatch(/\(2026\)/)
    expect((await pick(10, 'TDE', 2025))?.source_title).toMatch(/\(2024\)/)
  })
  it('8 ve 12 hâlâ eski programda; TYMM bölümleri pasif ve seçilmez', async () => {
    expect((await pick(8, 'MAT', 2026))?.curriculum_type).toBe('LEGACY')
    expect((await pick(12, 'FIZ', 2026))?.curriculum_type).toBe('LEGACY')
    const { data } = await svc.from('curriculum_versions').select('grade, active').eq('curriculum_type', 'TYMM').in('grade', [8, 12])
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((v) => !v.active)).toBe(true)
  })
  it('resmî kaynağı bulunamayan yıl "Eksik": 2025–2026 5. sınıf Matematik için sürüm uydurulmaz', async () => {
    expect(await pick(5, 'MAT', 2025)).toBeNull()
    expect((await pick(5, 'MAT', 2026))?.curriculum_type).toBe('TYMM')
  })
})

describe('Repodaki sürümlü veri = veritabanı', () => {
  it('her kaynak dosyasının sürümleri ve çıktıları veritabanında birebir', async () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    expect(files.length).toBe(manifest.totals.sources)
    const los = new Map((await all<LO & { description: string | null }>('learning_outcomes', 'id, code, title, grade')).map((o) => [o.id, o]))
    for (const f of files) {
      const d = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))
      expect(d.source.sha256, f).toMatch(/^[0-9a-f]{64}$/)
      expect(d.source.url, f).toMatch(/^https:\/\/mufredat\.meb\.gov\.tr\//)
      for (const o of d.outcomes) {
        const db = los.get(o.id)
        expect(db, `${f} ${o.code}`).toBeTruthy()
        expect([db!.code, db!.title, db!.grade]).toEqual([o.code, o.title, o.grade])
      }
    }
  })
  it('istemci katalogu değiştiremez', async () => {
    const { signInAdminAal2 } = await import('./helpers')
    const admin = await signInAdminAal2()
    expect((await admin.from('learning_outcomes').update({ title: 'x' }).eq('code', 'MAT.5.1.1').select('id')).data ?? []).toEqual([])
  })
})
