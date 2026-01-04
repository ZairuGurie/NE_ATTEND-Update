const { getModel } = require('./dataStore')
const {
  isDuringAddDropPeriod: _isDuringAddDropPeriod
} = require('./tardinessCalculator')

const Attendance = getModel('Attendance')
const Session = getModel('Session')
const Subject = getModel('Subject')

/**
 * Calculate consecutive weeks of unexcused absences
 *
 * @param {string} userId - User ID
 * @param {string} subjectId - Subject ID
 * @param {Date} startDate - Optional start date for calculation (defaults to subject creation)
 * @returns {Object} { consecutiveWeeks: number, isEligible: boolean, weeks: Array }
 */
async function calculateConsecutiveWeeksAbsent (
  userId,
  subjectId,
  _startDate = null
) {
  try {
    // Get subject to find semester start
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return { consecutiveWeeks: 0, isEligible: false, weeks: [] }
    }

    // Get all sessions for this subject, ordered by date
    const sessions = await Session.find({ subjectId })
      .sort({ sessionDate: 1, startTime: 1 })
      .lean()

    if (sessions.length === 0) {
      return { consecutiveWeeks: 0, isEligible: false, weeks: [] }
    }

    // Get all attendance records for this user in this group
    const attendanceRecords = await Attendance.find({
      userId,
      sessionId: { $in: sessions.map(s => s._id) }
    })
      .populate('sessionId')
      .lean()

    // Create a map of sessionId to attendance record
    const attendanceMap = new Map()
    attendanceRecords.forEach(record => {
      if (record.sessionId && record.sessionId._id) {
        attendanceMap.set(record.sessionId._id.toString(), record)
      }
    })

    // Group sessions by week
    const weeksMap = new Map()

    sessions.forEach(session => {
      const sessionDate = session.sessionDate
        ? new Date(session.sessionDate)
        : new Date(session.startTime)
      const weekKey = getWeekKey(sessionDate)

      if (!weeksMap.has(weekKey)) {
        weeksMap.set(weekKey, {
          weekStart: getWeekStart(sessionDate),
          weekEnd: getWeekEnd(sessionDate),
          sessions: []
        })
      }

      weeksMap.get(weekKey).sessions.push({
        sessionId: session._id,
        sessionDate,
        attendance: attendanceMap.get(session._id.toString())
      })
    })

    // Check each week for unexcused absences
    const weeks = Array.from(weeksMap.values()).map(week => {
      const hasUnexcusedAbsence = week.sessions.some(s => {
        const attendance = s.attendance
        if (!attendance) return true // No attendance record = absent

        // Check if during add/drop period
        // Subjects don't have add/drop period fields, so skip this check
        // (can be added to Subject model later if needed)

        // Check if excused
        if (attendance.isExcused) {
          return false // Don't count excused absences
        }

        // Exclude pending status - only count finalized absences
        if (attendance.status === 'pending') {
          return false // Don't count pending status until finalized
        }

        // Check if absent
        if (attendance.status === 'absent') {
          return true
        }

        // Tardiness is handled separately in contact hours calculation
        // For consecutive weeks, we only count actual absences
        return false
      })

      return {
        ...week,
        hasUnexcusedAbsence
      }
    })

    // Calculate consecutive weeks with unexcused absences
    let maxConsecutive = 0
    let currentConsecutive = 0

    weeks.forEach(week => {
      if (week.hasUnexcusedAbsence) {
        currentConsecutive++
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
      } else {
        currentConsecutive = 0
      }
    })

    const isEligible = maxConsecutive >= 3

    return {
      consecutiveWeeks: maxConsecutive,
      isEligible,
      weeks: weeks.map(w => ({
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        hasUnexcusedAbsence: w.hasUnexcusedAbsence
      }))
    }
  } catch (error) {
    console.error('Error calculating consecutive weeks absent:', error)
    return { consecutiveWeeks: 0, isEligible: false, weeks: [] }
  }
}

/**
 * Calculate contact hours absent percentage
 *
 * @param {string} userId - User ID
 * @param {string} subjectId - Subject ID
 * @returns {Object} { percentage: number, isEligible: boolean, absentHours: number, totalHours: number }
 */
