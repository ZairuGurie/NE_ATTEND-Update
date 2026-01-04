/**
 * Alert Component
 * Reusable alert/notification component using design system colors
 *
 * Usage:
 *   <Alert type="success">Operation completed!</Alert>
 *   <Alert type="error" onClose={() => setError(null)}>Error message</Alert>
 */

import React from 'react'
import { status as statusColors } from '../../utils/colors'

const alertConfig = {
  success: {
    bg: statusColors.present.bg,
    text: statusColors.present.text,
    border: statusColors.present.border,
    icon: 'bi-check-circle-fill'
  },
  error: {
    bg: statusColors.absent.bg,
    text: statusColors.absent.text,
    border: statusColors.absent.border,
    icon: 'bi-exclamation-circle-fill'
  },
  warning: {
    bg: statusColors.late.bg,
    text: statusColors.late.text,
    border: statusColors.late.border,
    icon: 'bi-exclamation-triangle-fill'
  },
  info: {
    bg: statusColors.pending.bg,
    text: statusColors.pending.text,
    border: statusColors.pending.border,
    icon: 'bi-info-circle-fill'
  }
}

const Alert = ({
  type = 'info',
  children,
  onClose,
  showIcon = true,
  className = '',
  style = {}
}) => {
  const config = alertConfig[type] || alertConfig.info

  return (
    <div
      className={`alert alert-${type} ${className}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 8,
        background: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
        fontSize: 14,
        lineHeight: 1.5,
        position: 'relative',
        ...style
      }}
      role='alert'
    >
      {showIcon && (
        <i
          className={config.icon}
          style={{
            fontSize: 16,
            flexShrink: 0,
            marginTop: 2
          }}
        />
      )}
      <div style={{ flex: 1 }}>{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: config.text,
            opacity: 0.7,
            fontSize: 16,
            lineHeight: 1,
            marginLeft: 8
          }}
          aria-label='Close alert'
        >
          <i className='bi-x-lg' />
        </button>
      )}
    </div>
  )
}

// Named exports for direct usage
export const SuccessAlert = props => <Alert type='success' {...props} />
export const ErrorAlert = props => <Alert type='error' {...props} />
export const WarningAlert = props => <Alert type='warning' {...props} />
export const InfoAlert = props => <Alert type='info' {...props} />

export default Alert
