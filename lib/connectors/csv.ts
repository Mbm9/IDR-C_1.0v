// CSV Connector
// Imports identities from a CSV file/string.
// Accepts columns: displayName, type, subType, upn, samAccountName, email,
//                  department, status, adTier, sourceId
// adTier accepts tier_0 / Tier 0 / T0, tier_top / Top Tier / TOP, T1, T2 (any case).

import type { Connector, RawIdentity, RawGroup, SyncProgressCallback } from './base'
import { parseTier } from './tier-patterns'

interface CSVConfig {
  fileContent: string
  /** Optional column mapping from AI-detected or user-configured mappings.
   *  Keys are source CSV header names, values are target Identity Radar field names.
   *  When provided, headers are remapped before processing. */
  columnMapping?: Record<string, string>
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  values.push(current.trim())
  return values
}

export class CSVConnector implements Connector {
  private config: CSVConfig

  constructor(credentials: Record<string, string>) {
    const { columnMapping: mappingStr, ...rest } = credentials
    let columnMapping: Record<string, string> | undefined
    if (mappingStr) {
      try {
        columnMapping = JSON.parse(mappingStr)
      } catch {
        // ignore invalid mapping JSON
      }
    }
    this.config = { ...rest, columnMapping } as unknown as CSVConfig
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.fileContent) {
      return { ok: false, message: 'No CSV content provided' }
    }

    const lines = this.config.fileContent.trim().split(/\r?\n/)
    if (lines.length < 2) {
      return { ok: false, message: 'CSV must have header + at least one data row' }
    }

    const rawHeaders = parseCsvLine(lines[0]).map(h => h.trim())
    const headers = rawHeaders.map(h => {
      if (this.config.columnMapping) {
        const mapped = this.config.columnMapping[h]
        if (mapped) return mapped.toLowerCase()
      }
      return h.toLowerCase()
    })
    const required = ['displayname']
    const missing = required.filter(r => !headers.includes(r))
    if (missing.length) {
      return { ok: false, message: `Missing required columns: ${missing.join(', ')}` }
    }

    return {
      ok: true,
      message: `CSV has ${lines.length - 1} rows with columns: ${headers.join(', ')}`,
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const lines = this.config.fileContent.trim().split(/\r?\n/)
    const rawHeaders = parseCsvLine(lines[0]).map(h => h.trim())
    // If columnMapping is provided, remap headers to target field names
    const headers = rawHeaders.map(h => {
      if (this.config.columnMapping) {
        const mapped = this.config.columnMapping[h]
        if (mapped) return mapped.toLowerCase()
      }
      return h.toLowerCase()
    })
    const identities: RawIdentity[] = []

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const values = parseCsvLine(lines[i])
      const row: Record<string, string> = {}
      headers.forEach((h, j) => {
        row[h] = values[j] || ''
      })

      if (!row.displayname) continue

      identities.push({
        sourceId: row.sourceid || row.upn || row.email || `csv-${i}`,
        displayName: row.displayname,
        type: (row.type === 'non_human' ? 'non_human' : 'human') as any,
        subType: row.subtype || 'employee',
        upn: row.upn,
        samAccountName: row.samaccountname,
        email: row.email,
        department: row.department,
        status: row.status || 'active',
        adTier: parseTier(row.adtier) ?? 'unclassified',
      })

      if (onProgress && i % 100 === 0) {
        onProgress({
          phase: 'extractIdentities',
          current: i,
          total: lines.length - 1,
          message: `Parsed ${i}/${lines.length - 1} CSV rows`,
        })
      }
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from CSV`,
    })

    return identities
  }

  async extractGroups(_onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    return [] // Basic CSV import doesn't support groups
  }
}
