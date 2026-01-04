/**
 * DashboardLayout Component (Phase 4)
 * Consistent layout wrapper for all dashboard pages
 *
 * Usage:
 *   <DashboardLayout
 *     sidebar={<Sidebar items={navItems} />}
 *     header={<PageHeader title="Dashboard" />}
 *   >
 *     {children}
 *   </DashboardLayout>
 */

import React, { useState } from 'react'
import { neutral, brand } from '../../utils/colors'
import { shadows } from '../../utils/shadows'

/**
 * DashboardLayout Component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Main content
 * @param {React.ReactNode} props.sidebar - Sidebar component
 * @param {React.ReactNode} props.header - Optional header component
 * @param {boolean} props.sidebarCollapsible - Enable sidebar collapse on mobile
 * @param {number} props.sidebarWidth - Sidebar width in pixels
 * @param {Object} props.style - Additional styles for main content
 */
const DashboardLayout = ({
  children,
  sidebar,
  header,
  sidebarCollapsible = true,
  sidebarWidth = 280,
  style = {}
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: neutral.bgPage
      }}
    >
      {/* Mobile Menu Button */}
      {sidebarCollapsible && (
        <button
          onClick={toggleSidebar}
          className='lg:hidden'
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 60,
            width: 44,
            height: 44,
            borderRadius: 10,
            background: brand.secondary,
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: shadows.md
          }}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          <i
            className={sidebarOpen ? 'bi-x-lg' : 'bi-list'}
            style={{ fontSize: 22 }}
          />
        </button>
      )}

      {/* Overlay for mobile */}
      {sidebarCollapsible && sidebarOpen && (
        <div
          className='sidebar-overlay open'
          onClick={() => setSidebarOpen(false)}
          aria-hidden='true'
        />
      )}

      {/* Sidebar */}
      {sidebar && (
        <aside
          className={
            sidebarCollapsible
              ? `sidebar-collapse ${sidebarOpen ? 'open' : ''}`
              : ''
          }
          style={{
            width: sidebarWidth,
            flexShrink: 0,
            height: '100vh',
            position: 'sticky',
            top: 0
          }}
        >
          {sidebar}
        </aside>
      )}

      {/* Main Content */}
      <main
        className={sidebarCollapsible ? 'main-with-sidebar' : ''}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          ...style
        }}
      >
        {/* Header */}
        {header && (
          <div style={{ paddingLeft: sidebarCollapsible ? 60 : 0 }}>
            {header}
          </div>
        )}

        {/* Content */}
        <div
          style={{
            flex: 1,
            padding: '24px 32px',
            paddingLeft: sidebarCollapsible ? 60 : 32
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}

/**
 * DashboardSection - Section wrapper with title
 */
export const DashboardSection = ({
  title,
  subtitle,
  actions,
  children,
  style = {}
}) => (
  <section style={{ marginBottom: 32, ...style }}>
    {(title || actions) && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div>
          {title && (
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: neutral.textStrong || neutral.textPrimary
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: 14,
                color: neutral.textSecondary
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
      </div>
    )}
    {children}
  </section>
)

/**
 * DashboardGrid - Responsive grid for dashboard cards
 */
export const DashboardGrid = ({
  children,
  columns = 4,
  gap = 24,
  style = {}
}) => (
  <div
    className={`grid grid-cols-1 sm:grid-cols-2 ${
      columns >= 3 ? 'lg:grid-cols-3' : ''
    } ${columns >= 4 ? 'xl:grid-cols-4' : ''}`}
    style={{
      gap,
      ...style
    }}
  >
    {children}
  </div>
)

/**
 * DashboardRow - Flex row with responsive behavior
 */
export const DashboardRow = ({
  children,
  gap = 24,
  wrap = true,
  style = {}
}) => (
  <div
    style={{
      display: 'flex',
      gap,
      flexWrap: wrap ? 'wrap' : 'nowrap',
      marginBottom: 24,
      ...style
    }}
  >
    {children}
  </div>
)

/**
 * DashboardColumn - Flex column within a row
 */
export const DashboardColumn = ({
  children,
  flex = 1,
  minWidth = 280,
  style = {}
}) => (
  <div
    style={{
      flex,
      minWidth,
      ...style
    }}
  >
    {children}
  </div>
)

export default DashboardLayout
