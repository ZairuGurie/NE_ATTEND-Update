/**
 * NE-ATTEND Messages Constants
 * Centralized error, success, and validation messages
 *
 * Usage:
 * import { MESSAGES, getErrorMessage } from '../utils/constants/messages'
 * setError(MESSAGES.AUTH.INVALID_CREDENTIALS)
 */

// ============================================================================
// AUTHENTICATION MESSAGES
// ============================================================================

export const AUTH_MESSAGES = {
  // Login
  INVALID_CREDENTIALS:
    'Invalid email or password. Please check your credentials and try again.',
  LOGIN_SUCCESS: 'Login successful! Redirecting...',
  LOGIN_FAILED: 'Login failed. Please try again.',
  SESSION_EXPIRED: 'Your session has expired. Please login again.',

  // Logout
  LOGOUT_SUCCESS: 'You have been logged out successfully.',

  // Registration
  REGISTRATION_SUCCESS: 'Account created successfully! Please login.',
  REGISTRATION_FAILED: 'Registration failed. Please try again.',
  EMAIL_EXISTS: 'An account with this email already exists.',

  // Password Reset
  RESET_EMAIL_SENT: 'Password reset instructions have been sent to your email.',
  RESET_SUCCESS:
    'Password reset successful! Please login with your new password.',
  RESET_FAILED: 'Password reset failed. Please try again.',
  RESET_LINK_EXPIRED: 'This password reset link has expired.',

  // Token
  TOKEN_INVALID: 'Invalid or expired token.',
  TOKEN_REQUIRED: 'Authentication required. Please login.',

  // Authorization
  UNAUTHORIZED: 'You are not authorized to access this resource.',
  FORBIDDEN: 'Access forbidden.',
  ROLE_REQUIRED: 'Invalid user role. Please contact support.'
}

// ============================================================================
// VALIDATION MESSAGES
// ============================================================================

export const VALIDATION_MESSAGES = {
  // Required fields
  REQUIRED: 'This field is required.',
  EMAIL_REQUIRED: 'Email address is required.',
  PASSWORD_REQUIRED: 'Password is required.',
  NAME_REQUIRED: 'Name is required.',

  // Format validation
  EMAIL_INVALID: 'Please enter a valid email address.',
  PASSWORD_MIN_LENGTH: 'Password must be at least 8 characters.',
  PASSWORD_WEAK:
    'Password must contain at least one uppercase letter, one lowercase letter, and one number.',
  PASSWORD_MISMATCH: 'Passwords do not match.',

  // Input validation
  INVALID_INPUT: 'Please check your input and try again.',
  FIELD_TOO_LONG: 'This field exceeds the maximum length.',
  FIELD_TOO_SHORT: 'This field is too short.',
  INVALID_DATE: 'Please enter a valid date.',
  INVALID_TIME: 'Please enter a valid time.',

  // Student ID
  STUDENT_ID_REQUIRED: 'Student ID is required.',
  STUDENT_ID_INVALID: 'Please enter a valid student ID.'
}

// ============================================================================
// NETWORK MESSAGES
// ============================================================================

export const NETWORK_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  SERVER_ERROR: 'Server error occurred. Please try again later.',
  TIMEOUT: 'Request timed out. Please try again.',
  NOT_FOUND: 'Resource not found.',
  SERVICE_UNAVAILABLE:
    'Service temporarily unavailable. Please try again later.',
  CONNECTION_FAILED:
    'Cannot connect to server. Please check your internet connection.'
}

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================

export const SUCCESS_MESSAGES = {
  // CRUD
  CREATED: 'Created successfully!',
  UPDATED: 'Updated successfully!',
  DELETED: 'Deleted successfully!',
  SAVED: 'Saved successfully!',

  // Attendance
  ATTENDANCE_MARKED: 'Attendance marked successfully!',
  ATTENDANCE_SAVED: 'Attendance session saved!',
  SESSION_STARTED: 'Attendance session started.',
  SESSION_ENDED: 'Attendance session ended.',

  // Profile
  PROFILE_UPDATED: 'Profile updated successfully!',
  PASSWORD_CHANGED: 'Password changed successfully!',
  PICTURE_UPLOADED: 'Profile picture uploaded successfully!',

  // Data
  DATA_LOADED: 'Data loaded successfully.',
  DATA_REFRESHED: 'Data refreshed.',
  SYNC_COMPLETE: 'Synchronization complete.'
}

// ============================================================================
// CONFIRMATION MESSAGES
// ============================================================================

