/**
 * API Constants
 * Centralized API endpoint definitions and configuration
 *
 * Usage:
 * import { ENDPOINTS, getEndpoint } from '../constants/api'
 * const url = getEndpoint(ENDPOINTS.USERS.LOGIN)
 */

// ============================================================================
// API CONFIGURATION
// ============================================================================

/**
 * Get the API base URL from environment variables
 * Falls back to development URL if not set
 */
export const getApiBaseUrl = () => {
  // In development with Vite proxy, use relative URL
  if (import.meta.env.DEV) {
    return '/api'
  }

  // In production, use environment variable
  const baseUrl = import.meta.env.VITE_API_BASE_URL

  if (!baseUrl) {
    console.warn(
      '⚠️ VITE_API_BASE_URL not set. Using fallback URL.',
      'Set this in your .env file for production.'
    )
    return 'http://localhost:8000/api'
  }

  return baseUrl
}

/**
 * Get the Socket.IO URL from environment variables
 */
export const getSocketUrl = () => {
  // In development, connect directly to backend
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
  }

  // In production, derive from API URL
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  if (apiUrl) {
    return apiUrl.replace('/api', '')
  }

  console.warn(
    '⚠️ Socket URL not configured. Using fallback.',
    'Set VITE_API_BASE_URL in your .env file.'
  )
  return 'http://localhost:8000'
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: 'auth/login',
    LOGOUT: 'auth/logout',
    REGISTER: 'auth/register',
    REFRESH: 'auth/refresh',
    VERIFY: 'auth/verify',
    FORGOT_PASSWORD: 'auth/forgot-password',
    RESET_PASSWORD: 'auth/reset-password'
  },

  // Users
  USERS: {
    BASE: 'users',
    BY_ID: id => `users/${id}`,
    PROFILE: 'users/profile',
    UPDATE: id => `users/${id}`,
    DELETE: id => `users/${id}`,
    LIST: 'users',
    BY_ROLE: role => `users/role/${role}`
  },

  // Attendance
  ATTENDANCE: {
    BASE: 'attendance',
    PROGRESS: 'attendance/progress',
    LIVE_PARTICIPANTS: 'attendance/live-participants',
    SAVE_HISTORY: 'attendance/save-history',
    BATCH: 'attendance/batch',
    BY_STUDENT: studentId => `attendance/student/${studentId}`,
    BY_SUBJECT: subjectId => `attendance/subject/${subjectId}`,
    BY_SESSION: sessionId => `attendance/${sessionId}`,
    CLEAR_SESSION: meetCode => `attendance/clear-session/${meetCode}`,
    GENERATE_TOKEN: 'attendance/generate-token'
  },

  ATTENDANCE_RISK: {
    SUBJECT: subjectId => `attendance/risk/subject/${subjectId}`,
    STUDENT: (studentId, subjectId) =>
      `attendance/risk/student/${studentId}/subject/${subjectId}`
  },

  // Subjects
  SUBJECTS: {
    BASE: 'subjects',
    BY_ID: id => `subjects/${id}`,
    BY_INSTRUCTOR: instructorId => `subjects/instructor/${instructorId}`,
    STUDENTS: subjectId => `subjects/${subjectId}/students`,
    ADD_STUDENT: subjectId => `subjects/${subjectId}/students`,
    REMOVE_STUDENT: (subjectId, studentId) =>
      `subjects/${subjectId}/students/${studentId}`
  },

  // Groups
  GROUPS: {
    BASE: 'groups',
    BY_ID: id => `groups/${id}`,
    BY_INSTRUCTOR: instructorId => `groups/instructor/${instructorId}`,
    MEMBERS: groupId => `groups/${groupId}/members`
  },

  // Sessions
  SESSIONS: {
    BASE: 'sessions',
    BY_ID: id => `sessions/${id}`,
    BY_SUBJECT: subjectId => `sessions/subject/${subjectId}`,
    BY_INSTRUCTOR: instructorId => `sessions/instructor/${instructorId}`,
    ACTIVE: 'sessions/active'
  },

  // Announcements
  ANNOUNCEMENTS: {
    BASE: 'announcements',
    BY_ID: id => `announcements/${id}`,
    BY_SUBJECT: subjectId => `announcements/subject/${subjectId}`
  },

  // Notes
  NOTES: {
    BASE: 'notes',
    BY_ID: id => `notes/${id}`,
    BY_SUBJECT: subjectId => `notes/subject/${subjectId}`
  },

  // Admin
  ADMIN: {
    DASHBOARD: 'admin/dashboard',
    STATS: 'admin/stats',
    ACTIVITY_LOG: 'admin/activity-log'
  }
}

// ============================================================================
// HTTP METHODS
// ============================================================================

export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE'
}

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
}

// ============================================================================
// SOCKET.IO EVENTS
// ============================================================================

export const SOCKET_EVENTS = {
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',

  // Room events
  JOIN_ROOMS: 'join:rooms',
  ROOMS_JOINED: 'rooms:joined',
  LEAVE_ROOMS: 'leave:rooms',

  // Attendance events
  ATTENDANCE_UPDATE: 'attendance:update',
  MEETING_STATUS: 'meeting:status',

  // Extension events
  EXTENSION_CONNECTED: 'extension:connected',
  EXTENSION_HEARTBEAT: 'extension:heartbeat',
  EXTENSION_DISCONNECTED: 'extension:disconnected'
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build full API URL for an endpoint
 * @param {string} endpoint - The endpoint path
 * @returns {string} Full API URL
 */
export const getEndpoint = endpoint => {
  const baseUrl = getApiBaseUrl()
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  return `${baseUrl}/${cleanEndpoint}`
}

/**
 * Build query string from params object
 * @param {Object} params - Query parameters
 * @returns {string} Query string (without leading ?)
 */
export const buildQueryString = params => {
  const filtered = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )

  return filtered.join('&')
}

/**
 * Build full URL with query parameters
 * @param {string} endpoint - The endpoint path
 * @param {Object} params - Query parameters
 * @returns {string} Full URL with query string
 */
export const buildUrl = (endpoint, params = {}) => {
  const url = getEndpoint(endpoint)
  const queryString = buildQueryString(params)
  return queryString ? `${url}?${queryString}` : url
}
