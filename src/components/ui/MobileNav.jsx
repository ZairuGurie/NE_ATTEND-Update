/**
 * MobileNav Component (Phase 4)
 * Mobile navigation hamburger menu with slide-out drawer
 *
 * Usage:
 *   <MobileNav
 *     items={navItems}
 *     currentPath="/dashboard"
 *     onNavigate={(path) => navigate(path)}
 *   />
 */

import React, { useState, useEffect } from 'react'
import { brand } from '../../utils/colors'
import { shadows, zIndex } from '../../utils/shadows'

/**
 * MobileNav Component
 * @param {Object} props
 * @param {Array} props.items - Navigation items [{ label, path, icon, badge? }]
 * @param {string} props.currentPath - Current active path
 * @param {Function} props.onNavigate - Navigation callback
 * @param {React.ReactNode} props.logo - Logo element
 * @param {React.ReactNode} props.footer - Footer content (e.g., user info)
 */
const MobileNav = ({ items = [], currentPath, onNavigate, logo, footer }) => {
  const [isOpen, setIsOpen] = useState(false)

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false)
  }, [currentPath])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleNavigate = path => {
    setIsOpen(false)
    if (onNavigate) {
      onNavigate(path)
    }
  }

  return (
    <>
      {/* Hamburger Button - Only visible on mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className='lg:hidden'
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: zIndex.modal + 10,
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
          boxShadow: shadows.md,
          transition: 'transform 0.2s ease'
        }}
        aria-label='Open menu'
        aria-expanded={isOpen}
      >
        <i className='bi-list' style={{ fontSize: 22 }} />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: zIndex.modal,
            animation: 'fadeIn 0.2s ease-out'
          }}
          aria-hidden='true'
        />
      )}

      {/* Drawer */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: isOpen ? 0 : -300,
          width: 280,
          height: '100vh',
          background: `linear-gradient(180deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
          zIndex: zIndex.modal + 5,
          display: 'flex',
          flexDirection: 'column',
          transition: 'left 0.3s ease',
          boxShadow: isOpen ? shadows.xl : 'none'
        }}
        aria-label='Mobile navigation'
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          {logo || (
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: '#fff'
              }}
            >
              NE-ATTEND
            </span>
          )}
          <button
            onClick={() => setIsOpen(false)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            aria-label='Close menu'
          >
            <i className='bi-x-lg' style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Navigation Items */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 0'
          }}
        >
          {items.map((item, index) => {
            const isActive = currentPath === item.path
            const isLogout =
              item.path === '/logout' || item.label?.toLowerCase() === 'logout'

            return (
              <button
                key={item.path || index}
                onClick={() => handleNavigate(item.path)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 24px',
                  background: isActive
                    ? 'rgba(255,255,255,0.15)'
                    : 'transparent',
                  border: 'none',
                  borderLeft: isActive
                    ? '4px solid #fff'
                    : '4px solid transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.8)',
                  fontSize: 15,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  marginTop: isLogout ? 'auto' : 0
                }}
              >
                {item.icon && (
                  <i
                    className={item.icon}
                    style={{
                      fontSize: 20,
                      width: 24,
                      textAlign: 'center'
                    }}
                  />
                )}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 999,
                      background: '#ef4444',
                      color: '#fff',
                      minWidth: 20,
                      textAlign: 'center'
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            {footer}
          </div>
        )}
      </nav>
    </>
  )
}

export default MobileNav
