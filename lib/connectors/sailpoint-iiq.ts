// SPDX-License-Identifier: Apache-2.0
// SailPoint IdentityIQ Connector
// Connects via SailPoint IdentityIQ REST API (SCIM 2.0 or legacy REST API)
// Pulls: identities, entitlements, roles, certifications, SoD policies

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { isTopTierName } from './tier-patterns'

interface SailPointIIQConfig {
  baseUrl: string        // e.g., https://sailpoint-iiq.example.com/identityiq
  username: string       // API user (IdentityIQ admin)
  password: string       // API password
  useSCIM: string        // 'true' to use SCIM 2.0 endpoint, 'false' for legacy REST
}

export class SailPointIIQConnector implements Connector {
  private config: SailPointIIQConfig
  private authHeader: string

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as SailPointIIQConfig
    if (!this.config.baseUrl || !this.config.username || !this.config.password) {
      throw new Error('SailPoint IIQ connector requires baseUrl, username, and password')
    }
    // IdentityIQ uses HTTP Basic Auth
    this.authHeader = `Basic ${Buffer.from(
      `${this.config.username}:${this.config.password}`,
    ).toString('base64')}`
  }

  // ---------- HTTP helpers ----------

  private async iiqGet(path: string): Promise<any> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`SailPoint IIQ API error: ${res.status} ${path} - ${text.substring(0, 200)}`)
    }
    return res.json()
  }

  /** Paginate through SCIM 2.0 results. */
  private async iiqGetAllSCIM(resource: string, onProgress?: SyncProgressCallback, label?: string): Promise<any[]> {
    let results: any[] = []
    let startIndex = 1
    const count = 100

    while (true) {
      const data = await this.iiqGet(
        `/scim/v2/${resource}?startIndex=${startIndex}&count=${count}`,
      )
      const resources = data.Resources || data.resources || []
      results = results.concat(resources)

      const totalResults = data.totalResults || 0
      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: totalResults,
          message: `Fetched ${results.length}/${totalResults} ${label}`,
        })
      }

      if (startIndex + count > totalResults || resources.length === 0) break
      startIndex += count
    }
    return results
  }

  /** Paginate through legacy REST API results. */
  private async iiqGetAllREST(resource: string, onProgress?: SyncProgressCallback, label?: string): Promise<any[]> {
    let results: any[] = []
    let start = 0
    const limit = 250

    while (true) {
      const data = await this.iiqGet(
        `/rest/${resource}?start=${start}&limit=${limit}`,
      )
      const objects = data.objects || data.items || (Array.isArray(data) ? data : [])
      results = results.concat(objects)

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: data.count || 0,
          message: `Fetched ${results.length} ${label}`,
        })
      }

      if (objects.length < limit) break
      start += limit
    }
    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      if (this.config.useSCIM === 'true') {
        const data = await this.iiqGet('/scim/v2/Users?startIndex=1&count=1')
        const total = data.totalResults || 0
        return { ok: true, message: `Connected to SailPoint IIQ (SCIM). ${total} identities found.` }
      } else {
        await this.iiqGet('/rest/identities?start=0&limit=1')
        return { ok: true, message: `Connected to SailPoint IIQ (REST API). Identities endpoint accessible.` }
      }
    } catch (e: any) {
      return { ok: false, message: `SailPoint IIQ connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    if (this.config.useSCIM === 'true') {
      const users = await this.iiqGetAllSCIM('Users', onProgress, 'SCIM users')
      for (const user of users) {
        identities.push(this.mapSCIMUser(user))
      }
    } else {
      const users = await this.iiqGetAllREST('identities', onProgress, 'REST identities')
      for (const user of users) {
        identities.push(this.mapRESTIdentity(user))
      }
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from SailPoint IIQ`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const groups: RawGroup[] = []

    if (this.config.useSCIM === 'true') {
      const scimGroups = await this.iiqGetAllSCIM('Groups', onProgress, 'SCIM groups')
      for (const g of scimGroups) {
        groups.push({
          sourceId: g.id || g.externalId,
          name: g.displayName || g.id,
          type: 'role_based',
          members: (g.members || []).map((m: any) => m.value || m.$ref),
          adTier: this.classifyIIQRole(g.displayName || ''),
          isPrivileged: this.isPrivilegedRole(g.displayName || ''),
        })
      }
    } else {
      // Legacy REST: pull roles (bundles) as groups
      const roles = await this.iiqGetAllREST('roles', onProgress, 'REST roles')
      for (const role of roles) {
        const memberIds: string[] = []
        try {
          const members = await this.iiqGetAllREST(`roles/${role.name || role.id}/identities`)
          for (const m of members) {
            memberIds.push(m.id || m.name)
          }
        } catch {
          // Some roles may not expose member listing
        }

        groups.push({
          sourceId: role.id || role.name,
          name: role.name || role.displayName || role.id,
          type: role.type === 'it' ? 'role_based' : 'security',
          members: memberIds,
          adTier: this.classifyIIQRole(role.name || ''),
          isPrivileged: this.isPrivilegedRole(role.name || ''),
        })
      }
    }

    onProgress?.({
      phase: 'extractGroups',
      current: groups.length,
      total: groups.length,
      message: `Extracted ${groups.length} groups/roles from SailPoint IIQ`,
    })

    return groups
  }

  /**
   * Extract entitlements — SailPoint's core value proposition.
   * Pulls both direct entitlements and role-based assignments.
   */
  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    try {
      if (this.config.useSCIM !== 'true') {
        // Legacy REST entitlements API
        const iiqEntitlements = await this.iiqGetAllREST('entitlements', onProgress, 'entitlements')
        for (const ent of iiqEntitlements) {
          entitlements.push({
            sourceId: ent.id,
            identitySourceId: ent.identity?.id || ent.identityId,
            permissionName: ent.displayName || ent.value || ent.name,
            permissionType: ent.type === 'role' ? 'role' : 'direct_assignment',
            permissionScope: ent.application?.name || ent.applicationName,
            adTierOfPermission: this.classifyEntitlementTier(ent),
            grantedAt: ent.created ? new Date(ent.created) : undefined,
            grantedBy: ent.assigner || 'SailPoint IIQ',
            lastUsedAt: ent.lastUsed ? new Date(ent.lastUsed) : null,
            certified: ent.certified || false,
            lastCertifiedAt: ent.certificationDate ? new Date(ent.certificationDate) : null,
            application: ent.application?.name || ent.applicationName,
            riskTags: this.deriveRiskTags(ent),
          })
        }
      }
    } catch (e: any) {
      console.warn(`SailPoint IIQ entitlement extraction failed: ${e.message}`)
    }

    // Also pull certifications for enrichment
    try {
      const certs = await this.iiqGetAllREST('certifications', onProgress, 'certifications')
      // Map certifications to existing entitlements for enrichment
      for (const cert of certs) {
        const items = cert.items || cert.certificationItems || []
        for (const item of items) {
          const existing = entitlements.find(e => e.sourceId === item.entitlementId)
          if (existing) {
            existing.certified = item.decision === 'Approved' || item.decision === 'Certified'
            existing.lastCertifiedAt = cert.signedDate ? new Date(cert.signedDate) : null
          }
        }
      }
    } catch {
      // Certifications API may not be available in all IIQ versions
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from SailPoint IIQ`,
    })

    return entitlements
  }

  // ---------- Mappers ----------

  private mapSCIMUser(user: any): RawIdentity {
    const active = user.active !== false
    const isService = user.userType === 'service' || user.userType === 'system'
    const enterprise = user['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']

    return {
      sourceId: user.id || user.externalId,
      displayName: user.displayName || `${user.name?.givenName || ''} ${user.name?.familyName || ''}`.trim() || user.userName,
      type: isService ? 'non_human' : 'human',
      subType: isService ? 'service_account' : 'employee',
      upn: user.userName,
      email: user.emails?.[0]?.value,
      department: enterprise?.department,
      status: active ? 'active' : 'disabled',
      adTier: 'unclassified',
      lastLogonAt: user.meta?.lastModified ? new Date(user.meta.lastModified) : undefined,
      managerSourceId: enterprise?.manager?.value,
      memberOf: (user.groups || []).map((g: any) => g.value),
    }
  }

  private mapRESTIdentity(identity: any): RawIdentity {
    const active = !identity.inactive && !identity.disabled
    const isService =
      identity.type === 'service' ||
      identity.attributes?.type === 'service' ||
      identity.correlated === false

    return {
      sourceId: identity.id || identity.name,
      displayName:
        identity.displayName ||
        identity.name ||
        `${identity.firstname || ''} ${identity.lastname || ''}`.trim(),
      type: isService ? 'non_human' : 'human',
      subType: isService ? 'service_account' : (identity.attributes?.employeeType || 'employee'),
      upn: identity.name,
      email: identity.email || identity.attributes?.email,
      department: identity.department || identity.attributes?.department,
      status: identity.inactive ? 'inactive' : identity.disabled ? 'disabled' : 'active',
      adTier: 'unclassified',
      lastLogonAt: identity.lastLogin ? new Date(identity.lastLogin) : undefined,
      passwordLastSetAt: identity.passwordLastSet ? new Date(identity.passwordLastSet) : undefined,
      managerSourceId: identity.manager?.id || identity.manager?.name,
      privileged: identity.attributes?.privileged === true || identity.type === 'admin',
      memberOf: (identity.assignedRoles || identity.detectedRoles || []).map((r: any) =>
        typeof r === 'string' ? r : r.name || r.id,
      ),
    }
  }

  // ---------- Classification helpers ----------

  private classifyIIQRole(roleName: string): string {
    const name = roleName.toLowerCase()
    // Tier 0 adjacent roles (Backup Operators, PKI/ADFS/Entra Connect admins, vault admins)
    if (isTopTierName(name) || name.includes('top tier')) return 'tier_top'

    const tier0 = [
      'domain admin', 'enterprise admin', 'schema admin', 'global admin',
      'privileged access', 'tier 0', 'identity admin', 'security admin',
    ]
    if (tier0.some(p => name.includes(p))) return 'tier_0'

    const tier1 = [
      'server', 'application admin', 'tier 1', 'app admin',
      'database admin', 'network admin',
    ]
    if (tier1.some(p => name.includes(p))) return 'tier_1'

    return 'tier_2'
  }

  private isPrivilegedRole(roleName: string): boolean {
    const name = roleName.toLowerCase()
    return name.includes('admin') || name.includes('privileged') ||
           name.includes('super') || name.includes('root') ||
           name.includes('full control') || name.includes('manage')
  }

  private classifyEntitlementTier(entitlement: any): string {
    const name = (entitlement.displayName || entitlement.value || entitlement.name || '').toLowerCase()
    const app = (entitlement.application?.name || entitlement.applicationName || '').toLowerCase()

    // Tier 0 adjacent entitlements (Backup Operators, Cert Publishers, vault admins...)
    if (isTopTierName(name)) return 'tier_top'

    // AD-related entitlements
    if (app.includes('active directory') || app.includes('ldap')) {
      if (name.includes('domain admin') || name.includes('enterprise admin') ||
          name.includes('schema admin')) {
        return 'tier_0'
      }
      if (name.includes('server') || name.includes('operator')) return 'tier_1'
    }

    // Cloud admin entitlements
    if (name.includes('global admin') || name.includes('owner') ||
        name.includes('root') || name.includes('super admin')) {
      return 'tier_0'
    }
    if (name.includes('admin') || name.includes('contributor') ||
        name.includes('write')) {
      return 'tier_1'
    }

    return 'tier_2'
  }

  private deriveRiskTags(entitlement: any): string[] {
    const tags: string[] = []
    const name = (entitlement.displayName || entitlement.value || '').toLowerCase()

    if (!entitlement.certified && entitlement.certificationDate) {
      tags.push('expired_certification')
    }
    if (name.includes('admin') && name.includes('write')) {
      tags.push('excessive_privilege')
    }
    if (entitlement.sodViolation) {
      tags.push('sod_violation')
    }

    return tags
  }
}
