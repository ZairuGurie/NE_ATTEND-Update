/**
 * Header Component
 * Reusable page header with user profile, notifications, and actions
 *
 * Usage:
 * <Header
 *   title="Dashboard"
 *   user={currentUser}
 *   onProfileClick={handleProfile}
 *   showNotifications={true}
 * />
 */

import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfileRoute } from '../../utils/constants/routes'
import { logout } from '../../utils/auth'
import { getAvatarUrl, getDisplayName } from '../../utils/ui'
import { brand, neutral, interactive } from '../../utils/colors'

/**
 * Dropdown Menu Component
 */
const DropdownMenu = ({ items, isOpen, onClose }) => {
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        minWidth: 200,
        background: neutral.bgSurface,
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        border: `1px solid ${neutral.borderLight}`,
        zIndex: 100,
        overflow: 'hidden',
        marginTop: 8,
        animation: 'fadeInDown 0.15s ease-out'
      }}
    >
      {items.map((item, idx) => (
        <div
          key={idx}
          onClick={item.onClick}
          style={{
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: 14,
            color: item.danger ? interactive.danger : neutral.textPrimary,
            fontWeight: 500,
            borderBottom:
              idx < items.length - 1
                ? `1px solid ${neutral.borderLight}`
                : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'background 0.2s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = neutral.bgHover
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {item.icon && <i className={item.icon} style={{ fontSize: 16 }} />}
          {item.label}
        </div>
      ))}
    </div>
  )
}

/**
 * Notification Badge
 */
const NotificationBadge = ({ count }) => {
  if (!count) return null

  return (
    <span
      style={{
        position: 'absolute',
        top: -4,
        right: -4,
        background: interactive.danger,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        borderRadius: '50%',
        width: 18,
        height: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/**
 * Header Component
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {Object} props.user - Current user object
 * @param {Function} props.onProfileClick - Profile click handler
 * @param {boolean} props.showNotifications - Show notifications button
 * @param {number} props.notificationCount - Number of unread notifications
 * @param {Array} props.notifications - Notification items
 * @param {React.ReactNode} props.actions - Additional action buttons
 * @param {Object} props.style - Additional styles
 */
const Header = ({
  title = 'Dashboard',
  user,
  onProfileClick,
  showNotifications = true,
  notificationCount = 0,
  notifications = [],
  actions,
  style = {}
}) => {
  const navigate = useNavigate()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showNotificationMenu, setShowNotificationMenu] = useState(false)

  const displayName = getDisplayName(user)
  const avatarUrl = getAvatarUrl(user)
  const role = user?.role || 'student'

  // Profile menu items
  const profileMenuItems = [
    {
      icon: 'bi-person',
      label: 'View Profile',
      onClick: () => {
        setShowProfileMenu(false)
        if (onProfileClick) {
          onProfileClick()
        } else {
          navigate(getProfileRoute(role))
        }
      }
    },
    {
      icon: 'bi-gear',
      label: 'Settings',
      onClick: () => {
        setShowProfileMenu(false)
        // Navigate to settings if available
      }
    },
    {
      icon: 'bi-box-arrow-right',
      label: 'Logout',
      danger: true,
      onClick: () => {
        setShowProfileMenu(false)
        logout(navigate)
      }
    }
  ]

  // Notification menu items
  const notificationItems =
    notifications.length > 0
      ? notifications.map(n => ({
          icon: n.icon || 'bi-bell',
          label: n.message,
          onClick: () => {
            setShowNotificationMenu(false)
            n.onClick?.()
          }
        }))
      : [
          {
            label: 'No new notifications',
            onClick: () => setShowNotificationMenu(false)
          }
        ]

  return (
    <header
      style={{
        height: 72,
        background: neutral.bgSurface,
        borderBottom: `1px solid ${neutral.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        ...style
      }}
    >
      {/* Title */}
      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 800,
          color: brand.secondary,
          letterSpacing: '-0.5px'
        }}
      >
        {title}
      </h1>

      {/* Right Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Custom Actions */}
        {actions}

        {/* Notifications */}
        {showNotifications && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowNotificationMenu(!showNotificationMenu)
                setShowProfileMenu(false)
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: neutral.bgMuted,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = neutral.bgHover
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = neutral.bgMuted
              }}
            >
              <i
                className='bi-bell'
                style={{ fontSize: 20, color: neutral.textSecondary }}
              />
              <NotificationBadge count={notificationCount} />
            </button>

            <DropdownMenu
              items={notificationItems}
              isOpen={showNotificationMenu}
              onClose={() => setShowNotificationMenu(false)}
            />
          </div>
        )}

        {/* User Profile */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowProfileMenu(!showProfileMenu)
              setShowNotificationMenu(false)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 16px 8px 8px',
              background: neutral.bgMuted,
              border: 'none',
              borderRadius: 24,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = neutral.bgHover
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = neutral.bgMuted
            }}
          >
            <img
              src={avatarUrl}
              alt={displayName}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                objectFit: 'cover'
              }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: neutral.textPrimary,
                maxWidth: 150,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {displayName}
            </span>
            <i
              className='bi-chevron-down'
              style={{ fontSize: 12, color: neutral.textMuted }}
            />
          </button>

          <DropdownMenu
            items={profileMenuItems}
            isOpen={showProfileMenu}
            onClose={() => setShowProfileMenu(false)}
          />
        </div>
      </div>
    </header>
  )
}

export default Header
