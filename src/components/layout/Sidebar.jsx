/**
 * Sidebar Component
 * Reusable navigation sidebar for all user roles
 *
 * Usage:
 * <Sidebar
 *   role="instructor"
 *   currentPath={location.pathname}
 *   onNavigate={handleNavigation}
 *   logo={logoImage}
 * />
 */

import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getNavItemsByRole } from '../../utils/constants/routes'
import { logout } from '../../utils/auth'
import { brand } from '../../utils/colors'

/**
 * Sidebar Navigation Item
 */
const SidebarItem = ({ icon, label, isActive, isLast, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '16px 32px',
      cursor: 'pointer',
      background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
      color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
      fontWeight: isActive ? 700 : 500,
      fontSize: 15,
      borderLeft: isActive ? '4px solid #fff' : '4px solid transparent',
      marginTop: isLast ? 'auto' : 0,
      transition: 'all 0.2s ease'
    }}
    onMouseEnter={e => {
      if (!isActive) {
        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
        e.currentTarget.style.color = '#fff'
      }
    }}
    onMouseLeave={e => {
      if (!isActive) {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
      }
    }}
  >
    <i
      className={icon}
      style={{ fontSize: 20, width: 24, textAlign: 'center' }}
    />
    <span>{label}</span>
  </div>
)

/**
 * Sidebar Component
 * @param {Object} props
 * @param {string} props.role - User role (student, instructor, admin)
 * @param {string} props.currentPath - Current route path
 * @param {Function} props.onNavigate - Navigation handler (optional, uses react-router by default)
 * @param {string} props.logo - Logo image source
 * @param {Object} props.style - Additional styles
 */
const Sidebar = ({
  role = 'student',
  currentPath,
  onNavigate,
  logo,
  style = {}
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const activePath = currentPath || location.pathname

  // Get navigation items for the user's role
  const navItems = getNavItemsByRole(role)

  // Handle navigation
  const handleNavigation = item => {
    if (item.isLogout) {
      logout(navigate)
      return
    }

    if (onNavigate) {
      onNavigate(item.path)
    } else {
      navigate(item.path)
    }
  }

  return (
    <aside
      style={{
        width: 290,
        background: `linear-gradient(180deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 0',
        boxShadow: '2px 0 16px rgba(44,44,84,0.08)',
        height: '100vh',
        flexShrink: 0,
        ...style
      }}
    >
      {/* Logo */}
      {logo && (
        <img
          src={logo}
          alt='NE-ATTEND Logo'
          style={{
            width: 180,
            height: 'auto',
            objectFit: 'contain',
            marginBottom: 40,
            borderRadius: 12
          }}
        />
      )}

      {/* Navigation Items */}
      <nav
        style={{
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {navItems.map((item, idx) => (
          <SidebarItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            isActive={activePath === item.path}
            isLast={idx === navItems.length - 1}
            onClick={() => handleNavigation(item)}
          />
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: '16px 24px',
          fontSize: 12,
          color: 'rgba(255,255,255,0.5)',
          textAlign: 'center'
        }}
      >
        NE-ATTEND v3.5
      </div>
    </aside>
  )
}

export default Sidebar
