/**
 * Instructor Schedule Service
 *
 * Calculates semester hours, policy metrics (25% tardiness, 17% absence)
 * for instructor schedules - both overall and per-session
 */

const { getModel: _getModel } = require('./dataStore')

// Policy constants
const TARDINESS_THRESHOLD_PERCENT = 0.25 // 25%
const ABSENCE_THRESHOLD_PERCENT = 0.17 // 17%
const TARDINESS_TO_ABSENCE_RATIO = 3
const DEFAULT_WEEKS_IN_SEMESTER = 18
const SEMESTER_MONTHS = 4 // Always calculate based on 4 months
const DAYS_PER_MONTH = 30 // Approximate days per month
const SEMESTER_DAYS = SEMESTER_MONTHS * DAYS_PER_MONTH // 120 days

/**
 * Parse time string to minutes since midnight
 * @param {string} timeStr - Time in "HH:MM" format
 * @returns {number} Minutes since midnight
 */
function parseTimeToMinutes (timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0

  const [hours = '0', minutes = '0'] = timeStr.split(':')
  const h = parseInt(hours, 10) || 0
  const m = parseInt(minutes, 10) || 0

  return h * 60 + m
}

/**
 * Calculate duration in minutes between start and end times
 * @param {string} startTime - Start time in "HH:MM" format
 * @param {string} endTime - End time in "HH:MM" format
 * @returns {number} Duration in minutes
 */
function calculateClassDuration (startTime, endTime) {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)

  if (endMinutes <= startMinutes) return 0 // Invalid time range

  return endMinutes - startMinutes
}

/**
 * Get weekday names that match schedule
 * @param {Array} weekdays - Array of weekday names from schedule
 * @returns {Array} Array of weekday numbers (0=Sunday, 1=Monday, etc.)
 */
function getWeekdayNumbers (weekdays) {
  const weekdayMap = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  }

  return (weekdays || [])
    .map(day => weekdayMap[day])
    .filter(num => num !== undefined)
}

/**
 * Calculate number of class sessions in date range
 * Always calculates based on exactly 4 months (120 days) from startDate
 * @param {Date} startDate - Start date of semester
 * @param {Date} endDate - End date of semester (ignored, always uses 4 months from startDate)
 * @param {Array} weekdays - Array of weekday names
 * @returns {number} Number of class sessions
 */
function calculateSessionCount (startDate, endDate, weekdays) {
  if (!startDate || !weekdays || weekdays.length === 0) {
    return 0
  }

  const weekdayNumbers = getWeekdayNumbers(weekdays)
  const start = new Date(startDate)
  // Always calculate based on exactly 4 months (120 days) from startDate
  const end = new Date(start)
  end.setDate(end.getDate() + SEMESTER_DAYS)

  let sessionCount = 0
  const current = new Date(start)

  while (current <= end) {
    const dayOfWeek = current.getDay()
    if (weekdayNumbers.includes(dayOfWeek)) {
      sessionCount++
    }
    current.setDate(current.getDate() + 1)
  }

  return sessionCount
}

/**
 * Calculate comprehensive schedule metrics for an instructor's subject
 * @param {string} instructorId - Instructor ID
 * @param {string} subjectId - Subject ID (optional, if null calculates for all subjects)
 * @returns {Object} Schedule calculations and policy metrics
 */
