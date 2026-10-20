// Connector Factory
// Creates the appropriate connector instance based on the integration source type.
// All connectors are lazily loaded to avoid pulling in unnecessary dependencies.

import type { Connector, ConnectorType, ConnectorConfig } from './base'

/**
 * Create a connector instance for the given configuration.
 * Uses dynamic imports so that each connector module is only loaded when needed.
 */
export async function createConnectorAsync(config: ConnectorConfig): Promise<Connector> {
  switch (config.type) {
    case 'active_directory': {
      const { LDAPConnector } = await import('./ldap')
      return new LDAPConnector(config.credentials)
    }
    case 'azure_ad': {
      const { AzureADConnector } = await import('./azure-ad')
      return new AzureADConnector(config.credentials)
    }
    case 'okta': {
      const { OktaConnector } = await import('./okta')
      return new OktaConnector(config.credentials)
    }
    case 'csv': {
      const { CSVConnector } = await import('./csv')
      return new CSVConnector(config.credentials)
    }
    case 'sailpoint_iiq': {
      const { SailPointIIQConnector } = await import('./sailpoint-iiq')
      return new SailPointIIQConnector(config.credentials)
    }
    case 'broadcom_sso': {
      const { BroadcomSSOConnector } = await import('./broadcom-sso')
      return new BroadcomSSOConnector(config.credentials)
    }
    case 'broadcom_pam': {
      const { BroadcomPAMConnector } = await import('./broadcom-pam')
      return new BroadcomPAMConnector(config.credentials)
    }
    case 'servicenow': {
      const { ServiceNowConnector } = await import('./servicenow')
      return new ServiceNowConnector(config.credentials)
    }
    case 'microsoft_defender': {
      const { MicrosoftDefenderConnector } = await import('./microsoft-defender')
      return new MicrosoftDefenderConnector(config.credentials)
    }
    case 'sap_grc': {
      const { SapGrcConnector } = await import('./sap-grc')
      return new SapGrcConnector(config.credentials)
    }
    case 'hashicorp_vault': {
      const { HashiCorpVaultConnector } = await import('./hashicorp-vault')
      return new HashiCorpVaultConnector(config.credentials)
    }
    case 'splunk': {
      const { SplunkConnector } = await import('./splunk')
      return new SplunkConnector(config.credentials)
    }
    case 'beyondtrust': {
      const { BeyondTrustConnector } = await import('./beyondtrust')
      return new BeyondTrustConnector(config.credentials)
    }
    case 'digicert': {
      const { DigiCertConnector } = await import('./digicert')
      return new DigiCertConnector(config.credentials)
    }
    default:
      throw new Error(`Unknown connector type: ${(config as ConnectorConfig).type}`)
  }
}

/**
 * Synchronous factory using require() for backward compatibility.
 * Prefer createConnectorAsync() in new code.
 */
export function createConnector(config: ConnectorConfig): Connector {
  switch (config.type) {
    case 'active_directory': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LDAPConnector } = require('./ldap')
      return new LDAPConnector(config.credentials)
    }
    case 'azure_ad': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AzureADConnector } = require('./azure-ad')
      return new AzureADConnector(config.credentials)
    }
    case 'okta': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OktaConnector } = require('./okta')
      return new OktaConnector(config.credentials)
    }
    case 'csv': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CSVConnector } = require('./csv')
      return new CSVConnector(config.credentials)
    }
    case 'sailpoint_iiq': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SailPointIIQConnector } = require('./sailpoint-iiq')
      return new SailPointIIQConnector(config.credentials)
    }
    case 'broadcom_sso': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BroadcomSSOConnector } = require('./broadcom-sso')
      return new BroadcomSSOConnector(config.credentials)
    }
    case 'broadcom_pam': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BroadcomPAMConnector } = require('./broadcom-pam')
      return new BroadcomPAMConnector(config.credentials)
    }
    case 'servicenow': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ServiceNowConnector } = require('./servicenow')
      return new ServiceNowConnector(config.credentials)
    }
    case 'microsoft_defender': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MicrosoftDefenderConnector } = require('./microsoft-defender')
      return new MicrosoftDefenderConnector(config.credentials)
    }
    case 'sap_grc': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SapGrcConnector } = require('./sap-grc')
      return new SapGrcConnector(config.credentials)
    }
    case 'hashicorp_vault': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { HashiCorpVaultConnector } = require('./hashicorp-vault')
      return new HashiCorpVaultConnector(config.credentials)
    }
    case 'splunk': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SplunkConnector } = require('./splunk')
      return new SplunkConnector(config.credentials)
    }
    case 'beyondtrust': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BeyondTrustConnector } = require('./beyondtrust')
      return new BeyondTrustConnector(config.credentials)
    }
    case 'digicert': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DigiCertConnector } = require('./digicert')
      return new DigiCertConnector(config.credentials)
    }
    default:
      throw new Error(`Unknown connector type: ${(config as ConnectorConfig).type}`)
  }
}

// Re-export registry data from the browser-safe module.
// Client components should import directly from '@/lib/connectors/registry' instead.
export { CONNECTOR_REGISTRY, getConnectorMeta } from './registry'
export type { ConnectorMeta } from './registry'
