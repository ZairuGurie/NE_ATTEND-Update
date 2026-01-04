/**
 * Tooltip Component (Phase 3)
 * Hover tooltip with multiple positions and variants
 *
 * Usage:
 *   <Tooltip content="Hello world">
 *     <button>Hover me</button>
 *   </Tooltip>
 *
 *   <Tooltip content="Info here" position="right" variant="dark">
 *     <span>Info icon</span>
 *   </Tooltip>
 */

import React, { useState, useRef, useEffect } from 'react'
import { neutral, brand } from '../../utils/colors'
import { shadows, zIndex } from '../../utils/shadows'

// Position configurations
const positions = {
  top: {
    tooltip: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginBottom: 8
    },
    arrow: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      borderTopColor: 'inherit'
    }
  },
  bottom: {
    tooltip: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginTop: 8
    },
    arrow: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      borderBottomColor: 'inherit'
    }
  },
  left: {
    tooltip: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginRight: 8
    },
    arrow: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      borderLeftColor: 'inherit'
    }
  },
  right: {
    tooltip: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginLeft: 8
    },
    arrow: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      borderRightColor: 'inherit'
    }
  }
}

// Variant configurations
const variantStyles = {
  dark: {
    background: neutral.textPrimary,
    color: neutral.textOnDark || '#fff',
    borderColor: neutral.textPrimary
  },
  light: {
    background: neutral.bgSurface,
    color: neutral.textPrimary,
    borderColor: neutral.border,
    boxShadow: shadows.lg
  },
  brand: {
    background: brand.secondary,
    color: '#fff',
    borderColor: brand.secondary
  }
}

/**
 * Tooltip Component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Trigger element
 * @param {React.ReactNode} props.content - Tooltip content
 * @param {'top'|'bottom'|'left'|'right'} props.position - Tooltip position
 * @param {'dark'|'light'|'brand'} props.variant - Visual variant
 * @param {number} props.delay - Show delay in ms
 * @param {boolean} props.disabled - Disable tooltip
 * @param {boolean} props.arrow - Show arrow pointer
 * @param {number} props.maxWidth - Max width of tooltip
 * @param {Object} props.style - Additional tooltip styles
 */
const Tooltip = ({
  children,
  content,
  position = 'top',
  variant = 'dark',
  delay = 200,
  disabled = false,
  arrow = true,
  maxWidth = 250,
  style = {}
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [actualPosition, setActualPosition] = useState(position)
  const timeoutRef = useRef(null)
  const tooltipRef = useRef(null)
  const triggerRef = useRef(null)

  const positionStyle = positions[actualPosition] || positions.top
  const variantStyle = variantStyles[variant] || variantStyles.dark

  // Handle mouse enter
  const handleMouseEnter = () => {
    if (disabled || !content) return
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  // Handle mouse leave
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Check if tooltip would be off-screen and adjust
  useEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let newPosition = position

      // Check boundaries and flip if needed
      if (position === 'top' && tooltipRect.top < 0) {
        newPosition = 'bottom'
      } else if (position === 'bottom' && tooltipRect.bottom > viewportHeight) {
        newPosition = 'top'
      } else if (position === 'left' && tooltipRect.left < 0) {
        newPosition = 'right'
      } else if (position === 'right' && tooltipRect.right > viewportWidth) {
        newPosition = 'left'
      }

      if (newPosition !== actualPosition) {
        setActualPosition(newPosition)
      }
    }
  }, [isVisible, position, actualPosition])

  // Reset position when not visible
  useEffect(() => {
    if (!isVisible) {
      setActualPosition(position)
    }
  }, [isVisible, position])

  if (!content) {
    return <>{children}</>
  }

  return (
    <div
      ref={triggerRef}
      style={{
        position: 'relative',
        display: 'inline-flex'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}

      {/* Tooltip */}
      {isVisible && (
        <div
          ref={tooltipRef}
          role='tooltip'
          style={{
            position: 'absolute',
            ...positionStyle.tooltip,
            zIndex: zIndex.tooltip,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            maxWidth,
            pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease-out',
            border:
              variant === 'light'
                ? `1px solid ${variantStyle.borderColor}`
                : 'none',
            ...variantStyle,
            ...style
          }}
        >
          {content}

          {/* Arrow */}
          {arrow && (
            <div
              style={{
                position: 'absolute',
                ...positionStyle.arrow,
                width: 0,
                height: 0,
                borderStyle: 'solid',
                borderWidth: 6,
                borderColor: 'transparent',
                ...(actualPosition === 'top' && {
                  borderTopColor: variantStyle.background
                }),
                ...(actualPosition === 'bottom' && {
                  borderBottomColor: variantStyle.background
                }),
                ...(actualPosition === 'left' && {
                  borderLeftColor: variantStyle.background
                }),
                ...(actualPosition === 'right' && {
                  borderRightColor: variantStyle.background
                })
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * InfoTooltip - Pre-styled info icon with tooltip
 */
export const InfoTooltip = ({
  content,
  size = 16,
  color = neutral.textMuted,
  ...props
}) => (
  <Tooltip content={content} {...props}>
    <i
      className='bi-info-circle'
      style={{
        fontSize: size,
        color,
        cursor: 'help'
      }}
    />
  </Tooltip>
)

/**
 * HelpTooltip - Pre-styled help icon with tooltip
 */
export const HelpTooltip = ({
  content,
  size = 16,
  color = neutral.textMuted,
  ...props
}) => (
  <Tooltip content={content} {...props}>
    <i
      className='bi-question-circle'
      style={{
        fontSize: size,
        color,
        cursor: 'help'
      }}
    />
  </Tooltip>
)

export default Tooltip
