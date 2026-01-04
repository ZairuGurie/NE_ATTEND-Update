/**
 * Authentication utility functions
 */

import { apiPost } from './api'
import { clearCachedValidation } from '../components/auth/authUtils'
import {
  AUTH_KEYS,
  AUTH_KEY_PATTERNS,
  REALTIME_KEYS,
  CHROME_STORAGE_KEYS,
  matchesKeyPattern
} from './constants/storage'

/**
 * Clear all authentication data from localStorage
 */
export const clearAuthData = () => {
  try {
    // Clear all authentication-related localStorage items using constants
    localStorage.removeItem(AUTH_KEYS.TOKEN)
    localStorage.removeItem(AUTH_KEYS.USER)
    localStorage.removeItem(AUTH_KEYS.CA_EMAIL)
    localStorage.removeItem(AUTH_KEYS.CA_PASSWORD)
    localStorage.removeItem(AUTH_KEYS.CA_FIRST_NAME)
    localStorage.removeItem(AUTH_KEYS.CA_LAST_NAME)
    localStorage.removeItem(AUTH_KEYS.CA_ROLE)
    localStorage.removeItem(AUTH_KEYS.CA_DEPARTMENT)
    localStorage.removeItem(AUTH_KEYS.CA_COURSE)
    localStorage.removeItem(AUTH_KEYS.CA_USER_ID)
    localStorage.removeItem(AUTH_KEYS.CA_VERIFICATION_CODE)

    // Clear validation cache
    clearCachedValidation()

    // Clear meeting status data (instructor real-time monitoring)
    localStorage.removeItem(REALTIME_KEYS.LIVE_ROWS)
    localStorage.removeItem(REALTIME_KEYS.HISTORICAL_ROWS)
    localStorage.removeItem(REALTIME_KEYS.ALL_ROWS)
    localStorage.removeItem(REALTIME_KEYS.ATTENDANCE_DATA)

    // Clear all attendance tokens (pattern matching)
    Object.keys(localStorage).forEach(key => {
      if (matchesKeyPattern(key, AUTH_KEY_PATTERNS.ATTENDANCE_TOKEN)) {
        localStorage.removeItem(key)
      }
    })

    // Clear chrome.storage data for extension
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.remove([CHROME_STORAGE_KEYS.CURRENT_USER], () => {
        if (chrome.runtime.lastError) {
          console.warn(
            'Failed to clear user from chrome.storage:',
            chrome.runtime.lastError
          )
        } else {
          console.log('✅ User identity cleared from chrome.storage')
        }
      })

      // Clear all attendance tokens from chrome.storage.sync
      chrome.storage.sync.get(null, items => {
        const keysToRemove = []
        for (const key in items) {
          if (matchesKeyPattern(key, CHROME_STORAGE_KEYS.TOKEN_PREFIX)) {
            keysToRemove.push(key)
          }
        }
        if (keysToRemove.length > 0) {
          chrome.storage.sync.remove(keysToRemove, () => {
            console.log('✅ Attendance tokens cleared from chrome.storage')
          })
        }
      })
    }

    // Note: We preserve REMEMBERED_EMAIL and REMEMBER_ME for "Remember Me" functionality
    // Users can manually uncheck "Remember Me" to clear saved credentials

    console.log(
      '✅ Authentication data and meeting status cleared from localStorage'
    )
  } catch (error) {
    console.error('❌ Error clearing authentication data:', error)
  }
}

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  try {
    const token = localStorage.getItem(AUTH_KEYS.TOKEN)
    const user = localStorage.getItem(AUTH_KEYS.USER)

    if (!token || !user) {
      return false
    }

    // Parse user data to check if it's valid
    const userData = JSON.parse(user)
    return !!(userData && userData._id && userData.role)
  } catch (error) {
    console.error('❌ Error checking authentication:', error)
    return false
  }
}

/**
 * Get current user data from localStorage (cached)
 */
export const getCurrentUser = () => {
  try {
    const user = localStorage.getItem(AUTH_KEYS.USER)
    return user ? JSON.parse(user) : null
  } catch (error) {
    console.error('❌ Error getting current user:', error)
    return null
  }
}

