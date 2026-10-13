// SPDX-License-Identifier: Apache-2.0
// Broadcom PAM (Privileged Access Manager) Connector
// Formerly CA PAM / Symantec PAM
// Connects via REST API to pull: privileged accounts, credential vaults,
// access policies, session recordings metadata, checkout/checkin events

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { isTopTierName } from './tier-patterns'

interface BroadcomPAMConfig {
  baseUrl: string          // e.g., https://pam.example.com:18443
  apiUser: string          // PAM API admin user
  apiPassword: string      // PAM API admin password
  apiKey: string           // Optional: API key if configured
  vaultName: string        // Vault name to pull from (optional, empty = all)
}

export class BroadcomPAMConnector implements Connector {
  private config: BroadcomPAMConfig
  private sessionToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as BroadcomPAMConfig
    if (!this.config.baseUrl || !this.config.apiUser || !this.config.apiPassword) {
      throw new Error('Broadcom PAM connector requires baseUrl, apiUser, and apiPassword')
    }
  }

  // ---------- Authentication ----------

  private async authenticate(): Promise<string> {
    if (this.sessionToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.sessionToken
    }

    // Try primary login endpoint
    const primaryUrl = `${this.config.baseUrl}/api/v1/auth/login`
    try {
      const res = await fetch(primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.config.apiUser,
          password: this.config.apiPassword,
          ...(this.config.apiKey ? { apiKey: this.config.apiKey } : {}),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        this.sessionToken = data.token || data.sessionId || data.access_token
        this.tokenExpiresAt = Date.now() + (data.expiresIn || 1800) * 1000
        return this.sessionToken!
      }
    } catch {
      // Primary endpoint not available
    }

    // Try alternative: session-based endpoint with Basic Auth
    const altUrl = `${this.config.baseUrl}/api/v1/session`
    const altRes = await fetch(altUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(
          `${this.config.apiUser}:${this.config.apiPassword}`,
        ).toString('base64')}`,
      },
    })

    if (!altRes.ok) {
      const text = await altRes.text().catch(() => '')
      throw new Error(
        `PAM authentication failed on both endpoints (status ${altRes.status}). ` +
        `Verify credentials and base URL. ${text.substring(0, 200)}`,
      )
    }

    const altData = await altRes.json()
    this.sessionToken = altData.token || altData.sessionId || altData.access_token
    this.tokenExpiresAt = Date.now() + 30 * 60 * 1000
    return this.sessionToken!
  }

  // ---------- HTTP helpers ----------

  private async pamGet(path: string): Promise<any> {
    const token = await this.authenticate()
    const url = `${this.config.baseUrl}${path}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {}),
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`PAM API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json()
  }

  private async pamGetAll(path: string, onProgress?: SyncProgressCallback, label?: string): Promise<any[]> {
    let results: any[] = []
    let offset = 0
    const limit = 100

    while (true) {
      const separator = path.includes('?') ? '&' : '?'
      const data = await this.pamGet(`${path}${separator}offset=${offset}&limit=${limit}`)
      const items = data.items || data.results || data.accounts || data.credentials ||
                    data.users || data.policies || (Array.isArray(data) ? data : [])
      results = results.concat(items)

      if (onProgress && label) {
        onProgress({
          phase: label,
          current: results.length,
          total: data.total || data.totalCount || 0,
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
      await this.authenticate()
      try {
        const vaults = await this.pamGet('/api/v1/vaults')
        const items = vaults.items || vaults.vaults || (Array.isArray(vaults) ? vaults : [])
        return { ok: true, message: `Connected to Broadcom PAM. ${items.length} vault(s) accessible.` }
      } catch {
        return { ok: true, message: `Connected to Broadcom PAM. Admin session established.` }
      }
    } catch (e: any) {
      return { ok: false, message: `Broadcom PAM connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // 1. Privileged credential accounts (the accounts PAM manages)
    try {
      const credPath = this.config.vaultName
        ? `/api/v1/vaults/${encodeURIComponent(this.config.vaultName)}/credentials`
        : '/api/v1/credentials'
      const accounts = await this.pamGetAll(credPath, onProgress, 'PAM credentials')

      for (const acct of accounts) {
        const name = acct.name || acct.accountName ||
          `${acct.target?.hostname || acct.targetHost || 'unknown'}\\${acct.username || 'unknown'}`

        identities.push({
          sourceId: `pam-cred-${acct.id || acct.credentialId}`,
          displayName: name,
          type: 'non_human',
          subType: 'service_account',
          upn: acct.username,
          samAccountName: acct.username,
          status: acct.enabled === false ? 'disabled' : 'active',
          adTier: this.classifyCredentialTier(acct),
          privileged: true, // All PAM-managed accounts are privileged by definition
          ownerSourceId: acct.owner?.id || acct.ownerId
            ? `pam-user-${acct.owner?.id || acct.ownerId}`
            : undefined,
        })
      }
    } catch (e: any) {
      console.warn(`PAM credentials extraction failed: ${e.message}`)
    }

    // 2. PAM users (humans who check out credentials)
    try {
      const users = await this.pamGetAll('/api/v1/users', onProgress, 'PAM users')

      for (const user of users) {
        identities.push({
          sourceId: `pam-user-${user.id || user.userId}`,
          displayName:
            user.displayName || user.name ||
            `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
          type: 'human',
          subType: user.role === 'admin' || user.isAdmin ? 'contractor' : 'employee',
          upn: user.username || user.email,
          email: user.email,
          department: user.department,
          status: user.enabled === false ? 'disabled' : user.locked ? 'suspended' : 'active',
          // PAM admins control the credential vault: Tier 0 adjacent
          adTier: user.isAdmin || user.role === 'admin' ? 'tier_top' : 'tier_1',
          lastLogonAt: user.lastLoginTime ? new Date(user.lastLoginTime) : undefined,
          privileged: user.isAdmin === true || user.role === 'admin',
        })
      }
    } catch (e: any) {
      console.warn(`PAM users extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from Broadcom PAM`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const groups: RawGroup[] = []

    // 1. Vaults as groups (contain credential accounts)
    try {
      const vaultsData = await this.pamGet('/api/v1/vaults')
      const vaults = vaultsData.items || vaultsData.vaults || (Array.isArray(vaultsData) ? vaultsData : [])

      for (const vault of vaults) {
        // Filter by configured vault name if specified
        if (this.config.vaultName && (vault.name || vault.displayName) !== this.config.vaultName) {
          continue
        }

        let members: string[] = []
        try {
          const vaultMembers = await this.pamGetAll(`/api/v1/vaults/${vault.id}/members`)
          members = vaultMembers.map((m: any) => `pam-user-${m.userId || m.id}`)
        } catch {
          // Member listing may require additional permissions
        }

        groups.push({
          sourceId: `pam-vault-${vault.id || vault.name}`,
          name: `PAM Vault: ${vault.name || vault.displayName}`,
          type: 'privileged_access',
          members,
          adTier: 'tier_top', // PAM vaults are Top Tier (Tier 0 adjacent) by default
          isPrivileged: true,
        })
      }
    } catch (e: any) {
      console.warn(`PAM vaults extraction failed: ${e.message}`)
    }

    // 2. Access policies as groups
    try {
      const policies = await this.pamGetAll('/api/v1/policies', onProgress, 'PAM policies')

      for (const policy of policies) {
        const members = (policy.users || policy.assignedUsers || []).map(
          (u: any) => `pam-user-${u.id || u.userId}`,
        )

        groups.push({
          sourceId: `pam-policy-${policy.id || policy.name}`,
          name: `PAM Policy: ${policy.name || policy.displayName}`,
          type: 'privileged_access',
          members,
          adTier: this.classifyPolicyTier(policy),
          isPrivileged: true,
        })
      }
    } catch (e: any) {
      console.warn(`PAM policies extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractGroups',
      current: groups.length,
      total: groups.length,
      message: `Extracted ${groups.length} groups from Broadcom PAM`,
    })

    return groups
  }

  /**
   * Extract PAM access policies as entitlements.
   * Each user-credential binding represents a privileged access entitlement.
   */
  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    try {
      const policies = await this.pamGetAll('/api/v1/policies', onProgress, 'PAM policy entitlements')

      for (const policy of policies) {
        const users = policy.users || policy.assignedUsers || []
        const credentials = policy.credentials || policy.accounts || []

        for (const user of users) {
          const userId = `pam-user-${user.id || user.userId}`

          // Each user-credential pair in a policy is an entitlement
          if (credentials.length > 0) {
            for (const cred of credentials) {
              entitlements.push({
                sourceId: `pam-ent-${policy.id}-${user.id || user.userId}-${cred.id || cred.credentialId}`,
                identitySourceId: userId,
                permissionName: `PAM Checkout: ${cred.name || cred.accountName || 'credential'}`,
                permissionType: 'direct_assignment',
                permissionScope: `Vault: ${cred.vaultName || policy.name}`,
                adTierOfPermission: this.classifyPolicyTier(policy),
                grantedBy: 'Broadcom PAM',
                application: 'Broadcom PAM',
                riskTags: this.derivePAMRiskTags(policy, cred),
              })
            }
          } else {
            // Policy-level entitlement (no specific credentials listed)
            entitlements.push({
              sourceId: `pam-ent-${policy.id}-${user.id || user.userId}`,
              identitySourceId: userId,
              permissionName: `PAM Policy: ${policy.name || policy.displayName}`,
              permissionType: 'direct_assignment',
              permissionScope: policy.name || policy.displayName,
              adTierOfPermission: this.classifyPolicyTier(policy),
              grantedBy: 'Broadcom PAM',
              application: 'Broadcom PAM',
            })
          }
        }
      }
    } catch (e: any) {
      console.warn(`PAM entitlement extraction failed: ${e.message}`)
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from Broadcom PAM`,
    })

    return entitlements
  }

  /**
   * Extract checkout/checkin events for audit trail enrichment.
   * Returns structured event data for the action_log.
   */
  async extractCheckoutEvents(onProgress?: SyncProgressCallback): Promise<PAMCheckoutEvent[]> {
    const events: PAMCheckoutEvent[] = []

    try {
      const checkouts = await this.pamGetAll('/api/v1/audit/checkouts', onProgress, 'checkout events')
      for (const event of checkouts) {
        events.push({
          type: event.type || (event.checkinTime ? 'checkin' : 'checkout'),
          userId: event.userId || event.requestedBy?.id,
          credentialId: event.credentialId || event.credential?.id,
          credentialName: event.credentialName || event.credential?.name,
          targetHost: event.targetHost || event.target?.hostname,
          checkoutTime: event.checkoutTime ? new Date(event.checkoutTime) : null,
          checkinTime: event.checkinTime ? new Date(event.checkinTime) : null,
          duration: event.duration,
          reason: event.reason || event.justification,
          approved: event.approved !== false,
          approvedBy: event.approvedBy?.id,
        })
      }
    } catch {
      // Audit API may not be available
    }

    return events
  }

  /**
   * Extract session recordings metadata.
   * Useful for compliance evidence and audit trails.
   */
  async extractSessionRecordings(): Promise<PAMSessionRecording[]> {
    const recordings: PAMSessionRecording[] = []

    try {
      const sessions = await this.pamGetAll('/api/v1/recordings')
      for (const session of sessions) {
        recordings.push({
          id: session.id || session.recordingId,
          credentialId: session.credentialId,
          userId: session.userId,
          targetHost: session.targetHost || session.target?.hostname,
          startTime: session.startTime ? new Date(session.startTime) : null,
          endTime: session.endTime ? new Date(session.endTime) : null,
          duration: session.duration,
          protocol: session.protocol || session.connectionType,
          hasKeystrokes: session.hasKeystrokes || false,
        })
      }
    } catch {
      // Recordings API may not be available
    }

    return recordings
  }

  // ---------- Classification helpers ----------

  private classifyCredentialTier(credential: any): string {
    const name = (credential.name || credential.accountName || '').toLowerCase()
    const target = (credential.target?.hostname || credential.targetHost || '').toLowerCase()

    // Domain admin credentials = Tier 0
    if (name.includes('domain admin') || name.includes('enterprise admin') ||
        name.includes('schema admin') || name.includes('krbtgt')) {
      return 'tier_0'
    }
    // Tier 0 adjacent targets (ADFS, Entra Connect, PKI/CA, DC backup) = Top Tier.
    // Checked before the 'dc' match so e.g. "adconnect01" is not read as a DC.
    if (isTopTierName(target) || isTopTierName(name) ||
        target.includes('pki') || target.includes('adfs') || target.includes('adconnect')) {
      return 'tier_top'
    }
    // Domain controller credentials = Tier 0
    if (target.includes('dc') || target.includes('domain controller')) {
      return 'tier_0'
    }
    // Server/application credentials = Tier 1
    if (target.includes('srv') || target.includes('server') ||
        target.includes('app') || target.includes('db') ||
        name.includes('sql') || name.includes('oracle') ||
        name.includes('root')) {
      return 'tier_1'
    }
    // Default for PAM-managed accounts is Tier 1
    return 'tier_1'
  }

  private classifyPolicyTier(policy: any): string {
    const name = (typeof policy === 'string' ? policy : policy.name || '').toLowerCase()
    if (name.includes('tier 0') || name.includes('domain') ||
        name.includes('emergency') || name.includes('break glass') ||
        name.includes('firecall')) {
      return 'tier_0'
    }
    return 'tier_1' // PAM policies default to Tier 1
  }

  private derivePAMRiskTags(policy: any, credential: any): string[] {
    const tags: string[] = []
    const policyName = (policy.name || '').toLowerCase()
    const credName = (credential.name || credential.accountName || '').toLowerCase()

    if (policyName.includes('emergency') || policyName.includes('break glass')) {
      tags.push('emergency_access')
    }
    if (credName.includes('domain admin') || credName.includes('enterprise admin')) {
      tags.push('excessive_privilege')
    }
    if (!policy.approvalRequired) {
      tags.push('no_approval_required')
    }

    return tags
  }
}

// Exported types for PAM-specific data
export interface PAMCheckoutEvent {
  type: string
  userId: string
  credentialId: string
  credentialName: string
  targetHost: string
  checkoutTime: Date | null
  checkinTime: Date | null
  duration?: number
  reason?: string
  approved: boolean
  approvedBy?: string
}

export interface PAMSessionRecording {
  id: string
  credentialId: string
  userId: string
  targetHost: string
  startTime: Date | null
  endTime: Date | null
  duration?: number
  protocol: string
  hasKeystrokes: boolean
}
