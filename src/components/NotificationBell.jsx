import React, { useEffect, useState } from 'react'
import 'bootstrap-icons/font/bootstrap-icons.css'
import { brand, neutral } from '../utils/colors'
import { useNotifications } from '../hooks/useNotifications'

const formatTimestamp = value => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const NotificationBell = ({
  limit = 20,
  pollIntervalMs = 60000,
  style = {},
  dropdownMinWidth = 320
}) => {
  const [open, setOpen] = useState(false)

  const {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead
  } = useNotifications({ limit, pollIntervalMs, enabled: true })

  useEffect(() => {
    if (open) {
      refresh()
    }
  }, [open, refresh])

  return (
    <div style={{ position: 'relative', ...style }}>
      <i
        className='bi bi-bell-fill'
        style={{
          fontSize: 22,
          color: brand.secondary,
          cursor: 'pointer'
        }}
        onClick={() => setOpen(prev => !prev)}
      ></i>

      {unreadCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#e53935',
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
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '130%',
            background: neutral.bgSurface,
            border: `1px solid ${neutral.border}`,
            borderRadius: 10,
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
            zIndex: 100,
            minWidth: dropdownMinWidth,
            maxWidth: 380,
            maxHeight: 400,
            overflowY: 'auto'
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              borderBottom: `1px solid ${neutral.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: neutral.bgMuted
            }}
          >
            <span style={{ fontWeight: 600, color: brand.secondary }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: brand.primary,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {loading ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: neutral.textSecondary
              }}
            >
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: neutral.textSecondary
              }}
            >
              No notifications
            </div>
          ) : (
            notifications.map(notification => (
              <div
                key={notification._id}
                onClick={() => {
                  if (!notification.isRead) {
                    markAsRead(notification._id)
                  }
                }}
                style={{
                  padding: '12px 16px',
                  fontSize: 13,
                  color: brand.secondary,
                  borderBottom: `1px solid ${neutral.borderLight}`,
                  background: notification.isRead
                    ? 'transparent'
                    : 'rgba(35, 34, 92, 0.05)',
                  cursor: notification.isRead ? 'default' : 'pointer'
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {notification.title}
                  {!notification.isRead && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: brand.primary,
                        marginLeft: 8
                      }}
                    />
                  )}
                </div>
                <div style={{ color: neutral.textSecondary, fontSize: 12 }}>
                  {notification.message}
                </div>
                <div
                  style={{
                    color: neutral.textMuted,
                    fontSize: 11,
                    marginTop: 4
                  }}
                >
                  {formatTimestamp(notification.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
