/**
 * Hooks barrel export
 * Import hooks from this file for cleaner imports
 *
 * Usage:
 *   import { useTheme, useColors, useLocalStorage, useDebounce } from '../hooks'
 */

// Theme hook with design tokens (static colors)
export {
  useTheme,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  transitions,
  buttonStyles,
  inputStyles,
  cardStyles,
  layoutStyles,
  badgeStyles
} from './useTheme'

// Theme-aware colors hook (reads from CSS variables, responds to dark mode)
export { useColors, getColor, cssVarNames } from './useColors'