/**
 * Refresh current user data from API
 * Fetches fresh user data from the server and updates localStorage
 * @returns {Promise<Object|null>} Fresh user data or null if fetch fails
 */
export const refreshCurrentUser = async () => {
  try {
    const cachedUser = getCurrentUser()
    const userId = cachedUser?._id || cachedUser?.id

    if (!userId) {
      console.warn('⚠️ No user ID available for refresh')
      return cachedUser
    }

    // Import apiGet dynamically to avoid circular dependencies
    const { apiGet } = await import('./api')
    const response = await apiGet(`users/${userId}`)

    if (!response.ok) {
      console.warn('⚠️ Failed to refresh user data from API, using cached')
      return cachedUser
    }

    const result = await response.json()
    if (result.success && result.data) {
      // Update localStorage with fresh data
      localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(result.data))
      console.log('✅ User data refreshed from API')
      return result.data
    }

    return cachedUser
  } catch (error) {
    console.error('❌ Error refreshing current user:', error)
    // Return cached user as fallback
    return getCurrentUser()
  }
}

/**
 * Get current user token
 */
export const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_KEYS.TOKEN)
  } catch (error) {
    console.error('❌ Error getting auth token:', error)
    return null
  }
}

/**
 * Logout function that clears auth data and optionally calls backend
 */
export const logout = async (navigate, showNotification = true) => {
  try {
    // Get current token for backend logout
    const token = getAuthToken()

    // Call backend logout endpoint (optional, for token blacklisting in production)
    if (token) {
      try {
        await apiPost('auth/logout', {})
        console.log('✅ Backend logout successful')
      } catch (backendError) {
        console.warn(
          '⚠️ Backend logout failed, but continuing with local logout:',
          backendError
        )
      }
    }

    // Clear all authentication data
    clearAuthData()

    // Show notification if requested
    if (showNotification) {
      console.log('👋 User logged out successfully')
    }

    // Navigate to login page
    if (navigate) {
      navigate('/login', { replace: true })
    }

    return true
  } catch (error) {
    console.error('❌ Error during logout:', error)

    // Even if there's an error, clear local data and navigate
    clearAuthData()
    if (navigate) {
      navigate('/login', { replace: true })
    }

    return false
  }
}

/**
 * Check if user has specific role
 */
export const hasRole = requiredRole => {
  try {
    const user = getCurrentUser()
    return user && user.role === requiredRole
  } catch (error) {
    console.error('❌ Error checking user role:', error)
    return false
  }
}

/**
 * Check if user is instructor
 */
export const isInstructor = () => hasRole('instructor')

/**
 * Check if user is student
 */
export const isStudent = () => hasRole('student')

/**
 * Check if user is admin
 */
export const isAdmin = () => hasRole('admin')

/**
 * Dispatch user update event for same-tab cross-component synchronization
 * Uses CustomEvent for same-tab updates. Cross-tab updates are handled automatically
 * by the browser's native StorageEvent when localStorage changes.
 * @param {Object} userData - Updated user data object
 */
export const dispatchUserUpdateEvent = userData => {
  try {
    const oldValue = localStorage.getItem('user')
    localStorage.setItem('user', JSON.stringify(userData))

    // Dispatch custom event for same-tab synchronization
    // This is the primary mechanism for same-tab component updates
    window.dispatchEvent(
      new CustomEvent('userUpdated', {
        detail: { user: userData, oldValue }
      })
    )

    // Note: We don't manually dispatch StorageEvent here because:
    // 1. StorageEvent only fires automatically for cross-tab changes (browser behavior)
    // 2. Manually dispatching StorageEvent in the same tab can cause duplicate updates
    // 3. Components should listen to 'userUpdated' CustomEvent for same-tab updates
    // 4. Components should listen to 'storage' event for cross-tab updates (automatic)

    console.log('✅ User update event dispatched')
  } catch (error) {
    console.warn('⚠️ Failed to dispatch user update event:', error)
  }
}
