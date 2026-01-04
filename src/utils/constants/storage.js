/**
 * LocalStorage Key Constants
 * Centralized storage key definitions to prevent hardcoding and ensure consistency
 *
 * Usage:
 * import { AUTH_KEYS, REALTIME_KEYS, ATTENDANCE_KEYS } from '../constants/storage'
 * localStorage.getItem(AUTH_KEYS.TOKEN)
 */

// ============================================================================
// AUTHENTICATION STORAGE KEYS
// ============================================================================

export const AUTH_KEYS = {
  // Core authentication
  TOKEN: 'token',
  USER: 'user',

  // Create Account flow
  CA_EMAIL: 'ca_email',
  CA_PASSWORD: 'ca_password',
  CA_FIRST_NAME: 'ca_firstName',
  CA_LAST_NAME: 'ca_lastName',
  CA_ROLE: 'ca_role',
  CA_DEPARTMENT: 'ca_department',
  CA_COURSE: 'ca_course',
  CA_USER_ID: 'ca_userId',
  CA_VERIFICATION_CODE: 'ca_verificationCode',

  // Remember me feature
  REMEMBERED_EMAIL: 'rememberedEmail',
  REMEMBER_ME: 'rememberMe'
}

// Pattern for dynamically generated auth keys
export const AUTH_KEY_PATTERNS = {
  ATTENDANCE_TOKEN: 'attendance_token_' // Pattern: attendance_token_{subjectId}
}

// ============================================================================
// REAL-TIME MONITORING STORAGE KEYS
// ============================================================================

export const REALTIME_KEYS = {
  // Instructor real-time monitoring
  LIVE_ROWS: 'instructorRealtimeLiveRows',
  HISTORICAL_ROWS: 'instructorRealtimeHistoricalRows',
  ALL_ROWS: 'instructorRealtimeAllRows',

  // Shared real-time data
  LIVE_PARTICIPANTS: 'neattend_live_participants',
  ACTIVE_MEETING: 'neattend_active_meeting',
  LAST_UPDATE: 'neattend_last_update',
  DURATION_TRACKER: 'neattend_duration_tracker',

  // General attendance data
  ATTENDANCE_DATA: 'neattend_attendance_data'
}

// ============================================================================
// ATTENDANCE HISTORY STORAGE KEYS
// ============================================================================

export const ATTENDANCE_KEYS = {
  HISTORY: 'instructorAttendanceHistory',
  CURRENT_MEET_CODE: 'instructorCurrentMeetCode',
  CURRENT_SESSION_START: 'instructorCurrentSessionStart'
}

// ============================================================================
// CHROME STORAGE KEYS (for browser extension)
// ============================================================================

export const CHROME_STORAGE_KEYS = {
  CURRENT_USER: 'neattend_current_user',
  TOKEN_PREFIX: 'neattend_token_' // Pattern: neattend_token_{subjectId}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all auth-related localStorage keys (excluding patterns)
 * @returns {string[]} Array of auth key values
 */
export const getAllAuthKeys = () => Object.values(AUTH_KEYS)

/**
 * Get all realtime-related localStorage keys
 * @returns {string[]} Array of realtime key values
 */
export const getAllRealtimeKeys = () => Object.values(REALTIME_KEYS)

/**
 * Get all attendance history-related localStorage keys
 * @returns {string[]} Array of attendance key values
 */
export const getAllAttendanceKeys = () => Object.values(ATTENDANCE_KEYS)

/**
 * Check if a key matches a dynamic pattern
 * @param {string} key - The key to check
 * @param {string} pattern - The pattern prefix
 * @returns {boolean} True if key starts with pattern
 */
export const matchesKeyPattern = (key, pattern) => key.startsWith(pattern)

/**
 * Generate an attendance token key for a subject
 * @param {string} subjectId - The subject ID
 * @returns {string} The full storage key
 */
export const getAttendanceTokenKey = subjectId =>
  `${AUTH_KEY_PATTERNS.ATTENDANCE_TOKEN}${subjectId}`

/**
 * Generate a chrome storage token key
 * @param {string} subjectId - The subject ID
 * @returns {string} The full storage key
 */
export const getChromeTokenKey = subjectId =>
  `${CHROME_STORAGE_KEYS.TOKEN_PREFIX}${subjectId}`

// Export all keys as a combined object for convenience
export const ALL_STORAGE_KEYS = {
  ...AUTH_KEYS,
  ...REALTIME_KEYS,
  ...ATTENDANCE_KEYS
}
