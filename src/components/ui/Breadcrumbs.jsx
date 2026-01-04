/**
 * Breadcrumbs Component (Phase 4)
 * Navigation breadcrumbs with responsive design
 *
 * Usage:
 *   <Breadcrumbs
 *     items={[
 *       { label: 'Home', href: '/' },
 *       { label: 'Dashboard', href: '/dashboard' },
 *       { label: 'Attendance', active: true }
 *     ]}
 *   />
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { neutral, interactive } from '../../utils/colors'

/**
 * Breadcrumbs Component
 * @param {Object} props
 * @param {Array} props.items - Array of breadcrumb items { label, href?, icon?, active? }
 * @param {string} props.separator - Separator between items (default: 'chevron')
 * @param {boolean} props.showHome - Show home icon as first item
 * @param {string} props.size - Size variant ('sm' | 'md' | 'lg')
 * @param {Object} props.style - Additional styles
 */
const Breadcrumbs = ({
  items = [],
  separator = 'chevron',
  showHome = true,
  size = 'md',
  style = {}
}) => {
  const navigate = useNavigate()

  // Size configurations
  const sizes = {
    sm: { fontSize: 12, iconSize: 12, padding: '4px 8px', gap: 6 },
    md: { fontSize: 13, iconSize: 14, padding: '6px 10px', gap: 8 },
    lg: { fontSize: 14, iconSize: 16, padding: '8px 12px', gap: 10 }
  }

  const sizeConfig = sizes[size] || sizes.md

  // Separator icons
  const separatorIcons = {
    chevron: 'bi-chevron-right',
    slash: 'bi-slash',
    arrow: 'bi-arrow-right-short',
    dot: 'bi-dot'
  }

  const separatorIcon = separatorIcons[separator] || separatorIcons.chevron

  // Handle item click
  const handleClick = (item, e) => {
    if (item.active) return
    e.preventDefault()
    if (item.onClick) {
      item.onClick()
    } else if (item.href) {
      navigate(item.href)
    }
  }

  // Build items with optional home
  const allItems = showHome
    ? [{ label: 'Home', href: '/', icon: 'bi-house-door' }, ...items]
    : items

  return (
    <nav
      aria-label='Breadcrumb'
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: sizeConfig.gap,
        ...style
      }}
    >
      <ol
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: sizeConfig.gap,
          margin: 0,
          padding: 0,
          listStyle: 'none'
        }}
      >
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1
          const isActive = item.active || isLast

          return (
            <li
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: sizeConfig.gap
              }}
            >
              {/* Breadcrumb Item */}
              <a
                href={item.href || '#'}
                onClick={e => handleClick(item, e)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: sizeConfig.padding,
                  borderRadius: 6,
                  fontSize: sizeConfig.fontSize,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? neutral.textPrimary : neutral.textSecondary,
                  textDecoration: 'none',
                  background: isActive ? neutral.bgMuted : 'transparent',
                  cursor: isActive ? 'default' : 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = neutral.bgHover
                    e.currentTarget.style.color = interactive.primary
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = neutral.textSecondary
                  }
                }}
              >
                {item.icon && (
                  <i
                    className={item.icon}
                    style={{ fontSize: sizeConfig.iconSize }}
                  />
                )}
                <span>{item.label}</span>
              </a>

              {/* Separator */}
              {!isLast && (
                <i
                  className={separatorIcon}
                  style={{
                    fontSize: sizeConfig.iconSize,
                    color: neutral.textDisabled,
                    flexShrink: 0
                  }}
                  aria-hidden='true'
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * BreadcrumbItem - For manual composition
 */
export const BreadcrumbItem = ({
  children,
  href,
  icon,
  active = false,
  onClick
}) => {
  const navigate = useNavigate()

  const handleClick = e => {
    if (active) return
    e.preventDefault()
    if (onClick) {
      onClick()
    } else if (href) {
      navigate(href)
    }
  }

  return (
    <a
      href={href || '#'}
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? neutral.textPrimary : neutral.textSecondary,
        textDecoration: 'none',
        background: active ? neutral.bgMuted : 'transparent',
        cursor: active ? 'default' : 'pointer',
        transition: 'all 0.15s ease'
      }}
    >
      {icon && <i className={icon} style={{ fontSize: 14 }} />}
      {children}
    </a>
  )
}

export default Breadcrumbs
