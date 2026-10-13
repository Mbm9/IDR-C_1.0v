// SPDX-License-Identifier: Apache-2.0
// HashiCorp Vault Connector
// Uses the Vault HTTP API with token-based or AppRole authentication.
// Pulls: entities (identities), groups, policies (entitlements), auth methods, secret engines.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'
import { stricterTier } from '@/lib/utils/tiers'

interface VaultConfig {
  vaultAddr: string
  vaultToken?: string
  roleId?: string
  secretId?: string
}

/** Vault secret engine metadata for resource mapping. */
export interface VaultSecretEngine {
  path: string
  type: string
  description: string
  accessor: string
}

export class HashiCorpVaultConnector implements Connector {
  private config: VaultConfig
  private baseUrl: string
  private token: string | null = null

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as VaultConfig
    if (!this.config.vaultAddr) {
      throw new Error('HashiCorp Vault connector requires vaultAddr')
    }
    if (!this.config.vaultToken && !(this.config.roleId && this.config.secretId)) {
      throw new Error('HashiCorp Vault connector requires either vaultToken or roleId+secretId (AppRole)')
    }
    this.baseUrl = this.config.vaultAddr.replace(/\/+$/, '')
    this.token = this.config.vaultToken || null
  }

  // ---------- Authentication ----------

  private async getToken(): Promise<string> {
    if (this.token) {
      return this.token
    }

    // AppRole authentication
    const res = await fetch(`${this.baseUrl}/v1/auth/approle/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role_id: this.config.roleId,
        secret_id: this.config.secretId,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vault AppRole login failed: ${res.status} - ${text.substring(0, 300)}`)
    }

    const data = await res.json()
    this.token = data.auth?.client_token
    if (!this.token) {
      throw new Error('Vault AppRole login did not return a client token')
    }
    return this.token
  }

  // ---------- API helpers ----------

  private async vaultGet<T = any>(path: string): Promise<T> {
    const token = await this.getToken()
    const url = `${this.baseUrl}/v1${path}`
    const res = await fetch(url, {
      headers: { 'X-Vault-Token': token },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vault API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  private async vaultList(path: string): Promise<string[]> {
    const token = await this.getToken()
    const url = `${this.baseUrl}/v1${path}?list=true`
    const res = await fetch(url, {
      headers: { 'X-Vault-Token': token },
    })
    if (!res.ok) {
      // 404 means no entries, not an error
      if (res.status === 404) return []
      const text = await res.text().catch(() => '')
      throw new Error(`Vault API ${res.status}: ${path}?list=true - ${text.substring(0, 200)}`)
    }
    const body = await res.json()
    return body?.data?.keys || []
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.getToken()
      const health = await this.vaultGet<any>('/sys/health')
      const version = health.version || 'unknown'
      const sealed = health.sealed ? 'sealed' : 'unsealed'
      const initialized = health.initialized ? 'initialized' : 'uninitialized'
      return {
        ok: true,
        message: `Connected to HashiCorp Vault v${version} (${sealed}, ${initialized}) at ${this.baseUrl}`,
      }
    } catch (e: any) {
      return { ok: false, message: `Vault connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // 1. List all identity entities
    const entityIds = await this.vaultList('/identity/entity/id')

    onProgress?.({
      phase: 'entities',
      current: 0,
      total: entityIds.length,
      message: `Found ${entityIds.length} entities in Vault`,
    })

    for (let i = 0; i < entityIds.length; i++) {
      try {
        const entity = await this.vaultGet<any>(`/identity/entity/id/${entityIds[i]}`)
        const data = entity.data || entity

        // Determine type from auth method aliases
        const aliases = data.aliases || []
        const authMethods = aliases.map((a: any) => a.mount_type || '').filter(Boolean)
        const isHuman = authMethods.some((m: string) =>
          m === 'ldap' || m === 'oidc' || m === 'userpass' || m === 'github',
        )
        const isNonHuman = authMethods.some((m: string) =>
          m === 'approle' || m === 'token' || m === 'aws' || m === 'gcp' || m === 'kubernetes',
        )

        const identityType: 'human' | 'non_human' = isHuman ? 'human' : (isNonHuman ? 'non_human' : 'human')
        const subType = identityType === 'human' ? 'employee' : 'service_account'

        const metadata = data.metadata || {}

        identities.push({
          sourceId: data.id || entityIds[i],
          displayName: data.name || `Entity ${entityIds[i].substring(0, 8)}`,
          type: identityType,
          subType,
          email: metadata.email || undefined,
          department: metadata.department || metadata.team || undefined,
          status: data.disabled ? 'disabled' : 'active',
          adTier: 'unclassified',
          // Policies determine tier — will be classified via entitlements
        })
      } catch {
        // Skip entities we cannot read
      }

      if (onProgress && i % 20 === 0) {
        onProgress({
          phase: 'entities',
          current: i + 1,
          total: entityIds.length,
          message: `Processing entity ${i + 1}/${entityIds.length}`,
        })
      }
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from Vault`,
    })

    return identities
  }

  async extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    const results: RawGroup[] = []

    // List all identity groups
    const groupIds = await this.vaultList('/identity/group/id')

    onProgress?.({
      phase: 'groups',
      current: 0,
      total: groupIds.length,
      message: `Found ${groupIds.length} groups in Vault`,
    })

    for (let i = 0; i < groupIds.length; i++) {
      try {
        const group = await this.vaultGet<any>(`/identity/group/id/${groupIds[i]}`)
        const data = group.data || group

        const members = data.member_entity_ids || []
        const policies = data.policies || []
        const isPrivileged = policies.some((p: string) =>
          p === 'root' || p.includes('admin') || p.includes('sudo'),
        )

        let adTier = 'unclassified'
        if (policies.some((p: string) => this.classifyPolicyTier(p) === 'tier_top')) {
          adTier = 'tier_top'
        } else if (isPrivileged) {
          adTier = 'tier_1'
        }

        results.push({
          sourceId: data.id || groupIds[i],
          name: data.name || `Group ${groupIds[i].substring(0, 8)}`,
          type: data.type === 'external' ? 'security' : 'role_based',
          members,
          adTier,
          isPrivileged,
        })
      } catch {
        // Skip groups we cannot read
      }

      if (onProgress && i % 20 === 0) {
        onProgress({
          phase: 'groups',
          current: i + 1,
          total: groupIds.length,
          message: `Processing group ${i + 1}/${groupIds.length}`,
        })
      }
    }

    onProgress?.({
      phase: 'extractGroups',
      current: results.length,
      total: results.length,
      message: `Extracted ${results.length} groups from Vault`,
    })

    return results
  }

  async extractEntitlements(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    const entitlements: RawEntitlement[] = []

    // 1. List all policies
    const policyNames = await this.vaultList('/sys/policy')

    onProgress?.({
      phase: 'policies',
      current: 0,
      total: policyNames.length,
      message: `Found ${policyNames.length} policies in Vault`,
    })

    // Build a map of policy name to tier
    const policyTierMap = new Map<string, string>()
    for (const policyName of policyNames) {
      policyTierMap.set(policyName, this.classifyPolicyTier(policyName))
    }

    // 2. Map entity policies to entitlements
    const entityIds = await this.vaultList('/identity/entity/id')

    for (let i = 0; i < entityIds.length; i++) {
      try {
        const entity = await this.vaultGet<any>(`/identity/entity/id/${entityIds[i]}`)
        const data = entity.data || entity
        const entityId = data.id || entityIds[i]
        const directPolicies = data.policies || []

        for (const policy of directPolicies) {
          entitlements.push({
            sourceId: `vault-policy-${entityId}-${policy}`,
            identitySourceId: entityId,
            permissionName: `Policy: ${policy}`,
            permissionType: 'direct_assignment',
            permissionScope: 'HashiCorp Vault',
            adTierOfPermission: policyTierMap.get(policy) || 'tier_2',
            grantedBy: 'Vault',
            application: 'HashiCorp Vault',
          })
        }
      } catch {
        // Skip unreadable entities
      }

      if (onProgress && i % 20 === 0) {
        onProgress({
          phase: 'entity policies',
          current: i + 1,
          total: entityIds.length,
          message: `Processing entity policies ${i + 1}/${entityIds.length}`,
        })
      }
    }

    // 3. Map group policies to inherited entitlements for group members
    const groupIds = await this.vaultList('/identity/group/id')

    for (const groupId of groupIds) {
      try {
        const group = await this.vaultGet<any>(`/identity/group/id/${groupId}`)
        const data = group.data || group
        const groupPolicies = data.policies || []
        const memberEntityIds = data.member_entity_ids || []

        for (const policy of groupPolicies) {
          for (const memberId of memberEntityIds) {
            // Avoid duplicates with direct policies
            const existing = entitlements.find(
              e => e.identitySourceId === memberId && e.permissionName === `Policy: ${policy}`,
            )
            if (!existing) {
              entitlements.push({
                sourceId: `vault-group-policy-${groupId}-${memberId}-${policy}`,
                identitySourceId: memberId,
                permissionName: `Policy: ${policy}`,
                permissionType: 'inherited',
                permissionScope: `Vault Group: ${data.name || groupId}`,
                adTierOfPermission: policyTierMap.get(policy) || 'tier_2',
                grantedBy: `Group: ${data.name || groupId}`,
                application: 'HashiCorp Vault',
              })
            }
          }
        }
      } catch {
        // Skip unreadable groups
      }
    }

    // 4. Extract auth method roles (AppRole, token roles) as NHI entitlements
    try {
      const authMethods = await this.vaultGet<any>('/sys/auth')
      const authData = authMethods.data || authMethods

      for (const [mountPath, methodInfo] of Object.entries(authData)) {
        const info = methodInfo as any
        if (info.type === 'approle') {
          try {
            const roles = await this.vaultList(`/auth/${mountPath}role`)
            for (const roleName of roles) {
              try {
                const roleDetail = await this.vaultGet<any>(`/auth/${mountPath}role/${roleName}`)
                const roleData = roleDetail.data || roleDetail
                const tokenPolicies = roleData.token_policies || roleData.policies || []

                // The AppRole itself is an entitlement for any entity using it
                const tier = tokenPolicies.reduce(
                  (t: string, p: string) => stricterTier(t, this.classifyPolicyTier(p)),
                  'tier_2',
                )

                entitlements.push({
                  sourceId: `vault-approle-${mountPath}-${roleName}`,
                  identitySourceId: `approle-${roleName}`, // Synthetic identity
                  permissionName: `AppRole: ${roleName}`,
                  permissionType: 'role',
                  permissionScope: `Vault Auth: ${mountPath}`,
                  adTierOfPermission: tier,
                  grantedBy: 'Vault',
                  application: 'HashiCorp Vault',
                })
              } catch {
                // Skip unreadable roles
              }
            }
          } catch {
            // AppRole listing may not be permitted
          }
        }
      }
    } catch {
      // Auth method listing may not be permitted
    }

    onProgress?.({
      phase: 'extractEntitlements',
      current: entitlements.length,
      total: entitlements.length,
      message: `Extracted ${entitlements.length} entitlements from Vault`,
    })

    return entitlements
  }

  // ---------- BONUS: Secret engines extraction ----------

  /**
   * Extract secret engines as resources for the Identity Radar resource inventory.
   */
  async extractSecretEngines(): Promise<VaultSecretEngine[]> {
    const engines: VaultSecretEngine[] = []

    try {
      const mounts = await this.vaultGet<any>('/sys/mounts')
      const mountData = mounts.data || mounts

      for (const [path, info] of Object.entries(mountData)) {
        const mountInfo = info as any
        engines.push({
          path,
          type: mountInfo.type || 'unknown',
          description: mountInfo.description || '',
          accessor: mountInfo.accessor || '',
        })
      }
    } catch {
      // Mount listing may not be permitted
    }

    return engines
  }

  // ---------- Tier classification ----------

  private classifyPolicyTier(policyName: string): string {
    const name = policyName.toLowerCase()

    // Vault holds the secrets that unlock Tier 0 but is not the identity plane
    // itself: root and vault-wide admin policies are Top Tier (Tier 0 adjacent).
    if (name === 'root' || name.includes('superuser') || name.includes('sudo') ||
        name === 'admin' || name.includes('vault-admin') || name.includes('vault_admin') ||
        name.includes('sys-admin') || name.includes('sys_admin')) return 'tier_top'
    if (name.includes('admin')) return 'tier_1'
    if (name === 'default' || name.includes('read') || name.includes('list')) return 'tier_2'

    return 'tier_2'
  }
}
