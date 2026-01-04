const crypto = require('crypto')
const mongoose = require('mongoose')
const { getModel } = require('./dataStore')
const { normalizeSessionDate } = require('./sessionService')

const AttendanceToken = getModel('AttendanceToken')
const Session = getModel('Session')
const Subject = getModel('Subject')
const User = getModel('User')

const TOKEN_VALID_LEAD_MINUTES = Number(
  process.env.TOKEN_VALID_LEAD_MINUTES || 15
)
const TOKEN_GRACE_MINUTES = Number(process.env.TOKEN_GRACE_MINUTES || 15)
const TOKEN_DEFAULT_LOOKAHEAD_MINUTES = Number(
  process.env.TOKEN_LOOKAHEAD_MINUTES || 360
)
const TOKEN_LOOKBACK_MINUTES = Number(process.env.TOKEN_LOOKBACK_MINUTES || 120)

function generateTokenString () {
  return crypto.randomBytes(32).toString('hex')
}

function normalizeSessionId (session) {
  const candidate =
    session && (session._id || session.id || session.sessionId || session)

  if (!candidate) {
    throw new Error('Session is missing a valid _id')
  }

  if (candidate instanceof mongoose.Types.ObjectId) {
    return candidate
  }

  const candidateString =
    typeof candidate === 'string'
      ? candidate
      : candidate.toString && candidate.toString()

  if (!candidateString || !mongoose.Types.ObjectId.isValid(candidateString)) {
    throw new Error(`Session _id is not a valid ObjectId: ${candidateString}`)
  }

  return new mongoose.Types.ObjectId(candidateString)
}

function computeValidityWindow (session) {
  const start = new Date(session.startTime)
  const end = new Date(session.endTime)
  const validFrom = new Date(start.getTime() - TOKEN_VALID_LEAD_MINUTES * 60000)
  const expiresAt = new Date(end.getTime() + TOKEN_GRACE_MINUTES * 60000)
  return { validFrom, expiresAt }
}

async function getOrCreateTokenForSession ({
  userId,
  subjectId,
  session,
  meetCode,
  issuedAutomatically = false
}) {
  if (!userId || !session || !session._id) {
    throw new Error('userId and session are required to issue token')
  }

  const normalizedSessionId = normalizeSessionId(session)

  const existing = await AttendanceToken.findOne({
    sessionId: normalizedSessionId,
    userId
  })

  if (existing && !existing.consumed && new Date() < existing.expiresAt) {
    return existing
  }

  if (existing) {
    await AttendanceToken.deleteOne({ _id: existing._id })
  }

  const { validFrom, expiresAt } = computeValidityWindow(session)
  const sessionDate =
    session.sessionDate || normalizeSessionDate(session.startTime || new Date())
  const token = new AttendanceToken({
    userId,
    subjectId,
    sessionId: normalizedSessionId,
    meetCode: meetCode || session.meetCode || null,
    token: generateTokenString(),
    sessionDate,
    validFrom,
    expiresAt,
    issuedAutomatically
  })

  await token.save()
  return token
}

async function autoIssueTokensForSession ({ sessionId, logger = console }) {
  const session = await Session.findById(sessionId || null)
  if (!session || !session.subjectId) {
    return { issued: 0, reason: 'missing_session_or_subject' }
  }

  const subject = await Subject.findById(session.subjectId)
    .select('sections meetingLink subjectName department')
    .lean()
  if (
    !subject ||
    !Array.isArray(subject.sections) ||
    subject.sections.length === 0
  ) {
    return { issued: 0, reason: 'subject_has_no_sections' }
  }

  const students = await User.find({
    role: 'student',
    section: { $in: subject.sections.filter(Boolean) }
  })
    .select('_id section')
    .lean()

  if (!students.length) {
    return { issued: 0, reason: 'no_students_for_subject' }
  }

  let issued = 0
  for (const student of students) {
    await getOrCreateTokenForSession({
      userId: student._id,
      subjectId: subject._id,
      session,
      meetCode: session.meetCode,
      issuedAutomatically: true
    })
    issued += 1
  }

  logger.log(
    `🎟️  Issued ${issued} token(s) for session ${session._id} (subject ${subject._id})`
  )

  return { issued }
}

async function findUpcomingSessionForSubject ({
  subjectId,
  referenceTime = new Date()
}) {
  if (!subjectId) return null
  const startWindow = new Date(
    referenceTime.getTime() - TOKEN_LOOKBACK_MINUTES * 60000
  )
  const endWindow = new Date(
    referenceTime.getTime() + TOKEN_DEFAULT_LOOKAHEAD_MINUTES * 60000
  )

  return Session.findOne({
    subjectId,
    startTime: { $gte: startWindow, $lte: endWindow }
  })
    .sort({ startTime: 1 })
    .lean()
}

async function markTokenConsumed ({ tokenRecord, consumedBy }) {
  if (!tokenRecord) return
  tokenRecord.consumed = true
  tokenRecord.consumedAt = new Date()
  tokenRecord.consumedBy = consumedBy || tokenRecord.consumedBy || null
  await tokenRecord.save()
}

async function cleanupExpiredTokens ({
  olderThanMinutes = 60,
  logger = console
} = {}) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60000)
  const result = await AttendanceToken.deleteMany({
    expiresAt: { $lt: cutoff },
    consumed: true
  })
  if (result.deletedCount > 0) {
    logger.log(
      `🧹 Cleaned up ${result.deletedCount} consumed token(s) older than ${olderThanMinutes}m`
    )
  }
  return result.deletedCount
}