async function calculateContactHoursAbsent (userId, subjectId) {
  try {
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return { percentage: 0, isEligible: false, absentHours: 0, totalHours: 0 }
    }

    // Use default contact hours per week (can be added to Subject model later)
    const contactHoursPerWeek = 3 // Default: 3 hours per week

    // Get all sessions for this subject
    const sessions = await Session.find({ subjectId })
      .sort({ sessionDate: 1, startTime: 1 })
      .lean()

    if (sessions.length === 0) {
      return { percentage: 0, isEligible: false, absentHours: 0, totalHours: 0 }
    }

    // Calculate total weeks in semester
    const firstSession = sessions[0]
    const lastSession = sessions[sessions.length - 1]
    const firstDate = firstSession.sessionDate
      ? new Date(firstSession.sessionDate)
      : new Date(firstSession.startTime)
    const lastDate = lastSession.sessionDate
      ? new Date(lastSession.sessionDate)
      : new Date(lastSession.startTime)

    const totalWeeks = Math.ceil(
      (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 7)
    )
    const totalContactHours = contactHoursPerWeek * Math.max(1, totalWeeks)

    const sessionsPerWeek = Math.max(
      1,
      Math.round(sessions.length / Math.max(1, totalWeeks))
    )
    const hoursPerSession = contactHoursPerWeek / sessionsPerWeek

    // Get all attendance records
    const attendanceRecords = await Attendance.find({
      userId,
      sessionId: { $in: sessions.map(s => s._id) }
    })
      .populate('sessionId')
      .lean()

    // Count unexcused absences (excluding add/drop period)
    let absentHours = 0
    let totalTardinessInstances = 0 // Track total tardiness instances

    attendanceRecords.forEach(record => {
      if (!record.sessionId) return

      const session = sessions.find(
        s => s._id.toString() === record.sessionId._id.toString()
      )
      if (!session) return

      // Skip if during add/drop period
      // Subjects don't have add/drop period fields, so skip this check
      // (can be added to Subject model later if needed)

      // Skip if excused
      if (record.isExcused) {
        return
      }

      // Exclude pending status - only count finalized absences
      if (record.status === 'pending') {
        return // Don't count pending status until finalized
      }

      // Count as absent if status is absent
      if (record.status === 'absent') {
        absentHours += hoursPerSession
      } else if (record.isTardy) {
        // Count each tardiness instance (each isTardy=true is one instance)
        // Only count if status is not pending (tardiness should be finalized)
        totalTardinessInstances += 1
      }
    })

    // Also count sessions with no attendance record as absences
    const attendedSessionIds = new Set(
      attendanceRecords.map(r => r.sessionId?._id?.toString()).filter(Boolean)
    )
    sessions.forEach(session => {
      if (attendedSessionIds.has(session._id.toString())) return

      // Skip if during add/drop period
      // Subjects don't have add/drop period fields, so skip this check
      // (can be added to Subject model later if needed)

      absentHours += hoursPerSession
    })

    // Convert tardiness to absences: 3 tardiness instances = 1 absence
    const tardinessAbsences = Math.floor(totalTardinessInstances / 3)
    absentHours += tardinessAbsences * hoursPerSession

    const percentageRaw =
      totalContactHours > 0 ? (absentHours / totalContactHours) * 100 : 0
    const percentage = Math.min(100, percentageRaw)
    const isEligible = percentage > 17

    return {
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
      isEligible,
      absentHours: Math.round(absentHours * 100) / 100,
      totalHours: totalContactHours
    }
  } catch (error) {
    console.error('Error calculating contact hours absent:', error)
    return { percentage: 0, isEligible: false, absentHours: 0, totalHours: 0 }
  }
}

/**
 * Helper function to get week key (YYYY-WW format)
 */
function getWeekKey (date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const year = d.getFullYear()
  const oneJan = new Date(year, 0, 1)
  const numberOfDays = Math.floor((d - oneJan) / (24 * 60 * 60 * 1000))
  const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * Helper function to get start of week (Monday)
 */
function getWeekStart (date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  return new Date(d.setDate(diff))
}

/**
 * Helper function to get end of week (Sunday)
 */
function getWeekEnd (date) {
  const weekStart = getWeekStart(date)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  return weekEnd
}

module.exports = {
  calculateConsecutiveWeeksAbsent,
  calculateContactHoursAbsent
}
