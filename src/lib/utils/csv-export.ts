/**
 * CSV Export Utility
 *
 * Generates CSV content from tabular data and triggers browser download.
 * Handles: comma escaping, quote wrapping, Unicode (UTF-8 BOM for Excel Arabic support).
 */

export interface CsvColumn {
  key: string
  label: string
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Generate a CSV string from columns and rows.
 */
export function generateCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map(c => escapeCell(c.label)).join(',')
  const body = rows.map(row =>
    columns.map(c => escapeCell(row[c.key])).join(',')
  ).join('\r\n')
  return `${header}\r\n${body}`
}

/**
 * Trigger a CSV file download in the browser.
 * Prepends UTF-8 BOM for proper Arabic text display in Excel.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
