/**
 * Status Utility Functions
 *
 * Unified status derivation and formatting logic for attendance tracking.
 * This module provides consistent status determination across all endpoints.
 */

/**
 * Derive raw status from participant data and meeting context
 *
 * @param {Object} participant - Participant data object
 * @param {Object} options - Options for status determination
 * @param {boolean} options.timeoutSynchronized - Whether participant had synchronized timeout
 * @param {boolean} options.meetingEnded - Whether meeting has ended
 * @param {string} options.instructorLeaveTimeIso - ISO timestamp of instructor leave time
 * @returns {string} Raw status: 'present', 'late', 'absent', 'pending', or 'left'
 */
function deriveRawStatus (participant = {}, options = {}) {
  // Check if participant had synchronized timeout (was still in meeting when instructor left)
  const timeoutSynchronized = participant.timeoutSynchronized || false
  const meetingEnded = options.meetingEnded || false
  const instructorLeaveTimeIso = options.instructorLeaveTimeIso || null

  if (participant.rawStatus) {
    return String(participant.rawStatus).trim().toLowerCase()
  }
  if (participant.status) {
    return String(participant.status).trim().toLowerCase()
  }
  // Check for pending status explicitly
  if (participant.status === 'pending' || participant.rawStatus === 'pending') {
    return 'pending'
  }
  // If synchronized timeout, student was still in meeting when instructor left - mark as present
  if (timeoutSynchronized && meetingEnded && instructorLeaveTimeIso) {
    return 'present'
  }
  if (
    participant.leaveTime ||
    participant.leaveTimeIso ||
    participant.timeOut
  ) {
    // If student left but meeting hasn't ended, status should be pending
    // This will be determined by the backend, but we can infer it here
    if (
      !meetingEnded &&
      participant.isCurrentlyInMeeting === false &&
      participant.status !== 'absent'
    ) {
      return 'pending'
    }
    // If meeting ended and student left before instructor, mark as absent
    if (meetingEnded && !timeoutSynchronized) {
      return 'absent'
    }
    return 'left'
  }
  if (
    typeof participant.attendedDuration === 'number' &&
    participant.attendedDuration < 60
  ) {
    return 'joined'
  }
  if (participant.isLive === false && !timeoutSynchronized) {
    return 'left'
  }
  return 'present'
}

/**
 * Format raw status into human-readable label
 *
 * @param {string} rawStatus - Raw status string
 * @returns {string} Formatted status label
 */
function formatStatusLabel (rawStatus) {
  switch ((rawStatus || '').toLowerCase()) {
    case 'pending':
      return 'Pending'
    case 'left':
    case 'left meeting':
      return 'Left Meeting'
    case 'late':
      return 'Late'
    case 'joined':
    case 'just joined':
      return 'Just Joined'
    case 'absent':
      return 'Absent'
    case 'present':
      return 'Present'
    default:
      // Default to 'Unknown' instead of 'Present' to avoid masking data issues
      return 'Unknown'
  }
}

/**
 * Parse time string in HH:MM:SS format
 *
 * @param {string} timeStr - Time string to parse
 * @returns {Object|null} Object with h, m, s properties or null if invalid
 */
function parseHms (timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const parts = timeStr.split(':').map(Number)
  if (!parts.length || parts.some(n => Number.isNaN(n))) return null
  const [h = 0, m = 0, s = 0] = parts
  return { h, m, s }
}

/**
 * Convert time value to ISO Date, using baseDate if timeStr is relative
 *
 * @param {string|Date} timeValue - Time value (ISO string, Date, or HH:MM:SS)
 * @param {Date} baseDate - Base date to use for relative times
 * @returns {Date|null} Date object or null if invalid
 */
function toIsoWithBase (timeValue, baseDate) {
  if (!timeValue) return null

  const tryDate = new Date(timeValue)
  if (!Number.isNaN(tryDate.getTime())) {
    return tryDate
  }

  const parsed = parseHms(timeValue)
  if (!parsed) return null

  const base = baseDate ? new Date(baseDate) : new Date()
  if (Number.isNaN(base.getTime())) {
    return null
  }
  base.setHours(parsed.h || 0, parsed.m || 0, parsed.s || 0, 0)
  return base
}

/**
 * Format Date object to HH:MM:SS string
 *
 * @param {Date} date - Date object to format
 * @returns {string|null} Formatted time string or null if invalid
 */
