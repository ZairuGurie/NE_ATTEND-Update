/**
 * Attendance Policy Utility
 *
 * Implements the attendance rules based on BOR Resolution No. 31, s. 2018
 *
 * Policy Rules:
 * 1. TARDINESS: Student is tardy when arriving past 25% of scheduled class period
 *    - 30 minutes for 1.5-hour class
 *    - 1 hour for 3-hour class
 * 2. TARDINESS TO ABSENCE: 3 instances of tardiness = 1 absence
 * 3. INSTRUCTOR LATE: Students wait until first 1/3 of class before leaving
 * 4. D/F ELIGIBILITY (BOR Res. 31, s. 2018):
 *    - 3+ consecutive weeks of unexcused absences, OR
 *    - More than 17% of total contact hours missed
 */

// ============================================================================
// POLICY CONSTANTS
// ============================================================================

/**
 * Tardiness threshold as percentage of class duration
 * Student is tardy if arriving after this percentage of class time has passed
 */
export const TARDINESS_THRESHOLD_PERCENT = 0.25 // 25%

/**
 * Number of tardiness instances that convert to one absence
 */
export const TARDINESS_TO_ABSENCE_RATIO = 3

/**
 * Percentage of class time students must wait for instructor before leaving
 */
export const INSTRUCTOR_WAIT_THRESHOLD_PERCENT = 1 / 3 // First 1/3 of class

/**
 * Number of consecutive weeks of absences that trigger D/F eligibility
 */
export const DF_CONSECUTIVE_WEEKS_THRESHOLD = 3

/**
 * Percentage of total contact hours that triggers D/F eligibility when exceeded
 */
export const DF_CONTACT_HOURS_THRESHOLD_PERCENT = 0.17 // 17%

/**
 * Default class durations in minutes for common class periods
 */
export const CLASS_DURATIONS = {
  SHORT: 90, // 1.5 hours
  MEDIUM: 120, // 2 hours
  LONG: 180 // 3 hours
}

/**
 * Default contact hours per week for typical class schedules
 */
export const CONTACT_HOURS = {
  ONCE_WEEKLY_3HR: 3,
  TWICE_WEEKLY_1_5HR: 3,
  THRICE_WEEKLY_1HR: 3
}

// ============================================================================
// TARDINESS CALCULATIONS
// ============================================================================

/**
 * Calculate the tardiness threshold in minutes for a given class duration
 * @param {number} classDurationMinutes - Duration of the class in minutes
 * @returns {number} - Number of minutes after which student is considered tardy
 */
export const calculateTardinessThreshold = classDurationMinutes => {
  return Math.round(classDurationMinutes * TARDINESS_THRESHOLD_PERCENT)
}

/**
 * Check if a student is tardy based on arrival time
 * @param {Date|string} classStartTime - Scheduled class start time
 * @param {Date|string} arrivalTime - Time student arrived
 * @param {number} classDurationMinutes - Duration of the class in minutes
 * @returns {object} - { isTardy: boolean, minutesLate: number, threshold: number }
 */
export const checkTardiness = (
  classStartTime,
  arrivalTime,
  classDurationMinutes
) => {
  const start = new Date(classStartTime)
  const arrival = new Date(arrivalTime)

  const minutesLate = Math.max(0, (arrival - start) / (1000 * 60))
  const threshold = calculateTardinessThreshold(classDurationMinutes)

  return {
    isTardy: minutesLate > threshold,
    minutesLate: Math.round(minutesLate),
    threshold,
    status:
      minutesLate === 0
        ? 'on_time'
        : minutesLate <= threshold
        ? 'late_but_present'
        : 'tardy'
  }
}

/**
 * Convert tardiness count to equivalent absences
 * @param {number} tardinessCount - Number of tardiness instances
 * @returns {object} - { equivalentAbsences: number, remainingTardiness: number }
 */
export const convertTardinessToAbsences = tardinessCount => {
  const equivalentAbsences = Math.floor(
    tardinessCount / TARDINESS_TO_ABSENCE_RATIO
  )
  const remainingTardiness = tardinessCount % TARDINESS_TO_ABSENCE_RATIO

  return {
    equivalentAbsences,
    remainingTardiness,
    totalTardiness: tardinessCount
  }
}

