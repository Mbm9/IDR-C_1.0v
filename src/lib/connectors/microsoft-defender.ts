// SPDX-License-Identifier: Apache-2.0
// Microsoft Defender for Identity Connector
// Uses the Microsoft 365 Defender API with OAuth2 client credentials.
// Pulls: identity threat signals, lateral movement profiles, sensitive identities, alerts.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'

interface DefenderConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

/** Alert from Microsoft Defender for Identity. */
export interface DefenderAlert {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  status: string
  assignedTo?: string
  detectionSource: string
  createdDateTime: string
  lastUpdatedDateTime: string
  userAccountName?: string
  userAccountDomain?: string
  userAccountSid?: string
  mitreTechniques: string[]
  description: string
}

/** Severity mapping from Defender severity to Identity Radar severity. */
const SEVERITY_MAP: Record<string, DefenderAlert['severity']> = {
  High: 'critical',
  Medium: 'high',
  Low: 'medium',
  Informational: 'low',
}

/** Alert category to kill chain phase mapping. */
const CATEGORY_MAP: Record<string, string> = {
  Reconnaissance: 'reconnaissance',
  LateralMovement: 'lateral_movement',
  DomainDominance: 'privilege_escalation',
  CredentialAccess: 'credential_access',
  Persistence: 'persistence',
  InitialAccess: 'initial_access',
  Execution: 'impact',
  Exfiltration: 'exfiltration',
}

export class MicrosoftDefenderConnector implements Connector {
  private config: DefenderConfig
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as DefenderConfig
    if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
      throw new Error('Microsoft Defender connector requires tenantId, clientId, and clientSecret')
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
      scope: 'https://api.security.microsoft.com/.default',
      grant_type: 'client_credentials',
    })

    const res = await fetch(tokenUrl, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Defender OAuth2 token request failed: ${res.status} - ${text.substring(0, 300)}`)
    }

    const data = await res.json()
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000
    return this.accessToken!
  }

  // ---------- API helpers ----------

  private async apiGet<T = any>(path: string): Promise<T> {
    const token = await this.getToken()
    const url = path.startsWith('http') ? path : `https://api.security.microsoft.com/api${path}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Defender API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  /**
   * Paginate through all results using @odata.nextLink.
   */
  private async apiGetAll<T = any>(
    path: string,
    onProgress?: SyncProgressCallback,
    label?: string,
  ): Promise<T[]> {
    let results: T[] = []
    let nextUrl: string | null = `https://api.security.microsoft.com/api${path}`
    let pageNum = 0

    while (nextUrl) {
      const token = await this.getToken()
      const response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Defender API ${response.status}: ${nextUrl} - ${text.substring(0, 200)}`)
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
          total: 0,
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
      // Verify access by fetching a single alert
      const data = await this.apiGet<any>('/alerts?$top=1')
      const alertCount = Array.isArray(data.value) ? data.value.length : 0
      return {
        ok: true,
        message: `Connected to Microsoft Defender for Identity (tenant: ${this.config.tenantId}). API accessible, sample alerts: ${alertCount}.`,
      }
    } catch (e: any) {
      return { ok: false, message: `Microsoft Defender connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // Pull lateral movement profiles from /users endpoint
    const users = await this.apiGetAll<any>(
      '/users?$top=500',
      onProgress,
      'defender users',
    )

    for (const user of users) {
      const isSensitive = user.isSensitive === true

      identities.push({
        sourceId: user.id || user.aadUserId || user.accountName || `defender-${users.indexOf(user)}`,
        displayName: user.accountDisplayName || user.accountName || 'Unknown',
        type: 'human',
        subType: 'employee',
        samAccountName: user.accountName || undefined,
        upn: user.userPrincipalName || undefined,
        email: user.mailAddress || undefined,
        department: user.department || undefined,
        status: 'active',
        // Sensitive identities in Defender are Tier 0 equivalents
        adTier: isSensitive ? 'tier_0' : 'unclassified',
        lastLogonAt: user.lastSeen ? new Date(user.lastSeen) : undefined,
        privileged: isSensitive,
      })
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from Microsoft Defender`,
    })

    return identities
  }

  async extractGroups(_onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    // Microsoft Defender for Identity does not expose group objects directly.
    return []
  }

  async extractEntitlements(_onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    // Microsoft Defender for Identity does not model entitlements directly.
    return []
  }

  // ---------- BONUS: Alerts extraction ----------

  /**
   * Extract unresolved alerts from Microsoft Defender for Identity.
   * Each alert maps to an identity threat signal in the Identity Radar schema.
   */
  async extractAlerts(onProgress?: SyncProgressCallback): Promise<DefenderAlert[]> {
    const rawAlerts = await this.apiGetAll<any>(
      "/alerts?$filter=status ne 'Resolved'&$top=500",
      onProgress,
      'alerts',
    )

    const alerts: DefenderAlert[] = rawAlerts.map((alert: any) => ({
      id: alert.id || alert.alertId,
      title: alert.title || 'Unknown Alert',
      severity: SEVERITY_MAP[alert.severity] || 'medium',
      category: CATEGORY_MAP[alert.category] || alert.category || 'unknown',
      status: alert.status || 'Unknown',
      assignedTo: alert.assignedTo || undefined,
      detectionSource: alert.detectionSource || 'MicrosoftDefenderForIdentity',
      createdDateTime: alert.createdDateTime || new Date().toISOString(),
      lastUpdatedDateTime: alert.lastUpdatedDateTime || new Date().toISOString(),
      userAccountName: alert.userStates?.[0]?.accountName || alert.evidence?.[0]?.userAccount?.accountName,
      userAccountDomain: alert.userStates?.[0]?.domainName || alert.evidence?.[0]?.userAccount?.domainName,
      userAccountSid: alert.userStates?.[0]?.userSid,
      mitreTechniques: alert.mitreTechniques || [],
      description: alert.description || '',
    }))

    onProgress?.({
      phase: 'extractAlerts',
      current: alerts.length,
      total: alerts.length,
      message: `Extracted ${alerts.length} unresolved alerts from Microsoft Defender`,
    })

    return alerts
  }

  // ---------- BONUS: Sensitive identities ----------

  /**
   * Extract identities marked as "sensitive" in Defender.
   * These are Defender's equivalent of Tier 0 identities.
   */
  async extractSensitiveIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const sensitiveUsers = await this.apiGetAll<any>(
      '/users?$filter=isSensitive eq true&$top=500',
      onProgress,
      'sensitive identities',
    )

    const identities: RawIdentity[] = sensitiveUsers.map((user: any) => ({
      sourceId: user.id || user.aadUserId || user.accountName || `defender-sensitive-${sensitiveUsers.indexOf(user)}`,
      displayName: user.accountDisplayName || user.accountName || 'Unknown',
      type: 'human' as const,
      subType: 'employee',
      samAccountName: user.accountName || undefined,
      upn: user.userPrincipalName || undefined,
      email: user.mailAddress || undefined,
      department: user.department || undefined,
      status: 'active',
      adTier: 'tier_0', // Sensitive = Tier 0
      lastLogonAt: user.lastSeen ? new Date(user.lastSeen) : undefined,
      privileged: true,
    }))

    onProgress?.({
      phase: 'extractSensitiveIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} sensitive identities from Microsoft Defender`,
    })

    return identities
  }
}
