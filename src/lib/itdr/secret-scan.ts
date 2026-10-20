// Exposed-secrets / secret-sprawl scan.
//
// Detects cleartext credentials sitting in shared locations an attacker can read — the classic
// AD examples being GPP cpassword in SYSVOL, passwords embedded in logon scripts, and connection
// strings in shares. Operates over scanned file artifacts (path + content sample) and emits
// exposure_findings (category 'secret').
//
// Pure functions: the scanner supplies the artifacts; this module finds the secrets.

import type { ExposureSeverity, RawFinding } from './exposure-types'

export interface FileArtifact {
  path: string // e.g. \\\\corp.local\\SYSVOL\\corp.local\\Policies\\{GUID}\\...\\Groups.xml
  content: string
  share?: string
}

interface SecretRule {
  id: string
  title: string
  severity: ExposureSeverity
  // returns the matched secret snippet(s), or [] if none
  match: (a: FileArtifact) => string[]
}

function rx(pattern: RegExp): (a: FileArtifact) => string[] {
  return (a) => {
    const out: string[] = []
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(a.content)) !== null) {
      out.push((m[1] ?? m[0]).slice(0, 120))
      if (!re.global) break
    }
    return out
  }
}

const RULES: SecretRule[] = [
  // GPP cpassword (Group Policy Preferences) — AES key is public, so this is effectively cleartext.
  {
    id: 'gpp_cpassword',
    title: 'GPP cpassword in SYSVOL (decryptable with the public Microsoft AES key)',
    severity: 'critical',
    match: rx(/cpassword\s*=\s*"([^"]+)"/i),
  },
  // Cleartext password assignments in scripts / config.
  {
    id: 'cleartext_password',
    title: 'Cleartext password in a shared file',
    severity: 'high',
    match: rx(/(?:password|passwd|pwd)\s*[:=]\s*["']?([^"'\s]{4,})/i),
  },
  // Connection strings with embedded credentials.
  {
    id: 'connection_string_secret',
    title: 'Connection string with embedded credentials',
    severity: 'high',
    match: rx(/(?:Password|Pwd)=([^;"\s]{4,})/i),
  },
  // net use / runas with a password on the command line.
  {
    id: 'script_credential',
    title: 'Credential passed on a command line in a logon script',
    severity: 'medium',
    match: rx(/net\s+use\b[^\n]*\/user:\S+\s+(\S+)/i),
  },
  // Private key material left in a share.
  {
    id: 'private_key',
    title: 'Private key material in a shared file',
    severity: 'high',
    match: rx(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/),
  },
]

function impactFor(): 'credential_theft' {
  return 'credential_theft'
}

export function scanArtifact(a: FileArtifact): RawFinding[] {
  const out: RawFinding[] = []
  for (const rule of RULES) {
    const hits = rule.match(a)
    if (hits.length > 0) {
      out.push({
        category: 'secret',
        findingType: rule.id,
        subjectName: a.path,
        subjectRef: a.path,
        severity: rule.severity,
        impact: impactFor(),
        title: `${rule.title} — ${a.path}`,
        evidence: { share: a.share, matches: hits, mitre: rule.id === 'gpp_cpassword' ? 'T1552.006' : 'T1552.001' },
      })
    }
  }
  return out
}

export function runSecretScan(artifacts: FileArtifact[]): RawFinding[] {
  return artifacts.flatMap(scanArtifact)
}
