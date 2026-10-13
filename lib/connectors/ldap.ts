// SPDX-License-Identifier: Apache-2.0
// Active Directory / LDAP Connector
// Supports two modes:
//   1. Live LDAP connection via ldapjs (dynamically imported — no hard dependency)
//   2. CSV fallback for offline AD imports
//
// The CSV fallback accepts exports from AD tools (PowerShell Get-ADUser, csvde, etc.)
// with columns: samAccountName, displayName, email, department, lastLogon, memberOf, userAccountControl

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { windowsFileTimeToDate, uacToStatus, classifyTier, classifyGroupTier, isPrivilegedGroupName } from './transformer'
import { parseTier } from './tier-patterns'

interface LDAPConfig {
  host: string
  port: string
  baseDN: string
  bindDN: string
  bindPassword: string
  useTLS: string
  // CSV fallback fields (used when mode === 'csv' or when ldapjs is unavailable)
  mode?: string           // 'ldap' | 'csv' — defaults to 'ldap'
  csvContent?: string     // raw CSV string for CSV mode
}

// ---------- Helpers ----------

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

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''))
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] || ''
    })
    rows.push(row)
  }
  return rows
}

// ---------- LDAP helpers (dynamic import) ----------

async function tryImportLdap(): Promise<any | null> {
  try {
    return await import('ldapjs')
  } catch {
    return null
  }
}

// ---------- LDAPConnector ----------

