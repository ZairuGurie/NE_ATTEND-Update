const mongoose = require('mongoose')
const { getModel } = require('./dataStore')

const Appeal = getModel('Appeal')
const Attendance = getModel('Attendance')
const Session = getModel('Session')
const Subject = getModel('Subject')

const ALLOWED_STATUS = new Set([
  'pending',
  'under_review',
  'approved',
  'denied'
])

function buildError (message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function sanitizeAttachments (attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return []
  }
  return attachments.slice(0, 5).map(att => ({
    url: att?.url || null,
    name: att?.name || null,
    mimeType: att?.mimeType || null
  }))
}

async function resolveAttendanceContext ({ attendanceId, studentId }) {
  if (!mongoose.Types.ObjectId.isValid(attendanceId)) {
    throw buildError('Invalid attendance identifier', 400)
  }

  const attendance = await Attendance.findById(attendanceId)
    .select('userId instructorId sessionId studentName status')
    .lean()

  if (!attendance) {
    throw buildError('Attendance record not found', 404)
  }

  if (attendance.userId.toString() !== studentId.toString()) {
    throw buildError('Attendance does not belong to student', 403)
  }

  if (!attendance.sessionId) {
    throw buildError('Attendance missing session reference', 400)
  }

  const session = await Session.findById(attendance.sessionId)
    .select('subjectId sessionDate startTime endTime meetCode')
    .lean()

  if (!session) {
    throw buildError('Session associated with attendance not found', 404)
  }

  if (!session.subjectId) {
    throw buildError('Session missing subject reference', 400)
  }

  const subject = await Subject.findById(session.subjectId)
    .select('subjectName instructorId department sections')
    .lean()

  if (!subject) {
    throw buildError('Subject associated with attendance not found', 404)
  }

  const instructorId = attendance.instructorId || subject.instructorId
  if (!instructorId) {
    throw buildError('Unable to determine instructor for appeal', 400)
  }

  return { attendance, session, subject, instructorId }
}

async function createAppeal ({
  attendanceId,
  studentId,
  reason,
  studentNotes,
  attachments
}) {
  if (!reason || !reason.trim()) {
    throw buildError('Appeal reason is required', 400)
  }

  const existing = await Appeal.findOne({ attendanceId, studentId })
  if (existing) {
    return existing
  }

  const { session, subject, instructorId } = await resolveAttendanceContext({
    attendanceId,
    studentId
  })

  const appeal = await Appeal.create({
    attendanceId,
    sessionId: session._id,
    subjectId: subject._id,
    studentId,
    instructorId,
    reason: reason.trim(),
    studentNotes: studentNotes ? studentNotes.trim() : undefined,
    attachments: sanitizeAttachments(attachments),
    events: [
      {
        type: 'submitted',
        message: reason.trim(),
        createdBy: studentId
      }
    ]
  })

  return appeal
}

async function listAppealsForStudent (studentId, { status } = {}) {
  const query = { studentId }
  if (status && ALLOWED_STATUS.has(status)) {
    query.status = status
  }
  return Appeal.find(query)
    .sort({ updatedAt: -1 })
    .populate('studentId', 'firstName lastName studentId')
    .populate('subjectId', 'subjectName')
    .populate('sessionId', 'sessionDate startTime endTime')
    .lean()
}

async function listAppealsForInstructor (instructorId, { status } = {}) {
  const query = { instructorId }
  if (status && ALLOWED_STATUS.has(status)) {
    query.status = status
  }
  return Appeal.find(query)
    .sort({ updatedAt: -1 })
    .populate('studentId', 'firstName lastName studentId')
    .populate('subjectId', 'subjectName')
    .populate('sessionId', 'sessionDate startTime endTime')
    .lean()
}

async function getAppealById (appealId) {
  if (!mongoose.Types.ObjectId.isValid(appealId)) {
    throw buildError('Invalid appeal identifier', 400)
  }
  const appeal = await Appeal.findById(appealId).lean()
  if (!appeal) {
    throw buildError('Appeal not found', 404)
  }
  return appeal
}

function assertAppealAccess (appeal, requester) {
  if (!appeal || !requester) {
    throw buildError('Forbidden', 403)
  }
  if (requester.role === 'admin') {
    return true
  }
  if (requester.role === 'student') {
    if (appeal.studentId.toString() === requester.userId.toString()) {
      return true
    }
  }
  if (requester.role === 'instructor') {
    if (appeal.instructorId.toString() === requester.userId.toString()) {
      return true
    }
  }
  throw buildError('Forbidden', 403)
}

async function updateAppealStatus ({
  appealId,
  status,
  decidedBy,
  decisionNotes
}) {
  if (!ALLOWED_STATUS.has(status)) {
    throw buildError('Invalid appeal status', 400)
  }

  const appeal = await Appeal.findById(appealId)
  if (!appeal) {
    throw buildError('Appeal not found', 404)
  }

  appeal.status = status
  appeal.resolution = {
    decidedBy,
    decidedAt: new Date(),
    decisionNotes: decisionNotes ? decisionNotes.trim() : undefined
  }
  appeal.events.push({
    type: 'status-change',
    message: `Status changed to ${status}`,
    createdBy: decidedBy
  })

  await appeal.save()
  return appeal.toObject()
}

async function addAppealEvent ({
  appealId,
  createdBy,
  message,
  type = 'comment'
}) {
  if (!message || !message.trim()) {
    throw buildError('Event message is required', 400)
  }
  const appeal = await Appeal.findById(appealId)
  if (!appeal) {
    throw buildError('Appeal not found', 404)
  }
  appeal.events.push({
    type,
    message: message.trim(),
    createdBy
  })
  await appeal.save()
  return appeal.toObject()
}

module.exports = {
  createAppeal,
  listAppealsForStudent,
  listAppealsForInstructor,
  getAppealById,
  updateAppealStatus,
  addAppealEvent,
  assertAppealAccess
}
