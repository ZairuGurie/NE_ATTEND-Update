/**
 * Theme Context (Phase 5)
 * Provides dark mode support across the application
 *
 * Usage:
 *   // Wrap app with ThemeProvider
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 *
 *   // Use in components
 *   const { theme, toggleTheme, isDark } = useTheme()
 */

import React, { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

// Theme configurations
export const themes = {
  light: {
    name: 'light',
    // Text colors - FIXED: Dark text for light backgrounds (WCAG AA compliant)
    textStrong: '#030712',
    textPrimary: '#111827', // gray-900 - main text on light bg
    textSecondary: '#374151', // gray-700 - secondary text on light bg
    textMuted: '#6b7280', // gray-500 - muted text
    textDisabled: '#9ca3af',
    textOnDark: '#f9fafb',
    textOnBrand: '#ffffff',
    // Background colors
    bgPage: '#f4f6fb',
    bgSurface: '#ffffff',
    bgMuted: '#f9fafb',
    bgHover: '#f3f4f6',
    bgActive: '#e5e7eb',
    // Border colors
    border: '#e5e7eb',
    borderLight: '#f3f4f6',
    borderDark: '#d1d5db',
    borderFocus: '#3b82f6',
    // Shadows
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowColorStrong: 'rgba(0, 0, 0, 0.15)'
  },
  dark: {
    name: 'dark',
    // Text colors - ENHANCED: Lighter text for dark backgrounds (WCAG AA compliant)
    textStrong: '#ffffff', // Pure white for headings
    textPrimary: '#f3f4f6', // gray-100 - brighter main text
    textSecondary: '#d1d5db', // gray-300 - readable secondary text
    textMuted: '#9ca3af', // gray-400 - better contrast than #6b7280
    textDisabled: '#6b7280', // gray-500 - still visible but clearly disabled
    textOnDark: '#111827',
    textOnBrand: '#ffffff',
    // Background colors
    bgPage: '#0f172a',
    bgSurface: '#1e293b',
    bgMuted: '#334155',
    bgHover: '#475569',
    bgActive: '#64748b',
    // Border colors
    border: '#334155',
    borderLight: '#1e293b',
    borderDark: '#475569',
    borderFocus: '#60a5fa',
    // Shadows
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowColorStrong: 'rgba(0, 0, 0, 0.5)'
  }
}

/**
 * Mapping from theme keys to standard CSS variable names
 * This ensures CSS variables in index.css get updated on theme change
 */
const themeKeyToCSSVar = {
  textStrong: '--text-strong',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  textDisabled: '--text-disabled',
  textOnDark: '--text-on-dark',
  textOnBrand: '--text-on-brand',
  bgPage: '--bg-page',
  bgSurface: '--bg-surface',
  bgMuted: '--bg-muted',
  bgHover: '--bg-hover',
  bgActive: '--bg-active',
  border: '--border-default',
  borderLight: '--border-light',
  borderDark: '--border-dark',
  borderFocus: '--border-focus',
  shadowColor: '--shadow-color',
  shadowColorStrong: '--shadow-color-strong'
}

/**
 * Apply theme to document
 * Sets both standard CSS variables (--text-primary) and legacy --theme-* variables
 */
const applyTheme = themeName => {
  const theme = themes[themeName]
  const root = document.documentElement

  // Set data attribute for CSS selectors (used by [data-theme='dark'] in index.css)
  root.setAttribute('data-theme', themeName)

  // Apply CSS variables - both standard and legacy --theme-* prefix
  Object.entries(theme).forEach(([key, value]) => {
    if (key !== 'name') {
      // Set standard CSS variable (e.g., --text-primary)
      const standardVar = themeKeyToCSSVar[key]
      if (standardVar) {
        root.style.setProperty(standardVar, value)
      }

      // Also set legacy --theme-* variable for backwards compatibility
      const legacyVar = `--theme-${key
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()}`
      root.style.setProperty(legacyVar, value)
    }
  })

  // Update meta theme-color for mobile browsers
  const metaTheme = document.querySelector('meta[name="theme-color"]')
  if (metaTheme) {
    metaTheme.setAttribute('content', theme.bgPage)
  }
}

/**
 * Theme Provider Component
 */
export const ThemeProvider = ({ children, defaultTheme = 'light' }) => {
  // Initialize theme from localStorage or system preference
  const [theme, setTheme] = useState(() => {
    // Check localStorage first
    const stored = localStorage.getItem('neattend_theme')
    if (stored && themes[stored]) {
      return stored
    }

    // Check system preference
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }

    return defaultTheme
  })

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('neattend_theme', theme)
  }, [theme])

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = e => {
      // Only auto-switch if user hasn't manually set a preference
      const stored = localStorage.getItem('neattend_theme')
      if (!stored) {
        setTheme(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Toggle between light and dark
  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
  }

  // Set specific theme
  const setThemeMode = themeName => {
    if (themes[themeName]) {
      setTheme(themeName)
    }
  }

  const value = {
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    toggleTheme,
    setTheme: setThemeMode,
    colors: themes[theme]
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Hook to use theme context
 */
export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeContext
