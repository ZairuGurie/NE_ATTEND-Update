/**
 * API Configuration Utility
 * Centralizes API base URL configuration and provides fetch wrapper
 * Uses Vite proxy in development for seamless API calls
 */

import {
  AUTH_KEYS,
  AUTH_KEY_PATTERNS,
  REALTIME_KEYS,
  matchesKeyPattern
} from './constants/storage'
import { TIMEOUTS } from './constants/timing'
import {
  getApiBaseUrl as getBaseUrlFromConstants,
  getSocketUrl as getSocketUrlFromConstants
} from './constants/api'

// Track if we're already handling a 401 to prevent infinite loops
let isHandling401 = false

/**
 * Handle 401 authentication errors globally
 * Clears auth data and redirects to login
 */
const handle401Error = async () => {
  // Prevent multiple simultaneous 401 handlers
  if (isHandling401) {
    return
  }

  isHandling401 = true

  try {
    // Clear authentication data using storage constants
    localStorage.removeItem(AUTH_KEYS.TOKEN)
    localStorage.removeItem(AUTH_KEYS.USER)

    // Clear other auth-related data
    localStorage.removeItem(AUTH_KEYS.CA_EMAIL)
    localStorage.removeItem(AUTH_KEYS.CA_PASSWORD)
    localStorage.removeItem(AUTH_KEYS.CA_FIRST_NAME)
    localStorage.removeItem(AUTH_KEYS.CA_LAST_NAME)
    localStorage.removeItem(AUTH_KEYS.CA_ROLE)
    localStorage.removeItem(AUTH_KEYS.CA_DEPARTMENT)
    localStorage.removeItem(AUTH_KEYS.CA_COURSE)
    localStorage.removeItem(AUTH_KEYS.CA_USER_ID)
    localStorage.removeItem(AUTH_KEYS.CA_VERIFICATION_CODE)

    // Clear meeting status data
    localStorage.removeItem(REALTIME_KEYS.LIVE_ROWS)
    localStorage.removeItem(REALTIME_KEYS.HISTORICAL_ROWS)
    localStorage.removeItem(REALTIME_KEYS.ALL_ROWS)
    localStorage.removeItem(REALTIME_KEYS.ATTENDANCE_DATA)

    // Clear all attendance tokens
    Object.keys(localStorage).forEach(key => {
      if (matchesKeyPattern(key, AUTH_KEY_PATTERNS.ATTENDANCE_TOKEN)) {
        localStorage.removeItem(key)
      }
    })

    // Dispatch storage event to notify other tabs/components
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_KEYS.TOKEN,
        newValue: null,
        oldValue: localStorage.getItem(AUTH_KEYS.TOKEN)
      })
    )

    // Dispatch custom event for React Router navigation
    // Components can listen to this event and use navigate() from React Router
    window.dispatchEvent(
      new CustomEvent('auth:logout', {
        detail: {
          reason: 'unauthorized',
          from: window.location.pathname
        }
      })
    )

    // Fallback: Use window.location if React Router navigation isn't available
    // This ensures navigation works even if no component is listening to the event
    if (
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/'
    ) {
      // Use replace to avoid adding to history
      window.location.replace('/login')
    }
  } catch (error) {
    console.error('Error handling 401:', error)
  } finally {
    // Reset flag after a short delay to allow navigation
    setTimeout(() => {
      isHandling401 = false
    }, TIMEOUTS.AUTH_REDIRECT_DELAY)
  }
}

// Get API base URL - delegates to centralized constants
const getApiBaseUrl = () => getBaseUrlFromConstants()

/**
 * Fetch wrapper with automatic API base URL prefixing
 * @param {string} endpoint - API endpoint (e.g., '/subjects/instructor/123')
 * @param {RequestInit} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>}
 */
