// SPDX-License-Identifier: Apache-2.0
// SAP GRC Access Control + SAP IdM Connector
// Uses SAP OData APIs (GRAC_API_USER_MGMT_SRV, GRAC_API_ROLE_MGMT_SRV, GRAC_API_RISK_ANALYSIS_SRV).
// Pulls: SAP users, roles, user-role assignments, SoD violations.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'

interface SapGrcConfig {
  baseUrl: string
  username: string
  password: string
  clientId?: string
  clientSecret?: string
  idmEndpoint?: string // Optional SAP IdM REST endpoint
}

/** SAP user type codes. */
const SAP_USER_TYPE_MAP: Record<string, { type: 'human' | 'non_human'; subType: string }> = {
  A: { type: 'human', subType: 'employee' },     // Dialog user
  B: { type: 'non_human', subType: 'service_account' }, // System user
  C: { type: 'non_human', subType: 'service_account' }, // Communication user
  S: { type: 'non_human', subType: 'service_account' }, // Service user
  L: { type: 'human', subType: 'contractor' },    // Reference user
}

/** Critical SAP authorization objects / profiles for tier classification. */
const TIER_0_PROFILES = ['SAP_ALL', 'SAP_NEW', 'S_A.SYSTEM']
const TIER_1_AUTHS = [
  'S_USER_GRP', // User admin
  'S_TABU_DIS', // Debug/Replace
  'S_BTCH_ADM', // Batch admin
  'S_ADMI_FCD', // Admin functions
  'S_RZL_ADM',  // System admin
  'SM19',       // Security audit config
]
const TIER_2_PATTERNS = ['S_TCODE', 'S_GUI', 'S_RFC']

