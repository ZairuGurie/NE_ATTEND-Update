/**
 * EmptyState Component
 * Displays a friendly message when no data is available
 *
 * Usage:
 * <EmptyState
 *   icon="bi-inbox"
 *   title="No data found"
 *   description="Start by adding some items"
 *   action={{ label: 'Add Item', onClick: handleAdd }}
 * />
 */

import React from 'react'
import { neutral, interactive } from '../../utils/colors'

/**
 * EmptyState Component
 * @param {Object} props
 * @param {string} props.icon - Bootstrap icon class (e.g., 'bi-inbox')
 * @param {string} props.title - Main heading
 * @param {string} props.description - Descriptive text
 * @param {Object} props.action - Optional action button { label, onClick }
 * @param {React.ReactNode} props.children - Custom content
 */
const EmptyState = ({
  icon = 'bi-inbox',
  title = 'No data found',
  description = '',
  action = null,
  children
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center'
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: neutral.bgMuted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20
        }}
      >
        <i
          className={icon}
          style={{
            fontSize: 36,
            color: neutral.textMuted
          }}
        />
      </div>

      {/* Title */}
      <h4
        style={{
          margin: 0,
          marginBottom: 8,
          fontSize: 18,
          fontWeight: 600,
          color: neutral.textPrimary
        }}
      >
        {title}
      </h4>

      {/* Description */}
      {description && (
        <p
          style={{
            margin: 0,
            marginBottom: action ? 20 : 0,
            fontSize: 14,
            color: neutral.textMuted,
            maxWidth: 400,
            lineHeight: 1.5
          }}
        >
          {description}
        </p>
      )}

      {/* Custom children */}
      {children}

      {/* Action Button */}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            background: interactive.primary,
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            e.target.style.background = interactive.primaryHover
            e.target.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.target.style.background = interactive.primary
            e.target.style.transform = 'translateY(0)'
          }}
        >
          {action.icon && <i className={action.icon} />}
          {action.label}
        </button>
      )}
    </div>
  )
}

export default EmptyState