async function calculateInstructorScheduleMetrics (
  instructorId,
  subjectId = null
) {
  try {
    const Subject = _getModel('Subject')

    // Build query
    const query = { instructorId, isActive: true }
    if (subjectId) {
      query._id = subjectId
    }

    const subjects = await Subject.find(query).lean()

    if (!subjects || subjects.length === 0) {
      return {
        success: false,
        message: 'No active subjects found for instructor',
        data: null
      }
    }

    const results = []
    let totalSemesterHours = 0
    let totalSessions = 0
    let totalContactHours = 0

    for (const subject of subjects) {
      const metrics = calculateSubjectMetrics(subject)
      results.push(metrics)

      totalSemesterHours += metrics.totalSemesterHours
      totalSessions += metrics.totalSessions
      totalContactHours += metrics.totalContactHours
    }

    // Calculate overall policy metrics
    const overallPolicyMetrics = calculateOverallPolicyMetrics(
      totalSessions,
      totalContactHours
    )

    // Calculate average weeks in semester from subjects (should be consistent)
    const avgWeeksInSemester = results.length > 0 && results[0].weeks
      ? results[0].weeks.weeksInSemester
      : DEFAULT_WEEKS_IN_SEMESTER // 18 weeks

    return {
      success: true,
      data: {
        instructorId,
        subjects: results,
        summary: {
          totalSubjects: subjects.length,
          totalSemesterHours: Math.round(totalSemesterHours * 10) / 10,
          totalSessions,
          totalContactHours: Math.round(totalContactHours * 10) / 10,
          weeksInSemester: avgWeeksInSemester,
          ...overallPolicyMetrics
        }
      }
    }
  } catch (error) {
    console.error('Error calculating instructor schedule metrics:', error)
    return {
      success: false,
      message: 'Failed to calculate schedule metrics',
      error: error.message
    }
  }
}

/**
 * Calculate metrics for a single subject
 * @param {Object} subject - Subject document
 * @returns {Object} Subject metrics
 */
function calculateSubjectMetrics (subject) {
  const { schedule, subjectName, subjectCode, _id } = subject

  // Default values if schedule is incomplete
  const classDurationMinutes =
    schedule && schedule.startTime && schedule.endTime
      ? calculateClassDuration(schedule.startTime, schedule.endTime)
      : 90 // Default 1.5 hours

  const sessionCount =
    schedule && schedule.startDate && schedule.weekdays
      ? calculateSessionCount(
          schedule.startDate,
          schedule.endDate, // endDate is ignored, always uses 4 months from startDate
          schedule.weekdays
        )
      : 18 // Default 18 sessions

  // Calculate weeks in semester: Always 18 weeks for one semester
  const weeksInSemester = DEFAULT_WEEKS_IN_SEMESTER // 18 weeks

  const totalSemesterHours = (sessionCount * classDurationMinutes) / 60
  const weeklyContactHours =
    (schedule?.weekdays?.length || 1) * (classDurationMinutes / 60)
  const totalContactHours = weeklyContactHours * weeksInSemester

  // Policy calculations for this subject
  const tardinessThresholdMinutes = Math.round(
    classDurationMinutes * TARDINESS_THRESHOLD_PERCENT
  )
  const maxAllowedAbsences = Math.floor(
    sessionCount * ABSENCE_THRESHOLD_PERCENT
  )
  const maxAllowedTardiness = maxAllowedAbsences * TARDINESS_TO_ABSENCE_RATIO

  return {
    subjectId: _id,
    subjectName,
    subjectCode,
    schedule: {
      startDate: schedule?.startDate,
      endDate: schedule?.endDate,
      weekdays: schedule?.weekdays || [],
      startTime: schedule?.startTime,
      endTime: schedule?.endTime,
      classDurationMinutes
    },
    sessions: {
      totalSessions: sessionCount,
      sessionsPerWeek: schedule?.weekdays?.length || 1,
      classDurationMinutes,
      weeklyContactHours: Math.round(weeklyContactHours * 10) / 10
    },
    hours: {
      totalSemesterHours: Math.round(totalSemesterHours * 10) / 10,
      totalContactHours: Math.round(totalContactHours * 10) / 10,
      weeklyContactHours: Math.round(weeklyContactHours * 10) / 10
    },
    weeks: {
      weeksInSemester
    },
    policy: {
      tardiness: {
        thresholdPercent: TARDINESS_THRESHOLD_PERCENT * 100,
        thresholdMinutes: tardinessThresholdMinutes,
        description: `Student is tardy after ${tardinessThresholdMinutes} minutes`
      },
      absence: {
        thresholdPercent: ABSENCE_THRESHOLD_PERCENT * 100,
        maxAllowedAbsences,
        maxAllowedTardiness,
        description: `Max ${maxAllowedAbsences} absences (${
          ABSENCE_THRESHOLD_PERCENT * 100
        }%) before D/F eligibility`
      },
      conversion: {
        tardinessToAbsence: TARDINESS_TO_ABSENCE_RATIO,
        description: `${TARDINESS_TO_ABSENCE_RATIO} tardiness = 1 absence`
      }
    }
  }
}

