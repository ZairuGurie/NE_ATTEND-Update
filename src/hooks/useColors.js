/**
 * useColors Hook (Phase 1 - Foundation Fix)
 * 
 * Theme-aware color hook that reads from CSS variables.
 * This bridges the gap between static colors.js and dynamic theming.
 * 
 * PROBLEM SOLVED:
 * - colors.js returns static hex values like '#111827'
 * - These don't respond to dark mode changes
 * - This hook reads CSS variables which DO respond to theme changes
 * 
 * Usage:
 *   import { useColors } from '../hooks/useColors'
 *   const { neutral, brand, status, interactive } = useColors()
 *   
 *   // In JSX:
 *   <div style={{ color: neutral.textPrimary, background: neutral.bgSurface }}>
 */

import { useMemo, useCallback, useSyncExternalStore } from 'react'

/**
 * Get CSS variable value from document root
 */
const getCSSVar = (varName, fallback = '') => {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  return value || fallback
}

/**
 * Subscribe to theme changes (data-theme attribute)
 */
const subscribeToThemeChanges = (callback) => {
  // Create observer to watch for data-theme changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'data-theme' || mutation.attributeName === 'style') {
        callback()
      }
    })
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'style']
  })

  return () => observer.disconnect()
}

/**
 * Get current theme snapshot
 */
