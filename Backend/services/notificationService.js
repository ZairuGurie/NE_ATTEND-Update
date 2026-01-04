const { getModel } = require('./dataStore')
const Notification = getModel('Notification')

/**
 * Create an attendance notification for a student
 * @param {Object} options
 * @param {string} options.userId - Student's user ID
 * @param {string} options.status - Attendance status (present, absent, late)
 * @param {string} options.meetCode - Meeting code
 * @param {string} options.subjectName - Subject name
 * @param {Date} options.sessionDate - Session date
 * @param {string} options.attendanceId - Attendance record ID
 * @param {string} options.oldStatus - Previous status (for status changes)
 * @param {string} options.instructorName - Instructor name (for status changes)
 * @param {boolean} options.isStatusChange - Whether this is a status change notification
 */
async function createAttendanceNotification (options) {
  const {
    userId,
    status,
    meetCode,
    subjectName,
    sessionDate,
    attendanceId,
    oldStatus,
    instructorName,
    isStatusChange = false
  } = options

  if (!userId) {
    console.warn('Cannot create notification: userId is required')
    return null
  }

  const normalizedStatus = (status || 'absent').toLowerCase()
  const formattedDate = sessionDate
    ? new Date(sessionDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : 'N/A'

  let type, title, message

  if (isStatusChange) {
    type = 'attendance_status_changed'
    title = 'Attendance Status Updated'
    message = `Your attendance status for ${
      subjectName || meetCode || 'a session'
    } on ${formattedDate} has been changed from "${
      oldStatus || 'unknown'
    }" to "${normalizedStatus}" by ${instructorName || 'your instructor'}.`
  } else {
    // Initial attendance recording
    switch (normalizedStatus) {
      case 'present':
        type = 'attendance_present'
        title = 'Attendance Recorded: Present'
        message = `You have been marked as PRESENT for ${
          subjectName || meetCode || 'a session'
        } on ${formattedDate}.`
        break
      case 'late':
        type = 'attendance_late'
        title = 'Attendance Recorded: Late'
        message = `You have been marked as LATE for ${
          subjectName || meetCode || 'a session'
        } on ${formattedDate}.`
        break
      case 'absent':
      default:
        type = 'attendance_absent'
        title = 'Attendance Recorded: Absent'
        message = `You have been marked as ABSENT for ${
          subjectName || meetCode || 'a session'
        } on ${formattedDate}.`
        break
    }
  }

  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      relatedId: attendanceId,
      relatedModel: 'Attendance',
      metadata: {
        meetCode,
        subjectName,
        sessionDate,
        oldStatus: isStatusChange ? oldStatus : undefined,
        newStatus: normalizedStatus,
        instructorName: isStatusChange ? instructorName : undefined
      }
    })

    console.log(`📬 Created ${type} notification for user ${userId}`)
    return notification
  } catch (error) {
    console.error('Failed to create attendance notification:', error)
    return null
  }
}

/**
 * Create notifications for multiple students after session ends
 * @param {Array} attendanceRecords - Array of attendance records with populated userId
 * @param {Object} sessionInfo - Session information (meetCode, subjectName, sessionDate)
 */
async function createBulkAttendanceNotifications (
  attendanceRecords,
  sessionInfo
) {
  const { meetCode, subjectName, sessionDate } = sessionInfo
  const results = []

  for (const record of attendanceRecords) {
    const userId = record.userId?._id || record.userId
    if (!userId) continue

    try {
      const notification = await createAttendanceNotification({
        userId,
        status: record.status,
        meetCode,
        subjectName,
        sessionDate,
        attendanceId: record._id,
        isStatusChange: false
      })
      if (notification) {
        results.push(notification)
      }
    } catch (error) {
      console.error(`Failed to create notification for user ${userId}:`, error)
    }
  }

  console.log(
    `📬 Created ${results.length} attendance notifications for session ${meetCode}`
  )
  return results
}

/**
 * Create a status change notification when instructor updates attendance
 * @param {Object} attendanceRecord - The updated attendance record
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 * @param {Object} instructor - Instructor who made the change
 */
async function createStatusChangeNotification (
  attendanceRecord,
  oldStatus,
  newStatus,
  instructor
) {
  const userId = attendanceRecord.userId?._id || attendanceRecord.userId
  if (!userId) {
    console.warn('Cannot create status change notification: userId is required')
    return null
  }

  const session = attendanceRecord.sessionId
  const meetCode = session?.meetCode || attendanceRecord.meetCode
  const sessionDate =
    session?.sessionDate || session?.startTime || attendanceRecord.createdAt

  // Get subject name from session or attendance record
  let subjectName = 'Unknown Subject'
  if (session?.subjectId?.subjectName) {
    subjectName = session.subjectId.subjectName
  } else if (attendanceRecord.subjectName) {
    subjectName = attendanceRecord.subjectName
  }

  const instructorName = instructor
    ? `${instructor.firstName || ''} ${instructor.lastName || ''}`.trim() ||
      'your instructor'
    : 'your instructor'

  return createAttendanceNotification({
    userId,
    status: newStatus,
    meetCode,
    subjectName,
    sessionDate,
    attendanceId: attendanceRecord._id,
    oldStatus,
    instructorName,
    isStatusChange: true
  })
}

module.exports = {
  createAttendanceNotification,
  createBulkAttendanceNotifications,
  createStatusChangeNotification
}
