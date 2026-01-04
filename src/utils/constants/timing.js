/**
 * Timing Constants
 * Centralized timing values for intervals, timeouts, and thresholds
 *
 * Usage:
 * import { INTERVALS, TIMEOUTS, THRESHOLDS } from '../constants/timing'
 * setInterval(callback, INTERVALS.POLLING)
 */

// ============================================================================
// POLLING INTERVALS (in milliseconds)
// ============================================================================

export const INTERVALS = {
  // Real-time polling intervals
  LIVE_PARTICIPANTS_POLL: 2000, // 2 seconds - poll for live participant data
  EXTENSION_BRIDGE: 1000, // 1 second - extension bridge updates
  DURATION_TRACKER: 1000, // 1 second - update duration display
  STALE_DATA_CHECK: 10000, // 10 seconds - check for stale data

  // Page refresh intervals
  HISTORY_REFRESH: 15000, // 15 seconds - refresh history page
  DASHBOARD_REFRESH: 30000, // 30 seconds - dashboard data refresh

  // Health check intervals
  SOCKET_HEALTH_CHECK: 30000, // 30 seconds - Socket.IO health check
  EXTENSION_HEARTBEAT: 5000, // 5 seconds - extension heartbeat

  // Cache cleanup intervals
  CACHE_CLEANUP: 30000, // 30 seconds - clean up stale cache entries
  PROGRESS_CLEANUP: 60000, // 60 seconds - clean up old progress requests

  // Auto-save intervals
  HISTORY_AUTO_SAVE: 10000 // 10 seconds - check for auto-save eligibility
}

// ============================================================================
// TIMEOUT DURATIONS (in milliseconds)
// ============================================================================

export const TIMEOUTS = {
  // Authentication
  AUTH_REDIRECT_DELAY: 1000, // 1 second - delay before auth redirect
  VALIDATION_DEBOUNCE: 300, // 300ms - debounce for input validation

  // API requests
  API_REQUEST: 30000, // 30 seconds - API request timeout
  SOCKET_CONNECT: 10000, // 10 seconds - Socket.IO connection timeout

  // UI feedback
  TOAST_DURATION: 5000, // 5 seconds - toast notification duration
  LOADING_SPINNER_MIN: 500, // 500ms - minimum loading spinner display

  // Debounce timeouts
  SEARCH_DEBOUNCE: 300, // 300ms - search input debounce
  RESIZE_DEBOUNCE: 150, // 150ms - window resize debounce

  // Retry delays
  RECONNECT_DELAY: 5000, // 5 seconds - delay before reconnect attempt
  RETRY_DELAY: 2000 // 2 seconds - delay between retries
}

// ============================================================================
// THRESHOLDS (in milliseconds unless specified)
// ============================================================================

export const THRESHOLDS = {
  // Stale data detection
  STALE_DATA: 30000, // 30 seconds - data is considered stale
  EXTENSION_INACTIVE: 30000, // 30 seconds - extension considered inactive

  // History/persistence thresholds
  HISTORY_SAVE: 40000, // 40 seconds - save to history after this duration

  // Cache TTL
  LIVE_CACHE_TTL: 120000, // 2 minutes - live cache time-to-live

  // Host detection
  HOST_MISSED: 3, // 3 missed cycles - unlock host (count, not ms)
  HOST_CONFIRMATION: 2, // 2 confirmations - lock host (count, not ms)

  // Late attendance threshold (in minutes)
  LATE_THRESHOLD_MINUTES: 15, // 15 minutes - after this, marked as late

  // Session limits
  MAX_HISTORY_SESSIONS: 50, // Maximum sessions to keep in localStorage
  MAX_CACHE_ENTRIES: 100 // Maximum entries in live cache
}

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: TIMEOUTS.RETRY_DELAY,
  BACKOFF_MULTIPLIER: 1.5
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert milliseconds to seconds
 * @param {number} ms - Milliseconds
 * @returns {number} Seconds
 */
export const msToSeconds = ms => Math.floor(ms / 1000)

/**
 * Convert seconds to milliseconds
 * @param {number} seconds - Seconds
 * @returns {number} Milliseconds
 */
export const secondsToMs = seconds => seconds * 1000

/**
 * Convert minutes to milliseconds
 * @param {number} minutes - Minutes
 * @returns {number} Milliseconds
 */
export const minutesToMs = minutes => minutes * 60 * 1000

/**
 * Check if a timestamp is stale based on threshold
 * @param {number|string} timestamp - Timestamp to check (ms or ISO string)
 * @param {number} thresholdMs - Threshold in milliseconds
 * @returns {boolean} True if stale
 */
export const isStale = (timestamp, thresholdMs = THRESHOLDS.STALE_DATA) => {
  const ts =
    typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  return Date.now() - ts > thresholdMs
}

/**
 * Format milliseconds to human-readable duration
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2m 30s")
 */
export const formatDuration = ms => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}
