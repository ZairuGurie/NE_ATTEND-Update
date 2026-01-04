/**
 * RiskSummaryCard Component
 *
 * Displays risk level badges (High/Medium/Low) with consistent styling
 * across Dashboard, History, and AttendanceInsights pages.
 *
 * @param {Object} props
 * @param {'high'|'medium'|'low'|'default'} props.level - Risk level
 * @param {number} props.count - Count to display
 * @param {'full'|'compact'} props.variant - Card size variant
 * @param {Function} props.onClick - Optional click handler
 * @param {string} props.className - Optional CSS class
 * @param {Object} props.style - Optional inline styles
 *
 * Usage:
 *   <RiskSummaryCard level="high" count={5} />
 *   <RiskSummaryCard level="medium" count={3} variant="compact" />
 */

import React from 'react'
import { riskColorMap } from '../../utils/colors'

// Standardized styling for risk cards
const CARD_STYLES = {
  full: {
    padding: '10px 16px',
    fontSize: 24,
    minWidth: 160,
    flex: '1 1 180px'
  },
  compact: {
    padding: '6px 12px',
    fontSize: 18,
    minWidth: 120,
    flex: 'none'
  }
}

const RISK_LABELS = {
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk'
}

const RiskSummaryCard = ({
  level = 'default',
  count = 0,
  variant = 'full',
  onClick,
  className = '',
  style = {}
}) => {
  const palette = riskColorMap[level] || riskColorMap.default
  const label = RISK_LABELS[level] || 'Unknown'
  const variantStyle = CARD_STYLES[variant] || CARD_STYLES.full

  return (
    <div
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyPress={onClick ? e => e.key === 'Enter' && onClick() : undefined}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: variantStyle.padding,
        borderRadius: 12,
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        fontWeight: 700,
        minWidth: variantStyle.minWidth,
        flex: variantStyle.flex,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        ...style
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: variantStyle.fontSize }}>{count}</span>
    </div>
  )
}

/**
 * RiskSummaryRow Component
 *
 * Displays a row of risk cards (High, Medium, Low) with consistent styling.
 *
 * Usage:
 *   <RiskSummaryRow counts={{ high: 5, medium: 3, low: 10 }} />
 */
export const RiskSummaryRow = ({
  counts = {},
  variant = 'full',
  gap = 12,
  style = {}
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap,
        ...style
      }}
    >
      {['high', 'medium', 'low'].map(level => (
        <RiskSummaryCard
          key={level}
          level={level}
          count={counts[level] || 0}
          variant={variant}
        />
      ))}
    </div>
  )
}

export default RiskSummaryCard
