/**
 * Shared Timeout Manager
 *
 * Manages pending timeouts for two-phase status emissions to prevent race conditions
 * and ensure consistent timeout handling across all endpoints.
 *
 * This module provides a centralized way to manage timeouts for meeting end events,
 * ensuring that timeouts are properly cleared and don't conflict between different
 * endpoints (server.js progress endpoint and routes/attendance.js).
 */

const pendingTimeouts = new Map() // Map<timeoutKey, timeoutId>

/**
 * Generate a consistent timeout key from session information
 *
 * @param {Object} options - Options for key generation
 * @param {string|ObjectId} options.sessionId - Session ID (preferred)
 * @param {string} options.meetCode - Meet code (fallback)
 * @returns {string} Generated timeout key
 */
function generateTimeoutKey ({ sessionId, meetCode }) {
  // Prefer sessionId if available, otherwise use meetCode
  if (sessionId) {
    return typeof sessionId === 'string' ? sessionId : sessionId.toString()
  }
  if (meetCode) {
    return `meet_${meetCode}`
  }
  throw new Error(
    'Timeout key generation requires either sessionId or meetCode'
  )
}

/**
 * Clear an existing timeout for a given key
 *
 * @param {string} key - Timeout key to clear
 * @returns {boolean} True if a timeout was cleared, false otherwise
 */
function clearTimeout (key) {
  if (!key) {
    return false
  }

  const timeoutId = pendingTimeouts.get(key)
  if (timeoutId) {
    global.clearTimeout(timeoutId)
    pendingTimeouts.delete(key)
    console.log(`🧹 Cleared timeout for key: ${key}`)
    return true
  }
  return false
}

/**
 * Set a new timeout, clearing any existing one for the same key
 *
 * @param {Object} options - Options for setting timeout
 * @param {string|ObjectId} options.sessionId - Session ID
 * @param {string} options.meetCode - Meet code (fallback)
 * @param {Function} options.callback - Callback function to execute
 * @param {number} options.delay - Delay in milliseconds (default: 1500)
 * @returns {string} The timeout key used
 */
function setTimeout ({ sessionId, meetCode, callback, delay = 1500 }) {
  const key = generateTimeoutKey({ sessionId, meetCode })

  // Clear any existing timeout for this key
  clearTimeout(key)

  // Set new timeout
  const timeoutId = global.setTimeout(() => {
    // Remove from map when it executes
    pendingTimeouts.delete(key)
    callback()
  }, delay)

  // Store timeout ID
  pendingTimeouts.set(key, timeoutId)

  return key
}

/**
 * Check if a timeout exists for a given key
 *
 * @param {string} key - Timeout key to check
 * @returns {boolean} True if timeout exists, false otherwise
 */
function hasTimeout (key) {
  if (!key) {
    return false
  }
  return pendingTimeouts.has(key)
}

/**
 * Clear all pending timeouts
 * Useful for cleanup on server shutdown
 */
function clearAll () {
  for (const [_key, timeoutId] of pendingTimeouts.entries()) {
    global.clearTimeout(timeoutId)
  }
  pendingTimeouts.clear()
  console.log('🧹 Cleared all pending timeouts')
}

/**
 * Get the number of pending timeouts
 *
 * @returns {number} Number of pending timeouts
 */
function getPendingCount () {
  return pendingTimeouts.size
}

module.exports = {
  generateTimeoutKey,
  clearTimeout,
  setTimeout: setTimeout,
  hasTimeout,
  clearAll,
  getPendingCount
}
