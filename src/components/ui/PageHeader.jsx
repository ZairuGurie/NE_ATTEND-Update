/**
 * PageHeader Component (Phase 4)
 * Consistent page header with title, breadcrumbs, and actions
 *
 * Usage:
 *   <PageHeader
 *     title="Dashboard"
 *     subtitle="Welcome back, John"
 *     breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
 *     actions={<Button>New Session</Button>}
 *   />
 */

import React from 'react'
import { neutral, brand } from '../../utils/colors'
import { shadows } from '../../utils/shadows'
import Breadcrumbs from './Breadcrumbs'

/**
 * PageHeader Component
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {string} props.subtitle - Optional subtitle/description
 * @param {string} props.icon - Optional Bootstrap icon class
 * @param {Array} props.breadcrumbs - Breadcrumb items array
 * @param {React.ReactNode} props.actions - Action buttons/elements
 * @param {React.ReactNode} props.children - Additional content
 * @param {boolean} props.sticky - Make header sticky
 * @param {boolean} props.bordered - Show bottom border
 * @param {'default'|'compact'|'hero'} props.variant - Header variant
 * @param {Object} props.style - Additional styles
 */
const PageHeader = ({
  title,
  subtitle,
  icon,
  breadcrumbs,
  actions,
  children,
  sticky = false,
  bordered = true,
  variant = 'default',
  style = {}
}) => {
  // Variant configurations
  const variants = {
    default: {
      padding: '24px 0',
      titleSize: 28,
      subtitleSize: 14,
      gap: 8
    },
    compact: {
      padding: '16px 0',
      titleSize: 22,
      subtitleSize: 13,
      gap: 4
    },
    hero: {
      padding: '40px 0',
      titleSize: 36,
      subtitleSize: 16,
      gap: 12
    }
  }

  const config = variants[variant] || variants.default

  return (
    <header
      style={{
        padding: config.padding,
        background: neutral.bgSurface,
        borderBottom: bordered ? `1px solid ${neutral.border}` : 'none',
        position: sticky ? 'sticky' : 'relative',
        top: sticky ? 0 : 'auto',
        zIndex: sticky ? 40 : 'auto',
        boxShadow: sticky ? shadows.sm : 'none',
        ...style
      }}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Breadcrumbs items={breadcrumbs} showHome={false} />
        </div>
      )}

      {/* Header Content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap'
        }}
      >
        {/* Title Section */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            {icon && (
              <div
                style={{
                  width: variant === 'hero' ? 56 : 44,
                  height: variant === 'hero' ? 56 : 44,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: shadows.md
                }}
              >
                <i
                  className={icon}
                  style={{
                    fontSize: variant === 'hero' ? 28 : 22,
                    color: '#ffffff'
                  }}
                />
              </div>
            )}
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: config.titleSize,
                  fontWeight: 800,
                  color: neutral.textStrong || neutral.textPrimary,
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em'
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  style={{
                    margin: `${config.gap}px 0 0 0`,
                    fontSize: config.subtitleSize,
                    color: neutral.textSecondary,
                    lineHeight: 1.5
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {actions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexShrink: 0
            }}
          >
            {actions}
          </div>
        )}
      </div>

      {/* Additional Content */}
      {children && <div style={{ marginTop: 20 }}>{children}</div>}
    </header>
  )
}

/**
 * PageHeaderStats - Stats row for page header
 */
export const PageHeaderStats = ({ children, style = {} }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 16,
      marginTop: 20,
      padding: 16,
      background: neutral.bgMuted,
      borderRadius: 12,
      ...style
    }}
  >
    {children}
  </div>
)

/**
 * PageHeaderStat - Individual stat in header
 */
export const PageHeaderStat = ({
  label,
  value,
  icon,
  trend,
  color = neutral.textPrimary
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }}
  >
    {icon && (
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: neutral.bgSurface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: shadows.xs
        }}
      >
        <i className={icon} style={{ fontSize: 18, color }} />
      </div>
    )}
    <div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          lineHeight: 1.2
        }}
      >
        {value}
        {trend && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 12,
              color: trend > 0 ? '#22c55e' : '#ef4444'
            }}
          >
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: neutral.textMuted,
          fontWeight: 500
        }}
      >
        {label}
      </div>
    </div>
  </div>
)

/**
 * PageHeaderTabs - Tab navigation in header
 */
export const PageHeaderTabs = ({ tabs, activeTab, onChange, style = {} }) => (
  <div
    style={{
      display: 'flex',
      gap: 4,
      marginTop: 20,
      borderBottom: `1px solid ${neutral.border}`,
      ...style
    }}
  >
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        style={{
          padding: '12px 20px',
          fontSize: 14,
          fontWeight: activeTab === tab.id ? 600 : 500,
          color: activeTab === tab.id ? brand.secondary : neutral.textSecondary,
          background: 'transparent',
          border: 'none',
          borderBottom: `2px solid ${
            activeTab === tab.id ? brand.secondary : 'transparent'
          }`,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          marginBottom: -1,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        {tab.icon && <i className={tab.icon} style={{ fontSize: 16 }} />}
        {tab.label}
        {tab.badge !== undefined && (
          <span
            style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 999,
              background:
                activeTab === tab.id ? brand.secondary : neutral.bgMuted,
              color: activeTab === tab.id ? '#fff' : neutral.textMuted
            }}
          >
            {tab.badge}
          </span>
        )}
      </button>
    ))}
  </div>
)

export default PageHeader
