// SPDX-License-Identifier: Apache-2.0
// Splunk SIEM Connector
// Uses the Splunk REST API with Basic Auth or Bearer token.
// Pulls: identity enrichment via SPL searches, security alerts, notable events.

import type { Connector, RawIdentity, RawGroup, RawEntitlement, SyncProgressCallback } from './base'

interface SplunkConfig {
  baseUrl: string
  username?: string
  password?: string
  bearerToken?: string
}

/** Alert from Splunk notable events or triggered alerts. */
export interface SplunkAlert {
  id: string
  ruleName: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  user?: string
  srcIp?: string
  destIp?: string
  description: string
  time: string
  status: string
  category?: string
}

/** Severity mapping from Splunk urgency to Identity Radar severity. */
const URGENCY_MAP: Record<string, SplunkAlert['severity']> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  informational: 'low',
}

export class SplunkConnector implements Connector {
  private config: SplunkConfig
  private baseUrl: string

  constructor(credentials: Record<string, string>) {
    this.config = credentials as unknown as SplunkConfig
    if (!this.config.baseUrl) {
      throw new Error('Splunk connector requires baseUrl')
    }
    if (!this.config.bearerToken && !(this.config.username && this.config.password)) {
      throw new Error('Splunk connector requires either bearerToken or username+password')
    }
    this.baseUrl = this.config.baseUrl.replace(/\/+$/, '')
  }

  // ---------- Authentication ----------

