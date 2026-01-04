import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfileRoute } from '../../utils/constants/routes'
import { logout } from '../../utils/auth'
import { getAvatarUrl, getDisplayName } from '../../utils/ui'
import { brand, neutral } from '../../utils/colors'

const UserMenu = ({ user, onProfileClick, onSettingsClick, menuItems }) => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  const displayName = useMemo(() => getDisplayName(user), [user])
  const avatarUrl = useMemo(() => getAvatarUrl(user), [user])
  const role = user?.role || 'student'

  useEffect(() => {
    const onDocMouseDown = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', onDocMouseDown)
    }

    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
    }
  }, [open])

  const items = useMemo(() => {
    if (Array.isArray(menuItems) && menuItems.length > 0) return menuItems

    return [
      {
        label: 'View Profile',
        onClick: () => {
          setOpen(false)
          if (onProfileClick) {
            onProfileClick()
          } else {
            navigate(getProfileRoute(role))
          }
        }
      },
      {
        label: 'Settings',
        onClick: () => {
          setOpen(false)
          onSettingsClick?.()
        }
      },
      {
        label: 'Logout',
        danger: true,
        onClick: () => {
          setOpen(false)
          logout(navigate)
        }
      }
    ]
  }, [menuItems, navigate, onProfileClick, onSettingsClick, role])

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        type='button'
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 16px 8px 10px',
          border: `1px solid ${neutral.borderLight}`,
          borderRadius: 999,
          background: brand.primary,
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 15,
          color: neutral.bgSurface
        }}
      >
        <img
          src={avatarUrl}
          alt={displayName}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            objectFit: 'cover'
          }}
        />
        <span
          style={{
            maxWidth: 180,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {displayName}
        </span>
        <i className='bi bi-caret-down-fill' style={{ fontSize: 12 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: neutral.bgSurface,
            border: `1px solid ${neutral.borderLight}`,
            borderRadius: 10,
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
            zIndex: 99,
            minWidth: 180,
            marginTop: 8,
            overflow: 'hidden'
          }}
        >
          {items.map((item, idx) => (
            <div
              key={`${item.label}-${idx}`}
              onClick={item.onClick}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                color: item.danger ? '#c0392b' : brand.secondary,
                borderBottom:
                  idx < items.length - 1
                    ? `1px solid ${neutral.borderLight}`
                    : 'none'
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default UserMenu
