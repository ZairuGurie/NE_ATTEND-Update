/**
 * NE-ATTEND Theme Hook
 *
 * Centralized theme system for consistent styling across the application.
 * Use this hook to access design tokens instead of hardcoding values.
 *
 * Usage:
 *   import { useTheme } from '../hooks/useTheme'
 *   const { colors, spacing, shadows, getStatusStyle } = useTheme()
 */

import { useMemo } from 'react'
import {
  brand,
  status,
  neutral,
  interactive,
  sidebar,
  getStatusStyle,
  getAttendanceStatusColor,
  getParticipantStatusStyle,
  normalizeStatus
} from '../utils/colors'

// ============================================================================
// DESIGN TOKENS
// ============================================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64
}

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999
}

export const fontSize = {
  xs: '0.75rem', // 12px
  sm: '0.875rem', // 14px
  base: '1rem', // 16px
  lg: '1.125rem', // 18px
  xl: '1.25rem', // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '1.875rem', // 30px
  '4xl': '2.25rem' // 36px
}

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700
}

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  card: '0 2px 8px rgba(0, 0, 0, 0.08)',
  elevated: '0 4px 16px rgba(0, 0, 0, 0.12)'
}

export const transitions = {
  fast: '150ms ease',
  normal: '250ms ease',
  slow: '350ms ease'
}

// ============================================================================
// COMMON STYLE OBJECTS
// ============================================================================

/**
 * Common button styles - use these as base and extend
 */
export const buttonStyles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    borderRadius: borderRadius.md,
    border: 'none',
    cursor: 'pointer',
    transition: `all ${transitions.fast}`,
    textDecoration: 'none',
    whiteSpace: 'nowrap'
  },

  primary: {
    backgroundColor: interactive.primary,
    color: '#ffffff'
  },

  primaryHover: {
    backgroundColor: interactive.primaryHover,
    transform: 'translateY(-1px)',
    boxShadow: shadows.md
  },

  secondary: {
    backgroundColor: neutral.bgMuted,
    color: neutral.textPrimary,
    border: `1px solid ${neutral.border}`
  },

  danger: {
    backgroundColor: interactive.danger,
    color: '#ffffff'
  },

  success: {
    backgroundColor: interactive.success,
    color: '#ffffff'
  },

  ghost: {
    backgroundColor: 'transparent',
    color: neutral.textSecondary
  },

  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },

  sm: {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.xs
  },

  lg: {
    padding: `${spacing.sm + 4}px ${spacing.lg}px`,
    fontSize: fontSize.base
  }
}

/**
 * Common input styles
 */
export const inputStyles = {
  base: {
    display: 'block',
    width: '100%',
    padding: `${spacing.sm}px ${spacing.sm + 4}px`,
    fontSize: fontSize.sm,
    color: neutral.textPrimary,
    backgroundColor: neutral.bgSurface,
    border: `1px solid ${neutral.border}`,
    borderRadius: borderRadius.md,
    transition: `all ${transitions.fast}`,
    outline: 'none',
    boxSizing: 'border-box'
  },

  focus: {
    borderColor: interactive.primary,
    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.15)'
  },

  error: {
    borderColor: interactive.danger,
    boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.15)'
  },

  disabled: {
    backgroundColor: neutral.bgMuted,
    color: neutral.textDisabled,
    cursor: 'not-allowed'
  },

  readonly: {
    backgroundColor: neutral.bgMuted,
    cursor: 'default'
  }
}

/**
 * Common card styles
 */
export const cardStyles = {
  base: {
    backgroundColor: neutral.bgSurface,
    borderRadius: borderRadius.lg,
    boxShadow: shadows.card,
    border: `1px solid ${neutral.borderLight}`
  },

  elevated: {
    boxShadow: shadows.elevated
  },

  header: {
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderBottom: `1px solid ${neutral.borderLight}`
  },

  body: {
    padding: spacing.lg
  },

  footer: {
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderTop: `1px solid ${neutral.borderLight}`,
    backgroundColor: neutral.bgMuted
  }
}

/**
 * Common layout styles
 */
export const layoutStyles = {
  page: {
    minHeight: '100vh',
    backgroundColor: neutral.bgPage
  },

  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: `0 ${spacing.lg}px`
  },

  section: {
    marginBottom: spacing.xl
  },

  flexCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  flexBetween: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.lg
  },

  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.lg
  },

  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.lg
  }
}

/**
 * Status badge styles - precomputed for performance
 */
export const badgeStyles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    borderRadius: borderRadius.full,
    whiteSpace: 'nowrap'
  },

  present: {
    backgroundColor: status.present.bg,
    color: status.present.text,
    border: `2px solid ${status.present.border}`
  },

  absent: {
    backgroundColor: status.absent.bg,
    color: status.absent.text,
    border: `2px solid ${status.absent.border}`
  },

  late: {
    backgroundColor: status.late.bg,
    color: status.late.text,
    border: `2px solid ${status.late.border}`
  },

  pending: {
    backgroundColor: status.pending.bg,
    color: status.pending.text,
    border: `2px solid ${status.pending.border}`
  },

  left: {
    backgroundColor: status.left.bg,
    color: status.left.text,
    border: `2px solid ${status.left.border}`
  },

  host: {
    backgroundColor: status.host.bg,
    color: status.host.text,
    border: `2px solid ${status.host.border}`
  },

  verified: {
    backgroundColor: status.verified.bg,
    color: status.verified.text,
    border: `2px solid ${status.verified.border}`
  },

  guest: {
    backgroundColor: status.guest.bg,
    color: status.guest.text,
    border: `2px solid ${status.guest.border}`
  }
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Main theme hook - provides access to all design tokens and utilities
 */
export const useTheme = () => {
  const theme = useMemo(
    () => ({
      // Color palettes
      colors: {
        brand,
        status,
        neutral,
        interactive,
        sidebar
      },

      // Design tokens
      spacing,
      borderRadius,
      fontSize,
      fontWeight,
      shadows,
      transitions,

      // Pre-built style objects
      styles: {
        button: buttonStyles,
        input: inputStyles,
        card: cardStyles,
        layout: layoutStyles,
        badge: badgeStyles
      },

      // Utility functions
      getStatusStyle,
      getAttendanceStatusColor,
      getParticipantStatusStyle,
      normalizeStatus,

      // Helper to get badge style by status
      getBadgeStyle: statusType => ({
        ...badgeStyles.base,
        ...(badgeStyles[statusType?.toLowerCase()] || badgeStyles.pending)
      }),

      // Helper to get button style by variant
      getButtonStyle: (variant = 'primary', size = 'md', disabled = false) => ({
        ...buttonStyles.base,
        ...(buttonStyles[variant] || buttonStyles.primary),
        ...(size === 'sm' ? buttonStyles.sm : {}),
        ...(size === 'lg' ? buttonStyles.lg : {}),
        ...(disabled ? buttonStyles.disabled : {})
      }),

      // Helper to get input style by state
      getInputStyle: (
        state = 'normal',
        isDisabled = false,
        isReadonly = false
      ) => ({
        ...inputStyles.base,
        ...(state === 'error' ? inputStyles.error : {}),
        ...(state === 'focus' ? inputStyles.focus : {}),
        ...(isDisabled ? inputStyles.disabled : {}),
        ...(isReadonly ? inputStyles.readonly : {})
      })
    }),
    []
  )

  return theme
}

export default useTheme
