/**
 * Auth Utilities
 * Helper functions for authentication handling
 * Separated from RequireAuth component for Fast Refresh compatibility
 */

import { AUTH_KEYS } from '../../utils/constants/storage'

/**
 * Get stored user from localStorage
 * @returns {Object|null} User object or null if not found
 */
export const getStoredUser = () => {
  try {
    const user = localStorage.getItem(AUTH_KEYS.USER)
    const token = localStorage.getItem(AUTH_KEYS.TOKEN)
    if (!user || !token) return null
    return JSON.parse(user)
  } catch {
    return null
  }
}

// Token validation cache - shared across all RequireAuth instances
const VALIDATION_CACHE_KEY = 'neattend_auth_validation_cache'
const CACHE_DURATION_MS = 60 * 1000 // 60 seconds cache duration

/**
 * Get cached validation result
 * @returns {boolean|null} Cached validation result or null if not cached
 */
export const getCachedValidation = () => {
  try {
    const cached = sessionStorage.getItem(VALIDATION_CACHE_KEY)
    if (!cached) return null
    const {
      isValid: cachedIsValid,
      timestamp,
      token: cachedToken
    } = JSON.parse(cached)
    const currentToken = localStorage.getItem(AUTH_KEYS.TOKEN)

    // Check if cache is still valid and token hasn't changed
    if (
      cachedToken === currentToken &&
      Date.now() - timestamp < CACHE_DURATION_MS
    ) {
      return cachedIsValid
    }
    // Cache expired or token changed, clear it
    sessionStorage.removeItem(VALIDATION_CACHE_KEY)
    return null
  } catch {
    return null
  }
}

/**
 * Set cached validation result
 * @param {boolean} isValid - Validation result
 * @param {string} token - Token that was validated
 */
export const setCachedValidation = (isValid, token) => {
  try {
    sessionStorage.setItem(
      VALIDATION_CACHE_KEY,
      JSON.stringify({
        isValid,
        timestamp: Date.now(),
        token
      })
    )
  } catch (error) {
    console.warn('⚠️ Failed to cache validation result:', error)
  }
}

/**
 * Clear cached validation result
 */
export const clearCachedValidation = () => {
  try {
    sessionStorage.removeItem(VALIDATION_CACHE_KEY)
  } catch (error) {
    console.warn('⚠️ Failed to clear validation cache:', error)
  }
}

// Cache duration constant for external use
export { CACHE_DURATION_MS }
