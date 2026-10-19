import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { AD_TIER_CONFIG } from '@/lib/utils/constants'

const tierLabel = (tier: string) =>
  AD_TIER_CONFIG[tier as keyof typeof AD_TIER_CONFIG]?.label ?? tier.replace(/_/g, ' ')

/** Organization branding (Settings -> Organization). Logo must be PNG/JPEG. */
interface BrandProps {
  brandName?: string
  brandLogo?: string | null
}

const BrandLogo = ({ logo }: { logo?: string | null }) =>
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
  logo ? <Image src={logo} style={{ height: 28, maxWidth: 140, objectFit: 'contain', marginBottom: 8 }} /> : null

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2px solid #0f172a',
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
  },
  orgName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#334155',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 8,
    marginTop: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottom: '1px solid #cbd5e1',
    padding: '6px 4px',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1px solid #e2e8f0',
    padding: '5px 4px',
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottom: '1px solid #e2e8f0',
    padding: '5px 4px',
    backgroundColor: '#f8fafc',
  },
  headerCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
  },
  cell: {
    fontSize: 9,
    color: '#334155',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    border: '1px solid #e2e8f0',
  },
  metricLabel: {
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1px solid #e2e8f0',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#94a3b8',
  },
  badge: {
    padding: '2px 6px',
    borderRadius: 3,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  gapItem: {
    flexDirection: 'row',
    padding: '6px 0',
    borderBottom: '1px solid #f1f5f9',
  },
})

const severityColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#fef2f2', text: '#dc2626' },
  high: { bg: '#fff7ed', text: '#ea580c' },
  medium: { bg: '#fefce8', text: '#ca8a04' },
  low: { bg: '#f0fdf4', text: '#16a34a' },
}

// ------ Audit Trail Report ------

interface AuditTrailProps extends BrandProps {
  orgName: string
  dateFrom: string
  dateTo: string
  generatedAt: string
  entries: {
    timestamp: string
    actor: string
    actionType: string
    rationale: string
    source: string
  }[]
  totalActions: number
}

export function AuditTrailDocument(props: AuditTrailProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <BrandLogo logo={props.brandLogo} />
          <Text style={styles.title}>Audit Trail Report</Text>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.subtitle}>
            Period: {props.dateFrom} - {props.dateTo} | Generated: {props.generatedAt}
          </Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Total Actions</Text>
            <Text style={styles.metricValue}>{props.totalActions}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Action Log</Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, { width: '15%' }]}>Timestamp</Text>
          <Text style={[styles.headerCell, { width: '15%' }]}>Actor</Text>
          <Text style={[styles.headerCell, { width: '18%' }]}>Action</Text>
          <Text style={[styles.headerCell, { width: '12%' }]}>Source</Text>
          <Text style={[styles.headerCell, { width: '40%' }]}>Rationale</Text>
        </View>

        {props.entries.map((entry, i) => (
          <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, { width: '15%' }]}>{entry.timestamp}</Text>
            <Text style={[styles.cell, { width: '15%' }]}>{entry.actor}</Text>
            <Text style={[styles.cell, { width: '18%' }]}>{entry.actionType}</Text>
            <Text style={[styles.cell, { width: '12%' }]}>{entry.source}</Text>
            <Text style={[styles.cell, { width: '40%' }]}>{entry.rationale}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{props.brandName || 'Identity Radar'} - Audit Trail Report</Text>
          <Text style={styles.footerText}>Confidential</Text>
        </View>
      </Page>
    </Document>
  )
}

// ------ Risk Summary Report ------

interface RiskSummaryProps extends BrandProps {
  orgName: string
  generatedAt: string
  overallRiskScore: number
  identityByTier: Record<string, number>
  topRiskyIdentities: {
    name: string
    type: string
    tier: string
    riskScore: number
  }[]
  violationBySeverity: Record<string, number>
  violationByType: Record<string, number>
  tierViolationCount: number
}