async function expireTokensForSession ({
  sessionId,
  consumedBy,
  logger = console
}) {
  if (!sessionId) {
    return 0
  }

  let normalizedSessionId
  try {
    normalizedSessionId = normalizeSessionId({ _id: sessionId })
  } catch (error) {
    logger?.warn?.(
      `⚠️ Unable to normalize sessionId when expiring tokens: ${error.message}`
    )
    return 0
  }

  const now = new Date()
  const updateResult = await AttendanceToken.updateMany(
    { sessionId: normalizedSessionId },
    {
      $set: {
        consumed: true,
        consumedAt: now,
        consumedBy: consumedBy || null
      }
    }
  )

  // Remove the consumed records so future sessions can issue fresh tokens
  await AttendanceToken.deleteMany({
    sessionId: normalizedSessionId,
    consumed: true
  })

  if (updateResult.modifiedCount > 0) {
    logger?.log?.(
      `🧹 Expired ${
        updateResult.modifiedCount
      } attendance token(s) for session ${normalizedSessionId.toString()}`
    )
  }

  return updateResult.modifiedCount
}

/**
 * Creates a makeup session from an origin session and issues tokens for all enrolled students
 * @param {Object} options - Configuration options
 * @param {ObjectId} options.originSessionId - The original session this makeup is for
 * @param {Date} options.makeupStart - Start time for the makeup session
 * @param {Date} options.makeupEnd - End time for the makeup session
 * @param {string} options.reason - Reason for the makeup class
 * @param {string} options.meetCode - Optional new meet code (defaults to origin session's meetCode)
 * @param {Object} options.logger - Logger instance (defaults to console)
 * @returns {Object} - { session, tokensIssued, students }
 */
async function createMakeupSessionAndTokens ({
  originSessionId,
  makeupStart,
  makeupEnd,
  reason,
  meetCode,
  logger = console
}) {
  if (!originSessionId) {
    throw new Error('originSessionId is required')
  }

  const originSession = await Session.findById(originSessionId)
  if (!originSession) {
    throw new Error('Origin session not found')
  }

  if (!originSession.subjectId) {
    throw new Error('Origin session has no associated subject')
  }

  // Determine makeup session times
  const startTime = makeupStart ? new Date(makeupStart) : new Date()
  const endTime = makeupEnd
    ? new Date(makeupEnd)
    : new Date(startTime.getTime() + 2 * 60 * 60 * 1000) // Default 2 hours

  // Normalize session date
  const sessionDate = new Date(startTime)
  sessionDate.setHours(0, 0, 0, 0)

  // Create the makeup session
  const makeupSession = new Session({
    sessionId: `sess_makeup_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    subjectId: originSession.subjectId,
    sessionDate,
    startTime,
    endTime,
    meetCode: meetCode || originSession.meetCode,
    status: 'scheduled',
    isOutscheduled: true,
    originSessionId: originSession._id,
    makeupReason: reason || 'Makeup class',
    notes: `Makeup session for ${originSession._id}`
  })

  await makeupSession.save()
  logger.log(
    `📅 Created makeup session ${makeupSession._id} for origin ${originSessionId}`
  )

  // Issue tokens for all enrolled students
  const subject = await Subject.findById(originSession.subjectId)
    .select('sections subjectName')
    .lean()

  if (
    !subject ||
    !Array.isArray(subject.sections) ||
    subject.sections.length === 0
  ) {
    return {
      session: makeupSession,
      tokensIssued: 0,
      students: [],
      reason: 'no_sections_in_subject'
    }
  }

  const students = await User.find({
    role: 'student',
    section: { $in: subject.sections.filter(Boolean) }
  })
    .select('_id section firstName lastName')
    .lean()

  if (!students.length) {
    return {
      session: makeupSession,
      tokensIssued: 0,
      students: [],
      reason: 'no_students_for_subject'
    }
  }

  // Issue tokens for each student
  let tokensIssued = 0
  const issuedStudents = []

  for (const student of students) {
    try {
      // Check if token already exists for this session + student
      const existingToken = await AttendanceToken.findOne({
        sessionId: makeupSession._id,
        userId: student._id
      })

      if (existingToken) {
        logger.log(
          `⏭️  Token already exists for student ${student._id} in makeup session`
        )
        continue
      }

      const { validFrom, expiresAt } = computeValidityWindow(makeupSession)

      const token = new AttendanceToken({
        userId: student._id,
        subjectId: originSession.subjectId,
        sessionId: makeupSession._id,
        meetCode: makeupSession.meetCode,
        token: generateTokenString(),
        sessionDate,
        validFrom,
        expiresAt,
        issuedAutomatically: true,
        isOutscheduled: true,
        originSessionId: originSession._id
      })

      await token.save()
      tokensIssued++
      issuedStudents.push({
        userId: student._id,
        name: `${student.firstName} ${student.lastName}`,
        section: student.section
      })
    } catch (err) {
      // Handle duplicate token errors gracefully
      if (err.code === 11000) {
        logger.log(`⏭️  Duplicate token skipped for student ${student._id}`)
      } else {
        logger.error(
          `❌ Failed to issue token for student ${student._id}:`,
          err.message
        )
      }
    }
  }

  logger.log(
    `🎟️  Issued ${tokensIssued} token(s) for makeup session ${makeupSession._id}`
  )

  return {
    session: makeupSession,
    tokensIssued,
    students: issuedStudents,
    totalStudents: students.length
  }
}

module.exports = {
  getOrCreateTokenForSession,
  autoIssueTokensForSession,
  findUpcomingSessionForSubject,
  markTokenConsumed,
  computeValidityWindow,
  cleanupExpiredTokens,
  createMakeupSessionAndTokens,
  expireTokensForSession
}
