/**
 * Card Component (Phase 2 Enhanced)
 * Reusable card container with header, body, footer, categories, and elevations
 *
 * Usage:
 * <Card category="success" elevated>
 *   <Card.Header title="Card Title" actions={<Button>Action</Button>} />
 *   <Card.Body>Content here</Card.Body>
 *   <Card.Footer>Footer content</Card.Footer>
 * </Card>
 */

import React from 'react'
import { neutral, brand, status } from '../../utils/colors'
import { shadows, coloredShadows } from '../../utils/shadows'

// Category color configurations
const categoryColors = {
  primary: { border: brand.secondary, shadow: coloredShadows.brand },
  success: { border: status.present.border, shadow: coloredShadows.present },
  warning: { border: status.late.border, shadow: coloredShadows.late },
  danger: { border: status.absent.border, shadow: coloredShadows.absent },
  info: { border: status.pending.border, shadow: coloredShadows.pending },
  host: { border: status.host.border, shadow: coloredShadows.host }
}

/**
 * Card Header Component
 */
const CardHeader = ({
  title,
  subtitle,
  icon,
  iconBg,
  actions,
  children,
  compact = false,
  style = {}
}) => {
  // Determine icon background color
  const getIconBg = () => {
    if (iconBg) return iconBg
    return neutral.bgMuted
  }

  return (
    <div
      style={{
        padding: compact ? '12px 16px' : '16px 24px',
        borderBottom: `1px solid ${neutral.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        ...style
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icon && (
          <div
            style={{
              width: compact ? 36 : 40,
              height: compact ? 36 : 40,
              borderRadius: 10,
              background: getIconBg(),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <i
              className={icon}
              style={{
                fontSize: compact ? 16 : 18,
                color: neutral.textSecondary
              }}
            />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          {title && (
            <h3
              style={{
                margin: 0,
                fontSize: compact ? 15 : 16,
                fontWeight: 600,
                color: neutral.textPrimary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {title}
            </h3>
          )}
          {subtitle && (
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: compact ? 12 : 13,
                color: neutral.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>
      )}
    </div>
  )
}

/**
 * Card Body Component
 */
const CardBody = ({ children, noPadding = false, style = {} }) => (
  <div
    style={{
      padding: noPadding ? 0 : 24,
      ...style
    }}
  >
    {children}
  </div>
)

/**
 * Card Footer Component
 */
const CardFooter = ({ children, align = 'right', style = {} }) => (
  <div
    style={{
      padding: '16px 24px',
      borderTop: `1px solid ${neutral.borderLight}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent:
        align === 'right'
          ? 'flex-end'
          : align === 'center'
          ? 'center'
          : 'flex-start',
      gap: 12,
      ...style
    }}
  >
    {children}
  </div>
)

/**
 * Main Card Component (Phase 2 Enhanced)
 * @param {Object} props
 * @param {boolean} props.hoverable - Add hover effect
 * @param {boolean} props.clickable - Make card clickable
 * @param {boolean} props.elevated - Use elevated shadow (medium)
 * @param {'flat'|'low'|'medium'|'high'} props.elevation - Shadow elevation level
 * @param {'primary'|'success'|'warning'|'danger'|'info'|'host'} props.category - Left border category
 * @param {boolean} props.animated - Animate card entrance
 * @param {Function} props.onClick - Click handler
 * @param {Object} props.style - Additional styles
 * @param {React.ReactNode} props.children - Card content
 */
const Card = ({
  hoverable = false,
  clickable = false,
  elevated = false,
  elevation = 'low',
  category,
  animated = false,
  onClick,
  style = {},
  children
}) => {
  // Get elevation shadow
  const getElevationShadow = (level, isHover = false) => {
    const elevations = {
      flat: { base: 'none', hover: shadows.xs },
      low: { base: shadows.sm, hover: shadows.md },
      medium: { base: shadows.md, hover: shadows.lg },
      high: { base: shadows.lg, hover: shadows.xl }
    }
    const config = elevations[level] || elevations.low
    return isHover ? config.hover : config.base
  }

  // Get category styles
  const getCategoryStyles = () => {
    if (!category) return {}
    const config = categoryColors[category]
    if (!config) return {}
    return {
      borderLeft: `4px solid ${config.border}`
    }
  }

  // Determine base shadow
  const baseShadow = elevated ? shadows.md : getElevationShadow(elevation)
  const hoverShadow = elevated
    ? shadows.lg
    : getElevationShadow(elevation, true)

  const handleMouseEnter = e => {
    if (hoverable || clickable) {
      e.currentTarget.style.boxShadow = category
        ? categoryColors[category]?.shadow || hoverShadow
        : hoverShadow
      e.currentTarget.style.transform = 'translateY(-2px)'
    }
  }

  const handleMouseLeave = e => {
    if (hoverable || clickable) {
      e.currentTarget.style.boxShadow = baseShadow
      e.currentTarget.style.transform = 'translateY(0)'
    }
  }

  // Focus handler for keyboard navigation
  const handleFocus = e => {
    if (clickable) {
      e.currentTarget.style.boxShadow = `${baseShadow}, 0 0 0 3px rgba(59, 130, 246, 0.4)`
      e.currentTarget.style.outline = 'none'
    }
  }

  const handleBlur = e => {
    if (clickable) {
      e.currentTarget.style.boxShadow = baseShadow
    }
  }

  return (
    <div
      onClick={clickable ? onClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? 'button' : undefined}
      style={{
        background: neutral.bgSurface,
        borderRadius: 16,
        boxShadow: baseShadow,
        border: `1px solid ${neutral.border}`,
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: clickable ? 'pointer' : 'default',
        animation: animated ? 'cardEnter 0.4s ease-out' : 'none',
        ...getCategoryStyles(),
        ...style
      }}
    >
      {children}
    </div>
  )
}

// Attach sub-components
Card.Header = CardHeader
Card.Body = CardBody
Card.Footer = CardFooter

export default Card
