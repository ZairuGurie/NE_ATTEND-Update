/**
 * Animation Utilities (Phase 5)
 * Reusable animation configurations and helpers
 *
 * Usage:
 *   import { fadeIn, slideUp, stagger, spring } from '../utils/animations'
 */

// ============================================================================
// Animation Presets
// ============================================================================

/**
 * Fade animations
 */
export const fade = {
  in: {
    from: { opacity: 0 },
    to: { opacity: 1 },
    duration: 200,
    easing: 'ease-out'
  },
  out: {
    from: { opacity: 1 },
    to: { opacity: 0 },
    duration: 150,
    easing: 'ease-in'
  }
}

/**
 * Slide animations
 */
export const slide = {
  up: {
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
    duration: 300,
    easing: 'ease-out'
  },
  down: {
    from: { opacity: 0, transform: 'translateY(-20px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
    duration: 300,
    easing: 'ease-out'
  },
  left: {
    from: { opacity: 0, transform: 'translateX(20px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
    duration: 300,
    easing: 'ease-out'
  },
  right: {
    from: { opacity: 0, transform: 'translateX(-20px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
    duration: 300,
    easing: 'ease-out'
  }
}

/**
 * Scale animations
 */
export const scale = {
  in: {
    from: { opacity: 0, transform: 'scale(0.9)' },
    to: { opacity: 1, transform: 'scale(1)' },
    duration: 200,
    easing: 'ease-out'
  },
  out: {
    from: { opacity: 1, transform: 'scale(1)' },
    to: { opacity: 0, transform: 'scale(0.9)' },
    duration: 150,
    easing: 'ease-in'
  },
  bounce: {
    from: { transform: 'scale(0.3)' },
    to: { transform: 'scale(1)' },
    duration: 500,
    easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
  }
}

/**
 * Spring physics-based easing curves
 */
export const spring = {
  gentle: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  bouncy: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  snappy: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)'
}

/**
 * Timing functions
 */
export const easing = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeInBack: 'cubic-bezier(0.6, -0.28, 0.735, 0.045)',
  easeOutBack: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  easeInOutBack: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
}

/**
 * Duration presets (in ms)
 */
export const duration = {
  instant: 0,
  fast: 150,
  normal: 200,
  slow: 300,
  slower: 500,
  slowest: 1000
}

// ============================================================================
// Animation Helpers
// ============================================================================

/**
 * Generate staggered delay for list items
 * @param {number} index - Item index
 * @param {number} baseDelay - Base delay per item (ms)
 * @param {number} maxDelay - Maximum total delay (ms)
 * @returns {number} Delay in ms
 */
export const staggerDelay = (index, baseDelay = 50, maxDelay = 500) => {
  return Math.min(index * baseDelay, maxDelay)
}

/**
 * Generate staggered animation style for list items
 * @param {number} index - Item index
 * @param {Object} options - Animation options
 * @returns {Object} Style object with animation delay
 */
export const staggerStyle = (index, options = {}) => {
  const {
    baseDelay = 50,
    maxDelay = 500,
    animation = 'fadeInUp',
    duration: dur = 300
  } = options

  const delay = staggerDelay(index, baseDelay, maxDelay)

  return {
    animation: `${animation} ${dur}ms ease-out ${delay}ms both`
  }
}

/**
 * Create CSS keyframes string
 * @param {string} name - Animation name
 * @param {Object} keyframes - Keyframe definitions
 * @returns {string} CSS keyframes string
 */
export const createKeyframes = (name, keyframes) => {
  const frames = Object.entries(keyframes)
    .map(([key, value]) => {
      const props = Object.entries(value)
        .map(([prop, val]) => `${prop}: ${val}`)
        .join('; ')
      return `${key} { ${props} }`
    })
    .join(' ')

  return `@keyframes ${name} { ${frames} }`
}

/**
 * Generate transition string
 * @param {string|string[]} properties - CSS properties to transition
 * @param {number} dur - Duration in ms
 * @param {string} ease - Easing function
 * @returns {string} CSS transition value
 */
export const transition = (
  properties,
  dur = duration.normal,
  ease = 'ease'
) => {
  const props = Array.isArray(properties) ? properties : [properties]
  return props.map(p => `${p} ${dur}ms ${ease}`).join(', ')
}

/**
 * Common transition presets
 */
export const transitions = {
  all: transition('all', duration.normal),
  allFast: transition('all', duration.fast),
  allSlow: transition('all', duration.slow),
  colors: transition(
    ['background-color', 'border-color', 'color'],
    duration.fast
  ),
  transform: transition('transform', duration.normal, spring.snappy),
  opacity: transition('opacity', duration.fast),
  shadow: transition('box-shadow', duration.normal)
}

// ============================================================================
// Interactive Animation Hooks
// ============================================================================

/**
 * Hover animation styles
 */
export const hoverStyles = {
  lift: {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
  },
  scale: {
    transform: 'scale(1.02)'
  },
  glow: (color = 'rgba(59, 130, 246, 0.3)') => ({
    boxShadow: `0 0 20px ${color}`
  }),
  brighten: {
    filter: 'brightness(1.1)'
  }
}

/**
 * Press/Active animation styles
 */
export const pressStyles = {
  scale: {
    transform: 'scale(0.98)'
  },
  press: {
    transform: 'translateY(1px)'
  }
}

/**
 * Focus animation styles
 */
export const focusStyles = {
  ring: (color = 'rgba(59, 130, 246, 0.4)') => ({
    boxShadow: `0 0 0 3px ${color}`,
    outline: 'none'
  }),
  outline: {
    outline: '2px solid currentColor',
    outlineOffset: 2
  }
}

// ============================================================================
// Page Transition Presets
// ============================================================================

export const pageTransitions = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    duration: 200
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    duration: 300
  },
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    duration: 300
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.05 },
    duration: 200
  }
}

// ============================================================================
// Number Animation
// ============================================================================

/**
 * Animate a number from start to end
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} dur - Duration in ms
 * @param {Function} callback - Called with current value on each frame
 * @param {string} ease - Easing type ('linear' | 'easeOut' | 'easeInOut')
 */
export const animateNumber = (start, end, dur, callback, ease = 'easeOut') => {
  const startTime = performance.now()
  const diff = end - start

  const easingFns = {
    linear: t => t,
    easeOut: t => 1 - Math.pow(1 - t, 3),
    easeInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  }

  const easeFn = easingFns[ease] || easingFns.easeOut

  const tick = currentTime => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / dur, 1)
    const easedProgress = easeFn(progress)
    const current = start + diff * easedProgress

    callback(current)

    if (progress < 1) {
      requestAnimationFrame(tick)
    }
  }

  requestAnimationFrame(tick)
}

/**
 * Format number with commas
 */
export const formatNumber = (num, decimals = 0) => {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export default {
  fade,
  slide,
  scale,
  spring,
  easing,
  duration,
  staggerDelay,
  staggerStyle,
  transition,
  transitions,
  hoverStyles,
  pressStyles,
  focusStyles,
  pageTransitions,
  animateNumber,
  formatNumber
}
