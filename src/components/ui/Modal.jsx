/**
 * Modal Component
 * Reusable modal dialog with customizable content
 *
 * Usage:
 * <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Confirm">
 *   Modal content here
 * </Modal>
 */

import React, { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { neutral } from '../../utils/colors'

// Modal sizes
const sizes = {
  sm: { maxWidth: 400 },
  md: { maxWidth: 560 },
  lg: { maxWidth: 720 },
  xl: { maxWidth: 960 },
  full: { maxWidth: '90vw', width: '100%' }
}

/**
 * Modal Component
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Modal title
 * @param {'sm'|'md'|'lg'|'xl'|'full'} props.size - Modal size
 * @param {boolean} props.closeOnOverlay - Close when clicking overlay
 * @param {boolean} props.closeOnEsc - Close on Escape key
 * @param {boolean} props.showClose - Show close button
 * @param {React.ReactNode} props.footer - Footer content
 * @param {React.ReactNode} props.children - Modal content
 * @param {Object} props.style - Additional modal styles
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  closeOnOverlay = true,
  closeOnEsc = true,
  showClose = true,
  footer,
  children,
  style = {}
}) => {
  // Handle Escape key
  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'Escape' && closeOnEsc) {
        onClose()
      }
    },
    [closeOnEsc, onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const sizeStyle = sizes[size] || sizes.md

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      {/* Overlay */}
      <div
        onClick={closeOnOverlay ? onClose : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease-out'
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          background: neutral.bgSurface,
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.25s ease-out',
          ...sizeStyle,
          ...style
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showClose) && (
          <div
            style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${neutral.borderLight}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}
          >
            {title && (
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 600,
                  color: neutral.textPrimary
                }}
              >
                {title}
              </h2>
            )}
            {showClose && (
              <button
                onClick={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  background: neutral.bgMuted,
                  color: neutral.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  marginLeft: 'auto'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = neutral.bgHover
                  e.currentTarget.style.color = neutral.textPrimary
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = neutral.bgMuted
                  e.currentTarget.style.color = neutral.textSecondary
                }}
              >
                <i className='bi-x-lg' style={{ fontSize: 16 }} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div
          style={{
            padding: 24,
            overflowY: 'auto',
            flex: 1
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: `1px solid ${neutral.borderLight}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              flexShrink: 0
            }}
          >
            {footer}
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { 
              opacity: 0;
              transform: translateY(20px) scale(0.95);
            }
            to { 
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
    </div>
  )

  // Render into portal
  return createPortal(modalContent, document.body)
}

export default Modal
