/**
 * Constants Index
 * Central export point for all application constants
 *
 * Usage:
 * import { AUTH_KEYS, STATUS, INTERVALS, ENDPOINTS } from '../utils/constants'
 * // or import specific modules
 * import { AUTH_KEYS } from '../utils/constants/storage'
 */

// Storage keys
export {
  AUTH_KEYS,
  AUTH_KEY_PATTERNS,
  REALTIME_KEYS,
  ATTENDANCE_KEYS,
  CHROME_STORAGE_KEYS,
  getAllAuthKeys,
  getAllRealtimeKeys,
  getAllAttendanceKeys,
  matchesKeyPattern,
  getAttendanceTokenKey,
  getChromeTokenKey,
  ALL_STORAGE_KEYS
} from './storage'

// Status values
export {
  STATUS,
  STATUS_LABELS,
  PARTICIPANT_TYPE,
  PARTICIPANT_TYPE_LABELS,
  MEETING_STATUS,
  MEETING_STATUS_LABELS,
  USER_ROLE,
  USER_ROLE_LABELS,
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_LABELS,
  getStatusInfo,
  normalizeStatus,
  isAttending,
  getAllStatuses,
  getAllRoles
} from './status'

// Timing constants
export {
  INTERVALS,
  TIMEOUTS,
  THRESHOLDS,
  RETRY_CONFIG,
  msToSeconds,
  secondsToMs,
  minutesToMs,
  isStale,
  formatDuration
} from './timing'

// API constants
export {
  getApiBaseUrl,
  getSocketUrl,
  ENDPOINTS,
  HTTP_METHODS,
  HTTP_STATUS,
  SOCKET_EVENTS,
  getEndpoint,
  buildQueryString,
  buildUrl
} from './api'

// Route constants
export {
  ROUTES,
  AUTH_ROUTES,
  STUDENT_ROUTES,
  INSTRUCTOR_ROUTES,
  ADMIN_ROUTES,
  STUDENT_NAV_ITEMS,
  INSTRUCTOR_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  getRoutesByRole,
  getNavItemsByRole,
  getDefaultDashboard,
  getProfileRoute,
  isAuthRoute,
  isActiveRoute
} from './routes'

// Message constants
export {
  MESSAGES,
  AUTH_MESSAGES,
  VALIDATION_MESSAGES,
  NETWORK_MESSAGES,
  SUCCESS_MESSAGES,
  CONFIRM_MESSAGES,
  EMPTY_MESSAGES,
  LOADING_MESSAGES,
  ATTENDANCE_MESSAGES,
  getErrorMessage,
  formatFieldError,
  getConfirmMessage
} from './messages'