function formatHmsFromDate (date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const pad = val => String(val).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`
}

/**
 * Determine final attendance status based on meeting state and participant behavior
 *
 * @param {Object} context - Context object containing all necessary information
 * @param {boolean} context.isInstructor - Whether participant is instructor
 * @param {boolean} context.instructorLeaveTimeIso - ISO timestamp when instructor left
 * @param {boolean} context.wasSynchronized - Whether participant was synchronized on instructor leave
 * @param {boolean} context.isCurrentlyInMeeting - Whether participant is currently in meeting
 * @param {Date} context.lastReturnTime - Last time participant returned to meeting
 * @param {Date} context.lastLeaveTime - Last time participant left meeting
 * @param {boolean} context.hasJoinTime - Whether participant has joined at least once
 * @param {boolean} context.hasLeaveTime - Whether participant has left at least once
 * @param {string} context.rawStatus - Raw status from participant data
 * @param {Object} context.existingAttendance - Existing attendance record
 * @param {Date} context.leaveDate - Leave date for pending status tracking
 * @returns {Object} Object with finalStatus and pendingSince
 */
function determineFinalStatus (context) {
  const {
    isInstructor,
    instructorLeaveTimeIso,
    wasSynchronized,
    isCurrentlyInMeeting,
    lastReturnTime,
    lastLeaveTime,
    hasJoinTime,
    hasLeaveTime,
    rawStatus,
    existingAttendance,
    leaveDate
  } = context

  let _finalStatus = 'present' // Default
  let pendingSince = existingAttendance?.pendingSince || null

  if (isInstructor) {
    return determineInstructorStatus({
      rawStatus,
      hasJoinTime,
      hasLeaveTime,
      instructorLeaveTimeIso,
      wasSynchronized
    })
  }

  if (instructorLeaveTimeIso) {
    return determineFinalizedStatus({
      wasSynchronized,
      isCurrentlyInMeeting,
      lastReturnTime,
      lastLeaveTime,
      hasJoinTime,
      hasLeaveTime,
      existingAttendance
    })
  }

  return determineOngoingStatus({
    hasJoinTime,
    isCurrentlyInMeeting,
    hasLeaveTime,
    wasSynchronized,
    rawStatus,
    pendingSince,
    leaveDate
  })
}

/**
 * Determine status for instructor participants
 */
function determineInstructorStatus ({
  rawStatus,
  hasJoinTime,
  hasLeaveTime,
  instructorLeaveTimeIso,
  wasSynchronized
}) {
  let finalStatus = 'present'

  if (rawStatus === 'late') {
    finalStatus = 'late'
  } else if (!hasJoinTime) {
    finalStatus = 'absent'
  } else if (hasLeaveTime && instructorLeaveTimeIso && !wasSynchronized) {
    // Instructor left - mark as present (they were the host)
    finalStatus = 'present'
  }

  return { finalStatus, pendingSince: null }
}

/**
 * Determine status when meeting has ended (instructor left)
 */
function determineFinalizedStatus ({
  wasSynchronized,
  isCurrentlyInMeeting,
  lastReturnTime,
  lastLeaveTime,
  hasJoinTime,
  hasLeaveTime,
  existingAttendance
}) {
  let finalStatus = 'absent' // Default for ended meetings

  if (wasSynchronized) {
    // Student was still in meeting when instructor left
    finalStatus = 'present'
  } else if (isCurrentlyInMeeting) {
    // Student is currently in meeting
    finalStatus = 'present'
  } else if (
    lastReturnTime &&
    lastLeaveTime &&
    lastReturnTime > lastLeaveTime
  ) {
    // Student returned after leaving
    finalStatus = 'present'
  } else if (!hasJoinTime) {
    // Student never joined
    finalStatus = 'absent'
  } else if (hasLeaveTime && !lastReturnTime && !isCurrentlyInMeeting) {
    // Student left and never returned (not synchronized)
    finalStatus = 'absent'
  } else if (existingAttendance && existingAttendance.status === 'pending') {
    // Existing pending status - check if student returned
    if (lastReturnTime && lastLeaveTime && lastReturnTime > lastLeaveTime) {
      finalStatus = 'present'
    } else {
      finalStatus = 'absent'
    }
  }

  return { finalStatus, pendingSince: null }
}

/**
 * Determine status when meeting is still ongoing
 */
function determineOngoingStatus ({
  hasJoinTime,
  isCurrentlyInMeeting,
  hasLeaveTime,
  wasSynchronized,
  rawStatus,
  pendingSince,
  leaveDate
}) {
  let finalStatus = 'present'
  let newPendingSince = pendingSince

  if (!hasJoinTime) {
    // Student hasn't joined yet
    finalStatus = 'absent'
    newPendingSince = null
  } else if (isCurrentlyInMeeting) {
    // Student is currently in meeting
    if (rawStatus === 'late') {
      finalStatus = 'late'
    } else {
      finalStatus = 'present'
    }
    newPendingSince = null
  } else if (hasLeaveTime && !isCurrentlyInMeeting && !wasSynchronized) {
    // Student left but meeting hasn't ended - status is pending
    finalStatus = 'pending'
    if (!newPendingSince) {
      newPendingSince = leaveDate || new Date()
    }
  } else if (rawStatus === 'late') {
    // Student is late
    finalStatus = 'late'
    newPendingSince = null
  } else {
    // Student is present
    finalStatus = 'present'
    newPendingSince = null
  }

  return { finalStatus, pendingSince: newPendingSince }
}

/**
 * Apply tardiness and instructor lateness rules to final status
 *
 * @param {string} finalStatus - Current final status
 * @param {Object} rules - Rules to apply
 * @param {boolean} rules.isTardy - Whether student is tardy
 * @param {boolean} rules.sessionIsDuringAddDrop - Whether session is during add/drop period
 * @param {boolean} rules.instructorLate - Whether instructor was late
 * @param {Date} rules.firstThirdThreshold - First third threshold for instructor lateness rule
 * @param {Date} rules.leaveDate - When student left (for instructor lateness rule)
 * @returns {string} Final status after applying rules
 */
function applyStatusRules (finalStatus, rules) {
  const {
    isTardy,
    sessionIsDuringAddDrop,
    instructorLate,
    firstThirdThreshold,
    leaveDate
  } = rules

  let adjustedStatus = finalStatus

  // Rule priority order:
  // 1. Instructor lateness rule (prevents false absences when instructor is late)
  // 2. Tardiness rule (converts present to late if tardy)

  // Priority 1: Handle instructor lateness rule first
  // This prevents marking students as absent when instructor was late and student left early
  if (
    instructorLate &&
    firstThirdThreshold &&
    leaveDate &&
    leaveDate < firstThirdThreshold
  ) {
    // Student left before first third, but instructor was late - don't count as absent
    if (adjustedStatus === 'absent') {
      adjustedStatus = 'present'
      // Note: Don't apply tardiness rule after this - student shouldn't be penalized
      return adjustedStatus
    }
  }

  // Priority 2: Apply tardiness rules if student is present (and not already handled by instructor rule)
  // Only apply if status is present and not during add/drop period
  if (adjustedStatus === 'present' && isTardy && !sessionIsDuringAddDrop) {
    adjustedStatus = 'late'
  }

  return adjustedStatus
}

// Alias for backward compatibility
const deriveParticipantStatus = deriveRawStatus

/**
 * Parse a date coming from the extension (usually dd/mm/yyyy) into a start-of-day Date (UTC)
 * IMPORTANT: Always parse dates in UTC to avoid timezone issues
 *
 * @param {string|Date} dateInput - Date input to parse
 * @returns {Date} Date object normalized to UTC start of day
 */
function parseSessionDay (dateInput) {
  if (dateInput instanceof Date && !isNaN(dateInput)) {
    // Convert to UTC start of day
    const d = new Date(dateInput)
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
    )
  }
  if (typeof dateInput === 'string') {
    const parts = dateInput.split(/[/-]/).map(p => p.trim())
    if (parts.length >= 3) {
      // Assume dd/mm/yyyy from extension
      let [dd, mm, yyyy] = parts
      if (yyyy && yyyy.length === 2) {
        yyyy = `20${yyyy}`
      }
      // Parse as UTC to avoid timezone issues
      const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(
        2,
        '0'
      )}T00:00:00.000Z`
      const dt = new Date(iso)
      if (!isNaN(dt)) {
        console.log(`📅 Parsed session date as UTC: ${iso}`)
        return dt
      }
    }
    // Try ISO string parsing
    const fallback = new Date(dateInput)
    if (!isNaN(fallback)) {
      // Convert to UTC start of day
      return new Date(
        Date.UTC(
          fallback.getUTCFullYear(),
          fallback.getUTCMonth(),
          fallback.getUTCDate(),
          0,
          0,
          0,
          0
        )
      )
    }
  }
  // Last resort: today start (UTC)
  const now = new Date()
  const utcToday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  )
  console.warn(
    `⚠️ Using current UTC date as fallback: ${utcToday.toISOString()}`
  )
  return utcToday
}

module.exports = {
  deriveRawStatus,
  deriveParticipantStatus,
  formatStatusLabel,
  parseHms,
  toIsoWithBase,
  formatHmsFromDate,
  determineFinalStatus,
  applyStatusRules,
  parseSessionDay
}
