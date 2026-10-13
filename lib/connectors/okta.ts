// SPDX-License-Identifier: Apache-2.0
// Okta Connector
// Connects via Okta REST API using API token (SSWS) authentication.
// Pulls: users, groups, app assignments, MFA factors.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { oktaStatusMap } from './transformer'
import { isTopTierName } from './tier-patterns'

interface OktaConfig {
  domain: string     // e.g., dev-123456.okta.com
  apiToken: string   // Okta API token (SSWS)
}

export class OktaConnector implements Connector {
  private config: OktaConfig

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as OktaConfig
    if (!this.config.domain || !this.config.apiToken) {
      throw new Error('Okta connector requires domain and apiToken')
    }
  }

  // ---------- Okta API helpers ----------

  /**
   * Paginate through Okta API results.
   * Okta uses Link header for pagination (rel="next").
   */
  private async oktaGet(path: string, onProgress?: SyncProgressCallback, label?: string): Promise<any[]> {
    let results: any[] = []
    let nextUrl: string | null = `https://${this.config.domain}/api/v1${path}`
    let pageNum = 0

    while (nextUrl) {
      const response: Response = await fetch(nextUrl, {
        headers: {
          Authorization: `SSWS ${this.config.apiToken}`,
          Accept: 'application/json',
        },
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Okta API ${response.status}: ${path} - ${text.substring(0, 200)}`)
      }
      const data: any = await response.json()
      results = results.concat(data)
      pageNum++

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: 0,
          message: `Fetched ${results.length} ${label} (page ${pageNum})`,
        })
      }

      // Okta pagination via Link header
      const linkHeader: string = response.headers.get('link') || ''
      const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
      nextUrl = nextMatch ? nextMatch[1] : null
    }
    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`https://${this.config.domain}/api/v1/org`, {
        headers: { Authorization: `SSWS ${this.config.apiToken}` },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`)
      }
      const org = await res.json()
      return { ok: true, message: `Connected to ${org.companyName || this.config.domain}` }
    } catch (e: any) {
      return { ok: false, message: `Okta connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const users = await this.oktaGet('/users?limit=200', onProgress, 'Okta users')

    const identities: RawIdentity[] = users.map(u => ({
      sourceId: u.id,
      displayName:
        `${u.profile?.firstName || ''} ${u.profile?.lastName || ''}`.trim() ||
        u.profile?.login,
      type: 'human' as const,
      subType: 'employee',
      upn: u.profile?.login,
      email: u.profile?.email,
      department: u.profile?.department,
      status: oktaStatusMap(u.status),
      adTier: 'unclassified',
      lastLogonAt: u.lastLogin ? new Date(u.lastLogin) : undefined,
      passwordLastSetAt: u.passwordChanged ? new Date(u.passwordChanged) : undefined,
      mfaEnabled: undefined, // Will be enriched below if possible
    }))

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from Okta`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const oktaGroups = await this.oktaGet('/groups?limit=200', onProgress, 'Okta groups')
    const results: RawGroup[] = []

    for (let i = 0; i < oktaGroups.length; i++) {
      const g = oktaGroups[i]
      let memberIds: string[] = []
      try {
        const members = await this.oktaGet(`/groups/${g.id}/users?limit=200`)
        memberIds = members.map((m: any) => m.id)
      } catch {
        // Some groups may restrict member listing
      }

      const groupName = g.profile?.name || g.id
      results.push({
        sourceId: g.id,
        name: groupName,
        type: g.type === 'OKTA_GROUP' ? 'security' : 'role_based',
        members: memberIds,
        adTier: 'unclassified',
        isPrivileged: groupName.toLowerCase().includes('admin') || false,
      })

      if (onProgress && i % 20 === 0) {
        onProgress({
          phase: 'group members',
          current: i,
          total: oktaGroups.length,
          message: `Fetching members for group ${i + 1}/${oktaGroups.length}`,
        })
      }
    }

    onProgress?.({
      phase: 'extractGroups',
      current: results.length,
      total: results.length,
      message: `Extracted ${results.length} groups from Okta`,
    })

    return results
  }

  /**
   * Extract Okta app assignments as entitlements.
   * Each user-app assignment represents an access entitlement.
   */
  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    try {
      // Get all applications
      const apps = await this.oktaGet('/apps?limit=200', onProgress, 'Okta apps')

      for (let i = 0; i < apps.length; i++) {
        const app = apps[i]
        try {
          // Get users assigned to this app
          const appUsers = await this.oktaGet(`/apps/${app.id}/users?limit=200`)
          for (const appUser of appUsers) {
            entitlements.push({
              sourceId: `okta-app-${app.id}-${appUser.id}`,
              identitySourceId: appUser.id,
              permissionName: `App Access: ${app.label || app.name}`,
              permissionType: 'direct_assignment',
              permissionScope: app.label || app.name,
              adTierOfPermission: this.classifyOktaApp(app),
              grantedAt: appUser.created ? new Date(appUser.created) : undefined,
              grantedBy: 'Okta',
              application: app.label || app.name,
            })
          }
        } catch {
          // App user listing may not be available for all apps
        }

        if (onProgress && i % 10 === 0) {
          onProgress({
            phase: 'app assignments',
            current: i,
            total: apps.length,
            message: `Processing app ${i + 1}/${apps.length}: ${app.label || app.name}`,
          })
        }
      }
    } catch (e: any) {
      console.warn(`Okta app assignment extraction failed: ${e.message}`)
    }

    // Also extract admin role assignments
    try {
      const adminUsers = await this.oktaGet('/users?filter=status eq "ACTIVE"&limit=200')
      for (const user of adminUsers) {
        try {
          const roles = await this.oktaGet(`/users/${user.id}/roles`)
          for (const role of roles) {
            entitlements.push({
              sourceId: `okta-role-${user.id}-${role.id}`,
              identitySourceId: user.id,
              permissionName: role.label || role.type,
              permissionType: 'role',
              permissionScope: 'Okta Organization',
              adTierOfPermission: this.classifyOktaRole(role.type),
              grantedAt: role.created ? new Date(role.created) : undefined,
              grantedBy: 'Okta',
              application: 'Okta',
            })
          }
        } catch {
          // Role listing may not be available for all users
        }
      }
    } catch {
      // Admin role enumeration may not be available
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from Okta`,
    })

    return entitlements
  }

  // ---------- Classification helpers ----------

  private classifyOktaApp(app: any): string {
    const label = (app.label || app.name || '').toLowerCase()
    // Tier 0 adjacent apps (ADFS, Entra Connect, PKI, PAM / secrets vaults) are Top Tier
    if (isTopTierName(label) || /(^|[^a-z0-9])(cyberark|beyondtrust|privileged access|hashicorp vault)/.test(label)) {
      return 'tier_top'
    }
    // Apps that manage identity plane are Tier 0
    if (label.includes('active directory') || label.includes('azure ad') ||
        label.includes('ldap') || label.includes('admin console')) {
      return 'tier_0'
    }
    // Infrastructure apps are Tier 1
    if (label.includes('aws') || label.includes('gcp') || label.includes('azure') ||
        label.includes('server') || label.includes('database')) {
      return 'tier_1'
    }
    return 'tier_2'
  }

  private classifyOktaRole(roleType: string): string {
    const type = roleType.toLowerCase()
    // Super admin, org admin = Tier 0
    if (type.includes('super_admin') || type.includes('org_admin') ||
        type.includes('user_admin') || type.includes('app_admin')) {
      return 'tier_0'
    }
    if (type.includes('group_admin') || type.includes('report_admin') ||
        type.includes('help_desk_admin')) {
      return 'tier_1'
    }
    return 'tier_2'
  }
}
