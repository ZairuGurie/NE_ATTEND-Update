/**
 * NE-ATTEND Design System
 *
 * Central export for all design tokens and utilities.
 * Import from this file for consistent styling across the application.
 *
 * Usage:
 *   import { colors, typography, shadows } from '../utils/design-system'
 *
 *   // Or import specific modules:
 *   import { neutral, brand, status } from '../utils/design-system'
 */

// ============================================================================
// COLORS
// ============================================================================
export {
  brand,
  status,
  neutral,
  interactive,
  sidebar,
  getStatusStyle,
  getAttendanceStatusColor,
  getParticipantStatusStyle,
  normalizeStatus,
  legacyColors,
  cssVars
} from './colors'

// ============================================================================
// TYPOGRAPHY
// ============================================================================
export {
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
  fontFamily,
  typography,
  getTypography,
  responsiveFontSize,
  truncateText
} from './typography'

// ============================================================================
// SHADOWS & SPACING
// ============================================================================
export {
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
} from './shadows'

// ============================================================================
// CONVENIENCE OBJECTS
// ============================================================================

// Import full modules for namespace access
import colorsModule from './colors'
import typographyModule from './typography'
import shadowsModule from './shadows'

// Re-export as namespaced objects
export const colors = colorsModule
export const typo = typographyModule
export const shadow = shadowsModule

// ============================================================================
// DESIGN SYSTEM VERSION
// ============================================================================
export const DESIGN_SYSTEM_VERSION = '1.0.0'
export const DESIGN_SYSTEM_PHASE = 'Phase 1 - Typography Enhancement'

// Default export with all modules
export default {
  colors: colorsModule,
  typography: typographyModule,
  shadows: shadowsModule,
  version: DESIGN_SYSTEM_VERSION,
  phase: DESIGN_SYSTEM_PHASE
}
