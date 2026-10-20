// SPDX-License-Identifier: Apache-2.0
// ServiceNow ITSM/ITOM Connector
// Uses the ServiceNow Table API with Basic Auth or OAuth2 client credentials.
// Pulls: users (sys_user), service accounts (cmdb_ci_service_account),
//        groups (sys_user_group), group memberships (sys_user_grmember),
//        roles (sys_user_has_role), catalog item access (sc_cat_item_user_mtom).

import type {
  Connector,
  RawIdentity,
  RawGroup,
  RawEntitlement,
  SyncProgressCallback,
} from './base'

interface ServiceNowConfig {
  instanceUrl: string
  username?: string
  password?: string
  clientId?: string
  clientSecret?: string
}

/** Well-known ServiceNow roles classified by AD tier. */
const TIER_0_ROLES = ['admin', 'security_admin']
const TIER_1_ROLES = ['itil_admin', 'user_admin', 'import_admin', 'web_service_admin']
const TIER_2_ROLES = ['itil', 'catalog_admin', 'maint', 'personalize', 'personalize_choices', 'rest_api_explorer', 'snc_internal', 'mid_server']

export class ServiceNowConnector implements Connector {
  private config: ServiceNowConfig
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0
  private baseUrl: string

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as ServiceNowConfig

    if (!this.config.instanceUrl) {
      throw new Error('ServiceNow connector requires instanceUrl')
    }

    // Normalize instance URL (strip trailing slash)
    this.baseUrl = this.config.instanceUrl.replace(/\/+$/, '')

