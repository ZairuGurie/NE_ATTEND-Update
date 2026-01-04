/**
 * Input Component (Phase 2 Enhanced)
 * Reusable form input with label, error, success states, and enhanced focus
 *
 * Usage:
 * <Input
 *   label="Email"
 *   type="email"
 *   placeholder="Enter your email"
 *   value={email}
 *   onChange={(e) => setEmail(e.target.value)}
 *   error="Invalid email format"
 *   success="Email is valid"
 *   icon="bi-envelope"
 * />
 */

import React, { forwardRef, useState, useId } from 'react'
import { neutral, interactive, status } from '../../utils/colors'

/**
 * Input Component
 * @param {Object} props
 * @param {string} props.label - Input label
 * @param {string} props.type - Input type (text, email, password, etc.)
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.error - Error message
 * @param {string} props.success - Success message (shows green state)
 * @param {string} props.hint - Hint text below input
 * @param {string} props.icon - Bootstrap icon class (left) - alias: leftIcon
 * @param {string} props.iconRight - Bootstrap icon class (right) - alias: rightIcon
 * @param {string} props.leftIcon - Alias for icon (left icon)
 * @param {string} props.rightIcon - Alias for iconRight (right icon)
 * @param {boolean} props.required - Show required indicator
 * @param {boolean} props.disabled - Disabled state
 * @param {boolean} props.loading - Loading state (shows spinner)
 * @param {boolean} props.fullWidth - Full width input
 * @param {'sm'|'md'|'lg'} props.size - Input size
 * @param {number} props.maxLength - Maximum character length (shows counter)
 * @param {Object} props.style - Additional input styles
 * @param {Object} props.containerStyle - Additional container styles
 * @param {string} props.id - Custom input id (auto-generated if not provided)
 * @param {string} props.name - Form field name (defaults to id)
 */
