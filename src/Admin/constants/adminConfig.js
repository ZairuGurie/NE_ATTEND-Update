// Admin Dashboard Configuration Constants

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [5, 10, 20, 50],
};

export const DEPARTMENTS = ['IT', 'CS', 'IS'];

export const SCHOOL_YEARS = ['2024-2025', '2025-2026', '2026-2027'];

export const SEMESTERS = ['1st Semester', '2nd Semester'];

export const YEAR_LEVELS = [
  '1st Year - BSIT 1A',
  '2nd Year - BSIT 2A',
  '3rd Year - BSIT 3A',
  '4th Year - BSIT 4A',
];

export const STATUS_OPTIONS = ['Active', 'Inactive'];

export const SUBJECT_COUNT_RANGES = [
  { value: '1-2', label: '1-2 Subjects' },
  { value: '3-4', label: '3-4 Subjects' },
  { value: '5+', label: '5+ Subjects' },
];

export const USER_ROLES = {
  ADMIN: 'admin',
  INSTRUCTOR: 'instructor',
  STUDENT: 'student',
};

export const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc',
};

// Analytics mock data with dates
export const generateAnalyticsData = () => {
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    last7Days.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      attendance: Math.floor(Math.random() * 20) + 75,
      late: Math.floor(Math.random() * 10) + 5,
      absent: Math.floor(Math.random() * 8) + 2,
    });
  }
  return last7Days;
};

export const ACTIVITY_LOG_TYPES = {
  USER_MANAGEMENT: 'User Management',
  ATTENDANCE: 'Attendance',
  SYSTEM: 'System',
};

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

export const EXPORT_FORMATS = {
  CSV: 'csv',
  PDF: 'pdf',
};

