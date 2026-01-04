/**
 * LoadingSpinner Component
 * Reusable loading indicator with various sizes and styles
 *
 * Usage:
 * <LoadingSpinner />
 * <LoadingSpinner size="lg" />
 * <LoadingSpinner overlay message="Loading data..." />
 */

import React from 'react'
import { interactive, neutral } from '../../utils/colors'

/**
 * Spinner sizes in pixels
 */
const SIZES = {
  sm: 16,
  md: 24,
  lg: 40,
  xl: 56
}

/**
 * LoadingSpinner Component
 * @param {Object} props
 * @param {'sm'|'md'|'lg'|'xl'} props.size - Spinner size (default: 'md')
 * @param {boolean} props.overlay - Show as overlay covering parent
 * @param {string} props.message - Optional loading message
 * @param {string} props.color - Spinner color (default: primary blue)
 */
const LoadingSpinner = ({
  size = 'md',
  overlay = false,
  message = '',
  color = interactive.primary
}) => {
  const spinnerSize = SIZES[size] || SIZES.md
  const borderWidth = size === 'sm' ? 2 : size === 'xl' ? 4 : 3

  const spinnerStyle = {
    width: spinnerSize,
    height: spinnerSize,
    border: `${borderWidth}px solid ${neutral.borderDefault}`,
    borderTopColor: color,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  }

  const containerStyle = overlay
    ? {
        position: 'absolute',
        inset: 0,
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        zIndex: 50
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12
      }

  return (
    <div style={containerStyle}>
      <div style={spinnerStyle} />
      {message && (
        <span
          style={{
            fontSize: size === 'sm' ? 12 : 14,
            color: neutral.textSecondary,
            fontWeight: 500
          }}
        >
          {message}
        </span>
      )}
      {/* CSS keyframes injected via style tag */}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

export default LoadingSpinner