export function RiskSummaryDocument(props: RiskSummaryProps) {
  const totalIdentities = Object.values(props.identityByTier).reduce((s, v) => s + v, 0)
  const totalViolations = Object.values(props.violationBySeverity).reduce((s, v) => s + v, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <BrandLogo logo={props.brandLogo} />
          <Text style={styles.title}>Risk Summary Report</Text>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.subtitle}>Generated: {props.generatedAt}</Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Avg Risk Score (Top 10)</Text>
            <Text style={styles.metricValue}>{props.overallRiskScore}/100</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Total Identities</Text>
            <Text style={styles.metricValue}>{totalIdentities}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Tier Violations</Text>
            <Text style={[styles.metricValue, { color: '#dc2626' }]}>{props.tierViolationCount}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Total Violations</Text>
            <Text style={styles.metricValue}>{totalViolations}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Identity Count by Tier</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, { width: '50%' }]}>AD Tier</Text>
          <Text style={[styles.headerCell, { width: '50%' }]}>Count</Text>
        </View>
        {Object.entries(props.identityByTier).map(([tier, cnt], i) => (
          <View key={tier} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, { width: '50%' }]}>{tierLabel(tier)}</Text>
            <Text style={[styles.cell, { width: '50%' }]}>{cnt}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Top 10 Riskiest Identities</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, { width: '35%' }]}>Name</Text>
          <Text style={[styles.headerCell, { width: '20%' }]}>Type</Text>
          <Text style={[styles.headerCell, { width: '20%' }]}>Tier</Text>
          <Text style={[styles.headerCell, { width: '25%' }]}>Risk Score</Text>
        </View>
        {props.topRiskyIdentities.map((identity, i) => (
          <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, { width: '35%' }]}>{identity.name}</Text>
            <Text style={[styles.cell, { width: '20%' }]}>{identity.type}</Text>
            <Text style={[styles.cell, { width: '20%' }]}>{tierLabel(identity.tier)}</Text>
            <Text style={[styles.cell, { width: '25%' }]}>{identity.riskScore}/100</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Violations by Severity</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, { width: '50%' }]}>Severity</Text>
          <Text style={[styles.headerCell, { width: '50%' }]}>Count</Text>
        </View>
        {Object.entries(props.violationBySeverity).map(([sev, cnt], i) => (
          <View key={sev} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, { width: '50%' }]}>{sev}</Text>
            <Text style={[styles.cell, { width: '50%' }]}>{cnt}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Violations by Type</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, { width: '50%' }]}>Type</Text>
          <Text style={[styles.headerCell, { width: '50%' }]}>Count</Text>
        </View>
        {Object.entries(props.violationByType).map(([t, cnt], i) => (
          <View key={t} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, { width: '50%' }]}>{t.replace(/_/g, ' ')}</Text>
            <Text style={[styles.cell, { width: '50%' }]}>{cnt}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{props.brandName || 'Identity Radar'} - Risk Summary Report</Text>
          <Text style={styles.footerText}>Confidential</Text>
        </View>
      </Page>
    </Document>
  )
}

// ------ Compliance Report ------

interface ComplianceProps extends BrandProps {
  orgName: string
  frameworkName: string
  frameworkKey: string
  generatedAt: string
  dateFrom: string
  dateTo: string
  totalIdentities: number
  openViolations: number
  violationStats: {
    type: string
    severity: string
    count: number
  }[]
  auditEntries: number
}

// Control area mappings per framework
const CONTROL_AREAS: Record<string, { id: string; name: string; description: string }[]> = {
  NCA: [
    { id: 'ECC-1', name: 'Identity Management', description: 'Establish and maintain identity governance program' },
    { id: 'ECC-2', name: 'Access Control', description: 'Implement least privilege and need-to-know access' },
    { id: 'ECC-3', name: 'Privileged Access', description: 'Manage and monitor privileged accounts' },
    { id: 'ECC-4', name: 'Authentication', description: 'Enforce multi-factor authentication' },
    { id: 'ECC-5', name: 'Account Lifecycle', description: 'Manage identity lifecycle from creation to deprovisioning' },
    { id: 'ECC-6', name: 'Access Review', description: 'Regular access certification and recertification' },
    { id: 'ECC-7', name: 'Audit Trail', description: 'Maintain comprehensive audit logs' },
    { id: 'ECC-8', name: 'Separation of Duties', description: 'Enforce SoD controls to prevent conflicts' },
  ],
  SAMA: [
    { id: 'CSF-3.1', name: 'IAM Governance', description: 'Identity and access management governance framework' },
    { id: 'CSF-3.2', name: 'User Access Management', description: 'Formal user access management procedures' },
    { id: 'CSF-3.3', name: 'Privileged Access', description: 'Privileged access management controls' },
    { id: 'CSF-3.4', name: 'Access Reviews', description: 'Periodic access review processes' },
    { id: 'CSF-3.5', name: 'Authentication', description: 'Authentication mechanism controls' },
    { id: 'CSF-3.6', name: 'Service Accounts', description: 'Non-human identity management' },
    { id: 'CSF-3.7', name: 'Monitoring', description: 'Access monitoring and anomaly detection' },
  ],
  PDPL: [
    { id: 'PDPL-1', name: 'Data Access Control', description: 'Control access to personal data' },
    { id: 'PDPL-2', name: 'Purpose Limitation', description: 'Ensure access is limited to stated purposes' },
    { id: 'PDPL-3', name: 'Accountability', description: 'Maintain accountability for data access' },
    { id: 'PDPL-4', name: 'Security Measures', description: 'Implement appropriate security measures' },
    { id: 'PDPL-5', name: 'Audit & Evidence', description: 'Maintain evidence of compliance activities' },
  ],
}

