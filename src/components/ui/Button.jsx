/**
 * Button Component (Phase 1 Enhanced)
 * Reusable button with various variants, sizes, and enhanced interactions
 *
 * Usage:
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Click Me
 * </Button>
 */

import React from 'react'
import { interactive, neutral } from '../../utils/colors'
import { shadows } from '../../utils/shadows'

// Button variants with their styles - ENHANCED with focus states
const variants = {
  primary: {
    background: interactive.primary,
    color: neutral.textOnBrand,
    border: 'none',
    hoverBg: interactive.primaryHover,
    activeBg: interactive.primaryActive,
    focusRing: interactive.primaryFocus,
    shadow: shadows.sm,
    hoverShadow: shadows.md
  },
  secondary: {
    background: neutral.bgMuted,
    color: neutral.textPrimary,
    border: `1px solid ${neutral.border}`,
    hoverBg: neutral.bgHover,
    activeBg: neutral.bgActive,
    focusRing: interactive.secondaryFocus,
    shadow: 'none',
    hoverShadow: shadows.xs
  },
  success: {
    background: interactive.success,
    color: neutral.textOnBrand,
    border: 'none',
    hoverBg: interactive.successHover,
    activeBg: interactive.successActive,
    focusRing: interactive.successFocus,
    shadow: shadows.sm,
    hoverShadow: shadows.md
  },
  danger: {
    background: interactive.danger,
    color: neutral.textOnBrand,
    border: 'none',
    hoverBg: interactive.dangerHover,
    activeBg: interactive.dangerActive,
    focusRing: interactive.dangerFocus,
    shadow: shadows.sm,
    hoverShadow: shadows.md
  },
  warning: {
    background: interactive.warning,
    color: neutral.textOnBrand,
    border: 'none',
    hoverBg: interactive.warningHover,
    activeBg: interactive.warningActive,
    focusRing: interactive.warningFocus,
    shadow: shadows.sm,
    hoverShadow: shadows.md
  },
  ghost: {
    background: 'transparent',
    color: neutral.textPrimary,
    border: 'none',
    hoverBg: neutral.bgMuted,
    activeBg: neutral.bgHover,
    focusRing: interactive.primaryFocus,
    shadow: 'none',
    hoverShadow: 'none'
  },
  outline: {
    background: 'transparent',
    color: interactive.primary,
    border: `2px solid ${interactive.primary}`,
    hoverBg: 'rgba(59, 130, 246, 0.08)',
    activeBg: 'rgba(59, 130, 246, 0.15)',
    focusRing: interactive.primaryFocus,
    shadow: 'none',
    hoverShadow: shadows.xs
  }
}

// Button sizes
const sizes = {
  sm: {
    padding: '6px 12px',
    fontSize: 13,
    borderRadius: 6
  },
  md: {
    padding: '10px 20px',
    fontSize: 14,
    borderRadius: 8
  },
  lg: {
    padding: '14px 28px',
    fontSize: 16,
    borderRadius: 10
  }
}

/**
 * Button Component (Phase 1 Enhanced)
 * @param {Object} props
 * @param {'primary'|'secondary'|'success'|'danger'|'warning'|'ghost'|'outline'} props.variant
 * @param {'sm'|'md'|'lg'} props.size
 * @param {boolean} props.fullWidth - Full width button
 * @param {boolean} props.loading - Show loading state
 * @param {boolean} props.disabled - Disabled state
 * @param {string} props.icon - Bootstrap icon class (left) - alias: leftIcon
 * @param {string} props.iconRight - Bootstrap icon class (right) - alias: rightIcon
 * @param {string} props.leftIcon - Alias for icon (left icon)
 * @param {string} props.rightIcon - Alias for iconRight (right icon)
 * @param {React.ReactNode} props.children - Button content
 * @param {Function} props.onClick - Click handler
 * @param {string} props.type - Button type (button, submit, reset)
 * @param {Object} props.style - Additional styles
 */
const Button = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  icon,
  iconRight,
  leftIcon, // Destructure to prevent passing to DOM (alias for icon)
  rightIcon, // Destructure to prevent passing to DOM (alias for iconRight)
  children,
  onClick,
  type = 'button',
  style = {},
  ...props
}) => {
  // Support both icon/leftIcon and iconRight/rightIcon naming conventions
  const effectiveLeftIcon = icon || leftIcon
  const effectiveRightIcon = iconRight || rightIcon
  const variantStyles = variants[variant] || variants.primary
  const sizeStyles = sizes[size] || sizes.md
  const isDisabled = disabled || loading

  // Enhanced hover handler with shadow
  const handleMouseEnter = e => {
    if (!isDisabled) {
      e.currentTarget.style.background = variantStyles.hoverBg
      e.currentTarget.style.transform = 'translateY(-1px)'
      if (variantStyles.hoverShadow) {
        e.currentTarget.style.boxShadow = variantStyles.hoverShadow
      }
    }
  }

  // Reset to default state
  const handleMouseLeave = e => {
    if (!isDisabled) {
      e.currentTarget.style.background = variantStyles.background
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = variantStyles.shadow || 'none'
    }
  }

  // Active/pressed state
  const handleMouseDown = e => {
    if (!isDisabled) {
      e.currentTarget.style.background =
        variantStyles.activeBg || variantStyles.hoverBg
      e.currentTarget.style.transform = 'translateY(0) scale(0.98)'
    }
  }

  // Release active state
  const handleMouseUp = e => {
    if (!isDisabled) {
      e.currentTarget.style.background = variantStyles.hoverBg
      e.currentTarget.style.transform = 'translateY(-1px) scale(1)'
    }
  }

  // Focus handler with focus ring
  const handleFocus = e => {
    if (!isDisabled && variantStyles.focusRing) {
      e.currentTarget.style.boxShadow = `0 0 0 3px ${variantStyles.focusRing}`
      e.currentTarget.style.outline = 'none'
    }
  }

  // Blur handler to remove focus ring
  const handleBlur = e => {
    e.currentTarget.style.boxShadow = variantStyles.shadow || 'none'
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        width: fullWidth ? '100%' : 'auto',
        boxShadow: variantStyles.shadow || 'none',
        ...variantStyles,
        ...sizeStyles,
        ...style
      }}
      {...props}
    >
      {loading ? (
        <>
          <span
            style={{
              width: 16,
              height: 16,
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }}
          />
          Loading...
        </>
      ) : (
        <>
          {effectiveLeftIcon && (
            <i
              className={effectiveLeftIcon}
              style={{ fontSize: sizeStyles.fontSize }}
            />
          )}
          {children}
          {effectiveRightIcon && (
            <i
              className={effectiveRightIcon}
              style={{ fontSize: sizeStyles.fontSize }}
            />
          )}
        </>
      )}
    </button>
  )
}

export default Button
