/**
 * LiveIndicator Component (Phase 2)
 * Visual indicator for real-time/live status with pulsing animation
 *
 * Usage:
 *   <LiveIndicator isLive />
 *   <LiveIndicator isLive label="Broadcasting" size="lg" />
 *   <LiveIndicator isLive={false} label="Offline" />
 */

import React from 'react'
import { status as statusColors, neutral } from '../../utils/colors'

// Size configurations
const sizes = {
  sm: {
    dotSize: 6,
    fontSize: 11,
    padding: '4px 10px',
    gap: 6
  },
  md: {
    dotSize: 8,
    fontSize: 12,
    padding: '6px 12px',
    gap: 8
  },
  lg: {
    dotSize: 10,
    fontSize: 14,
    padding: '8px 16px',
    gap: 10
  }
}

// Variant configurations
const variants = {
  live: {
    dotColor: statusColors.present.border,
    bgColor: statusColors.present.bg,
    textColor: statusColors.present.text,
    pulseColor: 'rgba(34, 197, 94, 0.4)'
  },
  offline: {
    dotColor: neutral.textDisabled,
    bgColor: neutral.bgMuted,
    textColor: neutral.textMuted,
    pulseColor: 'transparent'
  },
  recording: {
    dotColor: statusColors.absent.border,
    bgColor: statusColors.absent.bg,
    textColor: statusColors.absent.text,
    pulseColor: 'rgba(239, 68, 68, 0.4)'
  },
  connecting: {
    dotColor: statusColors.late.border,
    bgColor: statusColors.late.bg,
    textColor: statusColors.late.text,
    pulseColor: 'rgba(245, 158, 11, 0.4)'
  },
  syncing: {
    dotColor: statusColors.pending.border,
    bgColor: statusColors.pending.bg,
    textColor: statusColors.pending.text,
    pulseColor: 'rgba(59, 130, 246, 0.4)'
  }
}

/**
 * LiveIndicator Component
 * @param {Object} props
 * @param {boolean} props.isLive - Whether the indicator shows live/active state
 * @param {string} props.label - Text label (defaults to 'Live' or 'Offline')
 * @param {'sm'|'md'|'lg'} props.size - Size variant
 * @param {'live'|'offline'|'recording'|'connecting'|'syncing'} props.variant - Visual variant
 * @param {boolean} props.showLabel - Whether to show the label text
 * @param {boolean} props.pulse - Whether to show pulse animation (defaults to true when live)
 * @param {Object} props.style - Additional styles
 */
const LiveIndicator = ({
  isLive = false,
  label,
  size = 'md',
  variant,
  showLabel = true,
  pulse,
  style = {}
}) => {
  // Determine variant based on isLive if not explicitly provided
  const activeVariant = variant || (isLive ? 'live' : 'offline')
  const variantConfig = variants[activeVariant] || variants.offline
  const sizeConfig = sizes[size] || sizes.md

  // Default label based on variant
  const displayLabel =
    label !== undefined
      ? label
      : activeVariant === 'live'
      ? 'Live'
      : activeVariant === 'recording'
      ? 'Recording'
      : activeVariant === 'connecting'
      ? 'Connecting'
      : activeVariant === 'syncing'
      ? 'Syncing'
      : 'Offline'

  // Determine if pulse should be shown
  const showPulse = pulse !== undefined ? pulse : activeVariant !== 'offline'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizeConfig.gap,
        padding: sizeConfig.padding,
        background: variantConfig.bgColor,
        borderRadius: 999,
        fontSize: sizeConfig.fontSize,
        fontWeight: 600,
        color: variantConfig.textColor,
        transition: 'all 0.2s ease',
        ...style
      }}
      role='status'
      aria-live='polite'
      aria-label={`Status: ${displayLabel}`}
    >
      {/* Pulsing Dot */}
      <span
        style={{
          position: 'relative',
          width: sizeConfig.dotSize,
          height: sizeConfig.dotSize,
          flexShrink: 0
        }}
      >
        {/* Pulse ring (animated) */}
        {showPulse && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: variantConfig.dotColor,
              animation: 'livePulse 1.5s ease-in-out infinite'
            }}
          />
        )}
        {/* Solid dot */}
        <span
          style={{
            position: 'relative',
            display: 'block',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: variantConfig.dotColor
          }}
        />
      </span>

      {/* Label */}
      {showLabel && displayLabel}
    </span>
  )
}

// Convenience components for common use cases
export const LiveBadge = props => <LiveIndicator isLive {...props} />
export const OfflineBadge = props => <LiveIndicator isLive={false} {...props} />
export const RecordingBadge = props => (
  <LiveIndicator variant='recording' isLive {...props} />
)
export const ConnectingBadge = props => (
  <LiveIndicator variant='connecting' isLive {...props} />
)
export const SyncingBadge = props => (
  <LiveIndicator variant='syncing' isLive {...props} />
)

export default LiveIndicator
