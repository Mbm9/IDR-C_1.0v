# Risk Scoring Reference

> The 11-factor risk scoring formula with exact weights, computation logic, and interpretation.

## Formula

The risk score is a deterministic number from 0 to 100, computed from 11 weighted factors:

```
risk_score = (
  tier_violation      * 22 +   // Boolean: 0 or 1
  privilege_level     * 15 +   // Scale: 0 (Tier 2), 0.5 (Tier 1), 0.75 (Top Tier), 1 (Tier 0)
  shadow_admin        * 12 +   // Boolean: 0 or 1
  dormancy_days       * 10 +   // Scale: min(1, days / 180)
  violation_count     * 10 +   // Scale: min(1, count / 5)
  attack_path_count   * 10 +   // Scale: min(1, count / 3)
  missing_mfa         *  8 +   // Boolean: 0 or 1
  peer_anomaly_score  *  4 +   // Scale: min(1, score / 5)
  supply_chain_risk   *  4 +   // Boolean: 0 or 1
  certification_over  *  3 +   // Boolean: 0 or 1
  orphaned_nhi        *  2     // Boolean: 0 or 1
)
```

The total is clamped to a maximum of 100.

## Factor Details

| Factor | Weight | Type | Description |
|--------|--------|------|-------------|
| Tier Violation | 22 | Boolean | Identity has cross-tier access (effective tier > classified tier) |
| Privilege Level | 15 | Scale | 1.0 for Tier 0, 0.75 for Top Tier, 0.5 for Tier 1, 0 for Tier 2 |
| Shadow Admin | 12 | Boolean | Identity has admin-equivalent access without being in an admin group |
| Dormancy | 10 | Scale | Days since last logon, normalized to 180 days (6 months = max) |
| Violation Count | 10 | Scale | Open violation count, normalized to 5 (5+ violations = max) |
| Attack Paths | 10 | Scale | Number of attack paths originating from this identity, normalized to 3 |
| Missing MFA | 8 | Boolean | No MFA enabled on any account |
| Peer Anomaly | 4 | Scale | Entitlement deviation from peer group median, normalized to 5 |
| Supply Chain Risk | 4 | Boolean | Human identity whose departure would orphan critical NHIs |
| Certification Overdue | 3 | Boolean | At least one entitlement with expired certification |
| Orphaned NHI | 2 | Boolean | Non-human identity with no owner or disabled owner |

## Example Calculation

Consider a service account (Tier 1) with:
- Tier violation: yes (accesses Tier 0 resources) = 22
- Privilege level: 0.5 (Tier 1) = 7.5
- Shadow admin: no = 0
- Dormancy: 0 days (actively used) = 0
- Violation count: 3 = min(1, 3/5) * 10 = 6
- Attack paths: 2 = min(1, 2/3) * 10 = 6.67
- Missing MFA: yes = 8
- Peer anomaly: 0 = 0
- Supply chain risk: no = 0
- Certification overdue: yes = 3
- Orphaned NHI: no = 0

**Total**: 22 + 7.5 + 0 + 0 + 6 + 6.67 + 8 + 0 + 0 + 3 + 0 = **53** (rounded) -- Medium risk

## Score Interpretation

| Range | Level | Color | Action |
|-------|-------|-------|--------|
| 0-29 | Low | Green | Monitor during regular reviews |
| 30-59 | Medium | Yellow | Review at next certification cycle |
| 60-79 | High | Orange | Prioritize for remediation |
| 80-100 | Critical | Red | Immediate action required |

## Recalculation Schedule

Risk scores are recalculated:
- Every 6 hours by the automated risk scorer
- Immediately after a kinetic action (certify, revoke, update tier)
- On demand via the AI analysis trigger

## Next Steps

- [Tier Classification](./tier-classification.md)
- [AI Analysis](../user-guide/ai-analysis.md)
- [Policy Violations](../user-guide/violations.md)
