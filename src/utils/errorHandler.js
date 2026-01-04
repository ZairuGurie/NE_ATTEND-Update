/**
 * Error Handling Utility
 * Provides standardized error handling patterns for API responses
 */

/**
 * Standardized API response handler
 * Checks response.ok first, then result.success
 * Returns standardized error format
 *
 * @param {Response} response - Fetch Response object
 * @param {Object} result - Parsed JSON result from response
 * @returns {Object} - { success: boolean, data: any, error: string, message: string }
 */
export const handleApiResponse = async (response, result = null) => {
  // Parse JSON if not already parsed
  if (
    !result &&
    response.headers.get('content-type')?.includes('application/json')
  ) {
    try {
      result = await response.json()
    } catch {
      // If JSON parsing fails, return error
      return {
        success: false,
        data: null,
        error: 'Invalid response format',
        message: 'Server returned invalid JSON response'
      }
    }
  }

  // Check HTTP status first
  if (!response.ok) {
    return {
      success: false,
      data: null,
      error: result?.error || `HTTP ${response.status}`,
      message:
        result?.message ||
        result?.error ||
        `Request failed with status ${response.status}`
    }
  }

  // Check API success flag if present
  if (result && result.success === false) {
    return {
      success: false,
      data: result.data || null,
      error: result.error || 'API request failed',
      message: result.message || result.error || 'API request was unsuccessful'
    }
  }

  // Success case
  return {
    success: true,
    data: result?.data || result || null,
    error: null,
    message: result?.message || 'Request successful'
  }
}

/**
 * Extract error message from various error formats
 * Handles different error object structures consistently
 *
 * @param {Error|Object|string} error - Error object, response result, or error string
 * @returns {string} - Human-readable error message
 */
export const getErrorMessage = error => {
  if (!error) {
    return 'An unknown error occurred'
  }

  // String error
  if (typeof error === 'string') {
    return error
  }

  // Error object with message
  if (error.message) {
    return error.message
  }

  // API response format
  if (error.error) {
    return error.error
  }

  // API response format with message
  if (error.message) {
    return error.message
  }

  // Fallback
  return 'An error occurred'
}

/**
 * Check if error is an authentication error (401)
 *
 * @param {Response|Object} responseOrError - Response object or error object
 * @returns {boolean} - True if error is 401 Unauthorized
 */
export const isAuthError = responseOrError => {
  if (responseOrError?.status === 401) {
    return true
  }
  if (responseOrError?.statusCode === 401) {
    return true
  }
  if (responseOrError?.error === 'Unauthorized') {
    return true
  }
  return false
}

/**
 * Check if error is a network error
 *
 * @param {Error} error - Error object
 * @returns {boolean} - True if error is a network error
 */
export const isNetworkError = error => {
  if (!error) return false

  // Check for common network error indicators
  if (error.message?.includes('Failed to fetch')) {
    return true
  }
  if (error.message?.includes('NetworkError')) {
    return true
  }
  if (error.message?.includes('Network request failed')) {
    return true
  }
  if (error.name === 'TypeError' && error.message?.includes('fetch')) {
    return true
  }

  return false
}

/**
 * Standardized error handler for try-catch blocks
 * Logs error and returns user-friendly message
 *
 * @param {Error} error - Caught error
 * @param {string} context - Context where error occurred (e.g., 'fetching notes')
 * @returns {string} - User-friendly error message
 */
export const handleError = (error, context = 'operation') => {
  console.error(`Error ${context}:`, error)

  if (isNetworkError(error)) {
    return 'Network error. Please check your connection and try again.'
  }

  return getErrorMessage(error) || `Failed to ${context}. Please try again.`
}

export default {
  handleApiResponse,
  getErrorMessage,
  isAuthError,
  isNetworkError,
  handleError
}
