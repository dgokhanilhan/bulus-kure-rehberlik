/** Listeler yalnız mevcut kayıtlardan üretilir; numara kimlik olarak kullanılmaz. */
export type ListKind = 'students' | 'parents'
export const fields = {
  number: 'Sıra',
  studentName: 'Öğrenci',
  className: 'Sınıf',
  schoolNo: 'Okul no',
  parentName: 'Veli',
  relation: 'Yakınlık',
  phone: 'Telefon',
  email: 'İletişim e-postası',
  blank: 'Boş alan',
} as const
export type Field = keyof typeof fields
export interface ListColumn {
  id: string
  source: Field
  title: string
  width: number
}
export interface ParentContact {
  id: string
  name: string
  phone: string | null
  email: string | null
  contactEmail: string | null
  loginEmail: string | null
  updatedAt: string | null
}
export interface ListSources {
  school: string | null
  classes: { id: string; name: string; grade: number; active: boolean }[]
  students: { id: string; name: string; classId: string | null; className: string; schoolNo: string | null }[]
  parents: ParentContact[]
  links: { parentId: string; studentId: string; relation: string | null }[]
}
export interface ListConfig {
  title: string
  description: string
  date: string
  footer: string
  signatures: string
  orientation: 'portrait' | 'landscape'
  rowHeight: number
  columns: ListColumn[]
  classIds: string[]
  studentIds: string[]
  search: string
  missingPhone: boolean
  grouping: 'parent' | 'child'
  sort: 'name' | 'class' | 'number'
  excluded: string[]
  entries: Record<string, Record<string, string>>
}
export interface ListRow {
  id: string
  values: Partial<Record<Field, string>>
  parentIds: string[]
}
export interface ListDocument {
  id: string
  name: string
  kind: ListKind
  mode: 'dynamic' | 'snapshot'
  config: ListConfig
  snapshot: string[][] | null
  revision: number
}
export const templates = [
  { name: 'Standart sınıf listesi', extra: [] },
  { name: 'Deneme sınavı listesi', extra: ['Kitapçık', 'Salon', 'İmza'] },
  { name: 'Gezi katılım listesi', extra: ['Veli izni', 'Katılım'], contact: true },
  { name: 'Yoklama çizelgesi', extra: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'] },
  { name: 'Öğrenci imza listesi', extra: ['İmza'] },
  { name: 'Etkinlik ve organizasyon', extra: ['Görev', 'Katılım', 'Not'] },
  { name: 'Teslim-tesellüm çizelgesi', extra: ['Teslim edilen', 'Teslim tarihi', 'Teslim alan / imza'] },
  { name: 'Boş özel liste', extra: ['Açıklama'] },
]
export function column(source: Field, title: string = fields[source]): ListColumn {
  return {
    id: crypto.randomUUID(),
    source,
    title,
    width:
      source === 'number'
        ? 10
        : source === 'schoolNo'
          ? 14
          : source === 'studentName' || source === 'parentName'
            ? 28
            : source === 'className'
              ? 16
              : 20,
  }
}
export function newList(kind: ListKind, template = 0): ListConfig {
  const t = templates[template] ?? templates[0]!
  const base: Field[] =
    kind === 'parents'
      ? ['number', 'parentName', 'studentName', 'className', 'phone']
      : ['number', 'studentName', 'className', 'schoolNo']
  return {
    title: kind === 'parents' ? 'Veli iletişim listesi' : t.name,
    description: '',
    date: '',
    footer: '',
    signatures: '',
    orientation: 'portrait',
    rowHeight: 28,
    columns: [
      ...base.map((f) => column(f)),
      ...(kind === 'students' && t.contact ? [column('parentName'), column('phone')] : []),
      ...(kind === 'students' ? t.extra.map((x) => column('blank', x)) : []),
    ],
    classIds: [],
    studentIds: [],
    search: '',
    missingPhone: false,
    grouping: 'parent',
    sort: 'class',
    excluded: [],
    entries: {},
  }
}
const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
const join = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => !!x))].join(' / ')
export function listRows(data: ListSources, kind: ListKind, c: ListConfig): ListRow[] {
  const students = data.students.filter(
    (s) =>
      (!c.classIds.length || c.classIds.includes(s.classId ?? '')) &&
      (!c.studentIds.length || c.studentIds.includes(s.id)),
  )
  const sm = new Map(students.map((s) => [s.id, s]))
  const pm = new Map(data.parents.map((p) => [p.id, p]))
  let rows: ListRow[]
  if (kind === 'students')
    rows = students.map((s) => {
      const links = data.links.filter((l) => l.studentId === s.id && pm.has(l.parentId))
      const ps = links.map((l) => pm.get(l.parentId)!)
      return {
        id: s.id,
        parentIds: ps.map((p) => p.id),
        values: {
          studentName: s.name,
          className: s.className,
          schoolNo: s.schoolNo ?? '',
          parentName: join(ps.map((p) => p.name)),
          phone:
            ps.length > 1
              ? ps.map((p) => `${p.name}: ${p.phone || 'Belirtilmemiş'}`).join(' / ')
              : (ps[0]?.phone ?? ''),
          email:
            ps.length > 1
              ? ps.map((p) => `${p.name}: ${p.email || 'Belirtilmemiş'}`).join(' / ')
              : (ps[0]?.email ?? ''),
          relation: join(links.map((l) => l.relation)),
        },
      }
    })
  else
    rows = data.parents.flatMap((p) => {
      const links = data.links.filter((l) => l.parentId === p.id && sm.has(l.studentId))
      if (!links.length && (c.classIds.length || c.studentIds.length)) return []
      const groups = c.grouping === 'child' && links.length ? links.map((l) => [l]) : [links]
      return groups.map((ls) => ({
        id: `${p.id}:${c.grouping === 'child' ? (ls[0]?.studentId ?? '') : ''}`,
        parentIds: [p.id],
        values: {
          parentName: p.name,
          phone: p.phone ?? '',
          email: p.email ?? '',
          studentName: join(ls.map((l) => sm.get(l.studentId)?.name)),
          className: join(ls.map((l) => sm.get(l.studentId)?.className)),
          schoolNo: join(ls.map((l) => sm.get(l.studentId)?.schoolNo)),
          relation: join(ls.map((l) => l.relation)),
        },
      }))
    })
  rows = rows.filter(
    (r) =>
      (!c.missingPhone || !r.parentIds.some((id) => pm.get(id)?.phone)) &&
      (!c.search.trim() || fold(Object.values(r.values).join(' ')).includes(fold(c.search.trim()))),
  )
  const compare = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true })
  const name = kind === 'parents' ? 'parentName' : 'studentName'
  rows.sort(
    (a, b) =>
      (c.sort === 'class'
        ? compare(a.values.className ?? '', b.values.className ?? '')
        : c.sort === 'number'
          ? compare(a.values.schoolNo ?? '', b.values.schoolNo ?? '')
          : 0) ||
      compare(a.values[name] ?? '', b.values[name] ?? '') ||
      compare(a.id, b.id),
  )
  return rows
}
/** Bu izdüşüm dışa aktarım/sabit kayıt sınırıdır: seçilmeyen alanlar taşınmaz. */
export function projectRows(rows: ListRow[], c: ListConfig): string[][] {
  return rows
    .filter((r) => !c.excluded.includes(r.id))
    .map((r, i) =>
      c.columns.map((col) =>
        col.source === 'number'
          ? String(i + 1)
          : col.source === 'blank'
            ? (c.entries[r.id]?.[col.id] ?? '')
            : r.values[col.source] || 'Belirtilmemiş',
      ),
    )
}
export function widths(c: ListConfig): number[] {
  const sum = c.columns.reduce((n, x) => n + Math.max(1, x.width), 0)
  return c.columns.map((x) => (100 * Math.max(1, x.width)) / sum)
}
