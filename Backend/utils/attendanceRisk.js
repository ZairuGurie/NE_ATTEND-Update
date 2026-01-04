/**
 * Risk Assessment Configuration
 *
 * Risk Score Calculation:
 * - Absence Component: (absences / total sessions) × 100 × absenceWeight
 * - Tardiness Component: min(tardinessCount × tardyWeight, maxTardyContribution)
 * - Final Score: absenceComponent + tardyComponent (clamped 0-100)
 *
 * Risk Bands:
 * - LOW: score < 40 (Good standing, minimal intervention needed)
 * - MEDIUM: 40 ≤ score < 70 (Warning level, monitoring recommended)
 * - HIGH: score ≥ 70 (Critical level, immediate intervention required)
 *
 * Basis: BOR Resolution No. 31, s. 2018 - Attendance Policy
 */
const RISK_DEFAULTS = {
  absenceWeight: 1,
  tardyWeight: 5,
  maxTardyContribution: 30,
  mediumThreshold: 40,
  highThreshold: 70
}

function clampScore (value) {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function calculateRiskScore (stats = {}, overrides = {}) {
  const config = { ...RISK_DEFAULTS, ...overrides }
  const totalSessions = Math.max(stats.totalSessions || 0, 0)
  if (totalSessions === 0) {
    return 0
  }

  const absentCount = Math.max(stats.absentCount || 0, 0)
  const tardinessCount = Math.max(stats.tardinessCount || 0, 0)

  const absenceRatio = Math.min(1, absentCount / totalSessions)
  const absenceComponent = absenceRatio * 100 * config.absenceWeight

  const tardyComponent = Math.min(
    tardinessCount * config.tardyWeight,
    config.maxTardyContribution
  )

  return clampScore(absenceComponent + tardyComponent)
}

function categorizeRisk (score, overrides = {}) {
  const config = { ...RISK_DEFAULTS, ...overrides }
  if (score >= config.highThreshold) return 'high'
  if (score >= config.mediumThreshold) return 'medium'
  return 'low'
}

function buildRiskExplanation (stats = {}, score) {
  const absent = stats.absentCount || 0
  const tardy = stats.tardinessCount || 0
  const totalSessions = stats.totalSessions || 0
  const fragments = []

  // Calculate absence percentage for context
  const absencePercent =
    totalSessions > 0 ? Math.round((absent / totalSessions) * 100) : 0

  fragments.push(
    `${absent} absence${
      absent === 1 ? '' : 's'
    } (${absencePercent}%) across ${totalSessions} session${
      totalSessions === 1 ? '' : 's'
    }`
  )

  if (tardy > 0) {
    // Note: 3 tardiness = 1 absence equivalent per BOR policy
    const tardyEquivalent = Math.floor(tardy / 3)
    fragments.push(
      `${tardy} tardy${tardy === 1 ? '' : ' instances'}${
        tardyEquivalent > 0 ? ` (≈${tardyEquivalent} absence equiv.)` : ''
      }`
    )
  }

  // Add risk level context
  const riskLevel = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW'
  fragments.push(`Risk: ${riskLevel} (${score}/100)`)

  return fragments.join(' | ')
}

function summarizeRisk (stats = {}, overrides = {}) {
  const score = calculateRiskScore(stats, overrides)
  const band = categorizeRisk(score, overrides)
  return {
    score,
    band,
    explanation: buildRiskExplanation(stats, score)
  }
}

module.exports = {
  RISK_DEFAULTS,
  calculateRiskScore,
  categorizeRisk,
  buildRiskExplanation,
  summarizeRisk
}
