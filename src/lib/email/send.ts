import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
})

const FROM_ADDRESS = process.env.SMTP_FROM || 'Identity Radar <noreply@identityradar.io>'

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Identity Radar</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#0f172a;padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#38bdf8;font-size:18px;font-weight:700;">Identity Radar</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:24px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                Identity Radar - IAM Posture Management Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  try {
    if (!process.env.SMTP_HOST) {
      console.warn('[Email] SMTP not configured, skipping email to:', to)
      return false
    }

    await transporter.sendMail({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text: text || subject,
    })
    return true
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return false
  }
}

// --- Templates ---

export function violationDetectedEmail(params: {
  identityName: string
  violationType: string
  severity: string
  detectedAt: string
  link: string
}): { subject: string; html: string } {
  const severityColor: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
  }
  const color = severityColor[params.severity] || '#64748b'

  return {
    subject: `[${params.severity.toUpperCase()}] Policy Violation Detected - ${params.identityName}`,
    html: baseLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Policy Violation Detected</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#64748b;font-size:13px;">Identity</span><br>
            <span style="color:#0f172a;font-size:14px;font-weight:600;">${params.identityName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#64748b;font-size:13px;">Violation Type</span><br>
            <span style="color:#0f172a;font-size:14px;">${params.violationType.replace(/_/g, ' ')}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#64748b;font-size:13px;">Severity</span><br>
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;background-color:${color}20;color:${color};font-size:13px;font-weight:600;">${params.severity.toUpperCase()}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;">
            <span style="color:#64748b;font-size:13px;">Detected</span><br>
            <span style="color:#0f172a;font-size:14px;">${params.detectedAt}</span>
          </td>
        </tr>
      </table>
      <a href="${params.link}" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View Violation</a>
    `),
  }
}

export function certificationDueEmail(params: {
  identityName: string
  entitlementCount: number
  dueDate: string
  link: string
}): { subject: string; html: string } {
  return {
    subject: `Certification Due - ${params.identityName} (${params.entitlementCount} entitlements)`,
    html: baseLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Access Certification Due</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#475569;">
        Access certification is required for the following identity. Please review and certify or revoke entitlements before the due date.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#64748b;font-size:13px;">Identity</span><br>
            <span style="color:#0f172a;font-size:14px;font-weight:600;">${params.identityName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#64748b;font-size:13px;">Entitlements to Review</span><br>
            <span style="color:#0f172a;font-size:14px;">${params.entitlementCount}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;">
            <span style="color:#64748b;font-size:13px;">Due Date</span><br>
            <span style="color:#0f172a;font-size:14px;font-weight:600;">${params.dueDate}</span>
          </td>
        </tr>
      </table>
      <a href="${params.link}" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Review Certifications</a>
    `),
  }
}

export function syncFailedEmail(params: {
  sourceName: string
  sourceType: string
  errorMessage: string
  failedAt: string
  link: string
}): { subject: string; html: string } {
  return {
    subject: `Integration Sync Failed - ${params.sourceName}`,
    html: baseLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Integration Sync Failed</h2>
      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;color:#991b1b;font-weight:600;">Sync Error</p>
        <p style="margin:4px 0 0;font-size:13px;color:#b91c1c;">${params.errorMessage}</p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#64748b;font-size:13px;">Source</span><br>
            <span style="color:#0f172a;font-size:14px;font-weight:600;">${params.sourceName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#64748b;font-size:13px;">Type</span><br>
            <span style="color:#0f172a;font-size:14px;">${params.sourceType.replace(/_/g, ' ')}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;">
            <span style="color:#64748b;font-size:13px;">Failed At</span><br>
            <span style="color:#0f172a;font-size:14px;">${params.failedAt}</span>
          </td>
        </tr>
      </table>
      <a href="${params.link}" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View Integration</a>
    `),
  }
}
