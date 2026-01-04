const { getModel } = require('./dataStore')

const Attendance = getModel('Attendance')
const Session = getModel('Session')
const Subject = getModel('Subject')
const User = getModel('User')

async function ensureBaselineAttendanceForSession ({
  sessionId,
  logger = console
}) {
  if (!sessionId) {
    return { created: 0, reason: 'missing_sessionId' }
  }

  const session = await Session.findById(sessionId)
    .select('subjectId instructorId startTime')
    .lean()
  if (!session || !session.subjectId) {
    return { created: 0, reason: 'missing_session_or_subject' }
  }

  const subject = await Subject.findById(session.subjectId)
    .select('sections instructorId')
    .lean()
  if (
    !subject ||
    !Array.isArray(subject.sections) ||
    subject.sections.length === 0
  ) {
    return { created: 0, reason: 'subject_has_no_sections' }
  }

  const students = await User.find({
    role: 'student',
    section: { $in: subject.sections.filter(Boolean) }
  })
    .select('_id firstName lastName email')
    .lean()

  if (!students.length) {
    return { created: 0, reason: 'no_students_for_subject' }
  }

  const bulkOps = students.map(student => {
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`
      .trim()
      .replace(/\s+/g, ' ')
    return {
      updateOne: {
        filter: { sessionId, userId: student._id },
        update: {
          $setOnInsert: {
            sessionId,
            userId: student._id,
            subjectId: session.subjectId,
            instructorId: subject.instructorId || session.instructorId || null,
            studentName: studentName || student.email || 'Student',
            status: 'absent',
            duration: 0, // Explicitly set duration for consistency
            totalDurationSeconds: 0,
            leaveCount: 0,
            returnCount: 0,
            isCurrentlyInMeeting: false,
            firstJoinTime: null,
            timeToEnterSeconds: 0,
            isVerifiedParticipant: true,
            isTardy: false,
            tardinessCount: 0,
            isExcused: false,
            isDuringAddDrop: false,
            timeoutSynchronized: false,
            pendingSince: null
          }
        },
        upsert: true
      }
    }
  })

  if (!bulkOps.length) {
    return { created: 0, reason: 'no_bulk_ops' }
  }

  const result = await Attendance.bulkWrite(bulkOps, { ordered: false })
  const created = result.upsertedCount || 0
  if (created > 0) {
    logger.log(
      `🧾 Baseline attendance ensured for session ${sessionId} (created ${created})`
    )
  }

  return { created }
}

module.exports = {
  ensureBaselineAttendanceForSession
}