export const apiFetch = async (endpoint, options = {}) => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}/${cleanEndpoint}`

  // Default headers
  const defaultHeaders = {
    'Content-Type': 'application/json'
  }

  // Add auth token if available
  const token = localStorage.getItem(AUTH_KEYS.TOKEN)
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`
  }

  // Merge headers
  const headers = {
    ...defaultHeaders,
    ...(options.headers || {})
  }

  // Log request details in development
  if (import.meta.env.DEV) {
    console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`)
    if (headers.Authorization) {
      console.log('   Authorization: Bearer [TOKEN PRESENT]')
    } else {
      console.log('   Authorization: [NO TOKEN]')
    }
    if (options.body) {
      try {
        const bodyPreview =
          typeof options.body === 'string'
            ? JSON.parse(options.body)
            : options.body
        // Redact sensitive fields for logging
        const sanitizedBody = { ...bodyPreview }
        if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]'
        console.log('   Request body:', sanitizedBody)
      } catch {
        console.log('   Request body: [non-JSON]')
      }
    }
  }

  // Make the fetch request with error handling
  let response
  const hasPerformanceNow =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
  const startTime = hasPerformanceNow ? performance.now() : Date.now()
  try {
    response = await fetch(url, {
      ...options,
      headers
    })
  } catch (networkError) {
    const endTime = hasPerformanceNow ? performance.now() : Date.now()
    const durationMs = Math.round(endTime - startTime)
    if (import.meta.env.DEV) {
      console.error(
        `⏱ API Network Error after ${durationMs}ms for ${
          options.method || 'GET'
        } ${url}`
      )
    }
    // Handle network errors (connection refused, timeout, etc.)
    console.error(`❌ Network Error: Failed to connect to ${url}`)
    console.error('   Error type:', networkError.constructor.name)
    console.error('   Error message:', networkError.message)
    console.error('   Possible causes:')
    console.error('   1. Backend server is not running')
    console.error('   2. Network connection issue')
    console.error('   3. CORS policy blocking request')
    console.error('   4. Firewall blocking connection')

    // Create a mock response object for network errors
    // This allows calling code to handle the error gracefully
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Network Error',
        message:
          networkError.message ||
          'Failed to connect to server. Please check your connection and ensure the server is running.'
      }),
      {
        status: 0, // Status 0 indicates network error
        statusText: networkError.message || 'Network Error',
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  // Log response details in development, especially for errors
  const endTime = hasPerformanceNow ? performance.now() : Date.now()
  const durationMs = Math.round(endTime - startTime)
  if (import.meta.env.DEV) {
    if (!response.ok) {
      console.error(
        `❌ API Error: ${response.status} ${response.statusText} for ${
          options.method || 'GET'
        } ${url}`
      )
      console.error(`   Duration: ${durationMs}ms`)
      // Try to log response body for debugging
      response
        .clone()
        .text()
        .then(text => {
          try {
            const errorBody = JSON.parse(text)
            console.error('   Error response:', errorBody)
          } catch {
            console.error('   Error response (text):', text.substring(0, 200))
          }
        })
        .catch(error => {
          console.error('   Failed to read error response:', error)
        })
    } else {
      console.log(
        `✅ API Success: ${response.status} for ${
          options.method || 'GET'
        } ${url} (${durationMs}ms)`
      )
    }
  }

  // Handle 401 Unauthorized errors globally
  // Skip 401 handling for login endpoint to avoid redirect loops
  const isLoginEndpoint = cleanEndpoint.toLowerCase().includes('auth/login')
  if (response.status === 401 && !isLoginEndpoint) {
    // Handle 401 error (this will clear auth and redirect)
    await handle401Error()

    // Return the response so calling code can still handle it if needed
    // but the global handler has already taken action
    return response
  }

  // Log specific error codes with helpful messages
  if (response.status === 404) {
    console.error(`❌ 404 Not Found: ${options.method || 'GET'} ${url}`)
    console.error('   This usually means:')
    console.error('   1. Backend server is not running on port 8000')
    console.error('   2. Vite proxy is not forwarding the request correctly')
    console.error('   3. The route does not exist on the backend')
    console.error("   Check backend server logs and ensure it's running.")
  } else if (response.status === 500) {
    console.error(
      `❌ 500 Internal Server Error: ${options.method || 'GET'} ${url}`
    )
    console.error('   The server encountered an error processing your request.')
    console.error('   Check backend server logs for details.')
  } else if (response.status === 503) {
    console.error(
      `❌ 503 Service Unavailable: ${options.method || 'GET'} ${url}`
    )
    console.error('   The server is temporarily unavailable.')
    console.error('   This might indicate database connection issues.')
  } else if (response.status === 401 && import.meta.env.DEV) {
    const isLoginEndpoint = cleanEndpoint.toLowerCase().includes('auth/login')
    if (isLoginEndpoint) {
      console.warn(
        '⚠️ 401 Unauthorized on login endpoint - this is expected for invalid credentials'
      )
      console.warn(
        '   Make sure credentials are correct and user exists in database'
      )
    }
  }

  return response
}

/**
 * Convenience method for GET requests
 */
export const apiGet = async (endpoint, options = {}) => {
  return apiFetch(endpoint, {
    ...options,
    method: 'GET'
  })
}

/**
 * Convenience method for POST requests
 */
export const apiPost = async (endpoint, data, options = {}) => {
  return apiFetch(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * Convenience method for PUT requests
 */
export const apiPut = async (endpoint, data, options = {}) => {
  return apiFetch(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export const apiPatch = async (endpoint, data, options = {}) => {
  return apiFetch(endpoint, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}

/**
 * Convenience method for DELETE requests
 */
export const apiDelete = async (endpoint, options = {}) => {
  return apiFetch(endpoint, {
    ...options,
    method: 'DELETE'
  })
}

/**
 * Get the full API base URL (for reference/debugging)
 */
export const getApiBaseUrlForReference = () => {
  return getApiBaseUrl()
}

/**
 * Get the Socket.IO server URL (without /api suffix)
 * Used for Socket.IO connections - delegates to centralized constants
 */
export const getSocketIOUrl = () => getSocketUrlFromConstants()

export default {
  fetch: apiFetch,
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
  getBaseUrl: getApiBaseUrlForReference,
  getSocketIOUrl: getSocketIOUrl
}
