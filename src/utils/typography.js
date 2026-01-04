/**
 * NE-ATTEND Design System Typography
 *
 * This file defines a consistent typography scale for the entire application.
 * Includes font sizes, line heights, weights, and helper functions.
 *
 * Usage:
 *   import { typography, fontSize, fontWeight, lineHeight } from '../utils/typography'
 *
 *   // Use in styles:
 *   style={{ ...typography.heading.lg }}
 *   style={{ fontSize: fontSize.base, lineHeight: lineHeight.normal }}
 */

// ============================================================================
// FONT SIZES (in pixels)
// ============================================================================
export const fontSize = {
  xs: 12, // Captions, badges, small labels
  sm: 13, // Secondary text, hints
  base: 14, // Default body text
  md: 16, // Large body text
  lg: 18, // Subheadings, section titles
  xl: 20, // Page subtitles
  '2xl': 24, // Page titles
  '3xl': 28, // Hero headings
  '4xl': 32, // Large hero headings
  '5xl': 40 // Display headings
}

// ============================================================================
// LINE HEIGHTS (as multipliers)
// ============================================================================
export const lineHeight = {
  none: 1, // For single-line text with tight spacing
  tight: 1.25, // For headings
  snug: 1.375, // For subheadings
  normal: 1.5, // Default for body text
  relaxed: 1.625, // For paragraphs that need more breathing room
  loose: 2 // For spaced out text
}

// ============================================================================
// FONT WEIGHTS
// ============================================================================
export const fontWeight = {
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800
}

// ============================================================================
// LETTER SPACING
// ============================================================================
export const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em'
}

// ============================================================================
// FONT FAMILIES
// ============================================================================
export const fontFamily = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"Fira Code", "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace'
}

// ============================================================================
// PRE-BUILT TYPOGRAPHY STYLES
// ============================================================================
export const typography = {
  // Display text - for hero sections
  display: {
    xl: {
      fontSize: fontSize['5xl'],
      fontWeight: fontWeight.extrabold,
      lineHeight: lineHeight.tight,
      letterSpacing: letterSpacing.tight
    },
    lg: {
      fontSize: fontSize['4xl'],
      fontWeight: fontWeight.bold,
      lineHeight: lineHeight.tight,
      letterSpacing: letterSpacing.tight
    }
  },

  // Headings
  heading: {
    xl: {
      fontSize: fontSize['3xl'],
      fontWeight: fontWeight.bold,
      lineHeight: lineHeight.tight
    },
    lg: {
      fontSize: fontSize['2xl'],
      fontWeight: fontWeight.bold,
      lineHeight: lineHeight.snug
    },
    md: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.snug
    },
    sm: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.snug
    },
    xs: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.normal
    }
  },

  // Body text
  body: {
    lg: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.normal,
      lineHeight: lineHeight.relaxed
    },
    md: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.normal,
      lineHeight: lineHeight.normal
    },
    sm: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.normal,
      lineHeight: lineHeight.normal
    }
  },

  // Labels and captions
  label: {
    lg: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.normal,
      letterSpacing: letterSpacing.wide
    },
    md: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.normal,
      letterSpacing: letterSpacing.wide
    },
    sm: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      lineHeight: lineHeight.normal,
      letterSpacing: letterSpacing.wider
    }
  },

  // Captions and helper text
  caption: {
    md: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.normal,
      lineHeight: lineHeight.normal
    },
    sm: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.normal,
      lineHeight: lineHeight.normal
    }
  },

  // Buttons
  button: {
    lg: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.none,
      letterSpacing: letterSpacing.wide
    },
    md: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.none
    },
    sm: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.none
    }
  },

  // Badges/Tags
  badge: {
    md: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      lineHeight: lineHeight.none,
      letterSpacing: letterSpacing.wide
    },
    sm: {
      fontSize: 10,
      fontWeight: fontWeight.bold,
      lineHeight: lineHeight.none,
      letterSpacing: letterSpacing.wider
    }
  },

  // Code/Monospace
  code: {
    md: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.normal,
      lineHeight: lineHeight.normal
    },
    sm: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.normal,
      lineHeight: lineHeight.normal
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get typography style object
 * @param {string} category - 'heading', 'body', 'label', 'caption', 'button', 'badge'
 * @param {string} size - 'xl', 'lg', 'md', 'sm', 'xs'
 * @returns {Object} Typography style object
 */
export const getTypography = (category = 'body', size = 'md') => {
  const categoryStyles = typography[category]
  if (!categoryStyles) {
    return typography.body.md
  }
  return categoryStyles[size] || categoryStyles.md || typography.body.md
}

/**
 * Create responsive font size
 * @param {number} baseSize - Base font size in pixels
 * @param {number} minSize - Minimum font size in pixels
 * @returns {string} CSS clamp() value
 */
export const responsiveFontSize = (baseSize, minSize = 12) => {
  const vwSize = baseSize / 16 // Convert to vw approximation
  return `clamp(${minSize}px, ${vwSize}vw + 0.5rem, ${baseSize}px)`
}

/**
 * Truncate text with ellipsis
 * @param {number} lines - Number of lines before truncation
 * @returns {Object} Style object for text truncation
 */
export const truncateText = (lines = 1) => {
  if (lines === 1) {
    return {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
  }
}

// Default export
export default {
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
  fontFamily,
  typography,
  getTypography,
  responsiveFontSize,
  truncateText
}
