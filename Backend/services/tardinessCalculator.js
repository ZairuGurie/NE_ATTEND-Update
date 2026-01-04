const { getModel: _getModel } = require('./dataStore')

const DEFAULT_TARDINESS_THRESHOLD_PERCENT = 0.25

/**
 * Calculate if a student is tardy based on 25% rule
 * Student is tardy if arriving past 25% of scheduled class period
 *
 * @param {Object} session - Session object with startTime, endTime, and optional groupId
 * @param {Object} attendance - Attendance object with joinTime
 * @param {Object} group - Optional Group object with classDurationMinutes
 * @returns {Object} { isTardy: boolean, tardinessMinutes: number }
 */
function calculateTardiness (session, attendance, group = null) {
  if (!session || !attendance || !attendance.joinTime) {
    return { isTardy: false, tardinessMinutes: 0 }
  }

  const toValidDate = value => {
    if (!value) return null
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value
    }
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  // Get class duration: prefer stored value, otherwise calculate from session
  let classDurationMinutes = null

  const thresholdPercent =
    group && typeof group.tardinessThresholdPercent === 'number'
      ? group.tardinessThresholdPercent
      : DEFAULT_TARDINESS_THRESHOLD_PERCENT

  const scheduledStartOverride = toValidDate(group && group.scheduledStartTime)
  const scheduledEndOverride = toValidDate(group && group.scheduledEndTime)
  const scheduledStartTime =
    scheduledStartOverride ||
    (session.startTime ? new Date(session.startTime) : null)
  const scheduledEndTime =
    scheduledEndOverride || (session.endTime ? new Date(session.endTime) : null)

  if (group && group.classDurationMinutes) {
    classDurationMinutes = group.classDurationMinutes
  } else if (scheduledStartTime && scheduledEndTime) {
    classDurationMinutes = (scheduledEndTime - scheduledStartTime) / (1000 * 60) // Convert to minutes
  }

  if (!classDurationMinutes || classDurationMinutes <= 0) {
    return { isTardy: false, tardinessMinutes: 0 }
  }

  // Calculate 25% threshold
  const tardinessThresholdMinutes = classDurationMinutes * thresholdPercent

  // Parse join time
  const sessionStartTime = scheduledStartTime
    ? new Date(scheduledStartTime)
    : new Date(session.startTime)
  let joinTime = null

  // Try to parse joinTime as ISO string first
  if (attendance.joinTimeIso) {
    joinTime = new Date(attendance.joinTimeIso)
  } else if (attendance.joinTime) {
    // Try to parse as time string (HH:MM:SS) and merge with session date
    const timeStr = String(attendance.joinTime)
    const [h = '0', m = '0', s = '0'] = timeStr.split(':')
    joinTime = new Date(sessionStartTime)
    joinTime.setHours(
      parseInt(h, 10) || 0,
      parseInt(m, 10) || 0,
      parseInt(s, 10) || 0,
      0
    )
  }

  if (!joinTime || isNaN(joinTime.getTime())) {
    return { isTardy: false, tardinessMinutes: 0 }
  }

  const instructorJoinTime = toValidDate(group && group.instructorJoinTime)
  let effectiveStartTime = sessionStartTime
  if (
    instructorJoinTime &&
    sessionStartTime &&
    !Number.isNaN(sessionStartTime.getTime())
  ) {
    const instructorLateThreshold = new Date(
      sessionStartTime.getTime() + tardinessThresholdMinutes * 60 * 1000
    )
    if (instructorJoinTime > instructorLateThreshold) {
      if (joinTime <= instructorJoinTime) {
        return {
          isTardy: false,
          tardinessMinutes: 0,
          thresholdMinutes: tardinessThresholdMinutes
        }
      }
      effectiveStartTime = instructorJoinTime
    }
  }

  // Calculate minutes late
  const minutesLate = (joinTime - effectiveStartTime) / (1000 * 60)

  // Student is tardy if arriving past 25% of class period
  const isTardy = minutesLate > tardinessThresholdMinutes

  return {
    isTardy,
    tardinessMinutes: isTardy ? minutesLate : 0,
    thresholdMinutes: tardinessThresholdMinutes
  }
}

/**
 * Convert tardiness instances to absences
 * 3 instances of tardiness = 1 absence
 *
 * @param {number} tardinessCount - Total number of tardiness instances
 * @returns {Object} { absenceCount: number, remainingTardiness: number }
 */
function convertTardinessToAbsence (tardinessCount) {
  if (!tardinessCount || tardinessCount < 3) {
    return {
      absenceCount: 0,
      remainingTardiness: tardinessCount || 0
    }
  }

  const absenceCount = Math.floor(tardinessCount / 3)
  const remainingTardiness = tardinessCount % 3

  return {
    absenceCount,
    remainingTardiness
  }
}

/**
 * Check if a session is during the adding/dropping period
 *
 * @param {Object} session - Session object with sessionDate
 * @param {Object} group - Group object with addDropPeriodStart and addDropPeriodEnd
 * @returns {boolean}
 */
function isDuringAddDropPeriod (session, group) {
  if (!session || !group) {
    return false
  }

  if (!group.addDropPeriodStart || !group.addDropPeriodEnd) {
    return false
  }

  const sessionDate = session.sessionDate
    ? new Date(session.sessionDate)
    : new Date(session.startTime)
  const addDropStart = new Date(group.addDropPeriodStart)
  const addDropEnd = new Date(group.addDropPeriodEnd)

  // Set times to start of day for date comparison
  sessionDate.setHours(0, 0, 0, 0)
  addDropStart.setHours(0, 0, 0, 0)
  addDropEnd.setHours(23, 59, 59, 999)

  return sessionDate >= addDropStart && sessionDate <= addDropEnd
}

module.exports = {
  calculateTardiness,
  convertTardinessToAbsence,
  isDuringAddDropPeriod
}
