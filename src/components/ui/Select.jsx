/**
 * Select Component
 * Reusable dropdown select with label and error support
 *
 * Usage:
 * <Select
 *   label="Subject"
 *   value={filterSubject}
 *   onChange={(e) => setFilterSubject(e.target.value)}
 *   options={[
 *     { value: '', label: 'All Subjects' },
 *     { value: 'math', label: 'Mathematics' }
 *   ]}
 * />
 */

import React, { forwardRef } from 'react'
import { neutral, interactive, status, brand } from '../../utils/colors'

// Select variants
const variants = {
  default: {
    background: neutral.bgSurface,
    color: neutral.textPrimary,
    border: neutral.borderDefault
  },
  primary: {
    background: brand.primary,
    color: neutral.textLight,
    border: brand.primary
  },
  dark: {
    background: brand.secondary,
    color: neutral.textLight,
    border: brand.secondary
  }
}

// Select sizes
const sizes = {
  sm: { padding: '8px 12px', fontSize: 13 },
  md: { padding: '12px 16px', fontSize: 14 },
  lg: { padding: '14px 20px', fontSize: 16 }
}

/**
 * Select Component
 * @param {Object} props
 * @param {string} props.label - Select label
 * @param {string} props.value - Selected value
 * @param {Function} props.onChange - Change handler
 * @param {Array} props.options - Array of { value, label } objects
 * @param {string} props.placeholder - Placeholder option text
 * @param {string} props.error - Error message
 * @param {string} props.hint - Hint text
 * @param {boolean} props.required - Show required indicator
 * @param {boolean} props.disabled - Disabled state
 * @param {boolean} props.fullWidth - Full width select
 * @param {'default'|'primary'|'dark'} props.variant - Select style variant
 * @param {'sm'|'md'|'lg'} props.size - Select size
 * @param {Object} props.style - Additional select styles
 * @param {Object} props.containerStyle - Additional container styles
 */
const Select = forwardRef(
  (
    {
      label,
      value,
      onChange,
      options = [],
      placeholder,
      error,
      hint,
      required = false,
      disabled = false,
      fullWidth = true,
      variant = 'default',
      size = 'md',
      style = {},
      containerStyle = {},
      ...props
    },
    ref
  ) => {
    const hasError = Boolean(error)
    const variantStyles = variants[variant] || variants.default
    const sizeStyles = sizes[size] || sizes.md

    return (
      <div
        style={{
          width: fullWidth ? '100%' : 'auto',
          marginBottom: label ? 16 : 0,
          ...containerStyle
        }}
      >
        {/* Label */}
        {label && (
          <label
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 13,
              fontWeight: 600,
              color: neutral.textSecondary
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

        {/* Select wrapper */}
        <div style={{ position: 'relative' }}>
          <select
            ref={ref}
            value={value}
            onChange={onChange}
            disabled={disabled}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: `1px solid ${
                hasError ? status.absent.border : variantStyles.border
              }`,
              borderRadius: 8,
              background: disabled ? neutral.bgMuted : variantStyles.background,
              color: variantStyles.color,
              outline: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              appearance: 'none',
              paddingRight: 40,
              ...sizeStyles,
              ...style
            }}
            onFocus={e => {
              if (!hasError && variant === 'default') {
                e.target.style.borderColor = interactive.primary
                e.target.style.boxShadow = `0 0 0 3px rgba(59, 130, 246, 0.15)`
              }
            }}
            onBlur={e => {
              e.target.style.borderColor = hasError
                ? status.absent.border
                : variantStyles.border
              e.target.style.boxShadow = 'none'
            }}
            {...props}
          >
            {placeholder && (
              <option value='' disabled={required}>
                {placeholder}
              </option>
            )}
            {options.map((option, idx) => (
              <option
                key={option.value || idx}
                value={option.value}
                style={{
                  background: neutral.bgSurface,
                  color: neutral.textPrimary
                }}
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown arrow */}
          <i
            className='bi-chevron-down'
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 14,
              color: variantStyles.color,
              pointerEvents: 'none',
              opacity: 0.7
            }}
          />
        </div>

        {/* Error message */}
        {error && (
          <p
            style={{
              margin: '6px 0 0 0',
              fontSize: 12,
              color: status.absent.text,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <i className='bi-exclamation-circle' />
            {error}
          </p>
        )}

        {/* Hint text */}
        {hint && !error && (
          <p
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

Select.displayName = 'Select'

export default Select
