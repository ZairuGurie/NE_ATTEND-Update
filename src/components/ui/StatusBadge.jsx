/**
 * StatusBadge Component (Phase 2 Enhanced)
 * Reusable status badge/pill component with animations and enhanced styling
 *
 * Usage:
 *   <StatusBadge status="present">Present</StatusBadge>
 *   <StatusBadge status="absent" size="sm" pulse />
 *   <StatusBadge status="host" showIcon animated />
 */

import React from 'react'
import { getStatusStyle, status as statusColors } from '../../utils/colors'

// Status icons mapping
const statusIcons = {
  present: 'bi-check-circle-fill',
  absent: 'bi-x-circle-fill',
  late: 'bi-clock-fill',
  pending: 'bi-hourglass-split',
  left: 'bi-box-arrow-right',
  host: 'bi-star-fill',
  verified: 'bi-person-check-fill',
  guest: 'bi-person-dash-fill',
  active: 'bi-broadcast',
  inactive: 'bi-pause-circle',
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill'
}

// Status labels mapping
const statusLabels = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  pending: 'Pending',
  left: 'Left',
  host: 'Host',
  verified: 'Verified',
  guest: 'Guest',
  active: 'Active',
  inactive: 'Inactive',
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info'
}

// Size configurations - enhanced with minHeight for touch targets
const sizeStyles = {
  xs: {
    padding: '2px 6px',
    fontSize: 10,
    iconSize: 10,
    gap: 4,
    borderRadius: 4,
    minHeight: 20
  },
  sm: {
    padding: '4px 10px',
    fontSize: 11,
    iconSize: 12,
    gap: 5,
    borderRadius: 6,
    minHeight: 24
  },
  md: {
    padding: '6px 12px',
    fontSize: 12,
    iconSize: 14,
    gap: 6,
    borderRadius: 8,
    minHeight: 28
  },
  lg: {
    padding: '8px 16px',
    fontSize: 14,
    iconSize: 16,
    gap: 8,
    borderRadius: 10,
    minHeight: 36
  }
}

/**
 * StatusBadge Component
 * @param {Object} props
 * @param {string} props.status - Status type
 * @param {React.ReactNode} props.children - Custom label content
 * @param {'xs'|'sm'|'md'|'lg'} props.size - Badge size
 * @param {boolean} props.showIcon - Show status icon
 * @param {boolean} props.iconOnly - Show only icon (no label)
 * @param {boolean} props.pill - Use pill shape (rounded)
 * @param {boolean} props.pulse - Enable pulse animation
 * @param {boolean} props.animated - Enable entrance animation
 * @param {boolean} props.outlined - Use outlined variant
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.style - Additional inline styles
 */
const StatusBadge = ({
  status = 'pending',
  children,
  size = 'md',
  showIcon = false,
  iconOnly = false,
  pill = true,
  pulse = false,
  animated = false,
  outlined = false,
  className = '',
  style = {}
}) => {
  const normalizedStatus = status?.toLowerCase() || 'pending'
  const baseStatusStyle = getStatusStyle(normalizedStatus)
  const sizeConfig = sizeStyles[size] || sizeStyles.md
  const icon = statusIcons[normalizedStatus] || statusIcons.pending
  const label = children || statusLabels[normalizedStatus] || status

  // Get outlined styles if needed
  const getStyles = () => {
    if (outlined) {
      const statusConfig =
        statusColors[normalizedStatus] || statusColors.pending
      return {
        background: 'transparent',
        color: statusConfig.text,
        border: `2px solid ${statusConfig.border}`
      }
    }
    return baseStatusStyle
  }

  // Determine animation
  const getAnimation = () => {
    if (pulse && !animated) return 'statusPulse 2s ease-in-out infinite'
    if (animated && !pulse) return 'scaleIn 0.2s ease-out'
    if (pulse && animated)
      return 'scaleIn 0.2s ease-out, statusPulse 2s ease-in-out 0.2s infinite'
    return 'none'
  }

  return (
    <span
      className={`status-badge status-${normalizedStatus} ${className}`}
      role='status'
      aria-label={`Status: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: iconOnly ? 0 : sizeConfig.gap,
        padding: iconOnly ? sizeConfig.gap : sizeConfig.padding,
        fontSize: sizeConfig.fontSize,
        fontWeight: 600,
        borderRadius: pill ? 999 : sizeConfig.borderRadius,
        whiteSpace: 'nowrap',
        textTransform: 'capitalize',
        minHeight: sizeConfig.minHeight,
        transition: 'all 0.2s ease',
        animation: getAnimation(),
        ...getStyles(),
        ...style
      }}
    >
      {(showIcon || iconOnly) && icon && (
        <i
          className={icon}
          style={{
            fontSize: sizeConfig.iconSize,
            flexShrink: 0
          }}
        />
      )}
      {!iconOnly && label}
    </span>
  )
}

// Convenience components for specific statuses
export const PresentBadge = props => <StatusBadge status='present' {...props} />
export const AbsentBadge = props => <StatusBadge status='absent' {...props} />
export const LateBadge = props => <StatusBadge status='late' {...props} />
export const PendingBadge = props => <StatusBadge status='pending' {...props} />
export const HostBadge = props => <StatusBadge status='host' {...props} />
export const VerifiedBadge = props => (
  <StatusBadge status='verified' {...props} />
)
export const GuestBadge = props => <StatusBadge status='guest' {...props} />

export default StatusBadge