export const CONFIRM_MESSAGES = {
  DELETE: 'Are you sure you want to delete this item?',
  DELETE_SESSION: 'Are you sure you want to delete this session?',
  DELETE_USER: 'Are you sure you want to delete this user?',
  LOGOUT: 'Are you sure you want to logout?',
  DISCARD_CHANGES: 'You have unsaved changes. Are you sure you want to leave?',
  CLEAR_DATA: 'Are you sure you want to clear all data?',
  END_SESSION: 'Are you sure you want to end this session?'
}

// ============================================================================
// EMPTY STATE MESSAGES
// ============================================================================

export const EMPTY_MESSAGES = {
  NO_DATA: 'No data found.',
  NO_RESULTS: 'No results match your search.',
  NO_ATTENDANCE: 'No attendance records found.',
  NO_SUBJECTS: 'No subjects found.',
  NO_GROUPS: 'No groups found.',
  NO_ANNOUNCEMENTS: 'No announcements yet.',
  NO_NOTES: 'No notes found.',
  NO_USERS: 'No users found.',
  NO_SESSIONS: 'No sessions recorded.',
  NO_PARTICIPANTS: 'No participants in this session.'
}

// ============================================================================
// LOADING MESSAGES
// ============================================================================

export const LOADING_MESSAGES = {
  DEFAULT: 'Loading...',
  AUTHENTICATING: 'Authenticating...',
  LOADING_DATA: 'Loading data...',
  SAVING: 'Saving...',
  PROCESSING: 'Processing...',
  UPLOADING: 'Uploading...',
  SYNCING: 'Syncing...',
  REFRESHING: 'Refreshing...'
}

// ============================================================================
// ATTENDANCE SPECIFIC MESSAGES
// ============================================================================

export const ATTENDANCE_MESSAGES = {
  EXTENSION_CONNECTED: 'Extension connected successfully.',
  EXTENSION_DISCONNECTED: 'Extension disconnected.',
  EXTENSION_NOT_INSTALLED: 'Chrome extension not installed or not running.',
  MEETING_DETECTED: 'Google Meet session detected.',
  MEETING_ENDED: 'Meeting has ended.',
  PARTICIPANT_JOINED: 'joined the meeting.',
  PARTICIPANT_LEFT: 'left the meeting.',
  STATUS_PRESENT: 'Present',
  STATUS_ABSENT: 'Absent',
  STATUS_LATE: 'Late',
  STATUS_PENDING: 'Pending'
}

// ============================================================================
// COMBINED MESSAGES OBJECT
// ============================================================================

export const MESSAGES = {
  AUTH: AUTH_MESSAGES,
  VALIDATION: VALIDATION_MESSAGES,
  NETWORK: NETWORK_MESSAGES,
  SUCCESS: SUCCESS_MESSAGES,
  CONFIRM: CONFIRM_MESSAGES,
  EMPTY: EMPTY_MESSAGES,
  LOADING: LOADING_MESSAGES,
  ATTENDANCE: ATTENDANCE_MESSAGES
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get error message for HTTP status code
 * @param {number} status - HTTP status code
 * @param {string} defaultMessage - Default message if no match
 * @returns {string} Error message
 */
export const getErrorMessage = (
  status,
  defaultMessage = 'An error occurred.'
) => {
  const statusMessages = {
    400: VALIDATION_MESSAGES.INVALID_INPUT,
    401: AUTH_MESSAGES.TOKEN_INVALID,
    403: AUTH_MESSAGES.FORBIDDEN,
    404: NETWORK_MESSAGES.NOT_FOUND,
    408: NETWORK_MESSAGES.TIMEOUT,
    500: NETWORK_MESSAGES.SERVER_ERROR,
    502: NETWORK_MESSAGES.SERVER_ERROR,
    503: NETWORK_MESSAGES.SERVICE_UNAVAILABLE,
    504: NETWORK_MESSAGES.TIMEOUT
  }
  return statusMessages[status] || defaultMessage
}

/**
 * Format validation error message with field name
 * @param {string} fieldName - Name of the field
 * @param {string} message - Base message
 * @returns {string} Formatted message
 */
export const formatFieldError = (
  fieldName,
  message = VALIDATION_MESSAGES.REQUIRED
) => {
  return message.replace('This field', fieldName)
}

/**
 * Get confirmation message for action type
 * @param {string} action - Action type (delete, logout, etc.)
 * @param {string} itemName - Optional item name
 * @returns {string} Confirmation message
 */
export const getConfirmMessage = (action, itemName = '') => {
  if (itemName) {
    return `Are you sure you want to ${action} "${itemName}"?`
  }
  return (
    CONFIRM_MESSAGES[action.toUpperCase()] ||
    `Are you sure you want to ${action}?`
  )
}
