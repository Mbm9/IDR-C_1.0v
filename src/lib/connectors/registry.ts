// Connector registry — browser-safe metadata for UI components.
// This file has NO Node.js dependencies (no ldapjs, no fs, etc.)
// so it can be safely imported in 'use client' components.

import type { ConnectorType } from './base'

export interface ConnectorMeta {
  type: ConnectorType
  label: string
  description: string
  icon: string
  requiredCredentials: string[]
  optionalCredentials: string[]
  category: 'directory' | 'sso' | 'iga' | 'pam' | 'itsm' | 'import' | 'itdr' | 'secrets' | 'siem' | 'certificate'
}

export const CONNECTOR_REGISTRY: ConnectorMeta[] = [
  {
    type: 'active_directory',
    label: 'Active Directory (LDAP)',
    description: 'On-premises Active Directory via LDAP or CSV import',
    icon: 'server',
    requiredCredentials: ['host', 'port', 'baseDN', 'bindDN', 'bindPassword'],
    optionalCredentials: ['useTLS', 'mode', 'csvContent'],
    category: 'directory',
  },
  {
    type: 'azure_ad',
    label: 'Azure AD / Entra ID',
    description: 'Microsoft Entra ID via Microsoft Graph API',
    icon: 'cloud',
    requiredCredentials: ['tenantId', 'clientId', 'clientSecret'],
    optionalCredentials: [],
    category: 'directory',
  },
  {
    type: 'okta',
    label: 'Okta',
    description: 'Okta Identity Provider via REST API',
    icon: 'shield',
    requiredCredentials: ['domain', 'apiToken'],
    optionalCredentials: [],
    category: 'sso',
  },
  {
    type: 'sailpoint_iiq',
    label: 'SailPoint IdentityIQ',
    description: 'SailPoint IIQ via REST or SCIM 2.0 API',
    icon: 'users',
    requiredCredentials: ['baseUrl', 'username', 'password'],
    optionalCredentials: ['useSCIM'],
    category: 'iga',
  },
  {
    type: 'broadcom_sso',
    label: 'Broadcom SiteMinder SSO',
    description: 'Broadcom (CA) SiteMinder SSO policy server',
    icon: 'lock',
    requiredCredentials: ['baseUrl', 'adminUser', 'adminPassword', 'userDirectory'],
    optionalCredentials: ['policyDomain'],
    category: 'sso',
  },
  {
    type: 'broadcom_pam',
    label: 'Broadcom PAM',
    description: 'Broadcom (CA) Privileged Access Manager',
    icon: 'key',
    requiredCredentials: ['baseUrl', 'apiUser', 'apiPassword'],
    optionalCredentials: ['apiKey', 'vaultName'],
    category: 'pam',
  },
  {
    type: 'servicenow',
    label: 'ServiceNow',
    description: 'Import users, groups, and roles from ServiceNow ITSM/ITOM',
    icon: 'ticket',
    requiredCredentials: ['instanceUrl', 'username', 'password'],
    optionalCredentials: ['clientId', 'clientSecret'],
    category: 'itsm',
  },
  {
    type: 'csv',
    label: 'CSV Import',
    description: 'Import identities from a CSV file',
    icon: 'file-text',
    requiredCredentials: ['fileContent'],
    optionalCredentials: [],
    category: 'import',
  },
  {
    type: 'microsoft_defender',
    label: 'Microsoft Defender for Identity',
    description: 'Identity threat signals from Microsoft Defender for Identity via M365 Defender API',
    icon: 'shield-alert',
    requiredCredentials: ['tenantId', 'clientId', 'clientSecret'],
    optionalCredentials: [],
    category: 'itdr',
  },
  {
    type: 'sap_grc',
    label: 'SAP GRC / SAP IdM',
    description: 'Users, roles, and SoD violations from SAP GRC Access Control and SAP IdM',
    icon: 'database',
    requiredCredentials: ['baseUrl', 'username', 'password'],
    optionalCredentials: ['clientId', 'clientSecret', 'idmEndpoint'],
    category: 'iga',
  },
  {
    type: 'hashicorp_vault',
    label: 'HashiCorp Vault',
    description: 'Entities, groups, policies, and secret engines from HashiCorp Vault',
    icon: 'vault',
    requiredCredentials: ['vaultAddr'],
    optionalCredentials: ['vaultToken', 'roleId', 'secretId'],
    category: 'secrets',
  },
  {
    type: 'splunk',
    label: 'Splunk SIEM',
    description: 'Identity-related security events and alerts from Splunk Enterprise/Cloud',
    icon: 'activity',
    requiredCredentials: ['baseUrl'],
    optionalCredentials: ['username', 'password', 'bearerToken'],
    category: 'siem',
  },
  {
    type: 'beyondtrust',
    label: 'BeyondTrust PAM',
    description: 'Import privileged accounts, sessions, and access policies from BeyondTrust Password Safe',
    icon: 'shield',
    requiredCredentials: ['hostUrl', 'apiKey', 'runAsUser'],
    optionalCredentials: [],
    category: 'pam',
  },
  {
    type: 'digicert',
    label: 'DigiCert CertCentral',
    description: 'Track certificate lifecycle, expiry, and certificate-based identities',
    icon: 'file-key',
    requiredCredentials: ['apiKey'],
    optionalCredentials: [],
    category: 'certificate',
  },
]

/**
 * Look up connector metadata by type.
 */
export function getConnectorMeta(type: ConnectorType): ConnectorMeta | undefined {
  return CONNECTOR_REGISTRY.find(c => c.type === type)
}