export function ComplianceDocument(props: ComplianceProps) {
  const controls = CONTROL_AREAS[props.frameworkKey] || []
  const totalViolations = props.openViolations

  // Simple compliance scoring based on violation density
  const complianceScore = totalViolations === 0
    ? 100
    : Math.max(0, Math.round(100 - (totalViolations / Math.max(props.totalIdentities, 1)) * 100))

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <BrandLogo logo={props.brandLogo} />
          <Text style={styles.title}>Compliance Report</Text>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.subtitle}>{props.frameworkName}</Text>
          <Text style={styles.subtitle}>
            Period: {props.dateFrom} - {props.dateTo} | Generated: {props.generatedAt}
          </Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Compliance Score</Text>
            <Text style={[styles.metricValue, { color: complianceScore >= 80 ? '#16a34a' : complianceScore >= 60 ? '#ca8a04' : '#dc2626' }]}>
              {complianceScore}%
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Identities Managed</Text>
            <Text style={styles.metricValue}>{props.totalIdentities}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Open Violations</Text>
            <Text style={[styles.metricValue, { color: totalViolations > 0 ? '#dc2626' : '#16a34a' }]}>
              {totalViolations}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Audit Entries</Text>
            <Text style={styles.metricValue}>{props.auditEntries}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Control Area Mapping</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, { width: '12%' }]}>Control</Text>
          <Text style={[styles.headerCell, { width: '20%' }]}>Area</Text>
          <Text style={[styles.headerCell, { width: '48%' }]}>Description</Text>
          <Text style={[styles.headerCell, { width: '20%' }]}>Status</Text>
        </View>
        {controls.map((control, i) => (
          <View key={control.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, { width: '12%', fontFamily: 'Helvetica-Bold' }]}>{control.id}</Text>
            <Text style={[styles.cell, { width: '20%' }]}>{control.name}</Text>
            <Text style={[styles.cell, { width: '48%' }]}>{control.description}</Text>
            <Text style={[styles.cell, { width: '20%', color: totalViolations === 0 ? '#16a34a' : '#ca8a04' }]}>
              {totalViolations === 0 ? 'Compliant' : 'Review Needed'}
            </Text>
          </View>
        ))}

        {props.violationStats.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Open Gaps</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, { width: '40%' }]}>Violation Type</Text>
              <Text style={[styles.headerCell, { width: '30%' }]}>Severity</Text>
              <Text style={[styles.headerCell, { width: '30%' }]}>Count</Text>
            </View>
            {props.violationStats.map((v, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.cell, { width: '40%' }]}>{v.type}</Text>
                <Text style={[styles.cell, { width: '30%' }]}>{v.severity}</Text>
                <Text style={[styles.cell, { width: '30%' }]}>{v.count}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Recommendations</Text>
        <View style={{ padding: 8, backgroundColor: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
          {totalViolations > 0 ? (
            <>
              <Text style={[styles.cell, { marginBottom: 4 }]}>1. Address all open policy violations, prioritizing critical and high severity items.</Text>
              <Text style={[styles.cell, { marginBottom: 4 }]}>2. Review and remediate tier violations to ensure AD tiering compliance.</Text>
              <Text style={[styles.cell, { marginBottom: 4 }]}>3. Complete pending access certifications within the policy period.</Text>
              <Text style={[styles.cell, { marginBottom: 4 }]}>4. Ensure all non-human identities have assigned owners.</Text>
              <Text style={styles.cell}>5. Enable MFA for all privileged accounts.</Text>
            </>
          ) : (
            <Text style={[styles.cell, { color: '#16a34a' }]}>
              No open violations detected. Continue to monitor and maintain current security posture.
            </Text>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{props.brandName || 'Identity Radar'} - {props.frameworkName}</Text>
          <Text style={styles.footerText}>Confidential</Text>
        </View>
      </Page>
    </Document>
  )
}
