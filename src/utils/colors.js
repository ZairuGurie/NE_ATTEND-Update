/**
 * NE-ATTEND Design System Colors (Phase 3: Theme-Aware)
 *
 * This file defines a consistent color palette for the entire application.
 * All colors are WCAG AA compliant for accessibility.
 *
 * PHASE 3 ENHANCEMENT:
 * Colors now read from CSS variables when available, enabling dark mode support.
 * Components using these colors will automatically respond to theme changes.
 *
 * Usage:
 *   import { colors, statusColors, getStatusStyle } from '../utils/colors'
 */

// ============================================================================
// CSS VARIABLE HELPER (Phase 3)
// ============================================================================
const getCSSVar = (varName, fallback) => {
  if (typeof window === 'undefined') return fallback
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim()
    return value || fallback
  } catch {
    return fallback
  }
}

// ============================================================================
// BRAND COLORS (Theme-aware via CSS variables)
// ============================================================================
export const brand = {
  get primary () {
    return getCSSVar('--brand-primary', '#201B51')
  },
  get secondary () {
    return getCSSVar('--brand-secondary', '#23225c')
  },
  get accent () {
    return getCSSVar('--brand-accent', '#4a4494')
  },
  get light () {
    return getCSSVar('--brand-light', '#6366f1')
  },
  // TEXT ON BRAND BACKGROUNDS - Always use this for text on brand colors!
  // DO NOT use neutral.bgSurface for text - it's a background color, not text color
  textOnBrand: '#ffffff',
  textOnBrandMuted: 'rgba(255, 255, 255, 0.75)',
  textOnBrandSecondary: 'rgba(255, 255, 255, 0.85)'
}

// ============================================================================
// CONSTANT: White text for dark/brand backgrounds (always white, theme-independent)
// Use this instead of neutral.bgSurface when you need white text on brand backgrounds
// ============================================================================
export const TEXT_ON_BRAND = '#ffffff'
export const TEXT_ON_BRAND_MUTED = 'rgba(255, 255, 255, 0.75)'
export const TEXT_ON_BRAND_SECONDARY = 'rgba(255, 255, 255, 0.85)'

// ============================================================================
// STATUS COLORS (Theme-aware via CSS variables, WCAG AA Compliant)
// All text colors have minimum 4.5:1 contrast ratio on their backgrounds
// ============================================================================
export const status = {
  // Present / Success / Active
  present: {
    get bg () {
      return getCSSVar('--status-present-bg', '#dcfce7')
    },
    get text () {
      return getCSSVar('--status-present-text', '#166534')
    },
    get border () {
      return getCSSVar('--status-present-border', '#22c55e')
    },
    icon: '#16a34a'
  },

  // Absent / Error / Danger
  absent: {
    get bg () {
      return getCSSVar('--status-absent-bg', '#fee2e2')
    },
    get text () {
      return getCSSVar('--status-absent-text', '#991b1b')
    },
    get border () {
      return getCSSVar('--status-absent-border', '#ef4444')
    },
    icon: '#dc2626'
  },

  // Late / Warning
  late: {
    get bg () {
      return getCSSVar('--status-late-bg', '#fef3c7')
    },
    get text () {
      return getCSSVar('--status-late-text', '#92400e')
    },
    get border () {
      return getCSSVar('--status-late-border', '#f59e0b')
    },
    icon: '#d97706'
  },

  // Pending / Info
  pending: {
    get bg () {
      return getCSSVar('--status-pending-bg', '#dbeafe')
    },
    get text () {
      return getCSSVar('--status-pending-text', '#1e40af')
    },
    get border () {
      return getCSSVar('--status-pending-border', '#3b82f6')
    },
    icon: '#2563eb'
  },

  // Left / Inactive (for meeting participants who left)
  left: {
    get bg () {
      return getCSSVar('--status-left-bg', '#f3f4f6')
    },
    get text () {
      return getCSSVar('--status-left-text', '#4b5563')
    },
    get border () {
      return getCSSVar('--status-left-border', '#9ca3af')
    },
    icon: '#6b7280'
  },

  // Host / VIP
  host: {
    get bg () {
      return getCSSVar('--status-host-bg', '#fef9c3')
    },
    get text () {
      return getCSSVar('--status-host-text', '#854d0e')
    },
    get border () {
      return getCSSVar('--status-host-border', '#eab308')
    },
    icon: '#ca8a04'
  },

  // Verified / Authenticated
  verified: {
    get bg () {
      return getCSSVar('--status-verified-bg', '#d1fae5')
    },
    get text () {
      return getCSSVar('--status-verified-text', '#065f46')
    },
    get border () {
      return getCSSVar('--status-verified-border', '#10b981')
    },
    icon: '#059669'
  },

  // Guest / Unauthenticated
  guest: {
    get bg () {
      return getCSSVar('--status-guest-bg', '#fce7f3')
    },
    get text () {
      return getCSSVar('--status-guest-text', '#9d174d')
    },
    get border () {
      return getCSSVar('--status-guest-border', '#ec4899')
    },
    icon: '#db2777'
  }
}