    // Validate auth: either username+password or clientId+clientSecret
    const hasBasicAuth = this.config.username && this.config.password
    const hasOAuth = this.config.clientId && this.config.clientSecret
    if (!hasBasicAuth && !hasOAuth) {
      throw new Error('ServiceNow connector requires either username+password (Basic Auth) or clientId+clientSecret (OAuth2)')
    }
  }

  // ---------- Authentication ----------

  private get useOAuth(): boolean {
    return !!(this.config.clientId && this.config.clientSecret)
  }

  private async getOAuthToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken
    }

    const tokenUrl = `${this.baseUrl}/oauth_token.do`
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
      throw new Error(`ServiceNow OAuth2 token request failed: ${res.status} - ${text.substring(0, 300)}`)
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

    // Basic auth
    const encoded = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')
    return {
      Authorization: `Basic ${encoded}`,
      Accept: 'application/json',
    }
  }

  // ---------- Table API helpers ----------

  /**
   * Fetch a single page from the ServiceNow Table API.
   */
  private async tableGet<T = Record<string, any>>(
    tableName: string,
    params: Record<string, string> = {},
  ): Promise<{ result: T[]; totalCount?: number }> {
    const headers = await this.getAuthHeaders()
    const query = new URLSearchParams(params)
    const url = `${this.baseUrl}/api/now/table/${tableName}?${query.toString()}`

    const res = await fetch(url, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`ServiceNow Table API ${res.status}: ${tableName} - ${text.substring(0, 300)}`)
    }

    const body = await res.json()
    const totalCountHeader = res.headers.get('X-Total-Count')
    return {
      result: body.result || [],
      totalCount: totalCountHeader ? parseInt(totalCountHeader, 10) : undefined,
    }
  }

  /**
   * Paginate through all records in a ServiceNow table.
   * Uses sysparm_offset + sysparm_limit for pagination.
   */
  private async tableGetAll<T = Record<string, any>>(
    tableName: string,
    params: Record<string, string> = {},
    onProgress?: SyncProgressCallback,
    label?: string,
    pageSize: number = 100,
  ): Promise<T[]> {
    let results: T[] = []
    let offset = 0
    let totalCount: number | undefined
    let pageNum = 0

    while (true) {
      const pageParams = {
        ...params,
        sysparm_limit: String(pageSize),
        sysparm_offset: String(offset),
      }

      const page = await this.tableGet<T>(tableName, pageParams)

      if (page.totalCount !== undefined && totalCount === undefined) {
        totalCount = page.totalCount
      }

      results = results.concat(page.result)
      pageNum++

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: totalCount || 0,
          message: `Fetched ${results.length}${totalCount ? `/${totalCount}` : ''} ${label} (page ${pageNum})`,
        })
      }

      // Stop when we receive fewer results than the page size (last page)
      if (page.result.length < pageSize) {
        break
      }

      offset += pageSize
    }

    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const { result } = await this.tableGet('sys_user', {
        sysparm_limit: '1',
        sysparm_fields: 'sys_id,user_name',
      })

      // Also get total user count
      const headers = await this.getAuthHeaders()
      const countUrl = `${this.baseUrl}/api/now/stats/sys_user?sysparm_count=true&sysparm_query=active=true`
      const countRes = await fetch(countUrl, { headers })

      let userCount = 'unknown'
      if (countRes.ok) {
        const countBody = await countRes.json()
        const stats = countBody?.result?.stats
        if (stats?.count !== undefined) {
          userCount = String(stats.count)
        }
      }

      return {
        ok: true,
        message: `Connected to ServiceNow instance (${this.baseUrl}). Active users: ${userCount}.`,
      }
    } catch (e: any) {
      return { ok: false, message: `ServiceNow connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // 1. Pull human identities from sys_user
    const userFields = [
      'sys_id', 'user_name', 'name', 'first_name', 'last_name',
      'email', 'department', 'manager', 'active', 'locked_out',
      'last_login_time', 'title', 'company', 'source',
      'failed_attempts', 'vip',
    ].join(',')

    const users = await this.tableGetAll<any>(
      'sys_user',
      {
        sysparm_fields: userFields,
        sysparm_query: 'ORDERBYuser_name',
        sysparm_display_value: 'true',
      },
      onProgress,
      'users',
    )

    for (const user of users) {
      const isActive = user.active === 'true' || user.active === true
      const isLockedOut = user.locked_out === 'true' || user.locked_out === true

      let status: string = 'active'
      if (!isActive) {
        status = 'inactive'
      } else if (isLockedOut) {
        status = 'disabled'
      }

      // Infer type from title: service accounts often have 'service' or 'integration' in title
      const title = (user.title || '').toLowerCase()
      const userName = (user.user_name || '').toLowerCase()
      const isNHI = title.includes('service') || title.includes('integration') ||
        title.includes('api') || title.includes('bot') ||
        userName.startsWith('svc_') || userName.startsWith('svc-') ||
        userName.startsWith('api_') || userName.startsWith('int_')

      identities.push({
        sourceId: user.sys_id,
        displayName: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.user_name || 'Unknown',
        type: isNHI ? 'non_human' : 'human',
        subType: isNHI ? 'service_account' : 'employee',
        upn: user.email || undefined,
        samAccountName: user.user_name || undefined,
        email: user.email || undefined,
        department: user.department || undefined,
        status,
        adTier: 'unclassified',
        lastLogonAt: user.last_login_time ? new Date(user.last_login_time) : undefined,
        // Manager is returned as display value (name string) with display_value=true
        // We store the manager display name; the sync engine will resolve by sourceId later
      })
    }

    // 2. Pull service accounts from cmdb_ci_service_account (if table exists)
    try {
      const svcFields = [
        'sys_id', 'name', 'account_id', 'owned_by', 'operational_status',
        'used_for', 'category',
      ].join(',')

      const serviceAccounts = await this.tableGetAll<any>(
        'cmdb_ci_service_account',
        {
          sysparm_fields: svcFields,
          sysparm_display_value: 'true',
        },
        onProgress,
        'service accounts',
      )

      for (const svc of serviceAccounts) {
        // Avoid duplicates with sys_user entries
        const alreadyExists = identities.some(i => i.sourceId === svc.sys_id)
        if (alreadyExists) continue

        const isOperational = svc.operational_status !== 'Retired' && svc.operational_status !== 'Non Operational'

        identities.push({
          sourceId: svc.sys_id,
          displayName: svc.name || svc.account_id || 'Unknown Service Account',
          type: 'non_human',
          subType: 'service_account',
          status: isOperational ? 'active' : 'inactive',
          adTier: 'unclassified',
          ownerSourceId: undefined, // Owner display value, not sys_id
        })
      }
    } catch {
      // cmdb_ci_service_account table may not exist in all instances
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from ServiceNow`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const results: RawGroup[] = []

    // 1. Pull groups from sys_user_group
    const groupFields = [
      'sys_id', 'name', 'description', 'type', 'active',
      'manager', 'parent', 'default_assignee',
    ].join(',')

    const groups = await this.tableGetAll<any>(
      'sys_user_group',
      {
        sysparm_fields: groupFields,
        sysparm_query: 'active=true^ORDERBYname',
        sysparm_display_value: 'true',
      },
      onProgress,
      'groups',
    )

    // 2. Pull all group memberships to populate member lists
    const membershipFields = ['sys_id', 'user', 'group'].join(',')
    const memberships = await this.tableGetAll<any>(
      'sys_user_grmember',
      {
        sysparm_fields: membershipFields,
        sysparm_display_value: 'false', // We want sys_ids for linking
      },
      onProgress,
      'group memberships',
    )

    // Build a map: groupSysId -> [userSysIds]
    const groupMemberMap = new Map<string, string[]>()
    for (const m of memberships) {
      const groupId = typeof m.group === 'object' ? m.group?.value : m.group
      const userId = typeof m.user === 'object' ? m.user?.value : m.user
      if (!groupId || !userId) continue

      if (!groupMemberMap.has(groupId)) {
        groupMemberMap.set(groupId, [])
      }
      groupMemberMap.get(groupId)!.push(userId)
    }

    for (const group of groups) {
      const members = groupMemberMap.get(group.sys_id) || []

      // Classify group type based on ServiceNow group type field
      const groupType = this.classifyGroupType(group.type, group.name)

      // Check if group name suggests privileged access
      const nameLower = (group.name || '').toLowerCase()
      const isPrivileged = nameLower.includes('admin') ||
        nameLower.includes('security') ||
        nameLower.includes('privileged') ||
        nameLower.includes('domain admin')

      results.push({
        sourceId: group.sys_id,
        name: group.name || group.sys_id,
        type: groupType,
        members,
        adTier: isPrivileged ? 'tier_1' : 'unclassified',
        isPrivileged,
      })
    }

    onProgress?.({
      phase: 'extractGroups',
      current: results.length,
      total: results.length,
      message: `Extracted ${results.length} groups with ${memberships.length} memberships from ServiceNow`,
    })

    return results
  }

  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    // 1. Pull role assignments from sys_user_has_role
    const roleFields = [
      'sys_id', 'user', 'role', 'state', 'granted_by', 'inherited',
    ].join(',')

    const roleAssignments = await this.tableGetAll<any>(
      'sys_user_has_role',
      {
        sysparm_fields: roleFields,
        sysparm_display_value: 'all', // Get both value and display_value
      },
      onProgress,
      'role assignments',
    )

    for (const assignment of roleAssignments) {
      const userSysId = this.extractSysId(assignment.user)
      const roleName = this.extractDisplayValue(assignment.role)
      const roleSysId = this.extractSysId(assignment.role)

      if (!userSysId || !roleName) continue

      const tier = this.classifyRoleTier(roleName)
      const isInherited = assignment.inherited === 'true' || assignment.inherited === true ||
        (typeof assignment.inherited === 'object' && assignment.inherited?.display_value === 'true')

      entitlements.push({
        sourceId: `snow-role-${assignment.sys_id || `${userSysId}-${roleSysId}`}`,
        identitySourceId: userSysId,
        permissionName: roleName,
        permissionType: isInherited ? 'inherited' : 'role',
        permissionScope: 'ServiceNow',
        adTierOfPermission: tier,
        grantedBy: this.extractDisplayValue(assignment.granted_by) || 'ServiceNow',
        application: 'ServiceNow',
      })
    }

    // 2. Pull catalog item access from sc_cat_item_user_mtom (if available)
    try {
      const catalogFields = ['sys_id', 'user', 'sc_cat_item'].join(',')

      const catalogAccess = await this.tableGetAll<any>(
        'sc_cat_item_user_mtom',
        {
          sysparm_fields: catalogFields,
          sysparm_display_value: 'all',
        },
        onProgress,
        'catalog item access',
      )

      for (const access of catalogAccess) {
        const userSysId = this.extractSysId(access.user)
        const itemName = this.extractDisplayValue(access.sc_cat_item)
        const itemSysId = this.extractSysId(access.sc_cat_item)

        if (!userSysId || !itemName) continue

        entitlements.push({
          sourceId: `snow-catalog-${access.sys_id || `${userSysId}-${itemSysId}`}`,
          identitySourceId: userSysId,
          permissionName: `Catalog: ${itemName}`,
          permissionType: 'direct_assignment',
          permissionScope: 'ServiceNow Service Catalog',
          adTierOfPermission: 'tier_2',
          grantedBy: 'ServiceNow',
          application: 'ServiceNow Service Catalog',
        })
      }
    } catch {
      // sc_cat_item_user_mtom may not be accessible
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from ServiceNow`,
    })

    return entitlements
  }

  // ---------- Helper methods ----------

  /**
   * Extract sys_id from a ServiceNow reference field.
   * With sysparm_display_value=all, references come as { value: 'sys_id', display_value: 'Name' }.
   * With sysparm_display_value=false, they come as plain strings (sys_id).
   * With sysparm_display_value=true, they come as the display value string.
   */
  private extractSysId(field: any): string | undefined {
    if (!field) return undefined
    if (typeof field === 'string') return field
    if (typeof field === 'object' && field.value) return field.value
    return undefined
  }

  /**
   * Extract display value from a ServiceNow reference field.
   */
  private extractDisplayValue(field: any): string | undefined {
    if (!field) return undefined
    if (typeof field === 'string') return field
    if (typeof field === 'object' && field.display_value) return field.display_value
    if (typeof field === 'object' && field.value) return field.value
    return undefined
  }

  /**
   * Classify a ServiceNow role into an AD tier.
   */
  private classifyRoleTier(roleName: string): string {
    const name = roleName.toLowerCase()

    if (TIER_0_ROLES.some(r => name === r || name.includes(r))) {
      return 'tier_0'
    }
    if (TIER_1_ROLES.some(r => name === r || name.includes(r))) {
      return 'tier_1'
    }
    if (TIER_2_ROLES.some(r => name === r || name.includes(r))) {
      return 'tier_2'
    }

    // Default classification based on naming patterns
    if (name.includes('admin')) return 'tier_1'
    if (name.includes('security')) return 'tier_1'

    return 'tier_2'
  }

  /**
   * Classify a ServiceNow group type to an Identity Radar group type.
   */
  private classifyGroupType(snowType: string | undefined, groupName: string): string {
    const name = (groupName || '').toLowerCase()

    if (name.includes('admin') || name.includes('privileged') || name.includes('security')) {
      return 'privileged_access'
    }
    if (name.includes('role') || name.includes('assignment')) {
      return 'role_based'
    }

    // ServiceNow doesn't have strong group type semantics; default to security
    return 'security'
  }
}
