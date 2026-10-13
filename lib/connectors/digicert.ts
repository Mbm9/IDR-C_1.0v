// SPDX-License-Identifier: Apache-2.0
// DigiCert CertCentral Connector
// Connects via REST API v2 to pull: certificate orders, organizations,
// certificate details for lifecycle tracking of certificate-based identities.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { isTopTierName } from './tier-patterns'

interface DigiCertConfig {
  apiKey: string           // X-DC-DEVKEY header value
}

export class DigiCertConnector implements Connector {
  type = 'digicert' as const
  private config: DigiCertConfig
  private readonly baseUrl = 'https://www.digicert.com/services/v2'

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as DigiCertConfig
    if (!this.config.apiKey) {
      throw new Error('DigiCert connector requires apiKey')
    }
  }

  // ---------- HTTP helpers ----------

  private async dcGet(path: string): Promise<any> {
    const url = `${this.baseUrl}${path}`

    const res = await fetch(url, {
      headers: {
        'X-DC-DEVKEY': this.config.apiKey,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`DigiCert API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json()
  }

  /**
   * Paginated GET. DigiCert uses ?offset=N&limit=N pagination.
   * Response format: { orders: [...], page: { total, limit, offset } }
   */
  private async dcGetAll(
    path: string,
    dataKey: string,
    onProgress?: SyncProgressCallback,
    label?: string,
  ): Promise<any[]> {
    let results: any[] = []
    let offset = 0
    const limit = 100

    while (true) {
      const separator = path.includes('?') ? '&' : '?'
      const data = await this.dcGet(`${path}${separator}offset=${offset}&limit=${limit}`)

      const items = data[dataKey] || (Array.isArray(data) ? data : [])
      results = results.concat(items)

      const total = data.page?.total || data.total || 0

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total,
          message: `Fetched ${results.length} of ${total} ${label}`,
        })
      }

      if (items.length < limit || results.length >= total) break
      offset += limit
    }
    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const me = await this.dcGet('/user/me')
      const name = me.first_name && me.last_name
        ? `${me.first_name} ${me.last_name}`
        : me.email || 'API user'
      return {
        ok: true,
        message: `Connected to DigiCert CertCentral as ${name}.`,
      }
    } catch (e: any) {
      return { ok: false, message: `DigiCert connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    try {
      const orders = await this.dcGetAll(
        '/order/certificate',
        'orders',
        onProgress,
        'certificate orders',
      )

      for (const order of orders) {
        const cert = order.certificate || {}
        const commonName = cert.common_name || order.common_name || 'unknown'
        const serialNumber = cert.serial_number || order.id?.toString() || ''
        const orgName = cert.organization?.name || order.organization?.name || ''

        // Determine status
        const status = this.mapCertStatus(order.status || cert.status)

        // Determine expiry
        const validTill = cert.valid_till || order.valid_till
        const validFrom = cert.valid_from || order.valid_from

        // Risk analysis
        const riskFactors: string[] = []
        const keySize = cert.key_size || order.key_size
        const isWildcard = commonName.startsWith('*.')
        const isExpiringSoon = validTill && this.isExpiringSoon(validTill, 30)
        const isWeakKey = keySize && keySize < 2048

        if (isWildcard) riskFactors.push('wildcard_certificate')
        if (isExpiringSoon) riskFactors.push('expiring_soon')
        if (isWeakKey) riskFactors.push('weak_key')

        // Extract SAN entries as aliases (for display/search purposes)
        const sanEntries = cert.dns_names || cert.sans?.dns_names || []

        identities.push({
          sourceId: `dc-cert-${order.id || serialNumber}`,
          displayName: commonName,
          type: 'non_human',
          subType: 'certificate',
          department: orgName || undefined,
          status,
          adTier: this.classifyCertTier(commonName),
          privileged: isWildcard, // Wildcards grant broad access
          // Store SAN entries and risk factors as part of the identity
          // These will be available via the identity's metadata
          memberOf: sanEntries.length > 0
            ? sanEntries.map((san: string) => `dc-san-${san}`)
            : undefined,
        })
      }
    } catch (e: any) {
      console.warn(`DigiCert certificate extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} certificate identities from DigiCert`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const groups: RawGroup[] = []

    try {
      const orgs = await this.dcGet('/organization')
      const orgList = orgs.organizations || (Array.isArray(orgs) ? orgs : [])

      for (const org of orgList) {
        const orgId = org.id || org.organization_id
        const orgName = org.name || org.display_name || 'Unknown Organization'

        // Find all certificates belonging to this organization
        let members: string[] = []
        try {
          const orgCerts = await this.dcGetAll(
            `/order/certificate?filters[organization_id]=${orgId}`,
            'orders',
          )
          members = orgCerts.map((o: any) => `dc-cert-${o.id}`)
        } catch {
          // Organization cert listing may fail; proceed without members
        }

        groups.push({
          sourceId: `dc-org-${orgId}`,
          name: `DigiCert Org: ${orgName}`,
          type: 'security',
          members,
          adTier: 'tier_1', // Organizations are a logical grouping
          isPrivileged: false,
        })

        if (onProgress) {
          onProgress({
            phase: 'organizations',
            current: groups.length,
            total: orgList.length,
            message: `Fetched ${groups.length} of ${orgList.length} organizations`,
          })
        }
      }
    } catch (e: any) {
      console.warn(`DigiCert organization extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractGroups',
      current: groups.length,
      total: groups.length,
      message: `Extracted ${groups.length} groups from DigiCert`,
    })

    return groups
  }

  /**
   * Certificates grant access to resources (servers, apps).
   * Each certificate maps to an entitlement on its common_name resource.
   */
  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    try {
      const orders = await this.dcGetAll(
        '/order/certificate',
        'orders',
        onProgress,
        'certificate entitlements',
      )

      for (const order of orders) {
        const cert = order.certificate || {}
        const commonName = cert.common_name || order.common_name || 'unknown'
        const orderId = order.id || cert.serial_number
        const certType = order.product?.name || cert.cert_type || 'SSL Certificate'
        const validTill = cert.valid_till || order.valid_till
        const keySize = cert.key_size || order.key_size
        const isWildcard = commonName.startsWith('*.')

        // Build risk tags
        const riskTags: string[] = []
        if (isWildcard) riskTags.push('wildcard')
        if (keySize && keySize < 2048) riskTags.push('weak_key')
        if (validTill && this.isExpiringSoon(validTill, 30)) riskTags.push('expiring_soon')
        if (cert.signature_hash === 'sha1' || cert.signature_hash === 'md5') {
          riskTags.push('weak_signature')
        }
        // Detect self-signed (no issuer or issuer matches subject)
        const issuer = cert.ca_cert?.name || cert.issuer || ''
        if (!issuer || issuer === commonName) {
          riskTags.push('self_signed')
        }

        // Primary entitlement for the common name
        entitlements.push({
          sourceId: `dc-ent-${orderId}`,
          identitySourceId: `dc-cert-${orderId}`,
          permissionName: `Certificate: ${certType} for ${commonName}`,
          permissionType: 'direct_assignment',
          permissionScope: commonName,
          adTierOfPermission: this.classifyCertTier(commonName),
          grantedAt: cert.valid_from ? new Date(cert.valid_from) : undefined,
          grantedBy: 'DigiCert CertCentral',
          application: 'DigiCert CertCentral',
          riskTags: riskTags.length > 0 ? riskTags : undefined,
        })

        // Additional entitlements for SAN entries (each SAN = additional resource access)
        const sanEntries: string[] = cert.dns_names || cert.sans?.dns_names || []
        for (const san of sanEntries) {
          if (san === commonName) continue // Skip duplicate of CN

          entitlements.push({
            sourceId: `dc-ent-san-${orderId}-${san}`,
            identitySourceId: `dc-cert-${orderId}`,
            permissionName: `SAN Access: ${san}`,
            permissionType: 'inherited',
            permissionScope: san,
            adTierOfPermission: this.classifyCertTier(san),
            grantedAt: cert.valid_from ? new Date(cert.valid_from) : undefined,
            grantedBy: 'DigiCert CertCentral (SAN)',
            application: 'DigiCert CertCentral',
            riskTags: isWildcard ? ['wildcard_san'] : undefined,
          })
        }
      }
    } catch (e: any) {
      console.warn(`DigiCert entitlement extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from DigiCert`,
    })

    return entitlements
  }

  // ---------- Classification helpers ----------

  private mapCertStatus(status: string): string {
    const s = (status || '').toLowerCase()
    if (s === 'issued' || s === 'approved' || s === 'valid') return 'active'
    if (s === 'expired') return 'inactive'
    if (s === 'revoked' || s === 'rejected') return 'disabled'
    if (s === 'pending' || s === 'processing' || s === 'pending_issuance') return 'suspended'
    if (s === 'reissued' || s === 'renewed') return 'active'
    return 'active'
  }

  private classifyCertTier(commonName: string): string {
    const cn = commonName.toLowerCase()

    // Wildcard certs grant broad access → Tier 1
    if (cn.startsWith('*.')) {
      // Wildcard for primary corporate domain could be Tier 0
      if (cn.includes('corp') || cn.includes('internal') || cn.includes('ad.')) {
        return 'tier_0'
      }
      return 'tier_1'
    }

    // Federation, directory sync and CA certificates → Top Tier (Tier 0 adjacent):
    // a stolen ADFS token-signing or CA key forges Tier 0 credentials.
    if (
      cn.includes('adfs') || cn.includes('aad') ||
      cn.includes('pki') || cn.includes('ca.') || isTopTierName(cn)
    ) {
      return 'tier_top'
    }

    // Domain controller certificates → Tier 0
    if (
      cn.includes('dc01') || cn.includes('dc02') || cn.includes('dc0') ||
      cn.includes('domain controller') ||
      cn.includes('ldap') || cn.includes('kerberos')
    ) {
      return 'tier_0'
    }

    // Server/application certificates → Tier 1
    if (
      cn.includes('srv') || cn.includes('server') ||
      cn.includes('app') || cn.includes('api.') ||
      cn.includes('db') || cn.includes('sql') ||
      cn.includes('mail') || cn.includes('exchange')
    ) {
      return 'tier_1'
    }

    // Standard certificates → Tier 2
    return 'tier_2'
  }

  private isExpiringSoon(validTill: string, daysThreshold: number): boolean {
    try {
      const expiryDate = new Date(validTill)
      const now = new Date()
      const diffMs = expiryDate.getTime() - now.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      return diffDays > 0 && diffDays <= daysThreshold
    } catch {
      return false
    }
  }
}
