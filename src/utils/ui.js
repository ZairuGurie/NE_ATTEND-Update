/**
 * NE-ATTEND UI Utilities
 * Helper functions and style generators for consistent UI
 *
 * Usage:
 * import { styles, getAvatarUrl, getStatusBadgeClass } from '../utils/ui'
 */

import { brand, status, neutral, interactive } from './colors'

// ============================================================================
// AVATAR UTILITIES
// ============================================================================

/**
 * Generate avatar URL for user
 * Uses profile picture if available, otherwise generates placeholder
 * @param {Object} user - User object with profilePicture, firstName, lastName
 * @returns {string} Avatar URL
 */
export const getAvatarUrl = user => {
  if (user?.profilePicture) {
    return user.profilePicture
  }

  const displayName = getDisplayName(user)
  const encodedName = encodeURIComponent(displayName)
  const bgColor = brand.primary.replace('#', '')

  return `https://ui-avatars.com/api/?name=${encodedName}&background=${bgColor}&color=fff`
}

/**
 * Get display name from user object
 * @param {Object} user - User object
 * @returns {string} Display name
 */
export const getDisplayName = user => {
  if (!user) return 'User'

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
  return fullName || user.email || 'User'
}

// ============================================================================
// STATUS BADGE UTILITIES
// ============================================================================

/**
 * Get badge class name for status
 * @param {string} statusValue - Status value (present, absent, late, pending, left)
 * @returns {string} CSS class name
 */
export const getStatusBadgeClass = statusValue => {
  const statusMap = {
    present: 'badge-present',
    absent: 'badge-absent',
    late: 'badge-late',
    pending: 'badge-pending',
    left: 'badge-left',
    host: 'badge-host',
    verified: 'badge-verified',
    guest: 'badge-guest'
  }

  return `badge ${statusMap[statusValue?.toLowerCase()] || 'badge-pending'}`
}

/**
 * Get inline style object for status badge
 * Useful when CSS classes aren't available
 * @param {string} statusValue - Status value
 * @returns {Object} Style object
 */
