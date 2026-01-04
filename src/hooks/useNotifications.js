import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPut } from '../utils/api'

export const useNotifications = (options = {}) => {
  const { limit = 20, pollIntervalMs = 60000, enabled = true } = options

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mountedRef = useRef(false)
  const intervalRef = useRef(null)

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return

    setLoading(true)
    setError('')

    try {
      const response = await apiGet(
        `notifications?limit=${encodeURIComponent(limit)}`
      )
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          (result && (result.message || result.error)) ||
          `Failed to fetch notifications (status ${response.status}).`
        throw new Error(message)
      }

      if (result && result.success) {
        setNotifications(Array.isArray(result.data) ? result.data : [])
        setUnreadCount(
          typeof result.unreadCount === 'number' ? result.unreadCount : 0
        )
      } else {
        throw new Error(
          (result && (result.message || result.error)) ||
            'Failed to fetch notifications.'
        )
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to fetch notifications.')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [enabled, limit])

  const markAsRead = useCallback(async notificationId => {
    if (!notificationId) return

    try {
      const response = await apiPut(`notifications/${notificationId}/read`)
      if (!response.ok) {
        return
      }

      setNotifications(prev =>
        prev.map(n => (n._id === notificationId ? { ...n, isRead: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // ignore
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await apiPut('notifications/read-all')
      if (!response.ok) {
        return
      }

      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    if (enabled) {
      fetchNotifications()

      if (pollIntervalMs > 0) {
        intervalRef.current = setInterval(fetchNotifications, pollIntervalMs)
      }
    }

    return () => {
      mountedRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, fetchNotifications, pollIntervalMs])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead
  }
}
