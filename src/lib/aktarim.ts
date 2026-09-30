// Toplu aktarım (Faz H): CSV / Excel satırlarını alan adlarına eşler. Saf fonksiyonlar; doğrulamanın asıl yeri veritabanı (import_students) ve admin-davet.
import { fold } from './format'

export type ImportKind = 'ogrenci' | 'ogretmen'
export const FIELDS: Record<ImportKind, { key: string; label: string; required: boolean; alias: string[] }[]> = {
  ogrenci: [
    { key: 'full_name', label: 'Ad soyad', required: true, alias: ['ad soyad', 'adi soyadi', 'ad soyadi', 'adsoyad', 'ogrenci', 'ogrenci adi', 'ogrenci adi soyadi', 'isim'] },
    { key: 'class_name', label: 'Sınıf', required: true, alias: ['sinif', 'sinifi', 'sube', 'sinif/sube', 'sinif sube'] },
    { key: 'school_no', label: 'Okul no', required: false, alias: ['okul no', 'okul numarasi', 'no', 'numara', 'ogrenci no'] },
  ],
  ogretmen: [
    { key: 'full_name', label: 'Ad soyad', required: true, alias: ['ad soyad', 'adi soyadi', 'ad soyadi', 'adsoyad', 'ogretmen', 'isim'] },
    { key: 'email', label: 'E-posta', required: true, alias: ['e-posta', 'eposta', 'email', 'e-mail', 'mail', 'e posta'] },
    { key: 'branch', label: 'Branş', required: true, alias: ['brans', 'bransi', 'alan', 'ders'] },
    { key: 'phone', label: 'Telefon', required: false, alias: ['telefon', 'tel', 'cep', 'cep telefonu', 'gsm'] },
  ],
}
export const TEMPLATE: Record<ImportKind, string[][]> = {
  ogrenci: [['Ad soyad', 'Sınıf', 'Okul no'], ['Ayşe Yılmaz', '5/A', '1234'], ['Mehmet Kaya', '8/B', '']],
  ogretmen: [['Ad soyad', 'E-posta', 'Branş', 'Telefon'], ['Zeynep Demir', 'zeynep.demir@ornek.com', 'Matematik', '0532 000 00 00']],
}
export const MAX_ROWS: Record<ImportKind, number> = { ogrenci: 2000, ogretmen: 100 }

/** CSV çözücü: ; , ya da sekme ayırıcı (ilk satıra göre), tırnaklı alanlar, BOM. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const nl = t.search(/\r?\n/)
  const head = nl < 0 ? t : t.slice(0, nl)
  const count = (c: string) => head.split(c).length - 1
  const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0]!
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (q) {
      if (c === '"' && t[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (c === sep) row.push(cell), (cell = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell), rows.push(row), (row = []), (cell = '')
    } else cell += c
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row)
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

export function toCsv(rows: string[][]): string {
  const esc = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n'
}

/** Başlık satırını alanlara eşler: { alan: sütun no }. "Ad" + "Soyad" ayrı sütunlarsa birleştirilir. */
export function mapHeaders(kind: ImportKind, header: string[]) {
  const h = header.map((x) => fold(String(x ?? '')).replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim())
  const map: Record<string, number> = {}
  for (const f of FIELDS[kind]) {
    const i = h.findIndex((x) => f.alias.includes(x))
    if (i >= 0) map[f.key] = i
  }
  let split: [number, number] | null = null
  if (map.full_name === undefined) {
    const a = h.findIndex((x) => x === 'ad' || x === 'adi')
    const s = h.findIndex((x) => x === 'soyad' || x === 'soyadi')
    if (a >= 0 && s >= 0) split = [a, s]
  }
  const missing = FIELDS[kind].filter((f) => f.required && map[f.key] === undefined && !(f.key === 'full_name' && split)).map((f) => f.label)
  return { map, split, missing }
}

/** Başlıktan sonraki satırları nesnelere çevirir (boşluklar kırpılır). */
export function toRecords(kind: ImportKind, rows: unknown[][]) {
  const [header, ...body] = rows
  const { map, split, missing } = mapHeaders(kind, (header ?? []).map((x) => String(x ?? '')))
  const cell = (r: unknown[], i: number | undefined) => (i === undefined || r[i] == null ? '' : String(r[i]).trim().replace(/\s+/g, ' '))
  const records = body
    .filter((r) => r.some((x) => x != null && String(x).trim() !== ''))
    .map((r) => {
      const o: Record<string, string> = {}
      for (const f of FIELDS[kind]) o[f.key] = cell(r, map[f.key])
      if (split) o.full_name = `${cell(r, split[0])} ${cell(r, split[1])}`.trim()
      if (kind === 'ogretmen') o.email = o.email!.toLowerCase()
      return o
    })
  return { records, missing }
}
