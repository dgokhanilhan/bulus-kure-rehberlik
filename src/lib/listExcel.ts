import ExcelJS from 'exceljs'
import { widths, type ListConfig } from './schoolLists'

export async function listWorkbook(c: ListConfig, rows: string[][], school: string) {
  const book = new ExcelJS.Workbook()
  book.creator = school
  const sheet = book.addWorksheet('Liste', {
    pageSetup: { paperSize: 9, orientation: c.orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.columns = widths(c).map((w) => ({ width: Math.max(5, w * (c.orientation === 'landscape' ? 1.8 : 1.2)) }))
  const heading = (text: string) => {
    const row = sheet.addRow([text])
    if (c.columns.length > 1) sheet.mergeCells(row.number, 1, row.number, c.columns.length)
    row.font = { name: 'Calibri', size: 12, bold: true }
    row.alignment = { wrapText: true, vertical: 'middle' }
    row.height = 30
  }
  heading(school)
  heading(c.title)
  if (c.description) heading(c.description)
  if (c.date) heading(c.date)
  const header = sheet.addRow(c.columns.map((x) => x.title))
  header.height = 30
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5F5B' } }
    cell.alignment = { wrapText: true, vertical: 'middle' }
  })
  rows.forEach((values) => {
    // Strings stay strings, including leading zeros and =/+/@ prefixes. Never create formula objects.
    const row = sheet.addRow(values.map((v) => String(v)))
    row.height = Math.max(
      c.rowHeight,
      ...values.map((v, i) => Math.ceil(v.length / Math.max(5, sheet.getColumn(i + 1).width!)) * 14 + 10),
    )
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = '@'
      cell.font = { name: 'Calibri', size: 11 }
      cell.alignment = { wrapText: true, vertical: 'middle' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD8DEDE' } } }
    })
  })
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number + rows.length, column: c.columns.length },
  }
  sheet.views = [{ state: 'frozen', ySplit: header.number }]
  sheet.pageSetup.printTitlesRow = `${header.number}:${header.number}`
  if (c.footer) heading(c.footer)
  if (c.signatures) heading(c.signatures)
  return book
}
export async function listExcel(c: ListConfig, rows: string[][], school: string): Promise<Blob> {
  const b = await (await listWorkbook(c, rows, school)).xlsx.writeBuffer()
  return new Blob([new Uint8Array(b)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