const getThemeSnapshot = () => {
  if (typeof window === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') || 'light'
}

/**
 * Fallback colors (light theme defaults)
 */
const fallbackColors = {
  // Neutral
  textStrong: '#030712',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textDisabled: '#9ca3af',
  textOnDark: '#f9fafb',
  textOnBrand: '#ffffff',
  bgPage: '#f4f6fb',
  bgSurface: '#ffffff',
  bgMuted: '#f9fafb',
  bgHover: '#f3f4f6',
  bgActive: '#e5e7eb',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
  borderDark: '#d1d5db',
  borderFocus: '#3b82f6',
  // Brand
  brandPrimary: '#201b51',
  brandSecondary: '#23225c',
  brandAccent: '#4a4494',
  brandLight: '#6366f1',
  // Interactive
  interactivePrimary: '#3b82f6',
  interactivePrimaryHover: '#2563eb',
  interactiveDanger: '#ef4444',
  interactiveSuccess: '#22c55e',
  interactiveWarning: '#f59e0b',
  // Status - Present
  statusPresentBg: '#dcfce7',
  statusPresentText: '#166534',
  statusPresentBorder: '#22c55e',
  // Status - Absent
  statusAbsentBg: '#fee2e2',
  statusAbsentText: '#991b1b',
  statusAbsentBorder: '#ef4444',
  // Status - Late
  statusLateBg: '#fef3c7',
  statusLateText: '#92400e',
  statusLateBorder: '#f59e0b',
  // Status - Pending
  statusPendingBg: '#dbeafe',
  statusPendingText: '#1e40af',
  statusPendingBorder: '#3b82f6',
}

/**
 * Build colors object from CSS variables
 */
const buildColors = () => ({
  neutral: {
    textStrong: getCSSVar('--text-strong', fallbackColors.textStrong),
    textPrimary: getCSSVar('--text-primary', fallbackColors.textPrimary),
    textSecondary: getCSSVar('--text-secondary', fallbackColors.textSecondary),
    textMuted: getCSSVar('--text-muted', fallbackColors.textMuted),
    textDisabled: getCSSVar('--text-disabled', fallbackColors.textDisabled),
    textOnDark: getCSSVar('--text-on-dark', fallbackColors.textOnDark),
    textOnBrand: getCSSVar('--text-on-brand', fallbackColors.textOnBrand),
    bgPage: getCSSVar('--bg-page', fallbackColors.bgPage),
    bgSurface: getCSSVar('--bg-surface', fallbackColors.bgSurface),
    bgMuted: getCSSVar('--bg-muted', fallbackColors.bgMuted),
    bgHover: getCSSVar('--bg-hover', fallbackColors.bgHover),
    bgActive: getCSSVar('--bg-active', fallbackColors.bgActive),
    border: getCSSVar('--border-default', fallbackColors.border),
    borderLight: getCSSVar('--border-light', fallbackColors.borderLight),
    borderDark: getCSSVar('--border-dark', fallbackColors.borderDark),
    borderFocus: getCSSVar('--border-focus', fallbackColors.borderFocus),
  },
  brand: {
    primary: getCSSVar('--brand-primary', fallbackColors.brandPrimary),
    secondary: getCSSVar('--brand-secondary', fallbackColors.brandSecondary),
    accent: getCSSVar('--brand-accent', fallbackColors.brandAccent),
    light: getCSSVar('--brand-light', fallbackColors.brandLight),
  },
  interactive: {
    primary: getCSSVar('--interactive-primary', fallbackColors.interactivePrimary),
    primaryHover: getCSSVar('--interactive-primary-hover', fallbackColors.interactivePrimaryHover),
    danger: getCSSVar('--interactive-danger', fallbackColors.interactiveDanger),
    dangerHover: getCSSVar('--interactive-danger-hover', '#dc2626'),
    success: getCSSVar('--interactive-success', fallbackColors.interactiveSuccess),
    successHover: getCSSVar('--interactive-success-hover', '#16a34a'),
    warning: getCSSVar('--interactive-warning', fallbackColors.interactiveWarning),
    warningHover: getCSSVar('--interactive-warning-hover', '#d97706'),
  },
  status: {
    present: {
      bg: getCSSVar('--status-present-bg', fallbackColors.statusPresentBg),
      text: getCSSVar('--status-present-text', fallbackColors.statusPresentText),
      border: getCSSVar('--status-present-border', fallbackColors.statusPresentBorder),
    },
    absent: {
      bg: getCSSVar('--status-absent-bg', fallbackColors.statusAbsentBg),
      text: getCSSVar('--status-absent-text', fallbackColors.statusAbsentText),
      border: getCSSVar('--status-absent-border', fallbackColors.statusAbsentBorder),
    },
    late: {
      bg: getCSSVar('--status-late-bg', fallbackColors.statusLateBg),
      text: getCSSVar('--status-late-text', fallbackColors.statusLateText),
      border: getCSSVar('--status-late-border', fallbackColors.statusLateBorder),
    },
    pending: {
      bg: getCSSVar('--status-pending-bg', fallbackColors.statusPendingBg),
      text: getCSSVar('--status-pending-text', fallbackColors.statusPendingText),
      border: getCSSVar('--status-pending-border', fallbackColors.statusPendingBorder),
    },
    left: {
      bg: getCSSVar('--status-left-bg', '#f3f4f6'),
      text: getCSSVar('--status-left-text', '#4b5563'),
      border: getCSSVar('--status-left-border', '#9ca3af'),
    },
    host: {
      bg: getCSSVar('--status-host-bg', '#fef9c3'),
      text: getCSSVar('--status-host-text', '#854d0e'),
      border: getCSSVar('--status-host-border', '#eab308'),
    },
    verified: {
      bg: getCSSVar('--status-verified-bg', '#d1fae5'),
      text: getCSSVar('--status-verified-text', '#065f46'),
      border: getCSSVar('--status-verified-border', '#10b981'),
    },
    guest: {
      bg: getCSSVar('--status-guest-bg', '#fce7f3'),
      text: getCSSVar('--status-guest-text', '#9d174d'),
      border: getCSSVar('--status-guest-border', '#ec4899'),
    },
  },
  sidebar: {
    bg: getCSSVar('--brand-primary', fallbackColors.brandPrimary),
    bgGradient: `linear-gradient(180deg, ${getCSSVar('--brand-primary', fallbackColors.brandPrimary)} 0%, ${getCSSVar('--brand-secondary', fallbackColors.brandSecondary)} 100%)`,
    text: '#ffffff',
    textMuted: 'rgba(255, 255, 255, 0.7)',
    itemHover: 'rgba(255, 255, 255, 0.1)',
    itemActive: 'rgba(255, 255, 255, 0.2)',
  }
})

/**
 * Theme-aware colors hook
 * Automatically updates when theme changes
 */
export const useColors = () => {
  // Subscribe to theme changes for re-render
  const theme = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    () => 'light' // Server snapshot
  )

  // Rebuild colors when theme changes
  const colors = useMemo(() => buildColors(), [theme])

  // Helper to get status style by name
  const getStatusStyle = useCallback((statusName) => {
    const normalized = statusName?.toLowerCase() || 'pending'
    const statusColors = colors.status[normalized] || colors.status.pending
    return {
      backgroundColor: statusColors.bg,
      color: statusColors.text,
      borderColor: statusColors.border,
    }
  }, [colors])

  // Helper to normalize status names
  const normalizeStatus = useCallback((status) => {
    if (!status) return 'pending'
    const s = status.toLowerCase()
    if (s === 'on time' || s === 'ontime') return 'present'
    if (s === 'excused') return 'late'
    return s
  }, [])

  return {
    ...colors,
    getStatusStyle,
    normalizeStatus,
    isDark: theme === 'dark',
    theme,
  }
}

/**
 * Get color value directly (for non-hook usage)
 * Note: This won't auto-update on theme change
 */
export const getColor = (category, name) => {
  const colors = buildColors()
  return colors[category]?.[name] || null
}

/**
 * CSS variable names for reference
 */
export const cssVarNames = {
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  bgSurface: '--bg-surface',
  bgPage: '--bg-page',
  borderDefault: '--border-default',
  brandPrimary: '--brand-primary',
  interactivePrimary: '--interactive-primary',
}

export default useColors