export const getStatusBadgeStyle = statusValue => {
  const statusKey = statusValue?.toLowerCase() || 'pending'
  const colors = status[statusKey] || status.pending

  return {
    backgroundColor: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '4px 12px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  }
}

// ============================================================================
// COMMON STYLE OBJECTS
// ============================================================================

/**
 * Pre-built style objects for common UI patterns
 */
export const styles = {
  // Page Layout
  pageContainer: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    background: neutral.bgPage,
    overflow: 'hidden'
  },

  // Sidebar
  sidebar: {
    width: 290,
    background: `linear-gradient(180deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 0',
    boxShadow: '2px 0 16px rgba(44,44,84,0.08)',
    height: '100vh',
    flexShrink: 0
  },

  // Main Content
  mainContent: {
    flex: 1,
    padding: '48px 60px',
    height: '100vh',
    overflowY: 'auto',
    background: neutral.bgSurface
  },

  // Page Header
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 36
  },

  pageTitle: {
    margin: 0,
    fontWeight: 800,
    fontSize: 36,
    color: brand.secondary
  },

  // Cards
  card: {
    background: neutral.bgSurface,
    borderRadius: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    border: `1px solid ${neutral.borderLight}`,
    overflow: 'hidden'
  },

  cardHeader: {
    padding: '16px 24px',
    borderBottom: `1px solid ${neutral.borderLight}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },

  cardBody: {
    padding: 24
  },

  // Buttons
  buttonPrimary: {
    background: interactive.primary,
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8
  },

  buttonSecondary: {
    background: neutral.bgMuted,
    color: neutral.textPrimary,
    border: `1px solid ${neutral.borderDefault}`,
    padding: '10px 20px',
    borderRadius: 8,
    fontWeight: 500,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },

  buttonDanger: {
    background: interactive.danger,
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },

  buttonSuccess: {
    background: interactive.success,
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },

  // Inputs
  input: {
    width: '100%',
    padding: '10px 14px',
    border: `1px solid ${neutral.borderDefault}`,
    borderRadius: 8,
    fontSize: 14,
    color: neutral.textPrimary,
    transition: 'all 0.2s ease',
    outline: 'none',
    boxSizing: 'border-box'
  },

  inputLabel: {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: neutral.textSecondary
  },

  // Tables
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14
  },

  tableHeader: {
    background: neutral.bgMuted,
    fontWeight: 600,
    color: neutral.textSecondary,
    textAlign: 'left',
    padding: '12px 16px',
    borderBottom: `2px solid ${neutral.borderDefault}`
  },

  tableCell: {
    padding: '12px 16px',
    borderBottom: `1px solid ${neutral.borderLight}`
  },

  // Loading States
  spinner: {
    width: 24,
    height: 24,
    border: `2px solid ${neutral.borderDefault}`,
    borderTopColor: interactive.primary,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },

  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(255,255,255,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10
  },

  // Empty States
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    textAlign: 'center'
  },

  emptyStateIcon: {
    fontSize: 48,
    color: neutral.textMuted,
    marginBottom: 16
  },

  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: neutral.textPrimary,
    marginBottom: 8
  },

  emptyStateDescription: {
    fontSize: 14,
    color: neutral.textMuted,
    maxWidth: 400
  },

  // Dropdown Menu
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    minWidth: 200,
    background: neutral.bgSurface,
    borderRadius: 12,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    border: `1px solid ${neutral.borderLight}`,
    zIndex: 100,
    overflow: 'hidden'
  },

  dropdownItem: {
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 14,
    color: neutral.textPrimary,
    fontWeight: 500,
    borderBottom: `1px solid ${neutral.borderLight}`,
    background: neutral.bgSurface,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    transition: 'background 0.2s ease'
  },

  // Nav Items
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 24px',
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s ease',
    textDecoration: 'none',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left'
  },

  navItemActive: {
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    borderLeft: '3px solid #fff'
  },

  // Alerts
  alertSuccess: {
    background: status.present.bg,
    color: status.present.text,
    border: `1px solid ${status.present.border}`,
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },

  alertError: {
    background: status.absent.bg,
    color: status.absent.text,
    border: `1px solid ${status.absent.border}`,
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },

  alertWarning: {
    background: status.late.bg,
    color: status.late.text,
    border: `1px solid ${status.late.border}`,
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },

  alertInfo: {
    background: status.pending.bg,
    color: status.pending.text,
    border: `1px solid ${status.pending.border}`,
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 10
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Merge multiple style objects
 * @param  {...Object} styleObjects - Style objects to merge
 * @returns {Object} Merged style object
 */
export const mergeStyles = (...styleObjects) => {
  return Object.assign({}, ...styleObjects)
}

/**
 * Conditionally apply styles
 * @param {Object} baseStyle - Base style object
 * @param {boolean} condition - Condition to check
 * @param {Object} conditionalStyle - Style to apply if condition is true
 * @returns {Object} Resulting style object
 */
export const conditionalStyle = (baseStyle, condition, conditionalStyle) => {
  return condition ? { ...baseStyle, ...conditionalStyle } : baseStyle
}

/**
 * Format duration in seconds to human readable
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1h 23m 45s")
 */
export const formatDuration = seconds => {
  if (!seconds || seconds < 0) return '0s'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(' ')
}

/**
 * Format date to locale string
 * @param {string|Date} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date
 */
export const formatDate = (date, options = {}) => {
  if (!date) return ''

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  }

  return new Date(date).toLocaleDateString('en-US', defaultOptions)
}

/**
 * Format time to locale string
 * @param {string|Date} time - Time to format
 * @returns {string} Formatted time
 */
export const formatTime = time => {
  if (!time) return ''

  return new Date(time).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Export colors for convenience
export { brand, status, neutral, interactive } from './colors'
