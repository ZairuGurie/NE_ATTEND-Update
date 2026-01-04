/**
 * Attendance Status Constants
 * Centralized status definitions for consistency across the application
 *
 * Usage:
 * import { STATUS, STATUS_LABELS, getStatusInfo } from '../constants/status'
 * if (participant.status === STATUS.PRESENT) { ... }
 */

// ============================================================================
// ATTENDANCE STATUS VALUES
// ============================================================================

export const STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  PENDING: 'pending',
  LEFT: 'left'
}

// ============================================================================
// STATUS DISPLAY LABELS
// ============================================================================

export const STATUS_LABELS = {
  [STATUS.PRESENT]: 'Present',
  [STATUS.ABSENT]: 'Absent',
  [STATUS.LATE]: 'Late',
  [STATUS.PENDING]: 'Pending',
  [STATUS.LEFT]: 'Left Meeting'
}

// ============================================================================
// PARTICIPANT TYPES
// ============================================================================

export const PARTICIPANT_TYPE = {
  HOST: 'host',
  VERIFIED: 'verified',
  GUEST: 'guest'
}

export const PARTICIPANT_TYPE_LABELS = {
  [PARTICIPANT_TYPE.HOST]: 'Host',
  [PARTICIPANT_TYPE.VERIFIED]: 'Verified',
  [PARTICIPANT_TYPE.GUEST]: 'Guest'
}

// ============================================================================
// MEETING STATUS VALUES
// ============================================================================

export const MEETING_STATUS = {
  IDLE: 'idle',
  ACTIVE: 'active',
  SCRAPING: 'scraping',
  DATA_RECEIVED: 'data_received',
  PAUSED: 'paused'
}

export const MEETING_STATUS_LABELS = {
  [MEETING_STATUS.IDLE]: 'Waiting for data...',
  [MEETING_STATUS.ACTIVE]: 'Active',
  [MEETING_STATUS.SCRAPING]: 'Connecting...',
  [MEETING_STATUS.DATA_RECEIVED]: 'Receiving data',
  [MEETING_STATUS.PAUSED]: 'Paused'
}

// ============================================================================
// USER ROLES
// ============================================================================

export const USER_ROLE = {
  ADMIN: 'admin',
  INSTRUCTOR: 'instructor',
  STUDENT: 'student'
}

export const USER_ROLE_LABELS = {
  [USER_ROLE.ADMIN]: 'Administrator',
  [USER_ROLE.INSTRUCTOR]: 'Instructor',
  [USER_ROLE.STUDENT]: 'Student'
}

// ============================================================================
// ACCOUNT STATUS
// ============================================================================

export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended'
}

export const ACCOUNT_STATUS_LABELS = {
  [ACCOUNT_STATUS.ACTIVE]: 'Active',
  [ACCOUNT_STATUS.INACTIVE]: 'Inactive',
  [ACCOUNT_STATUS.PENDING]: 'Pending',
  [ACCOUNT_STATUS.SUSPENDED]: 'Suspended'
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get status info including label and color
 * @param {string} status - The status value
 * @returns {Object} Status info object
 */
export const getStatusInfo = status => {
  const normalizedStatus = normalizeStatus(status)
  return {
    value: normalizedStatus,
    label: STATUS_LABELS[normalizedStatus] || status,
    isValid: Object.values(STATUS).includes(normalizedStatus)
  }
}

/**
 * Normalize status string to lowercase standard format
 * @param {string} status - The status to normalize
 * @returns {string} Normalized status
 */
export const normalizeStatus = status => {
  if (!status) return STATUS.PENDING
  const lower = status.toLowerCase().trim()

  // Handle common variations
  if (lower === 'present' || lower === 'in meeting') return STATUS.PRESENT
  if (lower === 'absent' || lower === 'no show') return STATUS.ABSENT
  if (lower === 'late' || lower === 'tardy') return STATUS.LATE
  if (lower === 'pending' || lower === 'waiting') return STATUS.PENDING
  if (lower === 'left' || lower === 'left meeting') return STATUS.LEFT

  return lower
}

/**
 * Check if status indicates participant is present (present or late counts as attending)
 * @param {string} status - The status to check
 * @returns {boolean} True if participant is counted as attending
 */
export const isAttending = status => {
  const normalized = normalizeStatus(status)
  return normalized === STATUS.PRESENT || normalized === STATUS.LATE
}

/**
 * Get all possible status values
 * @returns {string[]} Array of status values
 */
export const getAllStatuses = () => Object.values(STATUS)

/**
 * Get all possible user roles
 * @returns {string[]} Array of role values
 */
export const getAllRoles = () => Object.values(USER_ROLE)