export class SapGrcConnector implements Connector {
  private config: SapGrcConfig
  private baseUrl: string
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as SapGrcConfig
    if (!this.config.baseUrl) {
      throw new Error('SAP GRC connector requires baseUrl')
    }
    if (!this.config.username || !this.config.password) {
      throw new Error('SAP GRC connector requires username and password')
    }
    this.baseUrl = this.config.baseUrl.replace(/\/+$/, '')
  }

  // ---------- Authentication ----------

  private get useOAuth(): boolean {
    return !!(this.config.clientId && this.config.clientSecret)
  }

  private async getOAuthToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken
    }

    const tokenUrl = `${this.baseUrl}/sap/bc/sec/oauth2/token`
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
    })

    const res = await fetch(tokenUrl, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`SAP OAuth2 token request failed: ${res.status} - ${text.substring(0, 300)}`)
    }

    const data = await res.json()
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + (data.expires_in || 1800) * 1000
    return this.accessToken!
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.useOAuth) {
      const token = await this.getOAuthToken()
      return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      }
    }
    const encoded = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')
    return {
      Authorization: `Basic ${encoded}`,
      Accept: 'application/json',
    }
  }

  // ---------- OData helpers ----------

  private async odataGet<T = any>(
    service: string,
    entitySet: string,
    params: Record<string, string> = {},
  ): Promise<{ results: T[]; next?: string }> {
    const headers = await this.getAuthHeaders()
    const query = new URLSearchParams({
      $format: 'json',
      ...params,
    })
    const url = `${this.baseUrl}/sap/opu/odata/sap/${service}/${entitySet}?${query.toString()}`

    const res = await fetch(url, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`SAP OData ${res.status}: ${service}/${entitySet} - ${text.substring(0, 300)}`)
    }

    const body = await res.json()
    const d = body.d || body
    const results = d.results || (Array.isArray(d) ? d : [])
    const next = d.__next || undefined
    return { results, next }
  }

  /**
   * Paginate through all OData results using __next link or $skip/$top.
   */
  private async odataGetAll<T = any>(
    service: string,
    entitySet: string,
    params: Record<string, string> = {},
    onProgress?: SyncProgressCallback,
    label?: string,
    pageSize: number = 100,
  ): Promise<T[]> {
    let results: T[] = []
    let skip = 0
    let pageNum = 0
    let nextUrl: string | undefined

    while (true) {
      let page: { results: T[]; next?: string }

      if (nextUrl) {
        // Follow __next link directly
        const headers = await this.getAuthHeaders()
        const res = await fetch(nextUrl, { headers })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`SAP OData ${res.status}: ${nextUrl} - ${text.substring(0, 300)}`)
        }
        const body = await res.json()
        const d = body.d || body
        page = {
          results: d.results || (Array.isArray(d) ? d : []),
          next: d.__next || undefined,
        }
      } else {
        page = await this.odataGet<T>(service, entitySet, {
          ...params,
          $skip: String(skip),
          $top: String(pageSize),
        })
      }

      results = results.concat(page.results)
      pageNum++

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: 0,
          message: `Fetched ${results.length} ${label} (page ${pageNum})`,
        })
      }

      if (page.results.length < pageSize && !page.next) {
        break
      }

      nextUrl = page.next
      skip += pageSize
    }

    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const headers = await this.getAuthHeaders()
      const url = `${this.baseUrl}/sap/opu/odata/sap/GRAC_API_USER_MGMT_SRV/$metadata`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      return {
        ok: true,
        message: `Connected to SAP GRC at ${this.baseUrl}. User Management service is accessible.`,
      }
    } catch (e: any) {
      return { ok: false, message: `SAP GRC connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // 1. Pull users from GRC User Management
    const users = await this.odataGetAll<any>(
      'GRAC_API_USER_MGMT_SRV',
      'UserSet',
      { $select: 'UserID,UserName,UserType,LockStatus,ValidFrom,ValidThrough,Email,Department' },
      onProgress,
      'SAP users',
    )

    for (const user of users) {
      const userType = SAP_USER_TYPE_MAP[user.UserType] || { type: 'human' as const, subType: 'employee' }
      const isLocked = user.LockStatus === 'LOCKED' || user.LockStatus === '64' || user.LockStatus === '128'

      let status: string = 'active'
      if (isLocked) {
        status = 'disabled'
      } else if (user.ValidThrough) {
        const expiryDate = new Date(user.ValidThrough)
        if (expiryDate < new Date()) {
          status = 'inactive'
        }
      }

      identities.push({
        sourceId: user.UserID || user.UserName,
        displayName: user.UserName || user.UserID || 'Unknown',
        type: userType.type,
        subType: userType.subType,
        samAccountName: user.UserID || undefined,
        email: user.Email || undefined,
        department: user.Department || undefined,
        status,
        adTier: 'unclassified',
      })
    }

    // 2. Optionally pull from SAP IdM if endpoint is configured
    if (this.config.idmEndpoint) {
      try {
        const headers = await this.getAuthHeaders()
        const idmUrl = `${this.config.idmEndpoint}/idmapi/v1/users?$top=500`
        const res = await fetch(idmUrl, { headers })
        if (res.ok) {
          const data = await res.json()
          const idmUsers = data.value || data.results || []

          for (const idmUser of idmUsers) {
            // Avoid duplicates
            const exists = identities.some(i => i.sourceId === idmUser.userId || i.sourceId === idmUser.loginName)
            if (exists) continue

            identities.push({
              sourceId: idmUser.userId || idmUser.loginName,
              displayName: idmUser.displayName || idmUser.loginName || 'Unknown',
              type: 'human',
              subType: 'employee',
              samAccountName: idmUser.loginName || undefined,
              email: idmUser.email || undefined,
              department: idmUser.department || undefined,
              status: idmUser.status === 'ACTIVE' ? 'active' : 'inactive',
              adTier: 'unclassified',
            })
          }
        }
      } catch {
        // SAP IdM endpoint may not be available
      }
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from SAP GRC`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const results: RawGroup[] = []

    // Pull roles from GRC Role Management
    const roles = await this.odataGetAll<any>(
      'GRAC_API_ROLE_MGMT_SRV',
      'RoleSet',
      { $select: 'RoleName,RoleDescription,RoleType,System' },
      onProgress,
      'SAP roles',
    )

    for (const role of roles) {
      // RoleType: 'C' (Composite), 'S' (Single), 'D' (Derived)
      const isComposite = role.RoleType === 'C'
      const roleName = (role.RoleName || '').toUpperCase()

      // Check if this role contains admin/privileged profiles
      const isPrivileged = isComposite && (
        roleName.includes('ADMIN') ||
        roleName.includes('BASIS') ||
        roleName.includes('SECURITY')
      )

      let groupType: string = 'role_based'
      if (isPrivileged) {
        groupType = 'privileged_access'
      } else if (role.RoleType === 'D') {
        groupType = 'dynamic'
      }

      results.push({
        sourceId: `sap-role-${role.RoleName}`,
        name: role.RoleName || 'Unknown Role',
        type: groupType,
        members: [], // Members are populated via entitlement extraction
        adTier: isPrivileged ? 'tier_1' : 'unclassified',
        isPrivileged,
      })
    }

    onProgress?.({
      phase: 'extractGroups',
      current: results.length,
      total: results.length,
      message: `Extracted ${results.length} roles from SAP GRC`,
    })

    return results
  }

  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    // 1. Pull user-role assignments
    const assignments = await this.odataGetAll<any>(
      'GRAC_API_USER_MGMT_SRV',
      'UserRoleAssignmentSet',
      { $select: 'UserID,RoleName,RoleType,ValidFrom,ValidThrough,System' },
      onProgress,
      'role assignments',
    )

    for (const assignment of assignments) {
      const roleName = assignment.RoleName || 'Unknown'
      const tier = this.classifyRoleTier(roleName)

      entitlements.push({
        sourceId: `sap-assign-${assignment.UserID}-${assignment.RoleName}`,
        identitySourceId: assignment.UserID,
        permissionName: roleName,
        permissionType: 'role',
        permissionScope: assignment.System || 'SAP',
        adTierOfPermission: tier,
        grantedAt: assignment.ValidFrom ? new Date(assignment.ValidFrom) : undefined,
        grantedBy: 'SAP GRC',
        riskTags: [],
        application: 'SAP',
      })
    }

    // 2. Pull SoD violations from Risk Analysis service
    try {
      const risks = await this.odataGetAll<any>(
        'GRAC_API_RISK_ANALYSIS_SRV',
        'RiskSet',
        { $select: 'RiskID,RiskDescription,RiskLevel,UserID,RoleName,ConflictingRoleName' },
        onProgress,
        'SoD risks',
      )

      // Tag entitlements that have SoD violations
      for (const risk of risks) {
        const matchingEntitlement = entitlements.find(
          e => e.identitySourceId === risk.UserID && e.permissionName === risk.RoleName,
        )
        if (matchingEntitlement) {
          matchingEntitlement.riskTags = matchingEntitlement.riskTags || []
          matchingEntitlement.riskTags.push('sod_violation')
          if (risk.RiskLevel === 'CRITICAL' || risk.RiskLevel === 'HIGH') {
            matchingEntitlement.riskTags.push('toxic_combination')
          }
        }

        // Also tag the conflicting role if found
        const conflicting = entitlements.find(
          e => e.identitySourceId === risk.UserID && e.permissionName === risk.ConflictingRoleName,
        )
        if (conflicting) {
          conflicting.riskTags = conflicting.riskTags || []
          conflicting.riskTags.push('sod_violation')
        }
      }
    } catch {
      // Risk Analysis service may not be available
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from SAP GRC`,
    })

    return entitlements
  }

  // ---------- Tier classification ----------

  private classifyRoleTier(roleName: string): string {
    const upper = roleName.toUpperCase()

    // Tier 0: God-mode profiles
    if (TIER_0_PROFILES.some(p => upper.includes(p))) {
      return 'tier_0'
    }

    // Tier 1: Admin authorization objects
    if (TIER_1_AUTHS.some(a => upper.includes(a))) {
      return 'tier_1'
    }

    // Additional tier 1 patterns
    if (upper.includes('ADMIN') || upper.includes('BASIS') || upper.includes('SECURITY')) {
      return 'tier_1'
    }

    // Tier 2: Standard transaction roles
    if (TIER_2_PATTERNS.some(p => upper.includes(p))) {
      return 'tier_2'
    }

    return 'tier_2'
  }
}
