/**
 * ProgressBar Component (Phase 2)
 * Animated progress bar with multiple variants and labels
 *
 * Usage:
 *   <ProgressBar value={75} />
 *   <ProgressBar value={50} variant="success" showLabel />
 *   <ProgressBar value={30} max={50} animated striped />
 */

import React from 'react'
import {
  neutral,
  interactive,
  status as statusColors
} from '../../utils/colors'

// Variant color configurations
const variants = {
  primary: {
    bg: interactive.primary,
    track: neutral.bgMuted
  },
  success: {
    bg: statusColors.present.border,
    track: statusColors.present.bg
  },
  warning: {
    bg: statusColors.late.border,
    track: statusColors.late.bg
  },
  danger: {
    bg: statusColors.absent.border,
    track: statusColors.absent.bg
  },
  info: {
    bg: statusColors.pending.border,
    track: statusColors.pending.bg
  }
}

// Size configurations
const sizes = {
  xs: { height: 4, fontSize: 10, borderRadius: 2 },
  sm: { height: 8, fontSize: 11, borderRadius: 4 },
  md: { height: 12, fontSize: 12, borderRadius: 6 },
  lg: { height: 20, fontSize: 14, borderRadius: 10 }
}

/**
 * ProgressBar Component
 * @param {Object} props
 * @param {number} props.value - Current progress value
 * @param {number} props.max - Maximum value (default: 100)
 * @param {'primary'|'success'|'warning'|'danger'|'info'} props.variant - Color variant
 * @param {'xs'|'sm'|'md'|'lg'} props.size - Size variant
 * @param {boolean} props.showLabel - Show percentage label
 * @param {string} props.label - Custom label (overrides percentage)
 * @param {boolean} props.animated - Enable animation on bar
 * @param {boolean} props.striped - Show striped pattern
 * @param {boolean} props.indeterminate - Show indeterminate (loading) state
 * @param {Object} props.style - Additional container styles
 */
const ProgressBar = ({
  value = 0,
  max = 100,
  variant = 'primary',
  size = 'md',
  showLabel = false,
  label,
  animated = false,
  striped = false,
  indeterminate = false,
  style = {}
}) => {
  // Calculate percentage
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const variantConfig = variants[variant] || variants.primary
  const sizeConfig = sizes[size] || sizes.md

  // Determine display label
  const displayLabel =
    label !== undefined ? label : `${Math.round(percentage)}%`

  // Striped gradient pattern
  const stripedGradient = striped
    ? `repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(255,255,255,0.15) 10px,
        rgba(255,255,255,0.15) 20px
      )`
    : 'none'

  return (
    <div
      style={{
        width: '100%',
        ...style
      }}
      role='progressbar'
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`Progress: ${displayLabel}`}
    >
      {/* Label above bar */}
      {showLabel && size !== 'xs' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
            fontSize: sizeConfig.fontSize,
            color: neutral.textSecondary,
            fontWeight: 500
          }}
        >
          <span>{displayLabel}</span>
          {!label && (
            <span style={{ color: neutral.textMuted }}>
              {value}/{max}
            </span>
          )}
        </div>
      )}

      {/* Track */}
      <div
        style={{
          width: '100%',
          height: sizeConfig.height,
          background: variantConfig.track,
          borderRadius: sizeConfig.borderRadius,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Bar */}
        <div
          style={{
            width: indeterminate ? '30%' : `${percentage}%`,
            height: '100%',
            background: variantConfig.bg,
            backgroundImage: stripedGradient,
            borderRadius: sizeConfig.borderRadius,
            transition: indeterminate
              ? 'none'
              : 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            animation: indeterminate
              ? 'progressIndeterminate 1.5s ease-in-out infinite'
              : animated && striped
              ? 'progressStriped 1s linear infinite'
              : 'none',
            position: indeterminate ? 'absolute' : 'relative'
          }}
        >
          {/* Inner label for large sizes */}
          {showLabel && size === 'lg' && !indeterminate && (
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: sizeConfig.fontSize - 2,
                fontWeight: 600,
                color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                whiteSpace: 'nowrap'
              }}
            >
              {displayLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Add keyframes to document if not exists
if (typeof document !== 'undefined') {
  const styleId = 'progress-bar-animations'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes progressIndeterminate {
        0% { left: -30%; }
        100% { left: 100%; }
      }
      @keyframes progressStriped {
        from { background-position: 40px 0; }
        to { background-position: 0 0; }
      }
    `
    document.head.appendChild(style)
  }
}

// Convenience components
export const SuccessProgress = props => (
  <ProgressBar variant='success' {...props} />
)
export const WarningProgress = props => (
  <ProgressBar variant='warning' {...props} />
)
export const DangerProgress = props => (
  <ProgressBar variant='danger' {...props} />
)

export default ProgressBar