export class LDAPConnector implements Connector {
  private config: LDAPConfig

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as LDAPConfig
  }

  private get isCsvMode(): boolean {
    return this.config.mode === 'csv' || !!this.config.csvContent
  }

  // ---------- testConnection ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    // CSV mode
    if (this.isCsvMode) {
      return this.testCsvConnection()
    }

    // LDAP mode
    const ldap = await tryImportLdap()
    if (!ldap) {
      return {
        ok: false,
        message:
          'ldapjs module is not installed. Install it with `npm install ldapjs` or use CSV fallback mode by setting mode=csv and providing csvContent.',
      }
    }

    const url = `${this.config.useTLS === 'true' ? 'ldaps' : 'ldap'}://${this.config.host}:${this.config.port || '389'}`

    return new Promise((resolve) => {
      const client = ldap.createClient({ url, timeout: 10000, connectTimeout: 10000 })

      client.on('error', (err: any) => {
        resolve({ ok: false, message: `LDAP connection failed: ${err.message}` })
      })

      client.bind(this.config.bindDN, this.config.bindPassword, (err: any) => {
        if (err) {
          client.destroy()
          resolve({ ok: false, message: `LDAP bind failed: ${err.message}` })
        } else {
          client.unbind()
          resolve({ ok: true, message: `Connected to ${this.config.host} (base: ${this.config.baseDN})` })
        }
      })
    })
  }

  // ---------- extractIdentities ----------

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    if (this.isCsvMode) {
      return this.extractIdentitiesFromCsv(onProgress)
    }

    const ldap = await tryImportLdap()
    if (!ldap) {
      throw new Error('ldapjs module is not available. Use CSV fallback mode instead.')
    }

    return this.extractIdentitiesFromLdap(ldap, onProgress)
  }

  // ---------- extractGroups ----------

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    if (this.isCsvMode) {
      // CSV mode: extract groups from memberOf column
      return this.extractGroupsFromCsv(onProgress)
    }

    const ldap = await tryImportLdap()
    if (!ldap) {
      throw new Error('ldapjs module is not available. Use CSV fallback mode instead.')
    }

    return this.extractGroupsFromLdap(ldap, onProgress)
  }

  // ---------- extractEntitlements ----------

  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    // Entitlements derived from group memberships
    const identities = await this.extractIdentities()
    const entitlements: RawEntitlement[] = []

    for (const identity of identities) {
      if (!identity.memberOf?.length) continue
      for (const groupName of identity.memberOf) {
        entitlements.push({
          sourceId: `ad-membership-${identity.sourceId}-${groupName}`,
          identitySourceId: identity.sourceId,
          permissionName: groupName,
          permissionType: 'group_membership',
          permissionScope: this.config.baseDN,
          adTierOfPermission: classifyTier([groupName]),
          grantedBy: 'Active Directory',
        })
      }
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Derived ${entitlements.length} entitlements from AD group memberships`,
    })

    return entitlements
  }

  // ==========================================================
  // LDAP extraction
  // ==========================================================

  private extractIdentitiesFromLdap(ldap: any, onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const url = `${this.config.useTLS === 'true' ? 'ldaps' : 'ldap'}://${this.config.host}:${this.config.port || '389'}`
    const identities: RawIdentity[] = []

    return new Promise((resolve, reject) => {
      const client = ldap.createClient({ url, timeout: 30000, connectTimeout: 10000 })

      client.on('error', (err: any) => reject(new Error(`LDAP connection error: ${err.message}`)))

      client.bind(this.config.bindDN, this.config.bindPassword, (bindErr: any) => {
        if (bindErr) {
          client.destroy()
          reject(new Error(`LDAP bind failed: ${bindErr.message}`))
          return
        }

        const opts = {
          filter: '(&(objectClass=user)(objectCategory=person))',
          scope: 'sub' as const,
          attributes: [
            'objectGUID', 'sAMAccountName', 'userPrincipalName', 'displayName',
            'mail', 'department', 'manager', 'memberOf', 'lastLogon',
            'pwdLastSet', 'userAccountControl', 'whenCreated',
            // AD security posture attributes
            'servicePrincipalName', 'adminCount', 'msDS-AllowedToDelegateTo',
            'msDS-AllowedToActOnBehalfOfOtherIdentity', 'msDS-SupportedEncryptionTypes',
          ],
          paged: true,
        }

        client.search(this.config.baseDN, opts, (searchErr: any, res: any) => {
          if (searchErr) {
            client.unbind()
            reject(new Error(`LDAP search failed: ${searchErr.message}`))
            return
          }

          res.on('searchEntry', (entry: any) => {
            const attrs = entry.ppiAttributes || entry.attributes || []
            const get = (name: string) => {
              const attr = attrs.find((a: any) => a.type === name)
              return attr?.values?.[0] || attr?._vals?.[0]?.toString() || ''
            }
            const getAll = (name: string) => {
              const attr = attrs.find((a: any) => a.type === name)
              return attr?.values || attr?._vals?.map((v: any) => v.toString()) || []
            }

            const memberOf = getAll('memberOf').map((dn: string) => {
              const match = dn.match(/^CN=([^,]+)/)
              return match ? match[1] : dn
            })

            const uac = parseInt(get('userAccountControl')) || 0
            const managerDn = get('manager')
            const managerMatch = managerDn ? managerDn.match(/^CN=([^,]+)/) : null

            // AD security posture attributes
            const spn = getAll('servicePrincipalName').filter(Boolean)
            const adminCount = parseInt(get('adminCount')) || 0
            const allowedToDelegateTo = getAll('msDS-AllowedToDelegateTo').filter(Boolean)
            const rbcd = !!get('msDS-AllowedToActOnBehalfOfOtherIdentity')
            const supportedEncTypes = parseInt(get('msDS-SupportedEncryptionTypes')) || undefined
            // A person object carrying an SPN is a service account → kerberoastable
            const isServiceAccount = spn.length > 0

            identities.push({
              sourceId: get('objectGUID') || get('sAMAccountName'),
              displayName: get('displayName') || get('sAMAccountName'),
              type: isServiceAccount ? 'non_human' : 'human',
              subType: isServiceAccount ? 'service_account' : 'employee',
              upn: get('userPrincipalName'),
              samAccountName: get('sAMAccountName'),
              email: get('mail'),
              department: get('department'),
              status: uacToStatus(uac),
              adTier: classifyTier(memberOf),
              lastLogonAt: windowsFileTimeToDate(get('lastLogon')) || undefined,
              passwordLastSetAt: windowsFileTimeToDate(get('pwdLastSet')) || undefined,
              managerSourceId: managerMatch?.[1],
              memberOf,
              mfaEnabled: false, // AD doesn't have native MFA
              privileged: memberOf.some((g: string) => isPrivilegedGroupName(g)),
              adSecurity: { uac, spn, adminCount, allowedToDelegateTo, rbcd, supportedEncTypes },
            })

            if (onProgress && identities.length % 100 === 0) {
              onProgress({
                phase: 'LDAP users',
                current: identities.length,
                total: 0,
                message: `Fetched ${identities.length} users from LDAP`,
              })
            }
          })

          res.on('error', (err: any) => {
            client.unbind()
            reject(new Error(`LDAP search error: ${err.message}`))
          })
          res.on('end', () => {
            client.unbind()
            onProgress?.({
              phase: 'extractIdentities',
              current: identities.length,
              total: identities.length,
              message: `Extracted ${identities.length} identities from LDAP`,
            })
            resolve(identities)
          })
        })
      })
    })
  }

  private extractGroupsFromLdap(ldap: any, onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const url = `${this.config.useTLS === 'true' ? 'ldaps' : 'ldap'}://${this.config.host}:${this.config.port || '389'}`
    const extractedGroups: RawGroup[] = []

    return new Promise((resolve, reject) => {
      const client = ldap.createClient({ url, timeout: 30000, connectTimeout: 10000 })

      client.on('error', (err: any) => reject(new Error(`LDAP connection error: ${err.message}`)))

      client.bind(this.config.bindDN, this.config.bindPassword, (bindErr: any) => {
        if (bindErr) {
          client.destroy()
          reject(new Error(`LDAP bind failed: ${bindErr.message}`))
          return
        }

        const opts = {
          filter: '(objectClass=group)',
          scope: 'sub' as const,
          attributes: ['objectGUID', 'cn', 'groupType', 'member', 'description'],
          paged: true,
        }

        client.search(this.config.baseDN, opts, (searchErr: any, res: any) => {
          if (searchErr) {
            client.unbind()
            reject(new Error(`LDAP search failed: ${searchErr.message}`))
            return
          }

          res.on('searchEntry', (entry: any) => {
            const attrs = entry.ppiAttributes || entry.attributes || []
            const get = (name: string) => {
              const attr = attrs.find((a: any) => a.type === name)
              return attr?.values?.[0] || attr?._vals?.[0]?.toString() || ''
            }
            const getAll = (name: string) => {
              const attr = attrs.find((a: any) => a.type === name)
              return attr?.values || attr?._vals?.map((v: any) => v.toString()) || []
            }

            const name = get('cn')
            const isPrv = isPrivilegedGroupName(name)

            extractedGroups.push({
              sourceId: get('objectGUID') || name,
              name,
              type: 'security',
              scope: 'global',
              members: getAll('member'),
              adTier: isPrv ? classifyGroupTier(name) : 'tier_2',
              isPrivileged: isPrv,
            })
          })

          res.on('error', (err: any) => {
            client.unbind()
            reject(new Error(`LDAP search error: ${err.message}`))
          })
          res.on('end', () => {
            client.unbind()
            onProgress?.({
              phase: 'extractGroups',
              current: extractedGroups.length,
              total: extractedGroups.length,
              message: `Extracted ${extractedGroups.length} groups from LDAP`,
            })
            resolve(extractedGroups)
          })
        })
      })
    })
  }

  // ==========================================================
  // CSV fallback extraction
  // ==========================================================

  private testCsvConnection(): { ok: boolean; message: string } {
    if (!this.config.csvContent) {
      return { ok: false, message: 'No CSV content provided. Set csvContent in credentials.' }
    }

    const rows = parseCsv(this.config.csvContent)
    if (rows.length === 0) {
      return { ok: false, message: 'CSV must have a header row and at least one data row.' }
    }

    const headers = Object.keys(rows[0])
    // Check for minimum required columns
    const hasIdentifier = headers.some(h =>
      ['samaccountname', 'displayname', 'upn', 'userprincipalname'].includes(h),
    )
    if (!hasIdentifier) {
      return {
        ok: false,
        message: `CSV must have at least one of: samAccountName, displayName, upn. Found columns: ${headers.join(', ')}`,
      }
    }

    return {
      ok: true,
      message: `CSV parsed: ${rows.length} rows, columns: ${headers.join(', ')}`,
    }
  }

  private extractIdentitiesFromCsv(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    if (!this.config.csvContent) {
      return Promise.resolve([])
    }

    const rows = parseCsv(this.config.csvContent)
    const identities: RawIdentity[] = []

    for (const row of rows) {
      const sam = row.samaccountname || row.sam_account_name || ''
      const displayName = row.displayname || row.display_name || row.name || sam
      const upn = row.upn || row.userprincipalname || row.user_principal_name || ''
      const email = row.email || row.mail || ''
      const department = row.department || ''

      if (!displayName && !sam) continue

      // Parse memberOf — may be semicolon-separated or pipe-separated
      const memberOfRaw = row.memberof || row.member_of || row.groups || ''
      const memberOf = memberOfRaw
        ? memberOfRaw.split(/[;|]/).map((g: string) => {
            const m = g.trim().match(/^CN=([^,]+)/)
            return m ? m[1] : g.trim()
          }).filter(Boolean)
        : []

      // Parse userAccountControl
      const uacRaw = row.useraccountcontrol || row.uac || ''
      const uac = parseInt(uacRaw) || 0

      // Parse lastLogon — could be Windows FILETIME or ISO date
      let lastLogonAt: Date | undefined
      const lastLogonRaw = row.lastlogon || row.last_logon || row.lastlogontimestamp || ''
      if (lastLogonRaw) {
        const numVal = parseInt(lastLogonRaw)
        if (numVal > 130000000000000000) {
          // Windows FILETIME
          lastLogonAt = windowsFileTimeToDate(numVal) || undefined
        } else {
          const d = new Date(lastLogonRaw)
          if (!isNaN(d.getTime())) lastLogonAt = d
        }
      }

      // Parse pwdLastSet
      let passwordLastSetAt: Date | undefined
      const pwdRaw = row.pwdlastset || row.pwd_last_set || row.passwordlastset || ''
      if (pwdRaw) {
        const numVal = parseInt(pwdRaw)
        if (numVal > 130000000000000000) {
          passwordLastSetAt = windowsFileTimeToDate(numVal) || undefined
        } else {
          const d = new Date(pwdRaw)
          if (!isNaN(d.getTime())) passwordLastSetAt = d
        }
      }

      const status = uac ? uacToStatus(uac) : (row.status || row.enabled === 'FALSE' ? 'disabled' : 'active')

      // AD security posture attributes (optional CSV columns)
      const spnRaw = row.serviceprincipalname || row.spn || ''
      const spn = spnRaw ? spnRaw.split(/[;|,]/).map((s: string) => s.trim()).filter(Boolean) : []
      const adminCount = parseInt(row.admincount || row.admin_count || '') || 0
      const delegateRaw = row.allowedtodelegateto || row.msds_allowedtodelegateto || ''
      const allowedToDelegateTo = delegateRaw ? delegateRaw.split(/[;|,]/).map((s: string) => s.trim()).filter(Boolean) : []
      const rbcd = ['true', '1', 'yes'].includes(String(row.rbcd || row.allowedtoactonbehalf || '').toLowerCase())
      const supportedEncTypes = parseInt(row.supportedenctypes || row.msds_supportedencryptiontypes || '') || undefined
      const isServiceAccount = spn.length > 0

      identities.push({
        sourceId: row.objectguid || row.objectid || sam || `csv-${identities.length}`,
        displayName,
        type: (row.type === 'non_human' || row.type === 'service' || isServiceAccount) ? 'non_human' : 'human',
        subType: row.subtype || row.sub_type || ((row.type === 'service' || isServiceAccount) ? 'service_account' : 'employee'),
        upn,
        samAccountName: sam,
        email,
        department,
        status,
        adTier: parseTier(row.adtier || row.ad_tier) ?? classifyTier(memberOf),
        lastLogonAt,
        passwordLastSetAt,
        memberOf,
        privileged: memberOf.some((g: string) => isPrivilegedGroupName(g)),
        adSecurity: { uac, spn, adminCount, allowedToDelegateTo, rbcd, supportedEncTypes },
      })
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from CSV`,
    })

    return Promise.resolve(identities)
  }

  private extractGroupsFromCsv(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    if (!this.config.csvContent) {
      return Promise.resolve([])
    }

    const rows = parseCsv(this.config.csvContent)
    const groupMap = new Map<string, Set<string>>()

    for (const row of rows) {
      const sam = row.samaccountname || row.sam_account_name || ''
      const memberOfRaw = row.memberof || row.member_of || row.groups || ''
      if (!memberOfRaw) continue

      const groups = memberOfRaw.split(/[;|]/).map((g: string) => {
        const m = g.trim().match(/^CN=([^,]+)/)
        return m ? m[1] : g.trim()
      }).filter(Boolean)

      for (const groupName of groups) {
        if (!groupMap.has(groupName)) groupMap.set(groupName, new Set())
        groupMap.get(groupName)!.add(sam || row.objectguid || row.displayname || '')
      }
    }

    const extractedGroups: RawGroup[] = []
    for (const [name, memberSet] of groupMap) {
      const isPrv = isPrivilegedGroupName(name)
      extractedGroups.push({
        sourceId: `csv-group-${name}`,
        name,
        type: 'security',
        scope: 'global',
        members: Array.from(memberSet),
        adTier: isPrv ? classifyGroupTier(name) : 'tier_2',
        isPrivileged: isPrv,
      })
    }

    onProgress?.({
      phase: 'extractGroups',
      current: extractedGroups.length,
      total: extractedGroups.length,
      message: `Derived ${extractedGroups.length} groups from CSV memberOf data`,
    })

    return Promise.resolve(extractedGroups)
  }
}
