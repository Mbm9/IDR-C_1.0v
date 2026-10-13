// SPDX-License-Identifier: Apache-2.0
// BeyondTrust PAM (Password Safe / Privileged Remote Access) Connector
// Connects via REST API v3 to pull: managed accounts, console users,
// user groups, access policies, and privileged session data.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { isTopTierName } from './tier-patterns'

interface BeyondTrustConfig {
  host: string             // e.g., https://pam.example.com
  apiKey: string           // API key for X-API-Key header
  runAsUser: string        // RunAs header value (user with read permissions)
}

export class BeyondTrustConnector implements Connector {
  type = 'beyondtrust' as const
  private config: BeyondTrustConfig
  private authToken: string | null = null

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as BeyondTrustConfig
    if (!this.config.host || !this.config.apiKey || !this.config.runAsUser) {
      throw new Error('BeyondTrust connector requires host, apiKey, and runAsUser')
    }
  }

  // ---------- Authentication ----------

  private get baseUrl(): string {
    return `${this.config.host.replace(/\/$/, '')}/BeyondTrust/api/public/v3`
  }

  /**
   * Sign in to the BeyondTrust API and obtain a session token.
   * POST /Auth/SignAppIn with API key returns a session token
   * that must be used for subsequent requests.
   */
  private async signIn(): Promise<string> {
    if (this.authToken) return this.authToken

    const res = await fetch(`${this.baseUrl}/Auth/SignAppIn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        RunAs: this.config.runAsUser,
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `BeyondTrust authentication failed (status ${res.status}). ` +
        `Verify API key and RunAs user. ${text.substring(0, 200)}`,
      )
    }

    // The sign-in response returns the token as a plain string or JSON
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await res.json()
      this.authToken = data.token || data.sessionId || data
    } else {
      this.authToken = (await res.text()).replace(/"/g, '').trim()
    }

    return this.authToken!
  }

  /**
   * Sign out from the BeyondTrust API to release the session.
   */
  private async signOut(): Promise<void> {
    if (!this.authToken) return
    try {
      await fetch(`${this.baseUrl}/Auth/SignAppOut`, {
        method: 'POST',
        headers: {
          Authorization: `PS-Auth key=${this.config.apiKey}; runas=${this.config.runAsUser}; token=${this.authToken}`,
        },
      })
    } catch {
      // Best-effort sign out
    }
    this.authToken = null
  }

  // ---------- HTTP helpers ----------

  private async btGet(path: string): Promise<any> {
    const token = await this.signIn()
    const url = `${this.baseUrl}${path}`

    const res = await fetch(url, {
      headers: {
        Authorization: `PS-Auth key=${this.config.apiKey}; runas=${this.config.runAsUser}; token=${token}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`BeyondTrust API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json()
  }

  /**
   * Paginated GET. BeyondTrust uses ?limit=N&offset=N for pagination.
   */
  private async btGetAll(
    path: string,
    onProgress?: SyncProgressCallback,
    label?: string,
  ): Promise<any[]> {
    let results: any[] = []
    let offset = 0
    const limit = 100

    while (true) {
      const separator = path.includes('?') ? '&' : '?'
      const data = await this.btGet(`${path}${separator}limit=${limit}&offset=${offset}`)

      // BeyondTrust returns arrays directly or wrapped in a container
      const items = Array.isArray(data)
        ? data
        : data.items || data.ManagedAccounts || data.Users || data.UserGroups ||
          data.Policies || data.Sessions || data.Requests || []

      results = results.concat(items)

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: data.TotalCount || data.total || 0,
          message: `Fetched ${results.length} ${label}`,
        })
      }

      if (items.length < limit) break
      offset += limit
    }
    return results
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.signIn()
      try {
        const accounts = await this.btGet('/ManagedAccounts?limit=1')
        const items = Array.isArray(accounts) ? accounts : accounts.ManagedAccounts || []
        await this.signOut()
        return {
          ok: true,
          message: `Connected to BeyondTrust PAM. Managed accounts accessible (sample: ${items.length}).`,
        }
      } catch {
        await this.signOut()
        return { ok: true, message: 'Connected to BeyondTrust PAM. Session established.' }
      }
    } catch (e: any) {
      return { ok: false, message: `BeyondTrust connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // 1. Managed accounts — privileged accounts managed by Password Safe (NHI)
    try {
      const accounts = await this.btGetAll('/ManagedAccounts', onProgress, 'managed accounts')

      for (const acct of accounts) {
        const accountName = acct.AccountName || acct.accountName || acct.Name || 'unknown'
        const systemName = acct.SystemName || acct.systemName || acct.DomainName || ''
        const displayName = systemName ? `${systemName}\\${accountName}` : accountName

        identities.push({
          sourceId: `bt-macct-${acct.ManagedAccountID || acct.AccountId || acct.id}`,
          displayName,
          type: 'non_human',
          subType: this.classifyAccountSubType(acct),
          samAccountName: accountName,
          upn: acct.UserPrincipalName || undefined,
          status: this.mapAccountStatus(acct),
          adTier: this.classifyManagedAccountTier(acct),
          privileged: true, // All BeyondTrust-managed accounts are privileged
          ownerSourceId: acct.ManagedByUserID
            ? `bt-user-${acct.ManagedByUserID}`
            : undefined,
          passwordLastSetAt: acct.LastChangeDate
            ? new Date(acct.LastChangeDate)
            : undefined,
        })
      }
    } catch (e: any) {
      console.warn(`BeyondTrust managed accounts extraction failed: ${e.message}`)
    }

    // 2. Console users — humans who use BeyondTrust to check out credentials
    try {
      const users = await this.btGetAll('/Users', onProgress, 'console users')

      for (const user of users) {
        identities.push({
          sourceId: `bt-user-${user.UserID || user.UserId || user.id}`,
          displayName:
            user.DisplayName || user.Name ||
            `${user.FirstName || ''} ${user.LastName || ''}`.trim() || user.UserName || 'unknown',
          type: 'human',
          subType: user.IsAdmin ? 'contractor' : 'employee',
          upn: user.UserName || user.EmailAddress,
          email: user.EmailAddress || user.Email || undefined,
          department: user.Department || undefined,
          status: user.IsLocked ? 'suspended' : user.IsEnabled === false ? 'disabled' : 'active',
          // Password Safe console admins control the vault: Tier 0 adjacent
          adTier: user.IsAdmin ? 'tier_top' : 'tier_1',
          lastLogonAt: user.LastLoginDate ? new Date(user.LastLoginDate) : undefined,
          privileged: user.IsAdmin === true,
          mfaEnabled: user.MFAEnabled || undefined,
        })
      }
    } catch (e: any) {
      console.warn(`BeyondTrust console users extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from BeyondTrust PAM`,
    })

    await this.signOut()
    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const groups: RawGroup[] = []

    try {
      const userGroups = await this.btGetAll('/UserGroups', onProgress, 'user groups')

      for (const grp of userGroups) {
        const name = grp.Name || grp.GroupName || grp.DisplayName || 'Unknown Group'
        const permissions = (grp.Permissions || grp.PermissionNames || []) as string[]

        // Fetch group members
        let members: string[] = []
        try {
          const groupId = grp.UserGroupID || grp.GroupId || grp.id
          const memberData = await this.btGet(`/UserGroups/${groupId}/Users`)
          const memberList = Array.isArray(memberData) ? memberData : memberData.Users || []
          members = memberList.map((m: any) => `bt-user-${m.UserID || m.UserId || m.id}`)
        } catch {
          // Member listing may require additional permissions
        }

        const isPrivileged = this.isPrivilegedGroup(name, permissions)

        groups.push({
          sourceId: `bt-group-${grp.UserGroupID || grp.GroupId || grp.id}`,
          name: `BT Group: ${name}`,
          type: isPrivileged ? 'privileged_access' : 'security',
          members,
          adTier: isPrivileged ? 'tier_top' : 'tier_1', // PAM vault admin groups are Top Tier
          isPrivileged,
        })
      }
    } catch (e: any) {
      console.warn(`BeyondTrust user groups extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractGroups',
      current: groups.length,
      total: groups.length,
      message: `Extracted ${groups.length} groups from BeyondTrust PAM`,
    })

    return groups
  }

  /**
   * Extract access policies and request history as entitlements.
   * Each policy assignment = entitlement.
   * Each access request = evidence of entitlement usage.
   */
  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    // 1. Access policies — who can request access to which managed accounts
    try {
      const policies = await this.btGetAll('/AccessPolicies', onProgress, 'access policies')

      for (const policy of policies) {
        const policyId = policy.AccessPolicyID || policy.PolicyId || policy.id
        const policyName = policy.Name || policy.PolicyName || 'Unnamed Policy'

        // Get accounts assigned to this policy
        let assignedAccounts: any[] = []
        try {
          const acctData = await this.btGet(`/AccessPolicies/${policyId}/ManagedAccounts`)
          assignedAccounts = Array.isArray(acctData) ? acctData : acctData.ManagedAccounts || []
        } catch {
          // May not have permission to list policy accounts
        }

        // Each managed account under the policy represents an entitlement
        for (const acct of assignedAccounts) {
          const accountName = acct.AccountName || acct.Name || 'unknown'
          const systemName = acct.SystemName || acct.DomainName || ''
          const tier = this.classifyManagedAccountTier(acct)

          entitlements.push({
            sourceId: `bt-ent-${policyId}-${acct.ManagedAccountID || acct.id}`,
            identitySourceId: `bt-macct-${acct.ManagedAccountID || acct.id}`,
            permissionName: `BT Policy: ${policyName} → ${systemName}\\${accountName}`,
            permissionType: 'direct_assignment',
            permissionScope: `Policy: ${policyName}`,
            adTierOfPermission: tier,
            grantedBy: 'BeyondTrust PAM',
            application: 'BeyondTrust PAM',
            riskTags: this.derivePolicyRiskTags(policy, acct),
          })
        }
      }
    } catch (e: any) {
      console.warn(`BeyondTrust policy entitlements extraction failed: ${e.message}`)
    }

    // 2. Access requests — evidence of who actually used privileged access
    try {
      const requests = await this.btGetAll('/Requests', onProgress, 'access requests')

      for (const req of requests) {
        const requestId = req.RequestID || req.RequestId || req.id
        const accountName = req.AccountName || req.ManagedAccountName || 'unknown'
        const systemName = req.SystemName || ''
        const requesterId = req.RequestorUserID || req.RequesterID

        if (!requesterId) continue

        const riskTags: string[] = []
        if (req.RequestType === 'Emergency' || req.IsEmergency) {
          riskTags.push('emergency_access')
        }
        if (req.AutoApprove || req.WasAutoApproved) {
          riskTags.push('no_approval')
        }

        entitlements.push({
          sourceId: `bt-req-${requestId}`,
          identitySourceId: `bt-user-${requesterId}`,
          permissionName: `BT Checkout: ${systemName}\\${accountName}`,
          permissionType: 'direct_assignment',
          permissionScope: systemName || accountName,
          adTierOfPermission: this.classifyAccountNameTier(accountName, systemName),
          grantedAt: req.RequestDate ? new Date(req.RequestDate) : undefined,
          grantedBy: req.ApproverUserName || 'Auto-Approved',
          lastUsedAt: req.CheckoutDate ? new Date(req.CheckoutDate) : undefined,
          application: 'BeyondTrust PAM',
          riskTags: riskTags.length > 0 ? riskTags : undefined,
        })
      }
    } catch (e: any) {
      console.warn(`BeyondTrust request entitlements extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from BeyondTrust PAM`,
    })

    return entitlements
  }

  // ---------- BONUS: Session extraction ----------

  /**
   * Extract active and recent privileged sessions.
   * Useful for compliance: who accessed what privileged account when.
   */
  async extractSessions(onProgress?: SyncProgressCallback): Promise<BeyondTrustSession[]> {
    const sessions: BeyondTrustSession[] = []

    try {
      const sessionData = await this.btGetAll('/Sessions', onProgress, 'sessions')

      for (const sess of sessionData) {
        const sessionId = sess.SessionID || sess.SessionId || sess.id

        // Optionally fetch session events for detailed audit trail
        let events: any[] = []
        try {
          const eventData = await this.btGet(`/Sessions/${sessionId}/Events`)
          events = Array.isArray(eventData) ? eventData : eventData.Events || []
        } catch {
          // Event details may not be available
        }

        sessions.push({
          id: String(sessionId),
          userId: String(sess.UserID || sess.UserId || ''),
          userName: sess.UserName || '',
          accountId: String(sess.ManagedAccountID || sess.AccountId || ''),
          accountName: sess.AccountName || '',
          systemName: sess.SystemName || '',
          startTime: sess.StartDate ? new Date(sess.StartDate) : null,
          endTime: sess.EndDate ? new Date(sess.EndDate) : null,
          duration: sess.Duration || null,
          protocol: sess.Protocol || sess.SessionType || 'unknown',
          status: sess.Status || (sess.EndDate ? 'completed' : 'active'),
          eventCount: events.length,
        })
      }
    } catch (e: any) {
      console.warn(`BeyondTrust session extraction failed: ${e.message}`)
    }

    return sessions
  }

  // ---------- Classification helpers ----------

  private classifyAccountSubType(acct: any): string {
    const accountType = (acct.AccountType || acct.Type || '').toLowerCase()
    const accountName = (acct.AccountName || acct.Name || '').toLowerCase()

    if (accountType.includes('service') || accountName.startsWith('svc-') || accountName.startsWith('svc_')) {
      return 'service_account'
    }
    if (accountType.includes('app') || accountName.startsWith('app-') || accountName.startsWith('app_')) {
      return 'app_registration'
    }
    if (accountType.includes('machine') || accountType.includes('computer')) {
      return 'machine'
    }
    // Default for PAM managed accounts
    return 'service_account'
  }

  private mapAccountStatus(acct: any): string {
    if (acct.IsDisabled || acct.Enabled === false) return 'disabled'
    if (acct.IsAutoManaged === false) return 'orphaned' // Unmanaged = potential orphan
    return 'active'
  }

  private classifyManagedAccountTier(acct: any): string {
    const accountName = (acct.AccountName || acct.Name || '').toLowerCase()
    const systemName = (acct.SystemName || acct.DomainName || '').toLowerCase()
    return this.classifyAccountNameTier(accountName, systemName)
  }

  private classifyAccountNameTier(accountName: string, systemName: string): string {
    const name = accountName.toLowerCase()
    const system = systemName.toLowerCase()

    // Domain Admin / Enterprise Admin / Schema Admin accounts → Tier 0
    if (
      name.includes('domain admin') || name.includes('enterprise admin') ||
      name.includes('schema admin') || name.includes('krbtgt') ||
      name.includes('dsrm')
    ) {
      return 'tier_0'
    }

    // Tier 0 adjacent systems (PKI, ADFS, Entra Connect, DC backup) → Top Tier.
    // Checked before the 'dc' match so e.g. "ADConnect01" is not read as a DC.
    if (
      system.includes('pki') || system.includes('adfs') ||
      system.includes('aad connect') || system.includes('aadconnect') ||
      system.includes('adconnect') || system.includes('entra connect') ||
      isTopTierName(system) || isTopTierName(name)
    ) {
      return 'tier_top'
    }

    if (name === 'administrator' || system.includes('dc') || system.includes('domain controller')) {
      return 'tier_0'
    }

    // Server admin accounts → Tier 1
    if (
      system.includes('srv') || system.includes('server') ||
      system.includes('app') || system.includes('db') ||
      system.includes('sql') || system.includes('oracle') ||
      name.includes('root') || name.includes('sa') ||
      name.includes('admin') // generic admin on non-DC
    ) {
      return 'tier_1'
    }

    // Workstation accounts → Tier 2
    if (system.includes('ws') || system.includes('workstation') || system.includes('desktop')) {
      return 'tier_2'
    }

    // Default for PAM-managed accounts is Tier 1
    return 'tier_1'
  }

  private isPrivilegedGroup(name: string, permissions: string[]): boolean {
    const n = name.toLowerCase()
    const hasPrivilegedName = n.includes('admin') || n.includes('vault') ||
      n.includes('privileged') || n.includes('pam') || n.includes('break glass')
    const hasPrivilegedPermission = permissions.some(p => {
      const pl = p.toLowerCase()
      return pl.includes('admin') || pl.includes('manage') || pl.includes('full')
    })
    return hasPrivilegedName || hasPrivilegedPermission
  }

  private derivePolicyRiskTags(policy: any, acct: any): string[] {
    const tags: string[] = []
    const policyName = (policy.Name || policy.PolicyName || '').toLowerCase()
    const accountName = (acct.AccountName || acct.Name || '').toLowerCase()

    if (policyName.includes('emergency') || policyName.includes('break glass') || policyName.includes('firecall')) {
      tags.push('emergency_access')
    }
    if (policy.AutoApproveEnabled || policy.AutoApprove) {
      tags.push('no_approval')
    }
    if (accountName.includes('domain admin') || accountName.includes('enterprise admin')) {
      tags.push('excessive_privilege')
    }
    if (!policy.RequireReason && !policy.ReasonRequired) {
      tags.push('no_justification_required')
    }

    return tags
  }
}

// Exported types for BeyondTrust-specific data
export interface BeyondTrustSession {
  id: string
  userId: string
  userName: string
  accountId: string
  accountName: string
  systemName: string
  startTime: Date | null
  endTime: Date | null
  duration: number | null
  protocol: string
  status: string
  eventCount: number
}