/**
 * Calculate overall policy metrics across all subjects
 * @param {number} totalSessions - Total sessions across all subjects
 * @param {number} totalContactHours - Total contact hours
 * @returns {Object} Overall policy metrics
 */
function calculateOverallPolicyMetrics (totalSessions, totalContactHours) {
  const maxAllowedAbsences = Math.floor(
    totalSessions * ABSENCE_THRESHOLD_PERCENT
  )
  const maxAllowedTardiness = maxAllowedAbsences * TARDINESS_TO_ABSENCE_RATIO
  const absenceThresholdHours =
    Math.round(totalContactHours * ABSENCE_THRESHOLD_PERCENT * 10) / 10

  return {
    overallPolicy: {
      totalSessions,
      totalContactHours,
      absence: {
        thresholdPercent: ABSENCE_THRESHOLD_PERCENT * 100,
        maxAllowedAbsences,
        maxAllowedTardiness,
        absenceThresholdHours,
        description: `Max ${maxAllowedAbsences} absences or ${absenceThresholdHours} hours missed (${
          ABSENCE_THRESHOLD_PERCENT * 100
        }%)`
      },
      tardiness: {
        thresholdPercent: TARDINESS_THRESHOLD_PERCENT * 100,
        description: `Tardiness calculated at ${
          TARDINESS_THRESHOLD_PERCENT * 100
        }% of class duration`
      }
    }
  }
}

/**
 * Get per-session policy breakdown
 * @param {string} subjectId - Subject ID
 * @returns {Object} Per-session policy details
 */
async function getPerSessionPolicyBreakdown (subjectId) {
  try {
    const metrics = await calculateInstructorScheduleMetrics(null, subjectId)

    if (!metrics.success || !metrics.data.subjects.length) {
      return {
        success: false,
        message: 'Subject not found or has no schedule'
      }
    }

    const subject = metrics.data.subjects[0]
    const { totalSessions, classDurationMinutes } = subject.sessions
    const { tardiness, absence } = subject.policy

    return {
      success: true,
      data: {
        subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        perSession: {
          classDurationMinutes,
          tardinessThresholdMinutes: tardiness.thresholdMinutes,
          tardinessDescription: tardiness.description,
          absencePerSession: (
            absence.maxAllowedAbsences / totalSessions
          ).toFixed(2),
          totalAllowedAbsences: absence.maxAllowedAbsences,
          totalAllowedTardiness: absence.maxAllowedTardiness
        },
        summary: {
          '25% Tardiness Rule': `After ${tardiness.thresholdMinutes} minutes of class time`,
          '17% Absence Rule': `Max ${absence.maxAllowedAbsences} absences (${
            absence.maxAllowedAbsences * TARDINESS_TO_ABSENCE_RATIO
          } tardiness instances)`,
          'Conversion Rate': `${TARDINESS_TO_ABSENCE_RATIO} tardiness = 1 absence`
        }
      }
    }
  } catch (error) {
    console.error('Error getting per-session policy breakdown:', error)
    return {
      success: false,
      message: 'Failed to get policy breakdown',
      error: error.message
    }
  }
}

/**
 * Get student policy status for a specific subject
 * Calculates current tardiness and absence counts vs policy limits
 * @param {string} subjectId - Subject ID
 * @param {string} studentId - Student ID
 * @returns {Object} Student policy status
 */