const Input = forwardRef(
  (
    {
      label,
      type = 'text',
      placeholder,
      value,
      onChange,
      error,
      success,
      hint,
      icon,
      iconRight,
      leftIcon, // Destructure to prevent passing to DOM (alias for icon)
      rightIcon, // Destructure to prevent passing to DOM (alias for iconRight)
      required = false,
      disabled = false,
      loading = false,
      fullWidth = true,
      size = 'md',
      maxLength,
      style = {},
      containerStyle = {},
      id: propId, // Optional custom id
      name, // Form field name
      ...props
    },
    ref
  ) => {
    // Generate unique ID for accessibility (label-input association)
    const generatedId = useId()
    const inputId = propId || `input-${generatedId}`

    // Support both icon/leftIcon and iconRight/rightIcon naming conventions
    const effectiveLeftIcon = icon || leftIcon
    const effectiveRightIcon = iconRight || rightIcon
    const [isFocused, setIsFocused] = useState(false)
    const hasError = Boolean(error)
    const hasSuccess = Boolean(success) && !hasError
    const isDisabled = disabled || loading

    // Size configurations
    const sizes = {
      sm: { padding: '8px 12px', fontSize: 13, iconSize: 14 },
      md: { padding: '10px 14px', fontSize: 14, iconSize: 16 },
      lg: { padding: '14px 18px', fontSize: 16, iconSize: 18 }
    }

    const sizeStyles = sizes[size] || sizes.md

    // Calculate padding based on icons and state indicators
    const hasLeftIcon = Boolean(effectiveLeftIcon)
    const hasRightIndicator =
      hasError || hasSuccess || loading || effectiveRightIcon
    const iconPadding = hasLeftIcon ? { paddingLeft: 40 } : {}
    const iconRightPadding = hasRightIndicator ? { paddingRight: 40 } : {}

    // Get border color based on state
    const getBorderColor = () => {
      if (hasError) return status.absent.border
      if (hasSuccess) return status.present.border
      if (isFocused) return interactive.primary
      return neutral.border
    }

    // Get focus shadow based on state
    const getFocusShadow = () => {
      if (!isFocused) return 'none'
      if (hasError) return `0 0 0 3px ${interactive.dangerFocus}`
      if (hasSuccess) return `0 0 0 3px ${interactive.successFocus}`
      return `0 0 0 3px ${interactive.primaryFocus}`
    }

    // Character count for maxLength
    const charCount = typeof value === 'string' ? value.length : 0
    const isOverLimit = maxLength && charCount > maxLength

    return (
      <div
        style={{
          width: fullWidth ? '100%' : 'auto',
          marginBottom: 16,
          ...containerStyle
        }}
      >
        {/* Label row with optional character counter */}
        {(label || maxLength) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6
            }}
          >
            {label && (
              <label
                htmlFor={inputId}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: neutral.textOnDark,
                  cursor: 'pointer'
                }}
              >
                {label}
                {required && (
                  <span style={{ color: status.absent.text, marginLeft: 4 }}>
                    *
                  </span>
                )}
              </label>
            )}
            {maxLength && (
              <span
                style={{
                  fontSize: 11,
                  color: isOverLimit ? status.absent.text : neutral.textMuted,
                  fontWeight: isOverLimit ? 600 : 400
                }}
              >
                {charCount}/{maxLength}
              </span>
            )}
          </div>
        )}

        {/* Input wrapper */}
        <div style={{ position: 'relative' }}>
          {/* Left icon */}
          {effectiveLeftIcon && (
            <i
              className={effectiveLeftIcon}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translate(-2px, -90%)',
                fontSize: sizeStyles.iconSize,
                color: hasError
                  ? status.absent.text
                  : hasSuccess
                  ? status.present.text
                  : isFocused
                  ? interactive.primary
                  : neutral.textMuted,
                pointerEvents: 'none',
                transition: 'color 0.2s ease'
              }}
            />
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            name={name || inputId}
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            disabled={isDisabled}
            maxLength={maxLength}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: `2px solid ${getBorderColor()}`,
              borderRadius: 8,
              background: isDisabled ? neutral.bgMuted : neutral.bgSurface,
              color: neutral.textPrimary,
              outline: 'none',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: getFocusShadow(),
              ...sizeStyles,
              ...iconPadding,
              ...iconRightPadding,
              ...style
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            aria-invalid={hasError}
            aria-describedby={
              error ? 'input-error' : hint ? 'input-hint' : undefined
            }
            {...props}
          />

          {/* Right indicator: loading, success, error, or custom icon */}
          <div
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none'
            }}
          >
            {loading && (
              <span
                style={{
                  width: sizeStyles.iconSize,
                  height: sizeStyles.iconSize,
                  border: `2px solid ${neutral.borderDark}`,
                  borderTopColor: interactive.primary,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
            )}
            {!loading && hasSuccess && (
              <i
                className='bi-check-circle-fill'
                style={{
                  fontSize: sizeStyles.iconSize,
                  color: status.present.border,
                  animation: 'scaleIn 0.2s ease-out'
                }}
              />
            )}
            {!loading && hasError && !effectiveRightIcon && (
              <i
                className='bi-exclamation-circle-fill'
                style={{
                  fontSize: sizeStyles.iconSize,
                  color: status.absent.border
                }}
              />
            )}
            {!loading && !hasSuccess && !hasError && effectiveRightIcon && (
              <i
                className={effectiveRightIcon}
                style={{
                  fontSize: sizeStyles.iconSize,
                  color: neutral.textMuted
                }}
              />
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p
            id='input-error'
            role='alert'
            style={{
              margin: '6px 0 0 0',
              fontSize: 12,
              color: status.absent.text,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              animation: 'fadeInUp 0.2s ease-out'
            }}
          >
            <i className='bi-exclamation-circle' />
            {error}
          </p>
        )}

        {/* Success message */}
        {success && !error && (
          <p
            style={{
              margin: '6px 0 0 0',
              fontSize: 12,
              color: status.present.text,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              animation: 'fadeInUp 0.2s ease-out'
            }}
          >
            <i className='bi-check-circle' />
            {success}
          </p>
        )}

        {/* Hint text */}
        {hint && !error && !success && (
          <p
            id='input-hint'
            style={{
              margin: '6px 0 0 0',
              fontSize: 12,
              color: neutral.textMuted
            }}
          >
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