// ============================================================================
// NEUTRAL COLORS (Theme-aware, WCAG AAA compliant)
// ============================================================================
export const neutral = {
  // Text colors - Theme-aware for dark mode support
  get textStrong () {
    return getCSSVar('--text-strong', '#030712')
  },
  get textPrimary () {
    return getCSSVar('--text-primary', '#111827')
  },
  get textSecondary () {
    return getCSSVar('--text-secondary', '#374151')
  },
  get textMuted () {
    return getCSSVar('--text-muted', '#6b7280')
  },
  get textDisabled () {
    return getCSSVar('--text-disabled', '#9ca3af')
  },
  get textOnDark () {
    return getCSSVar('--text-on-dark', '#f9fafb')
  },
  get textOnBrand () {
    return getCSSVar('--text-on-brand', '#ffffff')
  },
  // Alias: textInverse for backward compatibility (same as textOnBrand)
  get textInverse () {
    return getCSSVar('--text-on-brand', '#ffffff')
  },

  // Background colors - Theme-aware
  get bgPage () {
    return getCSSVar('--bg-page', '#f4f6fb')
  },
  get bgSurface () {
    return getCSSVar('--bg-surface', '#ffffff')
  },
  get bgMuted () {
    return getCSSVar('--bg-muted', '#f9fafb')
  },
  get bgHover () {
    return getCSSVar('--bg-hover', '#f3f4f6')
  },
  get bgActive () {
    return getCSSVar('--bg-active', '#e5e7eb')
  },

  // Border colors - Theme-aware
  get border () {
    return getCSSVar('--border-default', '#e5e7eb')
  },
  // Alias: borderDefault for backward compatibility (same as border)
  get borderDefault () {
    return getCSSVar('--border-default', '#e5e7eb')
  },
  get borderLight () {
    return getCSSVar('--border-light', '#f3f4f6')
  },
  get borderDark () {
    return getCSSVar('--border-dark', '#d1d5db')
  },
  get borderFocus () {
    return getCSSVar('--border-focus', '#3b82f6')
  }
}

// ============================================================================
// INTERACTIVE COLORS (Theme-aware with focus states)
// ============================================================================
export const interactive = {
  // Primary actions
  get primary () {
    return getCSSVar('--interactive-primary', '#3b82f6')
  },
  get primaryHover () {
    return getCSSVar('--interactive-primary-hover', '#2563eb')
  },
  get primaryActive () {
    return getCSSVar('--interactive-primary-active', '#1d4ed8')
  },
  get primaryFocus () {
    return getCSSVar('--interactive-primary-focus', 'rgba(59, 130, 246, 0.4)')
  },

  // Secondary actions
  secondary: '#6b7280',
  secondaryHover: '#4b5563',
  secondaryActive: '#374151',
  secondaryFocus: 'rgba(107, 114, 128, 0.4)',

  // Danger actions
  get danger () {
    return getCSSVar('--interactive-danger', '#ef4444')
  },
  get dangerHover () {
    return getCSSVar('--interactive-danger-hover', '#dc2626')
  },
  get dangerActive () {
    return getCSSVar('--interactive-danger-active', '#b91c1c')
  },
  get dangerFocus () {
    return getCSSVar('--interactive-danger-focus', 'rgba(239, 68, 68, 0.4)')
  },

  // Success actions
  get success () {
    return getCSSVar('--interactive-success', '#22c55e')
  },
  get successHover () {
    return getCSSVar('--interactive-success-hover', '#16a34a')
  },
  get successActive () {
    return getCSSVar('--interactive-success-active', '#15803d')
  },
  get successFocus () {
    return getCSSVar('--interactive-success-focus', 'rgba(34, 197, 94, 0.4)')
  },

  // Warning actions
  get warning () {
    return getCSSVar('--interactive-warning', '#f59e0b')
  },
  get warningHover () {
    return getCSSVar('--interactive-warning-hover', '#d97706')
  },
  get warningActive () {
    return getCSSVar('--interactive-warning-active', '#b45309')
  },
  get warningFocus () {
    return getCSSVar('--interactive-warning-focus', 'rgba(245, 158, 11, 0.4)')
  }
}

