/**
 * NE-ATTEND Route Constants
 * Centralized navigation paths for the entire application
 *
 * Usage:
 * import { ROUTES, getRoutesByRole } from '../utils/constants/routes'
 * navigate(ROUTES.STUDENT.DASHBOARD)
 */

// ============================================================================
// AUTH ROUTES
// ============================================================================

export const AUTH_ROUTES = {
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot',
  RESET_PASSWORD: '/reset-password'
}

// ============================================================================
// STUDENT ROUTES
// ============================================================================

export const STUDENT_ROUTES = {
  DASHBOARD: '/dashboard',
  ATTENDANCE_LOGS: '/attendance-logs',
  ANNOUNCEMENTS: '/student-announcements',
  NOTES: '/notes',
  SUBJECTS: '/group',
  PROFILE: '/student-profile'
}

// ============================================================================
// INSTRUCTOR ROUTES
// ============================================================================

export const INSTRUCTOR_ROUTES = {
  DASHBOARD: '/instructor-dashboard',
  HISTORY: '/history',
  SUBJECTS: '/Instructor_Subject',
  ANNOUNCEMENTS: '/Announcements',
  NOTES: '/Instructor_Notes',
  CREATE_GROUP: '/CreateGroup',
  GROUP_SETTINGS: '/GroupSettings',
  PROFILE: '/instructor-profile',
  INSIGHTS: '/instructor-insights'
}

// ============================================================================
// ADMIN ROUTES
// ============================================================================

export const ADMIN_ROUTES = {
  DASHBOARD: '/adminD',
  USERS: '/admin/users',
  SUBJECTS: '/admin/subjects',
  GROUPS: '/admin/groups',
  REPORTS: '/admin/reports',
  PROFILE: '/admin-profile'
}

// ============================================================================
// COMBINED ROUTES OBJECT
// ============================================================================

export const ROUTES = {
  AUTH: AUTH_ROUTES,
  STUDENT: STUDENT_ROUTES,
  INSTRUCTOR: INSTRUCTOR_ROUTES,
  ADMIN: ADMIN_ROUTES
}

// ============================================================================
// NAVIGATION ITEMS (For sidebar menus)
// ============================================================================

/**
 * Student navigation items for sidebar
 */
export const STUDENT_NAV_ITEMS = [
  {
    icon: 'bi-speedometer2',
    label: 'DASHBOARD',
    path: STUDENT_ROUTES.DASHBOARD
  },
  {
    icon: 'bi-calendar-check',
    label: 'ATTENDANCE LOGS',
    path: STUDENT_ROUTES.ATTENDANCE_LOGS
  },
  {
    icon: 'bi-megaphone',
    label: 'ANNOUNCEMENTS',
    path: STUDENT_ROUTES.ANNOUNCEMENTS
  },
  {
    icon: 'bi-journal-text',
    label: 'NOTES',
    path: STUDENT_ROUTES.NOTES
  },
  {
    icon: 'bi-people-fill',
    label: 'SUBJECT',
    path: STUDENT_ROUTES.SUBJECTS
  },
  {
    icon: 'bi-box-arrow-right',
    label: 'LOGOUT',
    path: '/logout',
    isLogout: true
  }
]

/**
 * Instructor navigation items for sidebar
 */
export const INSTRUCTOR_NAV_ITEMS = [
  {
    icon: 'bi-speedometer2',
    label: 'DASHBOARD',
    path: INSTRUCTOR_ROUTES.DASHBOARD
  },
  {
    icon: 'bi-clock-history',
    label: 'HISTORY',
    path: INSTRUCTOR_ROUTES.HISTORY
  },
  {
    icon: 'bi-book',
    label: 'SUBJECTS',
    path: INSTRUCTOR_ROUTES.SUBJECTS
  },
  {
    icon: 'bi-megaphone',
    label: 'ANNOUNCEMENTS',
    path: INSTRUCTOR_ROUTES.ANNOUNCEMENTS
  },
  {
    icon: 'bi-journal-text',
    label: 'NOTES',
    path: INSTRUCTOR_ROUTES.NOTES
  },
  {
    icon: 'bi-person-circle',
    label: 'VIEW PROFILE',
    path: INSTRUCTOR_ROUTES.PROFILE
  },
  // ATTENDANCE INSIGHTS removed - now integrated into Dashboard
  {
    icon: 'bi-box-arrow-right',
    label: 'LOGOUT',
    path: '/logout',
    isLogout: true
  }
]

/**
 * Admin navigation items for sidebar
 */
export const ADMIN_NAV_ITEMS = [
  {
    icon: 'bi-speedometer2',
    label: 'DASHBOARD',
    path: ADMIN_ROUTES.DASHBOARD
  },
  {
    icon: 'bi-people',
    label: 'USERS',
    path: ADMIN_ROUTES.USERS
  },
  {
    icon: 'bi-book',
    label: 'SUBJECTS',
    path: ADMIN_ROUTES.SUBJECTS
  },
  {
    icon: 'bi-collection',
    label: 'GROUPS',
    path: ADMIN_ROUTES.GROUPS
  },
  {
    icon: 'bi-graph-up',
    label: 'REPORTS',
    path: ADMIN_ROUTES.REPORTS
  },
  {
    icon: 'bi-box-arrow-right',
    label: 'LOGOUT',
    path: '/logout',
    isLogout: true
  }
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get routes for a specific user role
 * @param {string} role - User role (student, instructor, admin)
 * @returns {Object} Routes object for the role
 */
export const getRoutesByRole = role => {
  const roleRoutes = {
    student: STUDENT_ROUTES,
    instructor: INSTRUCTOR_ROUTES,
    admin: ADMIN_ROUTES
  }
  return roleRoutes[role?.toLowerCase()] || STUDENT_ROUTES
}

/**
 * Get navigation items for a specific user role
 * @param {string} role - User role
 * @returns {Array} Navigation items array
 */
export const getNavItemsByRole = role => {
  const navItems = {
    student: STUDENT_NAV_ITEMS,
    instructor: INSTRUCTOR_NAV_ITEMS,
    admin: ADMIN_NAV_ITEMS
  }
  return navItems[role?.toLowerCase()] || STUDENT_NAV_ITEMS
}

/**
 * Get default dashboard route for a role
 * @param {string} role - User role
 * @returns {string} Default dashboard path
 */
export const getDefaultDashboard = role => {
  const dashboards = {
    student: STUDENT_ROUTES.DASHBOARD,
    instructor: INSTRUCTOR_ROUTES.DASHBOARD,
    admin: ADMIN_ROUTES.DASHBOARD
  }
  return dashboards[role?.toLowerCase()] || AUTH_ROUTES.LOGIN
}

/**
 * Get profile route for a role
 * @param {string} role - User role
 * @returns {string} Profile path
 */
export const getProfileRoute = role => {
  const profiles = {
    student: STUDENT_ROUTES.PROFILE,
    instructor: INSTRUCTOR_ROUTES.PROFILE,
    admin: ADMIN_ROUTES.PROFILE
  }
  return profiles[role?.toLowerCase()] || AUTH_ROUTES.LOGIN
}

/**
 * Check if a path is an auth route (no auth required)
 * @param {string} path - Route path
 * @returns {boolean} True if auth route
 */
export const isAuthRoute = path => {
  return Object.values(AUTH_ROUTES).includes(path)
}

/**
 * Check if current path matches a route
 * @param {string} currentPath - Current location path
 * @param {string} routePath - Route to check against
 * @returns {boolean} True if paths match
 */
export const isActiveRoute = (currentPath, routePath) => {
  return currentPath === routePath
}
