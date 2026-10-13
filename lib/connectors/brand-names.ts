// Display names for integration types.
// Vendor and product names are trademarks and stay in Latin script in every
// locale, so they live here rather than in the message catalogues.

export const INTEGRATION_BRAND_NAMES: Record<string, string> = {
  active_directory: 'Active Directory',
  azure_ad: 'Azure AD / Entra ID',
  azure_logs: 'Azure Monitor Logs',
  okta: 'Okta',
  sailpoint: 'SailPoint',
  sailpoint_iiq: 'SailPoint IdentityIQ',
  cyberark: 'CyberArk',
  servicenow: 'ServiceNow',
  beyondtrust: 'BeyondTrust',
  digicert: 'DigiCert',
  hashicorp_vault: 'HashiCorp Vault',
  sap_grc: 'SAP GRC',
  microsoft_defender: 'Microsoft Defender for Identity',
  splunk: 'Splunk',
  broadcom_pam: 'Broadcom PAM',
  broadcom_sso: 'Broadcom SiteMinder',
  sso_provider: 'SSO',
  csv: 'CSV',
}

/** Brand display name for an integration type enum value (falls back to the raw value). */
export function integrationBrandName(type: string | null | undefined): string {
  if (!type) return ''
  return INTEGRATION_BRAND_NAMES[type] ?? type
}