// ============================================================================
// SIDEBAR/NAVIGATION COLORS
// ============================================================================
export const sidebar = {
  bg: '#201B51', // Dark blue-purple
  text: '#e5e7eb', // Light gray text
  textActive: '#ffffff', // White for active item
  itemHover: 'rgba(255, 255, 255, 0.1)', // Semi-transparent hover
  itemActive: 'rgba(255, 255, 255, 0.2)' // Active item background
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the complete style object for a status badge
 * @param {string} statusType - 'present', 'absent', 'late', 'pending', 'left', 'host', 'verified', 'guest'
 * @returns {Object} Style object with background, color, and border
 */
export const getStatusStyle = statusType => {
  const statusConfig = status[statusType?.toLowerCase()] || status.pending
  return {
    background: statusConfig.bg,
    color: statusConfig.text,
    border: `2px solid ${statusConfig.border}`
  }
}

/**
 * Get status color config by attendance status
 * @param {string} attendanceStatus - 'present', 'late', 'absent', 'pending'
 * @returns {Object} Status color configuration
 */
export const getAttendanceStatusColor = attendanceStatus => {
  const statusMap = {
    present: status.present,
    late: status.late,
    absent: status.absent,
    pending: status.pending,
    left: status.left
  }
  return statusMap[attendanceStatus?.toLowerCase()] || status.pending
}

/**
 * Get meeting participant status style
 * @param {boolean} isLive - Whether participant is currently in meeting
 * @param {boolean} isLeft - Whether participant has left
 * @param {boolean} isHost - Whether participant is the host
 * @returns {Object} Complete style object for participant row
 */
export const getParticipantStatusStyle = (isLive, isLeft, isHost) => {
  if (isHost) {
    return {
      ...getStatusStyle(isLive && !isLeft ? 'host' : 'left'),
      fontWeight: 700
    }
  }

  if (isLive && !isLeft) {
    return getStatusStyle('present')
  }

  return getStatusStyle('left')
}

/**
 * Map raw status strings to standard status types
 * @param {string} rawStatus - Any status string
 * @returns {string} Normalized status type
 */
export const normalizeStatus = rawStatus => {
  const statusStr = (rawStatus || '').toLowerCase().trim()

  if (
    statusStr.includes('present') ||
    statusStr === 'active' ||
    statusStr === 'in_meeting'
  ) {
    return 'present'
  }
  if (statusStr.includes('late') || statusStr === 'tardy') {
    return 'late'
  }
  if (statusStr.includes('absent') || statusStr === 'missing') {
    return 'absent'
  }
  if (statusStr.includes('left') || statusStr === 'departed') {
    return 'left'
  }
  if (statusStr === 'host' || statusStr.includes('instructor')) {
    return 'host'
  }

  return 'pending'
}

// ============================================================================
// LEGACY COLOR MAPPINGS (for gradual migration)
// ============================================================================
export const legacyColors = {
  // Old colors mapped to new
  '#7CFC00': status.present.border, // Bright lawn green → proper green
  '#FF5A5A': status.absent.border, // Old red → proper red
  '#FFE066': status.late.border, // Old yellow → proper amber
  '#856404': status.late.text, // Old brown → proper amber text
  '#666': neutral.textSecondary, // Old gray → proper secondary
  '#999': neutral.textMuted // Old muted → proper muted
}

// ============================================================================
// RISK COLOR MAP (Centralized - used by Dashboard, History, AttendanceInsights)
// Maps risk levels to status colors for consistent UI across all pages
// ============================================================================
export const riskColorMap = {
  high: {
    get bg () {
      return status.absent.bg
    },
    get border () {
      return status.absent.border
    },
    get text () {
      return status.absent.text || status.absent.border
    }
  },
  medium: {
    get bg () {
      return status.late.bg
    },
    get border () {
      return status.late.border
    },
    get text () {
      return status.late.text || status.late.border
    }
  },
  low: {
    get bg () {
      return status.present.bg
    },
    get border () {
      return status.present.border
    },
    get text () {
      return status.present.text || status.present.border
    }
  },
  default: {
    get bg () {
      return neutral.bgMuted
    },
    get border () {
      return neutral.borderLight
    },
    get text () {
      return neutral.textSecondary
    }
  }
}

/**
 * Get risk style object for a given risk level
 * @param {string} riskLevel - 'high', 'medium', 'low', or 'default'
 * @returns {Object} Style object with bg, border, and text colors
 */
export const getRiskStyle = riskLevel => {
  const palette = riskColorMap[riskLevel?.toLowerCase()] || riskColorMap.default
  return {
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    color: palette.text
  }
}

// ============================================================================
// CSS VARIABLE NAMES (for use with CSS custom properties)
// ============================================================================
export const cssVars = {
  // These match the CSS variables defined in colors.css
  brandPrimary: 'var(--brand-primary)',
  brandSecondary: 'var(--brand-secondary)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  bgPage: 'var(--bg-page)',
  bgSurface: 'var(--bg-surface)'
}

// Default export with all color categories
export default {
  brand,
  status,
  neutral,
  interactive,
  sidebar,
  riskColorMap,
  getStatusStyle,
  getAttendanceStatusColor,
  getParticipantStatusStyle,
  normalizeStatus,
  getRiskStyle
}
