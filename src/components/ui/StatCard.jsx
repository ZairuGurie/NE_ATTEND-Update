/**
 * StatCard Component (Phase 3)
 * Dashboard statistics card with animated numbers and trend indicators
 *
 * Usage:
 *   <StatCard
 *     title="Total Students"
 *     value={150}
 *     icon="bi-people-fill"
 *     trend={{ value: 12, direction: 'up' }}
 *     variant="primary"
 *   />
 */

import React, { useState, useEffect } from 'react'
import { neutral, brand, status as statusColors } from '../../utils/colors'
import { shadows, coloredShadows } from '../../utils/shadows'

// Variant configurations
const variants = {
  default: {
    bg: neutral.bgSurface,
    iconBg: neutral.bgMuted,
    iconColor: neutral.textSecondary,
    valueColor: neutral.textStrong || neutral.textPrimary,
    shadow: shadows.sm,
    hoverShadow: shadows.md,
    border: neutral.border
  },
  primary: {
    bg: neutral.bgSurface,
    iconBg: `rgba(35, 34, 92, 0.1)`,
    iconColor: brand.secondary,
    valueColor: brand.secondary,
    shadow: shadows.sm,
    hoverShadow: coloredShadows.brand,
    border: `rgba(35, 34, 92, 0.2)`
  },
  success: {
    bg: statusColors.present.bg,
    iconBg: `rgba(34, 197, 94, 0.15)`,
    iconColor: statusColors.present.border,
    valueColor: statusColors.present.border,
    shadow: shadows.sm,
    hoverShadow: coloredShadows.present,
    border: statusColors.present.border
  },
  warning: {
    bg: statusColors.late.bg,
    iconBg: `rgba(245, 158, 11, 0.15)`,
    iconColor: statusColors.late.border,
    valueColor: statusColors.late.text,
    shadow: shadows.sm,
    hoverShadow: coloredShadows.late,
    border: statusColors.late.border
  },
  danger: {
    bg: statusColors.absent.bg,
    iconBg: `rgba(239, 68, 68, 0.15)`,
    iconColor: statusColors.absent.border,
    valueColor: statusColors.absent.text,
    shadow: shadows.sm,
    hoverShadow: coloredShadows.absent,
    border: statusColors.absent.border
  },
  info: {
    bg: statusColors.pending.bg,
    iconBg: `rgba(59, 130, 246, 0.15)`,
    iconColor: statusColors.pending.border,
    valueColor: statusColors.pending.text,
    shadow: shadows.sm,
    hoverShadow: coloredShadows.pending,
    border: statusColors.pending.border
  }
}

/**
 * Animated number counter
 */
const AnimatedNumber = ({ value, duration = 1000, formatValue }) => {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const startValue = displayValue
    const endValue = typeof value === 'number' ? value : 0
    const startTime = performance.now()

    const animate = currentTime => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startValue + (endValue - startValue) * easeOut

      setDisplayValue(Math.round(current))

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  const formatted = formatValue
    ? formatValue(displayValue)
    : displayValue.toLocaleString()
  return <span>{formatted}</span>
}

/**
 * Trend indicator
 */
const TrendIndicator = ({ value, direction, showValue = true }) => {
  const isUp = direction === 'up'
  const color = isUp ? statusColors.present.text : statusColors.absent.text
  const bgColor = isUp ? statusColors.present.bg : statusColors.absent.bg
  const icon = isUp ? 'bi-arrow-up' : 'bi-arrow-down'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bgColor
      }}
    >
      <i className={icon} style={{ fontSize: 10 }} />
      {showValue && `${Math.abs(value)}%`}
    </span>
  )
}

/**
 * StatCard Component
 * @param {Object} props
 * @param {string} props.title - Card title/label
 * @param {number|string} props.value - Main statistic value
 * @param {string} props.subtitle - Optional subtitle/description
 * @param {string} props.icon - Bootstrap icon class
 * @param {'default'|'primary'|'success'|'warning'|'danger'|'info'} props.variant - Color variant
 * @param {Object} props.trend - Trend indicator { value: number, direction: 'up'|'down' }
 * @param {boolean} props.animated - Animate value on mount
 * @param {Function} props.formatValue - Custom value formatter
 * @param {boolean} props.loading - Show loading skeleton
 * @param {boolean} props.compact - Smaller padding
 * @param {Function} props.onClick - Click handler
 * @param {Object} props.style - Additional styles
 */
const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
  trend,
  animated = true,
  formatValue,
  loading = false,
  compact = false,
  onClick,
  style = {}
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const config = variants[variant] || variants.default
  const padding = compact ? 16 : 24

  // Loading skeleton
  if (loading) {
    return (
      <div
        style={{
          background: neutral.bgSurface,
          borderRadius: 12,
          padding,
          border: `1px solid ${neutral.borderLight}`,
          boxShadow: shadows.sm,
          ...style
        }}
      >
        <div
          style={{
            width: 80,
            height: 12,
            background: `linear-gradient(90deg, ${neutral.bgMuted} 0%, ${neutral.bgHover} 50%, ${neutral.bgMuted} 100%)`,
            backgroundSize: '200% 100%',
            borderRadius: 4,
            animation: 'shimmer 1.5s ease-in-out infinite',
            marginBottom: 12
          }}
        />
        <div
          style={{
            width: 100,
            height: 32,
            background: `linear-gradient(90deg, ${neutral.bgMuted} 0%, ${neutral.bgHover} 50%, ${neutral.bgMuted} 100%)`,
            backgroundSize: '200% 100%',
            borderRadius: 4,
            animation: 'shimmer 1.5s ease-in-out infinite'
          }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: config.bg,
        borderRadius: 12,
        padding,
        border: `2px solid ${config.border}`,
        boxShadow: isHovered && onClick ? config.hoverShadow : config.shadow,
        transform: isHovered && onClick ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'center',
        ...style
      }}
    >
      {/* Icon */}
      {icon && (
        <div
          style={{
            width: compact ? 40 : 48,
            height: compact ? 40 : 48,
            borderRadius: 12,
            background: config.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto'
          }}
        >
          <i
            className={icon}
            style={{
              fontSize: compact ? 20 : 24,
              color: config.iconColor
            }}
          />
        </div>
      )}

      {/* Value */}
      <div
        style={{
          fontSize: compact ? 28 : 36,
          fontWeight: 800,
          color: config.valueColor,
          marginBottom: 4,
          lineHeight: 1.2
        }}
      >
        {animated && typeof value === 'number' ? (
          <AnimatedNumber value={value} formatValue={formatValue} />
        ) : formatValue ? (
          formatValue(value)
        ) : (
          value
        )}
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: compact ? 13 : 14,
          fontWeight: 600,
          color:
            variant === 'default' ? neutral.textSecondary : config.valueColor,
          marginBottom: trend ? 8 : 0
        }}
      >
        {title}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div
          style={{
            fontSize: 12,
            color: neutral.textMuted,
            marginTop: 4
          }}
        >
          {subtitle}
        </div>
      )}

      {/* Trend */}
      {trend && (
        <div style={{ marginTop: 8 }}>
          <TrendIndicator value={trend.value} direction={trend.direction} />
        </div>
      )}
    </div>
  )
}

// Convenience components
export const PrimaryStatCard = props => (
  <StatCard variant='primary' {...props} />
)
export const SuccessStatCard = props => (
  <StatCard variant='success' {...props} />
)
export const WarningStatCard = props => (
  <StatCard variant='warning' {...props} />
)
export const DangerStatCard = props => <StatCard variant='danger' {...props} />

export { TrendIndicator, AnimatedNumber }
export default StatCard
