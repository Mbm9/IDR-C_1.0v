// SPDX-License-Identifier: Apache-2.0
// Azure AD / Entra ID Connector
// Uses Microsoft Graph API with OAuth2 client credentials flow.
// Pulls: users, groups, app registrations, service principals, directory roles, sign-in logs.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'

interface AzureConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

// Azure AD directory role template IDs for well-known privileged roles
const GLOBAL_ADMIN_TEMPLATE = '62e90394-69f5-4237-9190-012177145e10'
const PRIVILEGED_ROLE_ADMIN_TEMPLATE = 'e8611ab8-c189-46e8-94e1-60213ab1f814'

export class AzureADConnector implements Connector {
  private config: AzureConfig
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as AzureConfig
    if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
      throw new Error('Azure AD connector requires tenantId, clientId, and clientSecret')
    }
  }

  // ---------- OAuth2 client credentials ----------

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    })

    const res = await fetch(tokenUrl, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Azure AD OAuth2 token request failed: ${res.status} - ${text.substring(0, 300)}`)
    }

    const data = await res.json()
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000
    return this.accessToken!
  }

  // ---------- Graph API helpers ----------

  private async graphGet<T = any>(path: string): Promise<T> {
    const token = await this.getToken()
    const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Graph API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  /**
   * Paginate through all results using @odata.nextLink.
   * Returns the accumulated .value arrays.
   */
  private async graphGetAll<T = any>(path: string, onProgress?: SyncProgressCallback, label?: string): Promise<T[]> {
    let results: T[] = []
    let nextUrl: string | null = `https://graph.microsoft.com/v1.0${path}`
    const token = await this.getToken()
    let pageNum = 0

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Graph API ${response.status}: ${nextUrl} - ${text.substring(0, 200)}`)
      }
      const body: any = await response.json()
      const page = body.value || []
      results = results.concat(page)
      nextUrl = body['@odata.nextLink'] || null
      pageNum++

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: 0, // total unknown during pagination
          message: `Fetched ${results.length} ${label} (page ${pageNum})`,
        })
      }
    }
    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.getToken()
      const org = await this.graphGet<{ value: any[] }>('/organization')
      const tenant = org.value?.[0]
      const name = tenant?.displayName || 'Unknown'
      const verifiedDomains = (tenant?.verifiedDomains || [])
        .filter((d: any) => d.isDefault)
        .map((d: any) => d.name)
        .join(', ')
      return {
        ok: true,
        message: `Connected to ${name} (tenant: ${this.config.tenantId}${verifiedDomains ? `, domain: ${verifiedDomains}` : ''})`,
      }
    } catch (e: any) {
      return { ok: false, message: `Azure AD connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // 1. Users — include signInActivity for last sign-in enrichment
    const userSelect = [
      'id', 'displayName', 'userPrincipalName', 'mail', 'department',
      'accountEnabled', 'createdDateTime', 'userType', 'jobTitle',
      'companyName', 'officeLocation', 'signInActivity',
    ].join(',')

    const users = await this.graphGetAll<any>(
      `/users?$select=${userSelect}&$top=999`,
      onProgress,
      'users',
    )

    for (const user of users) {
      const lastSignIn = user.signInActivity?.lastSignInDateTime
        ? new Date(user.signInActivity.lastSignInDateTime)
        : undefined
      const lastNonInteractive = user.signInActivity?.lastNonInteractiveSignInDateTime
        ? new Date(user.signInActivity.lastNonInteractiveSignInDateTime)
        : undefined
      // Use the most recent of interactive / non-interactive sign-in
      const latestSignIn = lastSignIn && lastNonInteractive
        ? (lastSignIn > lastNonInteractive ? lastSignIn : lastNonInteractive)
        : lastSignIn || lastNonInteractive

      identities.push({
        sourceId: user.id,
        displayName: user.displayName || user.userPrincipalName || 'Unknown',
        type: 'human',
        subType: user.userType === 'Guest' ? 'vendor' : 'employee',
        upn: user.userPrincipalName,
        email: user.mail,
        department: user.department,
        status: user.accountEnabled ? 'active' : 'disabled',
        adTier: 'unclassified',
        lastLogonAt: latestSignIn,
      })
    }

    // 2. App Registrations — non-human identities
    const apps = await this.graphGetAll<any>(
      '/applications?$select=id,displayName,appId,createdDateTime,passwordCredentials,keyCredentials&$top=999',
      onProgress,
      'app registrations',
    )

    for (const app of apps) {
      // Determine expiry from the earliest password/key credential
      let expiryAt: Date | undefined
      const allCreds = [...(app.passwordCredentials || []), ...(app.keyCredentials || [])]
      if (allCreds.length > 0) {
        const soonest = allCreds
          .map((c: any) => c.endDateTime ? new Date(c.endDateTime) : null)
          .filter((d): d is Date => d !== null)
          .sort((a, b) => a.getTime() - b.getTime())
        if (soonest.length) expiryAt = soonest[0]
      }

      identities.push({
        sourceId: app.id,
        displayName: app.displayName || `App ${app.appId}`,
        type: 'non_human',
        subType: 'app_registration',
        status: 'active',
        adTier: 'unclassified',
      })
    }

    // 3. Service Principals (including managed identities)
    const sps = await this.graphGetAll<any>(
      '/servicePrincipals?$select=id,displayName,appId,servicePrincipalType,accountEnabled,appOwnerOrganizationId&$top=999',
      onProgress,
      'service principals',
    )

    for (const sp of sps) {
      const isManagedIdentity = sp.servicePrincipalType === 'ManagedIdentity'
      identities.push({
        sourceId: sp.id,
        displayName: sp.displayName || `SP ${sp.appId}`,
        type: 'non_human',
        subType: isManagedIdentity ? 'managed_identity' : 'service_account',
        status: sp.accountEnabled ? 'active' : 'disabled',
        adTier: 'unclassified',
      })
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities (${users.length} users, ${apps.length} apps, ${sps.length} service principals)`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const azureGroups = await this.graphGetAll<any>(
      '/groups?$select=id,displayName,groupTypes,securityEnabled,membershipRule,mailEnabled&$top=999',
      onProgress,
      'groups',
    )
    const results: RawGroup[] = []

    for (let i = 0; i < azureGroups.length; i++) {
      const g = azureGroups[i]
      let members: string[] = []
      try {
        const memberData = await this.graphGetAll<any>(
          `/groups/${g.id}/members?$select=id&$top=999`,
        )
        members = memberData.map((m: any) => m.id)
      } catch {
        // Some groups may restrict member listing
      }

      const isDynamic = g.groupTypes?.includes('DynamicMembership')
      results.push({
        sourceId: g.id,
        name: g.displayName || g.id,
        type: isDynamic ? 'dynamic' : g.securityEnabled ? 'security' : 'distribution',
        members,
        adTier: 'unclassified',
        isPrivileged: false, // Will be enriched by role assignment extraction
      })

      if (onProgress && i % 50 === 0) {
        onProgress({
          phase: 'groups members',
          current: i,
          total: azureGroups.length,
          message: `Fetching members for group ${i + 1}/${azureGroups.length}`,
        })
      }
    }

    return results
  }

  /**
   * Extract Azure AD directory role assignments as entitlements.
   * Each role membership becomes an entitlement linking an identity to a permission.
   */
  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    try {
      const roles = await this.graphGetAll<any>(
        '/directoryRoles?$select=id,displayName,roleTemplateId',
        onProgress,
        'directory roles',
      )

      for (let i = 0; i < roles.length; i++) {
        const role = roles[i]
        try {
          const members = await this.graphGetAll<any>(
            `/directoryRoles/${role.id}/members?$select=id,displayName`,
          )
          for (const member of members) {
            entitlements.push({
              sourceId: `azure-role-${role.id}-${member.id}`,
              identitySourceId: member.id,
              permissionName: role.displayName,
              permissionType: 'role',
              permissionScope: 'Azure AD Directory',
              adTierOfPermission: this.classifyAzureRole(role.displayName, role.roleTemplateId),
              grantedBy: 'Azure AD',
            })
          }
        } catch {
          // Some roles may not expose members without additional permissions
        }

        if (onProgress && i % 10 === 0) {
          onProgress({
            phase: 'role assignments',
            current: i,
            total: roles.length,
            message: `Processing role ${i + 1}/${roles.length}: ${role.displayName}`,
          })
        }
      }
    } catch (e: any) {
      console.warn(`Azure AD directory role extraction failed: ${e.message}`)
    }

    // Also extract app role assignments
    try {
      const appRoleAssignments = await this.graphGetAll<any>(
        '/servicePrincipals?$select=id,displayName,appRoleAssignedTo&$expand=appRoleAssignedTo&$top=999',
      )
      for (const sp of appRoleAssignments) {
        for (const assignment of sp.appRoleAssignedTo || []) {
          entitlements.push({
            sourceId: `azure-approle-${assignment.id}`,
            identitySourceId: assignment.principalId,
            permissionName: `AppRole on ${sp.displayName}`,
            permissionType: 'role',
            permissionScope: sp.displayName,
            adTierOfPermission: 'tier_2',
            grantedAt: assignment.createdDateTime ? new Date(assignment.createdDateTime) : undefined,
            grantedBy: 'Azure AD',
          })
        }
      }
    } catch {
      // appRoleAssignedTo expansion may not be available
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from Azure AD`,
    })

    return entitlements
  }

  /**
   * Extract sign-in logs for enrichment (last login, MFA usage, risk events).
   * Requires AuditLog.Read.All permission.
   */
  async extractSignInLogs(sinceHours: number = 24): Promise<AzureSignInEvent[]> {
    const logs: AzureSignInEvent[] = []

    try {
      const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()
      const signIns = await this.graphGetAll<any>(
        `/auditLogs/signIns?$filter=createdDateTime ge ${since}&$select=userId,userPrincipalName,appDisplayName,status,createdDateTime,location,mfaDetail,riskState,riskLevelDuringSignIn&$top=999`,
      )
      for (const signIn of signIns) {
        logs.push({
          userId: signIn.userId,
          userPrincipalName: signIn.userPrincipalName,
          appDisplayName: signIn.appDisplayName,
          status: signIn.status?.errorCode === 0 ? 'success' : 'failure',
          timestamp: signIn.createdDateTime,
          location: signIn.location?.city
            ? `${signIn.location.city}, ${signIn.location.countryOrRegion}`
            : null,
          mfaUsed: !!signIn.mfaDetail?.authMethod,
          mfaMethod: signIn.mfaDetail?.authMethod,
          riskState: signIn.riskState,
          riskLevel: signIn.riskLevelDuringSignIn,
        })
      }
    } catch (e: any) {
      console.warn(`Azure sign-in log fetch failed: ${e.message}. Requires AuditLog.Read.All permission.`)
    }

    return logs
  }

  // ---------- Tier classification ----------

  private classifyAzureRole(roleName: string, roleTemplateId?: string): string {
    // Check well-known role template IDs first
    if (roleTemplateId === GLOBAL_ADMIN_TEMPLATE || roleTemplateId === PRIVILEGED_ROLE_ADMIN_TEMPLATE) {
      return 'tier_0'
    }

    const name = roleName.toLowerCase()

    // Top Tier: Tier 0 adjacent — Entra Connect / federation and identity
    // secrets. Can take over the identity plane without being part of it.
    const topTierPatterns = [
      'directory sync', 'hybrid identity', 'key vault admin',
    ]
    if (topTierPatterns.some(p => name.includes(p))) return 'tier_top'

    // Tier 0: Identity plane control
    const tier0Patterns = [
      'global admin', 'privileged role', 'security admin',
      'exchange admin', 'sharepoint admin', 'user admin',
      'authentication admin', 'conditional access',
      'identity governance', 'password admin',
      'privileged authentication',
    ]
    if (tier0Patterns.some(p => name.includes(p))) return 'tier_0'

    // Tier 1: Application / service control
    const tier1Patterns = [
      'application admin', 'cloud app', 'intune', 'compliance',
      'billing', 'dynamics 365', 'power platform', 'teams admin',
      'groups admin', 'license admin',
    ]
    if (tier1Patterns.some(p => name.includes(p))) return 'tier_1'

    return 'tier_2'
  }
}

// Exported type for sign-in log events
export interface AzureSignInEvent {
  userId: string
  userPrincipalName: string
  appDisplayName: string
  status: 'success' | 'failure'
  timestamp: string
  location: string | null
  mfaUsed: boolean
  mfaMethod?: string
  riskState?: string
  riskLevel?: string
}
