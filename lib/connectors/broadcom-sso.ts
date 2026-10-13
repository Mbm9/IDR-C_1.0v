// SPDX-License-Identifier: Apache-2.0
// Broadcom SiteMinder SSO Connector
// Formerly CA SiteMinder / Symantec SSO
// Connects via SiteMinder Administrative REST API
// Pulls: SSO policies, user directories, authentication events, session data, protected resources

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { isTopTierName } from './tier-patterns'

interface BroadcomSSOConfig {
  baseUrl: string          // e.g., https://siteminder.example.com:8443
  adminUser: string        // SiteMinder admin username
  adminPassword: string    // SiteMinder admin password
  userDirectory: string    // LDAP user directory name in SiteMinder
  policyDomain: string     // Policy domain to pull from (optional, empty = all)
}

export class BroadcomSSOConnector implements Connector {
  private config: BroadcomSSOConfig
  private sessionToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as BroadcomSSOConfig
    if (!this.config.baseUrl || !this.config.adminUser || !this.config.adminPassword) {
      throw new Error('Broadcom SSO connector requires baseUrl, adminUser, and adminPassword')
    }
  }

  // ---------- Authentication ----------

  private async authenticate(): Promise<string> {
    if (this.sessionToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.sessionToken
    }

    // Try primary endpoint (newer SiteMinder versions)
    const primaryUrl = `${this.config.baseUrl}/ca/api/sso/services/policy/v1/AdminLogin`
    try {
      const res = await fetch(primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          User: this.config.adminUser,
          Password: this.config.adminPassword,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        this.sessionToken = data.SMSESSION || data.token || data.adminToken
        this.tokenExpiresAt = Date.now() + 30 * 60 * 1000 // 30 min default
        return this.sessionToken!
      }
    } catch {
      // Primary endpoint not available, try alternative
    }

    // Try alternative endpoint (older versions / different configuration)
    const altUrl = `${this.config.baseUrl}/iam/siteminder/rest/login`
    const altRes = await fetch(altUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(
          `${this.config.adminUser}:${this.config.adminPassword}`,
        ).toString('base64')}`,
      },
    })

    if (!altRes.ok) {
      const text = await altRes.text().catch(() => '')
      throw new Error(
        `SiteMinder authentication failed on both endpoints (status ${altRes.status}). ` +
        `Verify admin credentials and base URL. ${text.substring(0, 200)}`,
      )
    }

    const altData = await altRes.json()
    this.sessionToken = altData.token || altData.SMSESSION || altData.sessionToken
    this.tokenExpiresAt = Date.now() + 30 * 60 * 1000
    return this.sessionToken!
  }

  // ---------- HTTP helpers ----------

  private async smGet(path: string): Promise<any> {
    const token = await this.authenticate()
    const url = `${this.config.baseUrl}${path}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        SMSESSION: token,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`SiteMinder API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json()
  }

  private async smGetAll(path: string, onProgress?: SyncProgressCallback, label?: string): Promise<any[]> {
    let results: any[] = []
    let page = 1
    const pageSize = 100

    while (true) {
      const separator = path.includes('?') ? '&' : '?'
      const data = await this.smGet(`${path}${separator}page=${page}&pageSize=${pageSize}`)
      const items = data.items || data.content || data.users || data.policies || (Array.isArray(data) ? data : [])
      results = results.concat(items)

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: data.totalElements || data.total || 0,
          message: `Fetched ${results.length} ${label} (page ${page})`,
        })
      }

      if (items.length < pageSize) break
      page++
    }
    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.authenticate()
      // Verify API access by fetching policy domains
      try {
        const domains = await this.smGet('/ca/api/sso/services/policy/v1/PolicyDomains')
        const items = Array.isArray(domains) ? domains : domains.items || []
        return { ok: true, message: `Connected to Broadcom SiteMinder. ${items.length} policy domain(s) found.` }
      } catch {
        return { ok: true, message: `Connected to Broadcom SiteMinder. Admin session established.` }
      }
    } catch (e: any) {
      return { ok: false, message: `Broadcom SSO connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // Strategy 1: Pull from configured user directory
    try {
      const users = await this.smGetAll(
        `/ca/api/sso/services/policy/v1/UserDirectories/${encodeURIComponent(this.config.userDirectory)}/Users`,
        onProgress,
        'SSO users',
      )

      for (const user of users) {
        identities.push({
          sourceId: user.UniversalId || user.Name || user.DN,
          displayName: user.DisplayName || user.Name || user.CN || user.UniversalId,
          type: this.isServiceAccount(user) ? 'non_human' : 'human',
          subType: this.isServiceAccount(user) ? 'service_account' : 'employee',
          upn: user.UserPrincipalName || user.Email || user.Name,
          samAccountName: user.SamAccountName || user.Name,
          email: user.Email || user.Mail,
          department: user.Department,
          status: user.Disabled ? 'disabled' : user.Locked ? 'suspended' : 'active',
          adTier: 'unclassified',
          lastLogonAt: user.LastLogin ? new Date(user.LastLogin) : undefined,
          passwordLastSetAt: user.PasswordLastSet ? new Date(user.PasswordLastSet) : undefined,
          privileged: user.IsAdmin === true || this.hasPrivilegedPolicy(user),
        })
      }
    } catch (e: any) {
      console.warn(`SiteMinder user directory listing failed: ${e.message}. Trying authentication events fallback.`)

      // Strategy 2: Derive users from authentication events
      try {
        const events = await this.smGetAll(
          '/ca/api/sso/services/audit/v1/AuthenticationEvents',
          onProgress,
          'auth events',
        )
        const uniqueUsers = new Map<string, any>()
        for (const event of events) {
          const key = event.UserName || event.userName
          if (key && !uniqueUsers.has(key)) {
            uniqueUsers.set(key, event)
          }
        }
        for (const [username, event] of uniqueUsers) {
          identities.push({
            sourceId: `sm-${username}`,
            displayName: event.UserDisplayName || event.userDisplayName || username,
            type: 'human',
            subType: 'employee',
            upn: username,
            status: 'active',
            adTier: 'unclassified',
            lastLogonAt: event.Timestamp || event.timestamp
              ? new Date(event.Timestamp || event.timestamp)
              : undefined,
          })
        }
      } catch {
        // No fallback available — return empty
      }
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from Broadcom SiteMinder`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const groups: RawGroup[] = []

    try {
      // Pull policy domains as logical groups
      const domainsData = await this.smGetAll(
        '/ca/api/sso/services/policy/v1/PolicyDomains',
        onProgress,
        'policy domains',
      )
      const domains = Array.isArray(domainsData) ? domainsData : [domainsData]

      for (const domain of domains) {
        const domainName = domain.Name || domain.name || domain.DisplayName
        if (!domainName) continue

        // Filter by configured policy domain if specified
        if (this.config.policyDomain && domainName !== this.config.policyDomain) {
          continue
        }

        groups.push({
          sourceId: `sm-domain-${domainName}`,
          name: `SSO Policy: ${domainName}`,
          type: 'security',
          members: [],
          adTier: this.classifyPolicyTier(domainName),
          isPrivileged: domainName.toLowerCase().includes('admin') ||
                        domainName.toLowerCase().includes('privileged'),
        })

        // Pull policies within the domain
        try {
          const policies = await this.smGetAll(
            `/ca/api/sso/services/policy/v1/PolicyDomains/${encodeURIComponent(domainName)}/Policies`,
          )
          for (const policy of policies) {
            const policyName = policy.Name || policy.DisplayName || policy.Id
            groups.push({
              sourceId: `sm-policy-${policyName}`,
              name: `SSO Rule: ${policyName}`,
              type: 'security',
              members: (policy.Users || []).map((u: any) => u.UniversalId || u.Name),
              adTier: this.classifyPolicyTier(policyName),
              isPrivileged: policy.IsAdminPolicy === true,
            })
          }
        } catch {
          // Policy listing may not be available for all domains
        }
      }
    } catch (e: any) {
      console.warn(`SiteMinder policy listing failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractGroups',
      current: groups.length,
      total: groups.length,
      message: `Extracted ${groups.length} policy groups from Broadcom SiteMinder`,
    })

    return groups
  }

  /**
   * Extract SSO policy bindings as entitlements.
   * Each user-policy binding represents an access entitlement to the protected resource.
   */
  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    try {
      // Get all realms (protected resources) and their associated policies
      const realms = await this.smGetAll(
        '/ca/api/sso/services/policy/v1/Realms',
        onProgress,
        'realms',
      )

      for (const realm of realms) {
        const realmName = realm.Name || realm.ResourceFilter || realm.Id
        const rules = realm.Rules || realm.AccessRules || []

        for (const rule of rules) {
          const users = rule.Users || rule.AssignedUsers || []
          for (const user of users) {
            const userId = user.UniversalId || user.Name || user.DN
            entitlements.push({
              sourceId: `sm-ent-${realmName}-${userId}`,
              identitySourceId: userId,
              permissionName: `SSO Access: ${realmName}`,
              permissionType: 'direct_assignment',
              permissionScope: realm.PolicyDomain || realmName,
              adTierOfPermission: this.classifyPolicyTier(realmName),
              grantedBy: 'SiteMinder SSO',
              application: realmName,
            })
          }
        }
      }
    } catch (e: any) {
      console.warn(`SiteMinder entitlement extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from Broadcom SiteMinder`,
    })

    return entitlements
  }

  /**
   * Extract protected resources (apps/URLs protected by SiteMinder).
   * Useful for building the resources table.
   */
  async extractProtectedResources(): Promise<SSOProtectedResource[]> {
    const resources: SSOProtectedResource[] = []

    try {
      const realms = await this.smGetAll('/ca/api/sso/services/policy/v1/Realms')
      for (const realm of realms) {
        resources.push({
          sourceId: `sm-realm-${realm.Name || realm.Id}`,
          name: realm.Name || realm.ResourceFilter,
          type: 'saas_app',
          url: realm.ResourceFilter,
          authScheme: realm.AuthenticationScheme,
          policyDomain: realm.PolicyDomain,
        })
      }
    } catch {
      // Realm listing may not be available
    }

    return resources
  }

  // ---------- Classification helpers ----------

  private isServiceAccount(user: any): boolean {
    const name = (user.Name || user.DisplayName || '').toLowerCase()
    return name.startsWith('svc_') || name.startsWith('svc-') ||
           name.includes('service') || name.includes('system') ||
           name.includes('api_') || user.UserType === 'service'
  }

  private hasPrivilegedPolicy(user: any): boolean {
    if (!user.Policies) return false
    return user.Policies.some((p: any) =>
      (p.Name || '').toLowerCase().includes('admin') ||
      (p.Name || '').toLowerCase().includes('privileged'),
    )
  }

  private classifyPolicyTier(policyName: string): string {
    const name = policyName.toLowerCase()
    // Tier 0 adjacent (ADFS, PKI, Entra Connect, PAM vault) — before the broad 'admin' match
    if (isTopTierName(name) || name.includes('top tier')) return 'tier_top'

    const tier0 = ['admin', 'tier 0', 'domain controller', 'identity', 'privileged']
    if (tier0.some(p => name.includes(p))) return 'tier_0'

    const tier1 = ['server', 'tier 1', 'application', 'database']
    if (tier1.some(p => name.includes(p))) return 'tier_1'

    return 'tier_2'
  }
}

// Exported type for protected resources
export interface SSOProtectedResource {
  sourceId: string
  name: string
  type: string
  url: string
  authScheme: string
  policyDomain: string
}