// ============================================================================
// INSTRUCTOR WAIT TIME CALCULATIONS
// ============================================================================

/**
 * Calculate how long students should wait for a late instructor
 * @param {number} classDurationMinutes - Duration of the class in minutes
 * @returns {number} - Minutes students should wait
 */
export const calculateInstructorWaitTime = classDurationMinutes => {
  return Math.round(classDurationMinutes * INSTRUCTOR_WAIT_THRESHOLD_PERCENT)
}

/**
 * Check if students can leave when instructor is late
 * @param {Date|string} classStartTime - Scheduled class start time
 * @param {Date|string} currentTime - Current time
 * @param {number} classDurationMinutes - Duration of the class in minutes
 * @returns {object} - { canLeave: boolean, waitedMinutes: number, requiredWait: number }
 */
export const checkInstructorWaitStatus = (
  classStartTime,
  currentTime,
  classDurationMinutes
) => {
  const start = new Date(classStartTime)
  const now = new Date(currentTime)

  const waitedMinutes = Math.max(0, (now - start) / (1000 * 60))
  const requiredWait = calculateInstructorWaitTime(classDurationMinutes)

  return {
    canLeave: waitedMinutes >= requiredWait,
    waitedMinutes: Math.round(waitedMinutes),
    requiredWait,
    remainingWait: Math.max(0, Math.round(requiredWait - waitedMinutes))
  }
}

// ============================================================================
// D/F ELIGIBILITY CALCULATIONS
// ============================================================================

/**
 * Calculate total expected contact hours for a semester
 * @param {number} contactHoursPerWeek - Hours of class per week
 * @param {number} totalWeeks - Total weeks in semester (typically 18)
 * @returns {number} - Total contact hours
 */
export const calculateTotalContactHours = (
  contactHoursPerWeek,
  totalWeeks = 18
) => {
  return contactHoursPerWeek * totalWeeks
}

/**
 * Calculate the absence threshold for D/F eligibility (17% of contact hours)
 * @param {number} totalContactHours - Total contact hours in semester
 * @returns {number} - Maximum allowed missed hours before D/F
 */
export const calculateDFAbsenceThreshold = totalContactHours => {
  return Math.floor(totalContactHours * DF_CONTACT_HOURS_THRESHOLD_PERCENT)
}

/**
 * Check if a student is eligible for D/F based on attendance
 * @param {object} attendanceData - Student's attendance data
 * @param {number} attendanceData.consecutiveWeeksAbsent - Consecutive weeks of unexcused absences
 * @param {number} attendanceData.totalAbsences - Total absences including tardiness-converted
 * @param {number} attendanceData.totalTardiness - Total tardiness instances
 * @param {number} contactHoursPerWeek - Contact hours per week
 * @param {number} classDurationMinutes - Class duration in minutes
 * @param {number} totalWeeks - Total weeks in semester
 * @returns {object} - D/F eligibility status
 */
