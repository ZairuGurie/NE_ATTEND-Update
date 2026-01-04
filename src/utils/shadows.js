/**
 * NE-ATTEND Design System Shadows & Elevation
 *
 * This file defines a consistent shadow/elevation system for the entire application.
 * Shadows create visual hierarchy and depth perception.
 *
 * Usage:
 *   import { shadows, elevation, getShadow } from '../utils/shadows'
 *
 *   // Use in styles:
 *   style={{ boxShadow: shadows.md }}
 *   style={{ ...elevation.card }}
 */

// ============================================================================
// BASE SHADOWS (Neutral)
// ============================================================================
export const shadows = {
  none: 'none',

  // Extra small - subtle lift for inputs, badges
  xs: '0 1px 2px rgba(0, 0, 0, 0.04)',

  // Small - light cards, panels
  sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',

  // Medium - default cards, dropdowns
  md: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',

  // Large - modals, popovers, elevated cards
  lg: '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',

  // Extra large - high elevation elements
  xl: '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',

  // 2XL - maximum elevation (floating panels, dialogs)
  '2xl': '0 25px 50px rgba(0, 0, 0, 0.15), 0 12px 24px rgba(0, 0, 0, 0.08)',

  // Inner shadow (for inputs, inset elements)
  inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.05)',
  innerMd: 'inset 0 4px 6px rgba(0, 0, 0, 0.08)'
}

// ============================================================================
// COLORED SHADOWS (for status cards)
// ============================================================================
export const coloredShadows = {
  // Brand shadow
  brand: '0 4px 14px rgba(35, 34, 92, 0.2)',
  brandHover: '0 8px 20px rgba(35, 34, 92, 0.25)',

  // Present/Success shadow
  present: '0 4px 14px rgba(34, 197, 94, 0.2)',
  presentHover: '0 8px 20px rgba(34, 197, 94, 0.3)',

  // Absent/Danger shadow
  absent: '0 4px 14px rgba(239, 68, 68, 0.2)',
  absentHover: '0 8px 20px rgba(239, 68, 68, 0.3)',

  // Late/Warning shadow
  late: '0 4px 14px rgba(245, 158, 11, 0.2)',
  lateHover: '0 8px 20px rgba(245, 158, 11, 0.3)',

  // Pending/Info shadow
  pending: '0 4px 14px rgba(59, 130, 246, 0.2)',
  pendingHover: '0 8px 20px rgba(59, 130, 246, 0.3)',

  // Host shadow
  host: '0 4px 14px rgba(234, 179, 8, 0.25)',
  hostHover: '0 8px 20px rgba(234, 179, 8, 0.35)'
}

// ============================================================================
// FOCUS SHADOWS (for accessibility)
// ============================================================================
export const focusShadows = {
  // Primary focus ring
  primary: '0 0 0 3px rgba(59, 130, 246, 0.4)',

  // Success focus ring
  success: '0 0 0 3px rgba(34, 197, 94, 0.4)',

  // Danger focus ring
  danger: '0 0 0 3px rgba(239, 68, 68, 0.4)',

  // Warning focus ring
  warning: '0 0 0 3px rgba(245, 158, 11, 0.4)',

  // Neutral focus ring
  neutral: '0 0 0 3px rgba(107, 114, 128, 0.4)'
}

// ============================================================================
// ELEVATION PRESETS (combined shadow + border)
// ============================================================================
export const elevation = {
  // Flat - no elevation (for embedded content)
  flat: {
    boxShadow: shadows.none,
    border: '1px solid #e5e7eb'
  },

  // Low - subtle elevation (list items, pills)
  low: {
    boxShadow: shadows.xs,
    border: '1px solid #f3f4f6'
  },

  // Card - default card elevation
  card: {
    boxShadow: shadows.sm,
    border: '1px solid #e5e7eb'
  },

  // CardHover - hovered card elevation
  cardHover: {
    boxShadow: shadows.md,
    border: '1px solid #d1d5db',
    transform: 'translateY(-2px)'
  },

  // Raised - prominent cards, panels
  raised: {
    boxShadow: shadows.md,
    border: '1px solid #e5e7eb'
  },

  // Dropdown - floating menus, tooltips
  dropdown: {
    boxShadow: shadows.lg,
    border: '1px solid #e5e7eb'
  },

  // Modal - dialogs, modal overlays
  modal: {
    boxShadow: shadows.xl,
    border: 'none'
  },

  // Overlay - maximum elevation
  overlay: {
    boxShadow: shadows['2xl'],
    border: 'none'
  }
}

// ============================================================================
// SPACING SCALE (for margins, paddings)
// ============================================================================
export const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128
}

// ============================================================================
// BORDER RADIUS SCALE
// ============================================================================
export const radii = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 20,
  '4xl': 24,
  full: 9999
}

// ============================================================================
// Z-INDEX SCALE
// ============================================================================
export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
  max: 9999
}

// ============================================================================
// TRANSITION PRESETS
// ============================================================================
export const transitions = {
  // Timing functions
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',

  // Duration presets
  fast: '0.15s',
  normal: '0.2s',
  slow: '0.3s',
  slower: '0.5s',

  // Combined transitions
  all: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  colors: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
  transform: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  opacity: 'opacity 0.2s ease',
  shadow: 'box-shadow 0.2s ease'
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get shadow by status type
 * @param {string} status - 'present', 'absent', 'late', 'pending', 'host', 'brand'
 * @param {boolean} isHover - Whether to get hover state shadow
 * @returns {string} Box shadow value
 */
export const getStatusShadow = (status = 'brand', isHover = false) => {
  const key = isHover ? `${status}Hover` : status
  return coloredShadows[key] || coloredShadows.brand
}

/**
 * Get focus shadow by variant
 * @param {string} variant - 'primary', 'success', 'danger', 'warning', 'neutral'
 * @returns {string} Box shadow value for focus ring
 */
export const getFocusShadow = (variant = 'primary') => {
  return focusShadows[variant] || focusShadows.primary
}

/**
 * Combine multiple shadows
 * @param {...string} shadowValues - Shadow values to combine
 * @returns {string} Combined box shadow value
 */
export const combineShadows = (...shadowValues) => {
  return shadowValues.filter(Boolean).join(', ')
}

/**
 * Get elevation with focus ring
 * @param {string} elevationKey - 'flat', 'card', 'raised', 'dropdown', 'modal'
 * @param {string} focusVariant - 'primary', 'success', 'danger', etc.
 * @returns {Object} Style object with shadow and focus ring
 */
export const getElevationWithFocus = (
  elevationKey = 'card',
  focusVariant = 'primary'
) => {
  const elevationStyle = elevation[elevationKey] || elevation.card
  return {
    ...elevationStyle,
    ':focus-visible': {
      boxShadow: combineShadows(
        elevationStyle.boxShadow,
        getFocusShadow(focusVariant)
      )
    }
  }
}

// Default export
export default {
  shadows,
  coloredShadows,
  focusShadows,
  elevation,
  spacing,
  radii,
  zIndex,
  transitions,
  getStatusShadow,
  getFocusShadow,
  combineShadows,
  getElevationWithFocus
}