async function getStudentPolicyStatus (subjectId, studentId) {
  try {
    const Attendance = _getModel('Attendance')
    const Session = _getModel('Session')
    const Subject = _getModel('Subject')

    // Get subject with schedule
    const subject = await Subject.findById(subjectId).lean()
    if (!subject || !subject.schedule) {
      return {
        success: false,
        message: 'Subject not found or has no schedule'
      }
    }

    // Calculate subject metrics to get policy limits
    const subjectMetrics = calculateSubjectMetrics(subject)
    const { maxAllowedAbsences, maxAllowedTardiness } = subjectMetrics.policy.absence

    // Get all sessions for this subject
    const sessions = await Session.find({ subjectId }).lean()
    const sessionIds = sessions.map(s => s._id)

    // Get all attendance records for this student in this subject
    const attendanceRecords = await Attendance.find({
      userId: studentId,
      sessionId: { $in: sessionIds }
    }).lean()

    // Count tardiness instances (isTardy = true)
    const tardinessCount = attendanceRecords.filter(
      record => record.isTardy === true && !record.isExcused
    ).length

    // Count absences (status = 'absent' or tardinessCount >= 3)
    // Also count absences from tardiness conversion (3 tardiness = 1 absence)
    const directAbsences = attendanceRecords.filter(
      record => record.status === 'absent' && !record.isExcused
    ).length

    // Convert tardiness to absences (3 tardiness = 1 absence)
    const tardinessToAbsence = Math.floor(tardinessCount / TARDINESS_TO_ABSENCE_RATIO)
    const totalAbsenceCount = directAbsences + tardinessToAbsence

    // Calculate remaining tardiness after conversion
    const remainingTardiness = tardinessCount % TARDINESS_TO_ABSENCE_RATIO

    // Determine policy status
    let policyStatus = 'safe'
    let isAtRisk = false

    if (totalAbsenceCount >= maxAllowedAbsences) {
      policyStatus = 'over_limit'
    } else if (totalAbsenceCount >= maxAllowedAbsences * 0.8) {
      policyStatus = 'at_risk'
      isAtRisk = true
    } else if (tardinessCount >= maxAllowedTardiness * 0.8) {
      policyStatus = 'at_risk'
      isAtRisk = true
    }

    return {
      success: true,
      data: {
        studentId,
        subjectId,
        tardinessCount,
        absenceCount: totalAbsenceCount,
        directAbsences,
        tardinessToAbsence,
        remainingTardiness,
        maxAllowedTardiness,
        maxAllowedAbsences,
        isAtRisk,
        policyStatus,
        // Percentage calculations
        tardinessPercentage: maxAllowedTardiness > 0
          ? Math.round((tardinessCount / maxAllowedTardiness) * 100)
          : 0,
        absencePercentage: maxAllowedAbsences > 0
          ? Math.round((totalAbsenceCount / maxAllowedAbsences) * 100)
          : 0,
        // Remaining allowances
        remainingTardinessAllowance: Math.max(0, maxAllowedTardiness - tardinessCount),
        remainingAbsenceAllowance: Math.max(0, maxAllowedAbsences - totalAbsenceCount)
      }
    }
  } catch (error) {
    console.error('Error getting student policy status:', error)
    return {
      success: false,
      message: 'Failed to get student policy status',
      error: error.message
    }
  }
}

module.exports = {
  calculateInstructorScheduleMetrics,
  calculateSubjectMetrics,
  getPerSessionPolicyBreakdown,
  getStudentPolicyStatus,
  // Constants for frontend use
  POLICY_CONSTANTS: {
    TARDINESS_THRESHOLD_PERCENT,
    ABSENCE_THRESHOLD_PERCENT,
    TARDINESS_TO_ABSENCE_RATIO,
    DEFAULT_WEEKS_IN_SEMESTER,
    SEMESTER_MONTHS,
    SEMESTER_DAYS
  }
}