export const checkDFEligibility = (
  attendanceData,
  contactHoursPerWeek = 3,
  classDurationMinutes = 90,
  totalWeeks = 18
) => {
  const {
    consecutiveWeeksAbsent = 0,
    totalAbsences = 0,
    totalTardiness = 0
  } = attendanceData

  // Convert tardiness to absences
  const tardinessConversion = convertTardinessToAbsences(totalTardiness)
  const effectiveAbsences =
    totalAbsences + tardinessConversion.equivalentAbsences

  // Calculate thresholds
  const totalContactHours = calculateTotalContactHours(
    contactHoursPerWeek,
    totalWeeks
  )
  const sessionsPerWeek = Math.round(
    (contactHoursPerWeek * 60) / classDurationMinutes
  )
  const totalSessions = sessionsPerWeek * totalWeeks
  const maxAllowedAbsences = Math.floor(
    totalSessions * DF_CONTACT_HOURS_THRESHOLD_PERCENT
  )

  // Check D/F conditions
  const consecutiveWeeksExceeded =
    consecutiveWeeksAbsent >= DF_CONSECUTIVE_WEEKS_THRESHOLD
  const contactHoursExceeded = effectiveAbsences > maxAllowedAbsences

  // Calculate risk level
  const absencePercentage = (effectiveAbsences / totalSessions) * 100
  const weeksToThreshold =
    DF_CONSECUTIVE_WEEKS_THRESHOLD - consecutiveWeeksAbsent
  const absencesToThreshold = maxAllowedAbsences - effectiveAbsences

  let status = 'safe'
  let riskLevel = 0

  if (consecutiveWeeksExceeded || contactHoursExceeded) {
    status = 'df_eligible'
    riskLevel = 100
  } else if (weeksToThreshold <= 1 || absencesToThreshold <= 2) {
    status = 'at_risk'
    riskLevel = Math.max(
      ((DF_CONSECUTIVE_WEEKS_THRESHOLD - weeksToThreshold) /
        DF_CONSECUTIVE_WEEKS_THRESHOLD) *
        100,
      (effectiveAbsences / maxAllowedAbsences) * 100
    )
  } else {
    riskLevel = (effectiveAbsences / maxAllowedAbsences) * 100
  }

  return {
    status,
    riskLevel: Math.min(100, Math.round(riskLevel)),
    isEligibleForDF: status === 'df_eligible',
    isAtRisk: status === 'at_risk',

    // Consecutive weeks analysis
    consecutiveWeeksAbsent,
    consecutiveWeeksThreshold: DF_CONSECUTIVE_WEEKS_THRESHOLD,
    consecutiveWeeksExceeded,
    weeksToThreshold: Math.max(0, weeksToThreshold),

    // Contact hours analysis
    effectiveAbsences,
    maxAllowedAbsences,
    contactHoursExceeded,
    absencesToThreshold: Math.max(0, absencesToThreshold),
    absencePercentage: Math.round(absencePercentage * 10) / 10,

    // Tardiness breakdown
    totalTardiness,
    tardinessConvertedToAbsences: tardinessConversion.equivalentAbsences,
    remainingTardiness: tardinessConversion.remainingTardiness,

    // Summary
    totalSessions,
    totalContactHours,

    // Human-readable reason
    reason: consecutiveWeeksExceeded
      ? `${consecutiveWeeksAbsent} consecutive weeks of unexcused absences (threshold: ${DF_CONSECUTIVE_WEEKS_THRESHOLD})`
      : contactHoursExceeded
      ? `${effectiveAbsences} absences exceed ${
          DF_CONTACT_HOURS_THRESHOLD_PERCENT * 100
        }% threshold (max: ${maxAllowedAbsences})`
      : null
  }
}

/**
 * Get human-readable D/F status label
 * @param {string} status - Status from checkDFEligibility
 * @returns {object} - { label: string, color: string, icon: string }
 */
export const getDFStatusLabel = status => {
  const labels = {
    df_eligible: {
      label: 'D/F Eligible',
      description: 'Student has met the criteria for automatic D/F grade',
      color: 'absent',
      icon: 'bi-exclamation-triangle-fill'
    },
    at_risk: {
      label: 'At Risk',
      description: 'Student is approaching D/F eligibility threshold',
      color: 'late',
      icon: 'bi-exclamation-circle-fill'
    },
    safe: {
      label: 'Good Standing',
      description: 'Student attendance is within acceptable limits',
      color: 'present',
      icon: 'bi-check-circle-fill'
    }
  }

  return labels[status] || labels.safe
}

// ============================================================================
// ADD/DROP PERIOD HANDLING
// ============================================================================

/**
 * Check if a date falls within the add/drop period
 * @param {Date|string} date - Date to check
 * @param {Date|string} addDropStart - Start of add/drop period
 * @param {Date|string} addDropEnd - End of add/drop period
 * @returns {boolean} - True if date is within add/drop period
 */
export const isWithinAddDropPeriod = (date, addDropStart, addDropEnd) => {
  const checkDate = new Date(date)
  const start = new Date(addDropStart)
  const end = new Date(addDropEnd)

  return checkDate >= start && checkDate <= end
}

/**
 * Filter absences to exclude those during add/drop period
 * @param {Array} absences - Array of absence records with date field
 * @param {Date|string} addDropStart - Start of add/drop period
 * @param {Date|string} addDropEnd - End of add/drop period
 * @returns {Array} - Filtered absences
 */
