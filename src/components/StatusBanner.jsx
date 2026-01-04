import React from 'react'

const variantStyles = {
  info: {
    backgroundColor: '#e0f2fe',
    borderColor: '#38bdf8',
    color: '#0f172a'
  },
  warning: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    color: '#78350f'
  },
  error: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    color: '#7f1d1d'
  },
  success: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
    color: '#064e3b'
  }
}

function StatusBanner ({ variant = 'info', title, message, onClose }) {
  const style = variantStyles[variant] || variantStyles.info

  if (!message && !title) return null

  return (
    <div
      style={{
        ...style,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.75rem'
      }}
    >
      <div>
        {title && (
          <div
            style={{ fontWeight: 600, marginBottom: message ? '0.25rem' : 0 }}
          >
            {title}
          </div>
        )}
        {message && <div style={{ fontSize: '0.875rem' }}>{message}</div>}
      </div>
      {onClose && (
        <button
          type='button'
          onClick={onClose}
          aria-label='Dismiss notice'
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: style.color,
            fontSize: '1rem',
            padding: 0,
            lineHeight: 1
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

export default StatusBanner
