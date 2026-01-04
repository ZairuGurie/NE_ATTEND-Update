import React, { useEffect } from 'react'
import { brand, interactive } from '../../utils/colors'

/**
 * Reusable Confirmation Dialog Component
 * @param {Boolean} isOpen - Whether dialog is open
 * @param {Function} onClose - Close handler
 * @param {Function} onConfirm - Confirm action handler
 * @param {String} title - Dialog title
 * @param {String} message - Dialog message
 * @param {String} confirmText - Confirm button text
 * @param {String} cancelText - Cancel button text
 * @param {String} variant - Variant style ('danger', 'warning', 'info')
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) => {
  // Handle ESC key to close dialog
  useEffect(() => {
    const handleEscape = e => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const variantColors = {
    danger: {
      icon: '⚠️',
      confirmBg: brand.secondary,
      titleColor: brand.secondary
    },
    warning: {
      icon: '⚡',
      confirmBg: brand.warning,
      titleColor: brand.warning
    },
    info: {
      icon: 'ℹ️',
      confirmBg: interactive.info,
      titleColor: interactive.info
    }
  }

  const colors = variantColors[variant] || variantColors.danger

  return (
    <div
      style={styles.overlay}
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-labelledby='dialog-title'
    >
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.iconContainer}>
          <span style={styles.icon}>{colors.icon}</span>
        </div>

        <h3
          id='dialog-title'
          style={{ ...styles.title, color: colors.titleColor }}
        >
          {title}
        </h3>

        <p style={styles.message}>{message}</p>

        <div style={styles.buttonContainer}>
          <button
            onClick={onClose}
            style={styles.cancelButton}
            aria-label={cancelText}
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            style={{ ...styles.confirmButton, background: colors.confirmBg }}
            aria-label={confirmText}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    animation: 'fadeIn 0.2s ease-in-out'
  },
  dialog: {
    background: '#fff',
    borderRadius: 16,
    padding: '32px 24px',
    maxWidth: 440,
    width: '90%',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    animation: 'slideUp 0.3s ease-out',
    textAlign: 'center'
  },
  iconContainer: {
    marginBottom: 16
  },
  icon: {
    fontSize: 48
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 12,
    margin: 0
  },
  message: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 1.6
  },
  buttonContainer: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center'
  },
  cancelButton: {
    flex: 1,
    padding: '12px 24px',
    borderRadius: 8,
    border: '2px solid #ddd',
    background: '#fff',
    color: '#333',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  confirmButton: {
    flex: 1,
    padding: '12px 24px',
    borderRadius: 8,
    border: 'none',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
}

export default ConfirmDialog