export const filterAbsencesExcludingAddDrop = (
  absences,
  addDropStart,
  addDropEnd
) => {
  if (!addDropStart || !addDropEnd) return absences

  return absences.filter(absence => {
    const absenceDate = new Date(absence.date || absence.createdAt)
    return !isWithinAddDropPeriod(absenceDate, addDropStart, addDropEnd)
  })
}

// ============================================================================
// POLICY DISPLAY HELPERS
// ============================================================================

/**
 * Get formatted policy information for display
 * @param {number} classDurationMinutes - Class duration in minutes
 * @returns {object} - Formatted policy information
 */
export const getPolicyInfo = (classDurationMinutes = 90) => {
  const tardinessThreshold = calculateTardinessThreshold(classDurationMinutes)
  const instructorWaitTime = calculateInstructorWaitTime(classDurationMinutes)

  return {
    tardiness: {
      title: 'Tardiness Policy',
      description: `A student is considered tardy when arriving past ${
        TARDINESS_THRESHOLD_PERCENT * 100
      }% of the scheduled class period`,
      threshold: tardinessThreshold,
      example: `${tardinessThreshold} minutes for a ${classDurationMinutes}-minute class`,
      conversion: `${TARDINESS_TO_ABSENCE_RATIO} instances of tardiness = 1 absence`
    },
    instructorWait: {
      title: 'Instructor Lateness Policy',
      description:
        'Students should not leave until the first third of the scheduled class time has passed',
      waitTime: instructorWaitTime,
      example: `Wait ${instructorWaitTime} minutes for a ${classDurationMinutes}-minute class`
    },
    dfEligibility: {
      title: 'D/F Eligibility (BOR Res. 31, s. 2018)',
      description: 'Automatic D/F grade for excessive absences',
      conditions: [
        `${DF_CONSECUTIVE_WEEKS_THRESHOLD} or more consecutive weeks of unexcused absences`,
        `More than ${
          DF_CONTACT_HOURS_THRESHOLD_PERCENT * 100
        }% of total contact hours missed`
      ],
      example: 'For a 3-hour/week class: max ~3 absences before D/F eligibility'
    },
    addDropPeriod: {
      title: 'Add/Drop Period',
      description:
        'Absences during the adding/dropping period are NOT counted towards D/F eligibility'
    }
  }
}

/**
 * Format attendance summary for a student
 * @param {object} data - Attendance data
 * @returns {object} - Formatted summary
 */
export const formatAttendanceSummary = data => {
  const {
    totalSessions = 0,
    presentCount = 0,
    absentCount = 0,
    tardyCount = 0,
    excusedCount = 0
  } = data

  const attendedSessions = presentCount + tardyCount
  const attendanceRate =
    totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 0

  const tardinessConversion = convertTardinessToAbsences(tardyCount)
  const effectiveAbsences = absentCount + tardinessConversion.equivalentAbsences

  return {
    totalSessions,
    attended: attendedSessions,
    present: presentCount,
    tardy: tardyCount,
    absent: absentCount,
    excused: excusedCount,
    unexcusedAbsences: Math.max(0, absentCount - excusedCount),
    effectiveAbsences,
    tardinessConvertedToAbsences: tardinessConversion.equivalentAbsences,
    attendanceRate,
    attendanceRateLabel: `${attendanceRate}%`
  }
}

export default {
  // Constants
  TARDINESS_THRESHOLD_PERCENT,
  TARDINESS_TO_ABSENCE_RATIO,
  INSTRUCTOR_WAIT_THRESHOLD_PERCENT,
  DF_CONSECUTIVE_WEEKS_THRESHOLD,
  DF_CONTACT_HOURS_THRESHOLD_PERCENT,
  CLASS_DURATIONS,
  CONTACT_HOURS,

  // Tardiness functions
  calculateTardinessThreshold,
  checkTardiness,
  convertTardinessToAbsences,

  // Instructor wait functions
  calculateInstructorWaitTime,
  checkInstructorWaitStatus,

  // D/F eligibility functions
  calculateTotalContactHours,
  calculateDFAbsenceThreshold,
  checkDFEligibility,
  getDFStatusLabel,

  // Add/Drop period functions
  isWithinAddDropPeriod,
  filterAbsencesExcludingAddDrop,

  // Display helpers
  getPolicyInfo,
  formatAttendanceSummary
}