  private getAuthHeaders(): Record<string, string> {
    if (this.config.bearerToken) {
      return {
        Authorization: `Bearer ${this.config.bearerToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    }
    const encoded = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')
    return {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  }

  // ---------- Splunk REST API helpers ----------

  /**
   * Execute a Splunk search job (POST /services/search/jobs),
   * poll until done, then return results.
   */
  private async runSearch(
    spl: string,
    onProgress?: SyncProgressCallback,
    label?: string,
    maxResults: number = 500,
  ): Promise<any[]> {
    const headers = this.getAuthHeaders()

    // 1. Create search job
    const createRes = await fetch(`${this.baseUrl}/services/search/jobs`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        search: spl,
        output_mode: 'json',
        max_count: String(maxResults),
      }),
    })

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '')
      throw new Error(`Splunk search job creation failed: ${createRes.status} - ${text.substring(0, 300)}`)
    }

    const createBody = await createRes.json()
    const sid = createBody.sid
    if (!sid) {
      throw new Error('Splunk search job did not return a sid')
    }

    // 2. Poll until job is done
    let isDone = false
    let pollCount = 0
    const maxPolls = 120 // 2 minutes max at 1-second intervals

    while (!isDone && pollCount < maxPolls) {
      const statusRes = await fetch(
        `${this.baseUrl}/services/search/jobs/${sid}?output_mode=json`,
        { headers },
      )
      if (!statusRes.ok) {
        throw new Error(`Splunk job status check failed: ${statusRes.status}`)
      }
      const statusBody = await statusRes.json()
      const entry = statusBody.entry?.[0]?.content
      isDone = entry?.isDone === true || entry?.isDone === 'true'

      if (!isDone) {
        const dispatchState = entry?.dispatchState || 'RUNNING'
        const resultCount = entry?.resultCount || 0

        if (onProgress && label) {
          onProgress({
            phase: label,
            current: resultCount,
            total: 0,
            message: `Search "${label}" ${dispatchState} — ${resultCount} results so far`,
          })
        }

        await new Promise(resolve => setTimeout(resolve, 1000))
        pollCount++
      }
    }

    if (!isDone) {
      // Cancel the job
      try {
        await fetch(`${this.baseUrl}/services/search/jobs/${sid}/control`, {
          method: 'POST',
          headers,
          body: new URLSearchParams({ action: 'cancel' }),
        })
      } catch {
        // Best effort
      }
      throw new Error(`Splunk search job timed out after ${maxPolls} seconds`)
    }

    // 3. Get results
    const resultsRes = await fetch(
      `${this.baseUrl}/services/search/jobs/${sid}/results?output_mode=json&count=${maxResults}`,
      { headers },
    )
    if (!resultsRes.ok) {
      const text = await resultsRes.text().catch(() => '')
      throw new Error(`Splunk results fetch failed: ${resultsRes.status} - ${text.substring(0, 300)}`)
    }

    const resultsBody = await resultsRes.json()
    return resultsBody.results || []
  }

  /**
   * Simple GET request to a Splunk REST endpoint.
   */
  private async splunkGet<T = any>(path: string): Promise<T> {
    const headers = this.getAuthHeaders()
    const separator = path.includes('?') ? '&' : '?'
    const url = `${this.baseUrl}${path}${separator}output_mode=json`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Splunk API ${res.status}: ${path} - ${text.substring(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  // ---------- Connector interface ----------

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const info = await this.splunkGet<any>('/services/server/info')
      const entry = info.entry?.[0]?.content
      const serverName = entry?.serverName || 'unknown'
      const version = entry?.version || 'unknown'
      return {
        ok: true,
        message: `Connected to Splunk ${serverName} v${version} at ${this.baseUrl}`,
      }
    } catch (e: any) {
      return { ok: false, message: `Splunk connection failed: ${e.message}` }
    }
  }

  async extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]> {
    const identities: RawIdentity[] = []

    // Strategy 1: Try identity_manager_identities_lookup (Splunk ES asset/identity framework)
    try {
      const lookupResults = await this.runSearch(
        '| inputlookup identity_manager_identities_lookup | head 1000',
        onProgress,
        'identity lookup',
      )

      for (const row of lookupResults) {
        identities.push({
          sourceId: row.identity || row.key || `splunk-${identities.length}`,
          displayName: row.identity || row.email || row.nick || 'Unknown',
          type: 'human',
          subType: 'employee',
          samAccountName: row.nick || row.identity || undefined,
          email: row.email || undefined,
          department: row.category || row.bunit || undefined,
          status: row.endDate && new Date(row.endDate) < new Date() ? 'inactive' : 'active',
          adTier: 'unclassified',
        })
      }
    } catch {
      // Lookup may not exist — fall back to Windows event log extraction
    }

    // Strategy 2: If no identities from lookup, extract from Windows auth events
    if (identities.length === 0) {
      try {
        const authResults = await this.runSearch(
          'search index=main sourcetype=WinEventLog:Security EventCode=4624 earliest=-30d | stats latest(_time) as last_logon, count as logon_count, latest(src_ip) as last_src_ip by user | where user!="" AND user!="-" | head 500',
          onProgress,
          'auth events',
        )

        for (const row of authResults) {
          const userName = row.user || ''
          if (!userName || userName === '-' || userName === 'SYSTEM' || userName === 'LOCAL SERVICE') {
            continue
          }

          // Detect service accounts by naming convention
          const lower = userName.toLowerCase()
          const isNHI = lower.startsWith('svc_') || lower.startsWith('svc-') ||
            lower.startsWith('srv_') || lower.startsWith('app_') ||
            lower.includes('$') // Machine accounts end with $

          identities.push({
            sourceId: `splunk-auth-${userName}`,
            displayName: userName,
            type: isNHI ? 'non_human' : 'human',
            subType: isNHI ? 'service_account' : 'employee',
            samAccountName: userName,
            status: 'active',
            adTier: 'unclassified',
            lastLogonAt: row.last_logon ? new Date(row.last_logon) : undefined,
          })
        }
      } catch {
        // Auth event search may fail if index is not accessible
      }
    }

    onProgress?.({
      phase: 'extractIdentities',
      current: identities.length,
      total: identities.length,
      message: `Extracted ${identities.length} identities from Splunk`,
    })

    return identities
  }

  async extractGroups(_onProgress?: SyncProgressCallback): Promise<RawGroup[]> {
    // Splunk is not a primary source for group data.
    return []
  }

  async extractEntitlements(_onProgress?: SyncProgressCallback): Promise<RawEntitlement[]> {
    // Splunk is not a primary source for entitlement data.
    return []
  }

  // ---------- BONUS: Security alerts extraction ----------

  /**
   * Extract security alerts/notable events from Splunk for ITDR correlation.
   */
  async extractSecurityAlerts(onProgress?: SyncProgressCallback): Promise<SplunkAlert[]> {
    const alerts: SplunkAlert[] = []

    // Strategy 1: Splunk ES notable events
    try {
      const notableResults = await this.runSearch(
        'search `notable` earliest=-7d | head 500 | table _time, rule_name, urgency, user, src, dest, status_label, description, security_domain',
        onProgress,
        'notable events',
      )

      for (const row of notableResults) {
        alerts.push({
          id: `splunk-notable-${alerts.length}`,
          ruleName: row.rule_name || 'Unknown Rule',
          severity: URGENCY_MAP[row.urgency?.toLowerCase()] || 'medium',
          user: row.user || undefined,
          srcIp: row.src || undefined,
          destIp: row.dest || undefined,
          description: row.description || '',
          time: row._time || new Date().toISOString(),
          status: row.status_label || 'New',
          category: row.security_domain || undefined,
        })
      }
    } catch {
      // Notable events macro may not exist — try saved searches
    }

    // Strategy 2: Triggered alerts from saved searches
    if (alerts.length === 0) {
      try {
        const savedSearches = await this.splunkGet<any>('/services/saved/searches')
        const entries = savedSearches.entry || []

        for (const entry of entries) {
          const content = entry.content
          if (content?.alert_type && content?.triggered_alert_count > 0) {
            alerts.push({
              id: `splunk-saved-${entry.name}`,
              ruleName: entry.name,
              severity: URGENCY_MAP[content.alert?.severity?.toLowerCase()] || 'medium',
              description: content.description || '',
              time: content['next_scheduled_time'] || new Date().toISOString(),
              status: 'triggered',
            })
          }
        }
      } catch {
        // Saved search listing may not be permitted
      }
    }

    onProgress?.({
      phase: 'extractAlerts',
      current: alerts.length,
      total: alerts.length,
      message: `Extracted ${alerts.length} security alerts from Splunk`,
    })

    return alerts
  }

  // ---------- BONUS: Custom identity search ----------

  /**
   * Run a custom SPL query for identity-related data.
   * Returns raw result rows.
   */
  async runIdentitySearch(query: string): Promise<any[]> {
    return this.runSearch(query)
  }
}
