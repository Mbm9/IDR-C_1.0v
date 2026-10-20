// Base interfaces for all Identity Radar connectors.
// Every connector must implement the Connector interface.

export type ConnectorType =
  | 'active_directory'
  | 'azure_ad'
  | 'okta'
  | 'csv'
  | 'sailpoint_iiq'
  | 'broadcom_sso'
  | 'broadcom_pam'
  | 'servicenow'
  | 'microsoft_defender'
  | 'sap_grc'
  | 'hashicorp_vault'
  | 'splunk'
  | 'beyondtrust'
  | 'digicert'

export interface ConnectorConfig {
  type: ConnectorType
  credentials: Record<string, string>
}

export interface SyncResult {
  identitiesUpserted: number
  accountsUpserted: number
  groupsUpserted: number
  entitlementsUpserted: number
  errors: string[]
  duration: number
}

/** Raw AD security attributes used by the static posture/exposure checks. */
export interface AdSecurity {
  uac?: number // userAccountControl bitmask
  spn?: string[] // servicePrincipalName values (kerberoastable when set on a person account)
  adminCount?: number // 1 => protected by AdminSDHolder (currently/formerly privileged)
  allowedToDelegateTo?: string[] // msDS-AllowedToDelegateTo (constrained delegation)
  rbcd?: boolean // msDS-AllowedToActOnBehalfOfOtherIdentity present (resource-based constrained delegation)
  supportedEncTypes?: number // msDS-SupportedEncryptionTypes
}

export interface RawIdentity {
  sourceId: string
  displayName: string
  type: 'human' | 'non_human'
  subType: string
  upn?: string
  samAccountName?: string
  email?: string
  department?: string
  status: string
  adTier: string
  lastLogonAt?: Date
  passwordLastSetAt?: Date
  managerSourceId?: string
  ownerSourceId?: string
  mfaEnabled?: boolean
  privileged?: boolean
  memberOf?: string[] // group source IDs
  adSecurity?: AdSecurity
}

export interface RawGroup {
  sourceId: string
  name: string
  type: string
  scope?: string
  members: string[] // identity source IDs
  adTier: string
  isPrivileged: boolean
}

export interface RawEntitlement {
  sourceId: string
  identitySourceId: string
  permissionName: string
  permissionType: 'role' | 'group_membership' | 'direct_assignment' | 'inherited' | 'delegated'
  permissionScope?: string
  adTierOfPermission: string
  grantedAt?: Date
  grantedBy?: string
  lastUsedAt?: Date | null
  certified?: boolean
  lastCertifiedAt?: Date | null
  riskTags?: string[]
  application?: string
}

export interface SyncProgress {
  phase: string
  current: number
  total: number
  message: string
}

export type SyncProgressCallback = (progress: SyncProgress) => void

/**
 * Common interface for all Identity Radar connectors.
 * Each connector extracts data from a source system and returns
 * it in the Identity Radar ontology format (Raw* types).
 */
export interface Connector {
  /** Verify connectivity and credentials to the source system. */
  testConnection(): Promise<{ ok: boolean; message: string }>

  /** Extract identity objects (users, service accounts, etc.) */
  extractIdentities(onProgress?: SyncProgressCallback): Promise<RawIdentity[]>

  /** Extract group objects (security groups, roles, etc.) */
  extractGroups(onProgress?: SyncProgressCallback): Promise<RawGroup[]>

  /** Extract entitlement/permission assignments. Optional for connectors that do not model entitlements. */
  extractEntitlements?(onProgress?: SyncProgressCallback): Promise<RawEntitlement[]>
}
