const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()
const { getModel } = require('../services/dataStore')
const Attendance = getModel('Attendance')
const Session = getModel('Session')
const User = getModel('User')
const Subject = getModel('Subject')
const AttendanceToken = getModel('AttendanceToken')
const { upsertSessionByMeetCodeAndDate } = require('../services/sessionService')
const { requireAuth } = require('../middleware/auth')
const { handleError } = require('../utils/errorHandler')
const { JWT_SECRET } = require('../config/jwt')
const {
  calculateTardiness,
  isDuringAddDropPeriod: _isDuringAddDropPeriod
} = require('../services/tardinessCalculator')
const {
  calculateConsecutiveWeeksAbsent,
  calculateContactHoursAbsent
} = require('../services/absenceTracker')
const { checkDFGradeEligibility } = require('../services/gradeAssignment')
// Use shared timeout manager to prevent race conditions
const timeoutManager = require('../utils/timeoutManager')
// Use shared status utilities for consistent status determination
const {
  deriveParticipantStatus,
  formatStatusLabel,
  toIsoWithBase,
  formatHmsFromDate,
  determineFinalStatus,
  applyStatusRules,
  parseSessionDay,
  deriveRawStatus
} = require('../utils/statusUtils')
const {
  resolveParticipantIdentity
} = require('../services/participantIdentity')
const { sendMail } = require('../utils/email')
const {
  ensureBaselineAttendanceForSession
} = require('../services/attendanceBaselineService')
const { expireTokensForSession } = require('../services/attendanceTokenService')
const {
  createStatusChangeNotification,
  createBulkAttendanceNotifications
} = require('../services/notificationService')

function computeTimeToEnterSeconds (sessionStartTime, firstJoinTime) {
  if (!sessionStartTime || !firstJoinTime) return 0
  const sessionStart = new Date(sessionStartTime)
  const join =
    firstJoinTime instanceof Date ? firstJoinTime : new Date(firstJoinTime)
  if (Number.isNaN(sessionStart.getTime()) || Number.isNaN(join.getTime())) {
    return 0
  }
  return Math.max(0, Math.floor((join - sessionStart) / 1000))
}

const MAX_UNMATCHED_HISTORY = 50

async function normalizeParticipant (participant = {}, options = {}) {
  const timestamp = options.timestamp ? new Date(options.timestamp) : new Date()
  const sessionDateBase = options.sessionDate
    ? new Date(options.sessionDate)
    : new Date(timestamp)
  sessionDateBase.setHours(0, 0, 0, 0)

  const identity = await resolveParticipantIdentity(participant.name)

  const joinDate =
    toIsoWithBase(
      participant.joinTimeIso || participant.timeIn || participant.joinTime,
      sessionDateBase
    ) || null
  const leaveDate =
    toIsoWithBase(
      participant.leaveTimeIso || participant.timeOut || participant.leaveTime,
      sessionDateBase
    ) || null

  const joinTime =
    participant.timeIn || participant.joinTime || formatHmsFromDate(joinDate)
  const leaveTime =
    participant.timeOut || participant.leaveTime || formatHmsFromDate(leaveDate)

  // Pass instructor leave info and meeting end state to deriveRawStatus
  const rawStatus = deriveRawStatus(participant, {
    instructorLeaveTimeIso: options.instructorLeaveTimeIso,
    meetingEnded: options.meetingEnded
  })

  router.get('/session/:sessionId/tokens', requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.params
      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({
          success: false,
          error: 'InvalidSessionId',
          message: 'Invalid sessionId parameter'
        })
      }

      const tokens = await AttendanceToken.find({ sessionId })
        .select(
          'userId token validFrom expiresAt consumed consumedAt consumedBy issuedAutomatically meetCode'
        )
        .lean()

      res.json({
        success: true,
        sessionId,
        tokenCount: tokens.length,
        tokens
      })
    } catch (error) {
      console.error('❌ Error fetching session tokens:', error)
      res.status(500).json({
        success: false,
        error: 'InternalServerError',
        message: error.message
      })
    }
  })

  router.get('/session/:sessionId/overview', requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.params
      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({
          success: false,
          error: 'InvalidSessionId',
          message: 'Invalid sessionId parameter'
        })
      }

      const session = await Session.findById(sessionId)
        .select('meetCode subjectId startTime endTime status')
        .lean()

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'SessionNotFound'
        })
      }

      const [summary] = await Attendance.aggregate([
        {
          $match: { sessionId: mongoose.Types.ObjectId(sessionId) }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            present: {
              $sum: {
                $cond: [{ $eq: ['$status', 'present'] }, 1, 0]
              }
            },
            late: {
              $sum: {
                $cond: [{ $eq: ['$status', 'late'] }, 1, 0]
              }
            },
            absent: {
              $sum: {
                $cond: [{ $eq: ['$status', 'absent'] }, 1, 0]
              }
            },
            pending: {
              $sum: {
                $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
              }
            },
            tardy: {
              $sum: {
                $cond: [{ $eq: ['$isTardy', true] }, 1, 0]
              }
            },
            avgTimeToEnter: { $avg: '$timeToEnterSeconds' },
            minTimeToEnter: { $min: '$timeToEnterSeconds' },
            maxTimeToEnter: { $max: '$timeToEnterSeconds' }
          }
        }
      ])

      let expectedStudents = null
      let coveragePercent = null
      if (session.subjectId) {
        const subject = await Subject.findById(session.subjectId)
          .select('sections')
          .lean()
        if (subject?.sections?.length) {
          expectedStudents = await User.countDocuments({
            role: 'student',
            section: { $in: subject.sections }
          })
          if (expectedStudents > 0) {
            coveragePercent = summary
              ? Math.round((summary.total / expectedStudents) * 10000) / 100
              : 0
          }
        }
      }

      res.json({
        success: true,
        session,
        coverage: {
          expectedStudents,
          totalRecords: summary?.total || 0,
          coveragePercent
        },
        attendanceSummary: summary || {
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          pending: 0,
          tardy: 0,
          avgTimeToEnter: null,
          minTimeToEnter: null,
          maxTimeToEnter: null
        }
      })
    } catch (error) {
      console.error('❌ Error fetching session overview:', error)
      res.status(500).json({
        success: false,
        error: 'InternalServerError',
        message: error.message
      })
    }
  })

  const statusLabel = formatStatusLabel(rawStatus)

  const durationSeconds =
    typeof participant.attendedDuration === 'number' &&
    !Number.isNaN(participant.attendedDuration)
      ? participant.attendedDuration
      : 0

  return {
    meetCode:
      options.meetCode ||
      participant.meetCode ||
      options.defaultMeetCode ||
      null,
    name: identity.displayName || participant.name || 'Unknown',
    participantId: identity.userId || participant.participantId || null,
    studentId: identity.studentId || null,
    joinTime: joinTime || null,
    joinTimeIso: joinDate
      ? joinDate.toISOString()
      : participant.joinTimeIso || null,
    leaveTime: leaveTime || null,
    leaveTimeIso: leaveDate
      ? leaveDate.toISOString()
      : participant.leaveTimeIso || null,
    durationSeconds,
    status: statusLabel,
    rawStatus,
    isLive: rawStatus !== 'left' && rawStatus !== 'absent',
    timeoutSynchronized: participant.timeoutSynchronized || false,
    lastSeen: new Date().toISOString(),
    // Preserve host flag and other metadata from extension
    isHost:
      participant.isHost === true || participant.isHost === 'true' || false,
    avatarUrl: participant.avatarUrl || null,
    // Preserve other participant metadata that might be useful
    role: participant.role || null,
    presenter: participant.presenter || false
  }
}

// Note: This function is used by the DISABLED progress endpoint below (inside comment block)
// Kept for reference but renamed to satisfy eslint no-unused-vars rule
async function _normalizeParticipantsList (participants = [], options = {}) {
  return Promise.all(
    participants.map(participant => normalizeParticipant(participant, options))
  )
}

function normalizeNameKey (value = '') {
  return value ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
}

function buildRosterIndexes (users = []) {
  const indexes = {
    byId: new Map(),
    byEmail: new Map(),
    byStudentId: new Map(),
    byName: new Map()
  }

  users.forEach(userDoc => {
    if (!userDoc) return
    const id = userDoc._id ? userDoc._id.toString() : null
    const email = userDoc.email ? userDoc.email.toLowerCase() : null
    const studentId = userDoc.studentId
      ? String(userDoc.studentId).toLowerCase()
      : null
    const normalizedName = normalizeNameKey(
      `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim()
    )

    if (id) indexes.byId.set(id, userDoc)
    if (email) indexes.byEmail.set(email, userDoc)
    if (studentId) indexes.byStudentId.set(studentId, userDoc)
    if (normalizedName) indexes.byName.set(normalizedName, userDoc)
  })

  return indexes
}

// parseSessionDay is now imported from statusUtils for consistency

// POST /api/attendance - Receive attendance data from extension
router.post('/', async (req, res) => {
  try {
    // Phase 1 Task 2: Accept unauthenticated submissions
    const {
      meetCode,
      date,
      startTime,
      stopTime,
      participants,
      subjectId,
      verificationToken,
      isUnauthenticated
    } = req.body

    if (!meetCode || !date || !participants) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'meetCode, date, and participants are required'
      })
    }

    // Phase 1 Task 2: Handle unauthenticated submissions
    const isUnauthenticatedSubmission =
      isUnauthenticated === true || !verificationToken || !subjectId

    let subjectIdFinal
    let _instructorIdForRecord = null
    let rosterIndexes = {}
    let approvedMemberIds = new Set()
    let subject = null // Phase 1 Task 2: Declare subject outside block for later use
    let instructorId = null // Phase 1 Task 2: Declare instructorId outside block for later use

    if (isUnauthenticatedSubmission) {
      console.log('⚠️ === UNAUTHENTICATED FINAL ATTENDANCE SUBMISSION ===')
      console.log('   MeetCode:', meetCode)
      console.log('   Participants:', participants?.length || 0)
      console.log('   Date:', date)
      console.log('   ⚠️ This submission will be saved with subjectId: null')
      console.log('   💡 History will show warning for unauthenticated records')

      // For unauthenticated submissions, set subjectId to null
      subjectIdFinal = null
      _instructorIdForRecord = null
      rosterIndexes = {}
      approvedMemberIds = new Set()
      subject = null
      instructorId = null

      // Continue with unauthenticated submission (skip token validation)
    } else {
      // Authenticated submission - proceed with normal validation
      // Find subject early - needed for roster loading before JWT validation
      subject = await Subject.findById(subjectId)
      if (!subject) {
        return res.status(404).json({
          error: 'Subject not found',
          message:
            'The provided subjectId is invalid. Ensure the Google Meet is linked to a NE-Attend subject.'
        })
      }

      subjectIdFinal = subjectId

      // Get roster from subject sections (students assigned to subject by section)
      // Load roster early so it's available for JWT validation
      let instructorId = null

      // Use subject - get instructor and students by section
      if (subject.instructorId) {
        instructorId = subject.instructorId
        _instructorIdForRecord = instructorId
        approvedMemberIds.add(subject.instructorId.toString())
      }

      // Get all students whose section matches the subject's sections
      if (Array.isArray(subject.sections) && subject.sections.length > 0) {
        const normalizeSection = section => {
          if (!section || typeof section !== 'string') return ''
          return section.trim().toLowerCase()
        }
        const normalizedSections = subject.sections.map(s =>
          normalizeSection(s)
        )
        const matchingStudents = await User.find({
          role: 'student',
          active: { $ne: false },
          $or: [
            { section: { $in: subject.sections } },
            { section: { $in: normalizedSections } }
          ]
        }).select('_id firstName lastName email studentId role')

        matchingStudents.forEach(student => {
          approvedMemberIds.add(student._id.toString())
        })
      }

      const rosterUserIds = Array.from(approvedMemberIds)
      const rosterUsers =
        rosterUserIds.length > 0
          ? await User.find({ _id: { $in: rosterUserIds } }).select(
              'firstName lastName email studentId role'
            )
          : []
      rosterIndexes = buildRosterIndexes(rosterUsers)
    }

    // Phase 1 Task 2: Validate token only for authenticated submissions
    const jwt = require('jsonwebtoken')
    const _crypto = require('crypto')
    const fs = require('fs')
    const path = require('path')

    let tokenRecord = null
    let jwtPayload = null
    let isJWT = false

    // Phase 1 Task 2: Skip token validation for unauthenticated submissions
    if (!isUnauthenticatedSubmission) {
      // Check if token is JWT format (contains dots and base64-like structure)
      if (
        verificationToken &&
        verificationToken.includes('.') &&
        verificationToken.split('.').length === 3
      ) {
        isJWT = true
        try {
          // Try to verify as RS256 JWT
          const publicKeyPath = path.join(__dirname, '../keys/jwt-public.pem')
          if (fs.existsSync(publicKeyPath)) {
            const publicKey = fs.readFileSync(publicKeyPath, 'utf8')
            jwtPayload = jwt.verify(verificationToken, publicKey, {
              algorithms: ['RS256']
            })

            // Verify token payload matches request - check if student_id is authorized (in roster)
            if (
              jwtPayload.student_id &&
              !approvedMemberIds.has(jwtPayload.student_id.toString())
            ) {
              return res.status(401).json({
                error: 'Token validation failed',
                message:
                  'JWT token student_id is not authorized for this subject'
              })
            }

            if (
              jwtPayload.subject_id &&
              jwtPayload.subject_id.toString() !== subjectId.toString()
            ) {
              return res.status(401).json({
                error: 'Token validation failed',
                message: 'JWT token subject_id does not match subjectId'
              })
            }

            if (jwtPayload.meeting_id && jwtPayload.meeting_id !== meetCode) {
              return res.status(401).json({
                error: 'Token validation failed',
                message: 'JWT token meeting_id does not match meetCode'
              })
            }

            // Check expiration from JWT
            if (
              jwtPayload.exp &&
              new Date(jwtPayload.exp * 1000) < new Date()
            ) {
              return res.status(401).json({
                error: 'Token expired',
                message: 'JWT token has expired'
              })
            }
          } else {
            // Fallback to HS256 if public key not found
            jwtPayload = jwt.verify(verificationToken, JWT_SECRET, {
              algorithms: ['HS256']
            })

            // Same validation as above - check if student_id is authorized (in roster)
            if (
              jwtPayload.student_id &&
              !approvedMemberIds.has(jwtPayload.student_id.toString())
            ) {
              return res.status(401).json({
                error: 'Token validation failed',
                message:
                  'JWT token student_id is not authorized for this subject'
              })
            }
          }

          console.log('✅ JWT token validated successfully:', {
            student_id: jwtPayload.student_id,
            meeting_id: jwtPayload.meeting_id,
            subject_id: jwtPayload.subject_id
          })
        } catch (jwtError) {
          return res.status(401).json({
            error: 'Invalid JWT token',
            message: `JWT verification failed: ${jwtError.message}`
          })
        }

        // Also check database record if it exists
        tokenRecord = await AttendanceToken.findOne({
          token: verificationToken,
          subjectId: subjectId,
          consumed: false
        })

        // Check if JWT token was already consumed (even if JWT itself is valid)
        if (isJWT && !tokenRecord) {
          const consumedRecord = await AttendanceToken.findOne({
            token: verificationToken,
            subjectId: subjectId,
            consumed: true
          })
          if (consumedRecord) {
            return res.status(401).json({
              error: 'Token already used',
              message:
                'This verification token has already been used. Please generate a new token from NE-Attend.'
            })
          }
        }
      } else {
        // Legacy token format - check database
        tokenRecord = await AttendanceToken.findOne({
          token: verificationToken,
          subjectId: subjectId,
          consumed: false
        })

        if (!tokenRecord) {
          // Check if token was consumed (more specific error)
          const consumedRecord = await AttendanceToken.findOne({
            token: verificationToken,
            subjectId: subjectId,
            consumed: true
          })
          if (consumedRecord) {
            return res.status(401).json({
              error: 'Token already used',
              message:
                'This verification token has already been used. Please generate a new token from NE-Attend.'
            })
          }
          // Token not found at all
          return res.status(401).json({
            error: 'Invalid verification token',
            message:
              'The provided verification token is invalid or not found. Please ensure you joined the meeting through NE-Attend dashboard and request a new token if needed.'
          })
        }

        // Check if token is expired (check expiration before consumed for better error messages)
        if (new Date() >= tokenRecord.expiresAt) {
          return res.status(401).json({
            error: 'Token expired',
            message:
              'The verification token has expired. Please generate a new one from NE-Attend before submitting attendance.'
          })
        }
      }
    } // Phase 1 Task 2: End of authenticated token validation block

    // Idempotency check: Check if attendance already exists for this session
    // Normalize session date first (extension sends dd/mm/yyyy)
    const sessionDateForCheck = parseSessionDay(date)
    const existingSessionForCheck = await Session.findOne({
      meetCode,
      sessionDate: sessionDateForCheck
    })
    if (existingSessionForCheck) {
      const existingAttendance = await Attendance.find({
        sessionId: existingSessionForCheck._id
      })
      if (existingAttendance.length > 0) {
        console.log(
          `✅ Attendance already submitted for session: ${existingSessionForCheck._id}, returning existing data`
        )
        return res.json({
          success: true,
          message: 'Attendance already submitted for this session',
          sessionId: existingSessionForCheck._id,
          attendanceCount: existingAttendance.length,
          existing: true
        })
      }
    }

    // Phase 1 Task 2: Mark token as consumed only for authenticated submissions
    if (!isUnauthenticatedSubmission) {
      if (tokenRecord) {
        tokenRecord.consumed = true
        await tokenRecord.save()
      } else if (isJWT) {
        // For JWT tokens, create a consumption record
        const consumedToken = new AttendanceToken({
          userId: jwtPayload.student_id,
          subjectId: subjectId,
          token: verificationToken,
          sessionDate: new Date(),
          expiresAt: jwtPayload.exp
            ? new Date(jwtPayload.exp * 1000)
            : new Date(),
          consumed: true
        })
        await consumedToken.save()
      }
    } // Phase 1 Task 2: End of token consumption block (only for authenticated)

    // Normalize session date (extension sends dd/mm/yyyy)
    const sessionDate = parseSessionDay(date)
    let session = null

    // Parse start/end time strings like "4:40:55" into Date on the sessionDate (timezone-aware)
    // Uses UTC to avoid timezone-related date shifts
    function mergeTime (baseDate, timeStr) {
      if (!timeStr) return null
      const [h = '0', m = '0', s = '0'] = String(timeStr).split(':')
      const d = new Date(baseDate)
      // Use UTC methods to avoid timezone issues
      return new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          parseInt(h, 10) || 0,
          parseInt(m, 10) || 0,
          parseInt(s, 10) || 0,
          0
        )
      )
    }

    function mergeScheduleTime (baseDate, timeStr) {
      if (!timeStr) return null
      const [h = '0', m = '0'] = String(timeStr).split(':')
      const d = new Date(baseDate)
      return new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          parseInt(h, 10) || 0,
          parseInt(m, 10) || 0,
          0,
          0
        )
      )
    }

    const scheduledStartTime = subject?.schedule?.startTime
      ? mergeScheduleTime(sessionDate, subject.schedule.startTime)
      : null
    const scheduledEndTime = subject?.schedule?.endTime
      ? mergeScheduleTime(sessionDate, subject.schedule.endTime)
      : null

    // Calculate first third threshold (for instructor lateness rule)
    const sessionStartTime =
      scheduledStartTime || mergeTime(sessionDate, startTime) || sessionDate
    const sessionEndTime =
      scheduledEndTime || mergeTime(sessionDate, stopTime) || sessionDate
    const classDuration = sessionEndTime - sessionStartTime
    const firstThirdThreshold = new Date(
      sessionStartTime.getTime() + classDuration / 3
    )

    // Check if session is during add/drop period
    // Subjects don't have add/drop period fields - default to false
    // (can be added to Subject model later if needed)
    const sessionIsDuringAddDrop = false

    // Phase 3 Task 1: Create or find session using atomic findOneAndUpdate with upsert to prevent race conditions
    // This ensures only one session is created even with concurrent requests
    // MongoDB automatically sets query fields (meetCode, sessionDate) when creating documents via upsert
    const sessionData = {
      // meetCode and sessionDate removed - MongoDB sets from query automatically
      startTime: sessionStartTime,
      endTime: sessionEndTime,
      subjectId: subjectIdFinal, // Phase 3 Task 1: subjectIdFinal may be null for unauthenticated submissions
      isDuringAddDrop: sessionIsDuringAddDrop,
      firstThirdThreshold: firstThirdThreshold,
      status: 'active', // Set to active when main endpoint creates it
      // ensure sessionId string exists (model also has default)
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    }

    // Phase 3 Task 1: Enhanced logging for subjectId
    console.log('📋 === SESSION DATA PREPARATION ===')
    console.log('   MeetCode:', meetCode)
    console.log('   SessionDate:', sessionDate)
    console.log('   SubjectIdFinal:', subjectIdFinal)
    console.log('   IsUnauthenticated:', isUnauthenticatedSubmission)
    if (!subjectIdFinal) {
      console.warn(
        '   ⚠️ WARNING: subjectIdFinal is null - this is an unauthenticated submission'
      )
      console.warn('   💡 Session will be saved with subjectId: null')
      console.warn(
        '   💡 History will show warning for unauthenticated records'
      )
    } else {
      console.log('   ✅ SubjectIdFinal is set - authenticated submission')
    }

    try {
      const upsertResult = await upsertSessionByMeetCodeAndDate({
        meetCode,
        sessionDate,
        insert: sessionData
      })
      session = upsertResult.session
      console.log(
        `📝 Session ensured via upsert: ${session._id} (status: ${session.status})`
      )
      await ensureBaselineAttendanceForSession({
        sessionId: session._id
      })
    } catch (dbError) {
      console.error('❌ Database error creating/upserting session:', dbError)
      return res.status(503).json({
        success: false,
        error: 'Database operation failed',
        message: 'Could not create or update session',
        details: dbError.message
      })
    }

    try {
      if (session && session.status === 'scheduled') {
        console.log(
          '📝 Updating placeholder session created by progress endpoint'
        )
        const updateSubjectId = subjectIdFinal || session.subjectId
        session = await Session.findByIdAndUpdate(
          session._id,
          {
            $set: {
              startTime: sessionStartTime,
              endTime: sessionEndTime,
              subjectId: updateSubjectId,
              isDuringAddDrop: sessionIsDuringAddDrop,
              firstThirdThreshold: firstThirdThreshold,
              status: 'active',
              sessionId: session.sessionId.startsWith('prog_')
                ? sessionData.sessionId
                : session.sessionId
            }
          },
          {
            new: true,
            runValidators: true
          }
        )

        if (!session) {
          throw new Error('Session update returned null')
        }

        console.log('✅ Session updated successfully')
        console.log('   Session ID:', session._id)
        console.log('   Session subjectId:', session.subjectId)
        if (!session.subjectId) {
          console.warn('   ⚠️ WARNING: Session.subjectId is null after update')
        } else {
          console.log('   ✅ Session.subjectId is set correctly')
        }
      } else if (session && !session.subjectId && subjectIdFinal) {
        console.warn('   ⚠️ WARNING: Existing session has null subjectId')
        session = await Session.findByIdAndUpdate(
          session._id,
          { $set: { subjectId: subjectIdFinal } },
          { new: true, runValidators: true }
        )
        console.log('   ✅ Session updated with subjectId:', session.subjectId)
      }
    } catch (dbError) {
      console.error('❌ Database error updating session:', dbError)
      return res.status(503).json({
        success: false,
        error: 'Database operation failed',
        message: 'Could not create or update session',
        details: dbError.message
      })
    }

    // Update firstThirdThreshold after session is retrieved (if missing)
    if (firstThirdThreshold && session && !session.firstThirdThreshold) {
      session = await Session.findByIdAndUpdate(
        session._id,
        { $set: { firstThirdThreshold: firstThirdThreshold } },
        { new: true }
      )
    }

    // If subject/group wasn't loaded yet, try to get it from session
    if (!subject && session.subjectId) {
      subject = await Subject.findById(session.subjectId)
      if (subject && subject.instructorId && !instructorId) {
        instructorId = subject.instructorId
      }
    }
    // Get instructor from subject if session has subjectId
    if (!instructorId && session.subjectId) {
      const subjectForInstructor = await Subject.findById(
        session.subjectId
      ).select('instructorId')
      if (subjectForInstructor && subjectForInstructor.instructorId) {
        instructorId = subjectForInstructor.instructorId
      }
    }

    // Track instructor lateness and detect instructor leave time
    let instructorJoinTime = null
    let instructorLate = false
    let instructorLeaveTime = null
    let instructorLeaveTimeIso = null
    let instructorParticipantIndex = -1
    let instructorDetectionWarnings = []
    let instructorDetectionFailed = false // Track if instructor detection completely failed
    const synchronizedParticipantUserIds = new Set()

    if (instructorId && Array.isArray(participants)) {
      // Find instructor in participants list
      const instructor = await User.findById(instructorId)
      if (instructor) {
        // Normalize instructor name: remove extra spaces, convert to lowercase
        const normalizeName = name => {
          return (name || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/^(dr\.|prof\.|mr\.|mrs\.|ms\.|miss)\s+/i, '')
        }

        const instructorFirstName = normalizeName(instructor.firstName)
        const instructorLastName = normalizeName(instructor.lastName)
        const instructorFullName = `${instructorFirstName} ${instructorLastName}`
        const instructorEmail = (instructor.email || '').toLowerCase()
        const instructorStudentId = (instructor.studentId || '').toLowerCase()

        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i]
          let participantName = (participant.name || '').trim()

          // Try matching by userId/email first if available (most reliable)
          if (
            participant.participantId &&
            participant.participantId.toString() === instructorId.toString()
          ) {
            // Direct userId match - most reliable
            instructorParticipantIndex = i
            break
          }

          if (
            participant.email &&
            participant.email.toLowerCase() === instructorEmail
          ) {
            // Email match - very reliable
            instructorParticipantIndex = i
            break
          }

          if (
            participant.studentId &&
            participant.studentId.toLowerCase() === instructorStudentId
          ) {
            // Student ID match
            instructorParticipantIndex = i
            break
          }

          // Normalize participant name for comparison
          participantName = normalizeName(participantName)

          // Check if this participant is the instructor by name matching
          // Try multiple matching strategies:
          // 1. Exact match (normalized)
          // 2. Contains both first and last name
          // 3. Contains first name and last name (in any order)
          const nameMatches =
            participantName === instructorFullName ||
            (participantName.includes(instructorFirstName) &&
              participantName.includes(instructorLastName)) ||
            participantName ===
              `${instructorLastName} ${instructorFirstName}` || // Last, First format
            (participantName.startsWith(instructorFirstName) &&
              participantName.includes(instructorLastName)) ||
            (participantName.endsWith(instructorLastName) &&
              participantName.includes(instructorFirstName))

          if (nameMatches) {
            instructorParticipantIndex = i

            // Get instructor join time with validation and fallback
            instructorJoinTime = toIsoWithBase(
              participant.joinTimeIso ||
                participant.timeIn ||
                participant.joinTime,
              sessionDate
            )
            // Validate and provide fallback if date is invalid
            if (
              !instructorJoinTime ||
              Number.isNaN(instructorJoinTime.getTime())
            ) {
              // Fallback to current time or session start time
              instructorJoinTime = session.startTime || new Date()
              console.warn(
                `⚠️ Invalid instructor join time, using fallback: ${instructorJoinTime.toISOString()}`
              )
            }

            // Get instructor leave time with validation and fallback
            instructorLeaveTimeIso = toIsoWithBase(
              participant.leaveTimeIso ||
                participant.timeOut ||
                participant.leaveTime,
              sessionDate
            )
            // Validate and provide fallback if date is invalid
            if (
              instructorLeaveTimeIso &&
              !Number.isNaN(instructorLeaveTimeIso.getTime())
            ) {
              instructorLeaveTime =
                participant.timeOut ||
                participant.leaveTime ||
                formatHmsFromDate(instructorLeaveTimeIso)
            } else if (participant.timeOut || participant.leaveTime) {
              // If we have a time string but invalid ISO, try to use the time string directly
              instructorLeaveTime = participant.timeOut || participant.leaveTime
              // Try to create a valid date from the time string
              const leaveTimeStr = String(instructorLeaveTime)
              const [h = '0', m = '0', s = '0'] = leaveTimeStr.split(':')
              const fallbackLeaveDate = new Date(sessionDate)
              fallbackLeaveDate.setHours(
                parseInt(h, 10) || 0,
                parseInt(m, 10) || 0,
                parseInt(s, 10) || 0,
                0
              )
              if (!Number.isNaN(fallbackLeaveDate.getTime())) {
                instructorLeaveTimeIso = fallbackLeaveDate
              } else {
                instructorLeaveTimeIso = null
                console.warn(
                  `⚠️ Invalid instructor leave time, clearing: ${instructorLeaveTime}`
                )
              }
            } else {
              instructorLeaveTime = null
              instructorLeaveTimeIso = null
            }

            // Check if instructor is late (arrived after scheduled start time)
            if (instructorJoinTime && session.startTime) {
              instructorLate = instructorJoinTime > session.startTime
            }

            // Update session with instructor information (only if valid) - use atomic update
            if (
              instructorJoinTime &&
              !Number.isNaN(instructorJoinTime.getTime())
            ) {
              try {
                const updateResult = await Session.findByIdAndUpdate(
                  session._id,
                  {
                    $set: {
                      instructorJoinTime: instructorJoinTime,
                      instructorLate: instructorLate
                    }
                  },
                  { new: false } // Don't need to return updated doc
                )

                if (!updateResult) {
                  console.warn(
                    `⚠️ Session update returned null for instructor join time`
                  )
                } else {
                  // Update local session object for later use
                  session.instructorJoinTime = instructorJoinTime
                  session.instructorLate = instructorLate
                }
              } catch (dbError) {
                console.error(
                  `❌ Database error updating instructor join time:`,
                  dbError
                )
                // Don't fail the entire request - continue with warning
                instructorDetectionWarnings.push({
                  type: 'DATABASE_UPDATE_FAILED',
                  message: 'Failed to save instructor join time to database',
                  error: dbError.message
                })
              }
            } else {
              console.warn(
                `⚠️ Skipping instructor join time update due to invalid date`
              )
            }

            break
          }
        }

        // If instructor not detected, log warning and try fallback detection
        if (instructorParticipantIndex === -1) {
          console.warn(
            `⚠️ Instructor detection failed for ${instructor.firstName} ${instructor.lastName} (ID: ${instructorId})`
          )
          console.warn(
            `   Participants: ${participants
              .map(p => p.name || 'Unknown')
              .join(', ')}`
          )

          instructorDetectionWarnings.push({
            type: 'INSTRUCTOR_NOT_FOUND',
            message: `Instructor ${instructor.firstName} ${instructor.lastName} not detected in participant list`,
            instructorId: instructorId,
            participantNames: participants.map(p => p.name || 'Unknown')
          })

          // Fallback Strategy 1: Try to find instructor by role if available
          for (let i = 0; i < participants.length; i++) {
            const participant = participants[i]
            if (
              participant.role === 'instructor' ||
              participant.role === 'host' ||
              participant.isHost
            ) {
              instructorParticipantIndex = i
              console.log(
                `✅ Found instructor via role fallback: ${
                  participant.name || 'Unknown'
                }`
              )

              instructorDetectionWarnings.push({
                type: 'INSTRUCTOR_DETECTED_BY_ROLE',
                message: `Instructor detected by role fallback: ${
                  participant.name || 'Unknown'
                }`,
                detectionMethod: 'role'
              })
              break
            }
          }

          // Fallback Strategy 2: Fuzzy/partial name matching
          if (instructorParticipantIndex === -1) {
            console.log('🔍 Trying fuzzy name matching...')
            const instructorLastNameOnly = instructorLastName
            const instructorFirstNameOnly = instructorFirstName

            for (let i = 0; i < participants.length; i++) {
              const participant = participants[i]
              const participantName = normalizeName(participant.name || '')

              // Strategy: Match if last name appears anywhere (instructors often use last name only)
              // OR if first name + at least 3 chars of last name match
              const lastNameMatch =
                participantName.includes(instructorLastNameOnly) &&
                instructorLastNameOnly.length >= 3
              const partialMatch =
                participantName.includes(instructorFirstNameOnly) &&
                instructorLastNameOnly.length >= 3 &&
                participantName.includes(instructorLastNameOnly.substring(0, 3))

              if (lastNameMatch || partialMatch) {
                instructorParticipantIndex = i
                console.log(
                  `✅ Found instructor via fuzzy matching: "${participant.name}" matched "${instructor.firstName} ${instructor.lastName}"`
                )

                instructorDetectionWarnings.push({
                  type: 'INSTRUCTOR_DETECTED_BY_FUZZY_MATCH',
                  message: `Instructor detected by fuzzy name matching: ${participant.name}`,
                  detectionMethod: 'fuzzy_name',
                  confidence: lastNameMatch ? 'medium' : 'low'
                })
                break
              }
            }
          }

          // Fallback Strategy 3: If only one participant, assume it's the instructor
          if (instructorParticipantIndex === -1 && participants.length === 1) {
            instructorParticipantIndex = 0
            console.log(
              `✅ Found instructor by single participant assumption: ${
                participants[0].name || 'Unknown'
              }`
            )

            instructorDetectionWarnings.push({
              type: 'INSTRUCTOR_DETECTED_BY_SINGLE_PARTICIPANT',
              message: `Instructor detected because only one participant: ${participants[0].name}`,
              detectionMethod: 'single_participant',
              confidence: 'low'
            })
          }

          // If instructor detected via any fallback, extract times
          if (instructorParticipantIndex !== -1) {
            const participant = participants[instructorParticipantIndex]

            // Get instructor join time with validation and fallback
            instructorJoinTime = toIsoWithBase(
              participant.joinTimeIso ||
                participant.timeIn ||
                participant.joinTime,
              sessionDate
            )
            if (
              !instructorJoinTime ||
              Number.isNaN(instructorJoinTime.getTime())
            ) {
              instructorJoinTime = session.startTime || new Date()
              console.warn(
                `⚠️ Invalid instructor join time, using fallback: ${instructorJoinTime.toISOString()}`
              )
            }

            // Validate instructor join time is within reasonable range (last 48 hours to next 1 hour)
            const now = new Date()
            const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)
            const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

            if (
              instructorJoinTime < twoDaysAgo ||
              instructorJoinTime > oneHourFromNow
            ) {
              console.warn(
                `⚠️ Instructor join time out of reasonable range: ${instructorJoinTime.toISOString()}, using current time`
              )
              instructorJoinTime = now
            }

            // Get instructor leave time with validation and fallback
            instructorLeaveTimeIso = toIsoWithBase(
              participant.leaveTimeIso ||
                participant.timeOut ||
                participant.leaveTime,
              sessionDate
            )
            if (
              instructorLeaveTimeIso &&
              !Number.isNaN(instructorLeaveTimeIso.getTime())
            ) {
              instructorLeaveTime =
                participant.timeOut ||
                participant.leaveTime ||
                formatHmsFromDate(instructorLeaveTimeIso)

              // Validate leave time is after join time
              if (instructorLeaveTimeIso < instructorJoinTime) {
                console.warn(
                  `⚠️ Instructor leave time before join time, clearing leave time`
                )
                instructorLeaveTimeIso = null
                instructorLeaveTime = null
              }
            }

            // Check if instructor is late
            if (instructorJoinTime && session.startTime) {
              instructorLate = instructorJoinTime > session.startTime
            }

            // Update session with instructor information
            if (
              instructorJoinTime &&
              !Number.isNaN(instructorJoinTime.getTime())
            ) {
              try {
                const updateResult = await Session.findByIdAndUpdate(
                  session._id,
                  {
                    $set: {
                      instructorJoinTime: instructorJoinTime,
                      instructorLate: instructorLate
                    }
                  },
                  { new: false }
                )

                if (!updateResult) {
                  console.warn(
                    `⚠️ Session update returned null for instructor join time (fallback)`
                  )
                } else {
                  // Update local session object for later use
                  session.instructorJoinTime = instructorJoinTime
                  session.instructorLate = instructorLate
                }
              } catch (dbError) {
                console.error(
                  `❌ Database error updating instructor join time (fallback):`,
                  dbError
                )
                // Continue processing - don't fail the entire request
              }
            }
          }

          // If still not found after all fallbacks, mark as complete failure
          if (instructorParticipantIndex === -1) {
            instructorDetectionFailed = true
            console.error(
              `❌ CRITICAL: Instructor detection completely failed after all fallback strategies`
            )
            console.error(
              `   Instructor: ${instructor.firstName} ${instructor.lastName} (${instructor.email})`
            )
            console.error(
              `   Participants: ${participants
                .map(p => p.name || 'Unknown')
                .join(', ')}`
            )
            instructorDetectionWarnings.push({
              type: 'INSTRUCTOR_DETECTION_FAILED',
              message:
                'Instructor detection completely failed after all fallback strategies. Meeting end will not be tracked. Student attendance may be inaccurate.',
              severity: 'critical',
              impact:
                'No instructor tracking, no meeting end detection, no synchronized timeouts',
              suggestions: [
                'Ensure instructor name in system matches Google Meet display name',
                'Consider using email matching by including instructor email in attendance data',
                'Verify instructor has joined the meeting'
              ]
            })
          }
        }
      } else {
        const warningMsg = `Instructor user not found in database (ID: ${instructorId})`
        console.warn(`⚠️ ${warningMsg}`)
        instructorDetectionWarnings.push({
          type: 'INSTRUCTOR_NOT_IN_DATABASE',
          message: warningMsg,
          instructorId: instructorId
        })
      }
    } else if (subjectId && !instructorId) {
      const warningMsg = `No instructor ID found for subject: ${subjectId}`
      console.warn(`⚠️ ${warningMsg}`)
      instructorDetectionWarnings.push({
        type: 'NO_INSTRUCTOR_ID',
        message: warningMsg,
        subjectId: subjectId
      })
    }

    // If instructor/host left, synchronize all other participants' time out BEFORE processing
    // This ensures all participants get the same time-out as the instructor
    // Track which participants got synchronized timeout (were still in meeting when instructor left)
    // Use asymmetric tolerance: strict for "before" (100ms), lenient for "after" (1000ms, though shouldn't happen)
    const SYNCHRONIZATION_TOLERANCE_BEFORE_MS = 100 // Strict: only 100ms before instructor
    const SYNCHRONIZATION_TOLERANCE_AFTER_MS = 1000 // Lenient: up to 1s after (edge cases)
    if (
      instructorLeaveTimeIso &&
      instructorLeaveTime &&
      Array.isArray(participants)
    ) {
      console.log(
        '🔄 Instructor/Host left. Synchronizing time out for all participants...'
      )

      // Update session with instructor leave information (only if valid) - use atomic update
      if (
        instructorLeaveTimeIso &&
        !Number.isNaN(instructorLeaveTimeIso.getTime())
      ) {
        const updateResult = await Session.findByIdAndUpdate(
          session._id,
          {
            $set: {
              instructorLeaveTime: instructorLeaveTimeIso,
              meetingEnded: true,
              status: 'completed' // Update status to completed when instructor leaves
            }
          },
          { new: false } // Don't need to return updated doc
        )

        if (updateResult) {
          // Update local session object for later use
          session.instructorLeaveTime = instructorLeaveTimeIso
          session.meetingEnded = true
          session.status = 'completed'
          console.log(
            `✅ Updated session ${session._id} to completed (instructor left)`
          )
        } else {
          console.warn(
            `⚠️ Session update returned null for instructor leave time`
          )
        }
      } else {
        console.warn(
          `⚠️ Skipping instructor leave time update due to invalid date`
        )
      }

      // Update all participants who don't have a leave time yet (were still in meeting)
      // This applies to ALL participants still in meeting, not just those without leave times
      for (let i = 0; i < participants.length; i++) {
        // Skip the instructor
        if (i === instructorParticipantIndex) {
          continue
        }

        const participant = participants[i]
        const participantLeaveTimeIso = toIsoWithBase(
          participant.leaveTimeIso ||
            participant.timeOut ||
            participant.leaveTime,
          sessionDate
        )

        // Determine if participant should be synchronized (was still in meeting when instructor left)
        // Asymmetric tolerance: strict for "before", lenient for "after"
        // - No leave time: definitely still in meeting → synchronize
        // - Left within 100ms before instructor: likely still in meeting (timing variance) → synchronize
        // - Left within 1000ms after instructor: edge case (shouldn't happen but handle) → synchronize
        // - Left more than 100ms before instructor: definitely left early → do NOT synchronize
        let shouldSynchronize = false
        if (!participantLeaveTimeIso) {
          // No leave time recorded - participant is still in meeting
          shouldSynchronize = true
        } else {
          const instructorLeaveMillis = instructorLeaveTimeIso
            ? instructorLeaveTimeIso.getTime()
            : null
          const participantLeaveMillis = participantLeaveTimeIso.getTime()

          if (instructorLeaveMillis === null) {
            // No instructor leave time - shouldn't happen but be safe
            shouldSynchronize = false
          } else if (
            participantLeaveMillis <
            instructorLeaveMillis - SYNCHRONIZATION_TOLERANCE_BEFORE_MS
          ) {
            // Participant left more than 100ms BEFORE instructor - definitely left early
            shouldSynchronize = false
          } else if (
            participantLeaveMillis <=
            instructorLeaveMillis + SYNCHRONIZATION_TOLERANCE_AFTER_MS
          ) {
            // Participant left within tolerance window (100ms before to 1000ms after)
            shouldSynchronize = true
          } else {
            // Participant left way after instructor (shouldn't happen)
            shouldSynchronize = false
          }
        }

        if (shouldSynchronize) {
          participant.leaveTime = instructorLeaveTime
          participant.leaveTimeIso = instructorLeaveTimeIso
          participant.timeOut = instructorLeaveTime
          participant.timeoutSynchronized = true // Mark as synchronized
          console.log(
            `✅ Synchronized time out for participant: ${
              participant.name || 'Unknown'
            } (was still in meeting)`
          )
        }
      }
    }

    // Process each participant
    const attendanceRecords = []
    const unmatchedParticipantsLog = []
    const emittedRows = []
    let cachedSubjectSessionIds = null
    let cachedSubjectSessionIdsExcludingCurrent = null
    const tardinessCountCache = new Map()
    let attendanceWarnings = [] // Initialize warnings array for the entire request

    for (
      let participantIndex = 0;
      participantIndex < participants.length;
      participantIndex++
    ) {
      const participant = participants[participantIndex]
      const participantName = (participant.name || '').trim() || 'Unknown'
      const nameParts = participantName.split(/\s+/)
      const [firstName = 'Unknown', ...restName] = nameParts
      const lastName = restName.join(' ') || 'User'
      const normalizedParticipantName = normalizeNameKey(participantName)

      // Attempt to resolve participant using roster indexes before falling back to DB queries
      let user = null
      if (participant.participantId) {
        const participantIdStr = participant.participantId.toString()
        user = rosterIndexes.byId.get(participantIdStr) || null
      }
      if (!user && participant.email) {
        user =
          rosterIndexes.byEmail.get(participant.email.trim().toLowerCase()) ||
          null
      }
      if (!user && participant.studentId) {
        user =
          rosterIndexes.byStudentId.get(
            String(participant.studentId).toLowerCase()
          ) || null
      }
      if (!user && normalizedParticipantName) {
        user = rosterIndexes.byName.get(normalizedParticipantName) || null
      }

      let hasDuplicateName = false
      let potentialMatches = []

      if (!user && participant.participantId) {
        user = await User.findById(participant.participantId).catch(() => null)
      }

      if (!user) {
        user = await User.findOne({
          firstName: { $regex: new RegExp(`^${firstName}`, 'i') },
          lastName: { $regex: new RegExp(`^${lastName}`, 'i') }
        })

        if (user) {
          const duplicateUsers = await User.find({
            firstName: { $regex: new RegExp(`^${firstName}`, 'i') },
            lastName: { $regex: new RegExp(`^${lastName}`, 'i') }
          }).select('_id firstName lastName studentId email')

          if (duplicateUsers.length > 1) {
            hasDuplicateName = true
            potentialMatches = duplicateUsers.map(duplicateUser => ({
              userId: duplicateUser._id,
              firstName: duplicateUser.firstName,
              lastName: duplicateUser.lastName,
              studentId: duplicateUser.studentId || null,
              email: duplicateUser.email
            }))
          }
        }
      }

      if (!user) {
        // DO NOT auto-create users - this creates data integrity issues
        // Instead, log the issue and skip this participant
        console.warn(`⚠️ User not found in database: ${participantName}`)
        console.warn(
          `   Skipping attendance record for unknown user. They must be registered in NE-Attend first.`
        )

        // Add warning to response
        attendanceWarnings.push({
          type: 'USER_NOT_FOUND',
          participantName: participantName,
          message: `User "${participantName}" not found in database. Attendance not recorded. Please register this user in NE-Attend.`
        })

        unmatchedParticipantsLog.push({
          name: participantName,
          meetParticipantId: participant.participantId || null,
          joinTime: joinTime || null,
          leaveTime: leaveTime || null,
          durationSeconds,
          recordedAt: new Date()
        })

        // Skip this participant - don't create attendance record
        continue
      }

      // Ensure participant belongs to the authorized subject (instructor or approved member)
      // CRITICAL FIX: For unauthenticated submissions, bypass enrollment check
      // This allows attendance records to be created even without subject verification
      const userIdString = user._id.toString()
      const isSubjectInstructor =
        subject &&
        subject.instructorId &&
        userIdString === subject.instructorId.toString()

      // CRITICAL FIX: Skip enrollment check for unauthenticated submissions
      // Unauthenticated submissions have no subject to verify against
      if (
        !isUnauthenticatedSubmission &&
        !approvedMemberIds.has(userIdString) &&
        !isSubjectInstructor
      ) {
        console.warn(
          `⚠️ User ${participantName} is not enrolled in subject ${
            subject?.subjectName || subject?._id || 'unknown'
          }. Skipping attendance entry.`
        )
        attendanceWarnings.push({
          type: 'USER_NOT_IN_SUBJECT',
          participantName: participantName,
          message: `User "${participantName}" is not enrolled in this subject. Attendance entry skipped.`
        })
        unmatchedParticipantsLog.push({
          name: participantName,
          meetParticipantId: participant.participantId || null,
          joinTime: joinTime || null,
          leaveTime: leaveTime || null,
          durationSeconds,
          recordedAt: new Date()
        })
        continue
      }

      // Log when unauthenticated submission bypasses enrollment check
      if (isUnauthenticatedSubmission) {
        console.log(
          `✅ Unauthenticated submission - bypassing enrollment check for ${participantName}`
        )
      }

      // Get existing attendance for this session (needed early for firstJoinTime in tardiness calculation)
      const existingAttendance = await Attendance.findOne({
        sessionId: session._id,
        userId: user._id
      })

      // Initialize firstJoinTime from existing attendance (needed for tardiness calculation)
      let firstJoinTime = existingAttendance?.firstJoinTime || null

      const joinDate =
        toIsoWithBase(
          participant.joinTimeIso || participant.timeIn || participant.joinTime,
          sessionDate
        ) || null
      const leaveDate =
        toIsoWithBase(
          participant.leaveTimeIso ||
            participant.timeOut ||
            participant.leaveTime,
          sessionDate
        ) || null

      // Ensure joinTime is properly set - prioritize existing values, then format from joinDate
      const joinTime =
        participant.timeIn ||
        participant.joinTime ||
        formatHmsFromDate(joinDate) ||
        null
      const leaveTime =
        participant.timeOut ||
        participant.leaveTime ||
        formatHmsFromDate(leaveDate) ||
        null

      // Debug logging for time fields
      if (joinDate || joinTime) {
        console.log(`⏰ Time fields for ${participantName}:`)
        console.log(
          `   joinDate: ${joinDate ? joinDate.toISOString() : 'null'}`
        )
        console.log(`   joinTime: ${joinTime || 'null'}`)
        console.log(`   leaveTime: ${leaveTime || 'null'}`)
      }
      const durationSeconds =
        typeof participant.attendedDuration === 'number' &&
        !Number.isNaN(participant.attendedDuration)
          ? participant.attendedDuration
          : 0

      const rawStatus = deriveParticipantStatus(participant)
      const _statusLabel = formatStatusLabel(rawStatus)

      // Calculate tardiness using 25% rule
      // Use firstJoinTime for tardiness calculation, not return time
      // If instructor is late, students should not be marked tardy until instructor arrives
      const firstJoinTimeForTardiness = firstJoinTime || joinDate
      const attendanceForTardiness = {
        joinTime: firstJoinTimeForTardiness
          ? formatHmsFromDate(firstJoinTimeForTardiness)
          : joinTime || null,
        joinTimeIso: firstJoinTimeForTardiness
          ? firstJoinTimeForTardiness.toISOString()
          : joinDate
          ? joinDate.toISOString()
          : null
      }

      // If instructor is late and student left before first third, don't mark as absent
      let shouldCountAsAbsent = true
      if (instructorLate && session.firstThirdThreshold && leaveDate) {
        if (leaveDate < session.firstThirdThreshold) {
          shouldCountAsAbsent = false // Student left before first third, but instructor was late
        }
      }

      // Calculate tardiness: if instructor is late, adjust threshold based on instructor join time
      const tardinessContext = {
        lateRuleTime: 15,
        tardinessThresholdPercent: 0.25,
        instructorJoinTime: session.instructorJoinTime || null,
        scheduledStartTime: scheduledStartTime || session.startTime,
        scheduledEndTime: scheduledEndTime || session.endTime
      }

      const sessionForTardiness = {
        ...session.toObject(),
        startTime: tardinessContext.scheduledStartTime,
        endTime: tardinessContext.scheduledEndTime
      }

      const tardinessResult = calculateTardiness(
        sessionForTardiness,
        attendanceForTardiness,
        tardinessContext
      )

      if (
        participant.timeoutSynchronized ||
        existingAttendance?.timeoutSynchronized
      ) {
        synchronizedParticipantUserIds.add(user._id.toString())
      }

      // Check if this participant is the instructor
      const isInstructor =
        instructorId && user._id.toString() === instructorId.toString()

      // Track leave/return cycles and accumulate duration
      let leaveCount = existingAttendance?.leaveCount || 0
      let returnCount = existingAttendance?.returnCount || 0
      let lastLeaveTime = existingAttendance?.lastLeaveTime || null
      let lastReturnTime = existingAttendance?.lastReturnTime || null
      let isCurrentlyInMeeting =
        existingAttendance?.isCurrentlyInMeeting || false
      let totalDurationSeconds = existingAttendance?.totalDurationSeconds || 0

      // Track first join time (for tardiness calculation)
      if (joinDate && !firstJoinTime) {
        firstJoinTime = joinDate
        console.log(
          `⏰ First join time recorded for ${participantName}: ${firstJoinTime.toISOString()}`
        )
      }

      // Determine if student left or returned
      const hasLeaveTime = leaveDate !== null
      const hasJoinTime = joinDate !== null
      // Check if participant was synchronized (still in meeting when instructor left)
      const wasSynchronized =
        synchronizedParticipantUserIds.has(user._id.toString()) ||
        participant.timeoutSynchronized ||
        existingAttendance?.timeoutSynchronized

      // Simplified state tracking: determine current meeting state based on most recent event
      // State transitions are explicit: join -> in meeting, leave -> not in meeting
      // If synchronized, meeting ended so student is no longer in meeting
      let isNowInMeeting = false

      if (wasSynchronized) {
        // Meeting ended - student was synchronized but meeting is over
        isNowInMeeting = false
      } else if (hasJoinTime && !hasLeaveTime) {
        // Has join time but no leave time - currently in meeting
        isNowInMeeting = true
      } else if (hasJoinTime && hasLeaveTime && leaveDate > joinDate) {
        // Has both join and leave, but leave is after join - might still be in meeting
        // Check if this is a return (join after previous leave)
        if (lastLeaveTime && joinDate > lastLeaveTime) {
          // This is a return - currently in meeting
          isNowInMeeting = true
        } else if (!lastLeaveTime) {
          // First join, leave time is after join - not in meeting (left)
          isNowInMeeting = false
        } else {
          // Leave is after join but before return - not in meeting
          isNowInMeeting = false
        }
      } else {
        // Default: use existing state or false
        isNowInMeeting = isCurrentlyInMeeting && !hasLeaveTime
      }

      // Update wasInMeeting for leave/return tracking
      const _wasInMeeting =
        isCurrentlyInMeeting || (wasSynchronized && !hasLeaveTime)

      // Handle state transitions based on explicit join/leave events
      // Simplified logic: track state changes explicitly

      // Handle leave event (actual leave, not synchronized)
      if (hasLeaveTime && !wasSynchronized && isCurrentlyInMeeting) {
        leaveCount += 1
        lastLeaveTime = leaveDate
        isCurrentlyInMeeting = false
        console.log(
          `📤 Student ${participantName} left the meeting (leave count: ${leaveCount})`
        )

        // Accumulate duration for the segment that just ended
        const segmentStart = lastReturnTime || joinDate || firstJoinTime
        if (segmentStart && leaveDate > segmentStart) {
          const segmentDuration = Math.floor((leaveDate - segmentStart) / 1000)
          // Validate segment duration is positive before adding
          if (segmentDuration > 0) {
            totalDurationSeconds += segmentDuration
            console.log(
              `⏱️ Added segment duration: ${segmentDuration}s (total: ${totalDurationSeconds}s)`
            )
          } else {
            console.warn(
              `⚠️ Invalid segment duration calculated: ${segmentDuration}s (start: ${segmentStart.toISOString()}, end: ${leaveDate.toISOString()})`
            )
          }
        }
      }

      // Handle return event (join after leaving)
      if (
        hasJoinTime &&
        !wasSynchronized &&
        lastLeaveTime &&
        joinDate > lastLeaveTime
      ) {
        returnCount += 1
        lastReturnTime = joinDate
        isCurrentlyInMeeting = true
        console.log(
          `📥 Student ${participantName} returned to meeting (return count: ${returnCount})`
        )
      }

      // Handle first join (no previous leave)
      if (
        hasJoinTime &&
        !existingAttendance &&
        !lastLeaveTime &&
        !wasSynchronized
      ) {
        isCurrentlyInMeeting = true
        lastReturnTime = joinDate
        // Initial duration will be set below
      }

      // Update isCurrentlyInMeeting based on simplified state
      if (!wasSynchronized) {
        isCurrentlyInMeeting = isNowInMeeting
      }

      // Handle synchronized timeout (student was still in meeting when instructor left)
      if (wasSynchronized) {
        isCurrentlyInMeeting = false // Meeting ended
        // If student was in meeting when instructor left, accumulate duration until instructor left
        // Use timestamp-based calculation for accuracy (more reliable than extension's duration)
        // Note: Extension's durationSeconds represents TOTAL cumulative time, not per-segment
        const previousTotalDuration =
          existingAttendance?.totalDurationSeconds || 0

        if (
          lastReturnTime &&
          instructorLeaveTimeIso &&
          instructorLeaveTimeIso > lastReturnTime
        ) {
          // Calculate duration from last return to instructor leave (current active segment)
          const currentSegmentDuration = Math.floor(
            (instructorLeaveTimeIso - lastReturnTime) / 1000
          )
          // Validate segment duration is positive before adding
          if (currentSegmentDuration > 0) {
            totalDurationSeconds =
              previousTotalDuration + currentSegmentDuration
            console.log(
              `⏱️ Added synchronized segment duration: ${currentSegmentDuration}s (total: ${totalDurationSeconds}s)`
            )
          } else {
            console.warn(
              `⚠️ Invalid synchronized segment duration: ${currentSegmentDuration}s. Keeping previous duration.`
            )
            totalDurationSeconds = previousTotalDuration
          }
        } else if (
          !lastLeaveTime &&
          joinDate &&
          instructorLeaveTimeIso &&
          instructorLeaveTimeIso > joinDate
        ) {
          // Student joined and was still in meeting when instructor left (no leave/return cycle)
          // Calculate total duration from first join to instructor leave
          const totalMeetingDuration = Math.floor(
            (instructorLeaveTimeIso - joinDate) / 1000
          )
          // Validate duration is positive
          if (totalMeetingDuration > 0) {
            // Use calculated duration (timestamp-based is more accurate for synchronized cases)
            totalDurationSeconds = totalMeetingDuration
            console.log(
              `⏱️ Added synchronized segment duration from join: ${totalMeetingDuration}s (total: ${totalDurationSeconds}s)`
            )
          } else {
            console.warn(
              `⚠️ Invalid total meeting duration: ${totalMeetingDuration}s. Keeping previous duration.`
            )
            totalDurationSeconds = previousTotalDuration
          }
        } else {
          // Fallback: no clear timestamp, keep previous duration
          totalDurationSeconds = previousTotalDuration
        }
      }

      // Update total duration using payload-provided timestamps/metrics only
      // Use explicit comparison instead of Math.max() to avoid masking calculation errors
      if (isCurrentlyInMeeting && !wasSynchronized) {
        // Trust the extension's reported duration to avoid server-side skew
        if (durationSeconds > 0) {
          if (durationSeconds < totalDurationSeconds) {
            // Log warning if duration decreases unexpectedly (could indicate a bug)
            console.warn(
              `⚠️ Duration decreased for ${participantName}: ${totalDurationSeconds}s -> ${durationSeconds}s. Using higher value.`
            )
            // Keep existing duration (don't decrease)
          } else {
            totalDurationSeconds = durationSeconds
          }
        }
      } else if (!existingAttendance && hasJoinTime && durationSeconds > 0) {
        // First join - initialize duration from payload
        totalDurationSeconds = durationSeconds
      } else if (
        !isCurrentlyInMeeting &&
        !wasSynchronized &&
        durationSeconds > 0
      ) {
        // Explicit comparison instead of Math.max() to detect potential bugs
        if (durationSeconds < totalDurationSeconds) {
          console.warn(
            `⚠️ Duration decreased for ${participantName}: ${totalDurationSeconds}s -> ${durationSeconds}s. Using higher value.`
          )
          // Keep existing duration (don't decrease)
        } else {
          totalDurationSeconds = durationSeconds
        }
      } else if (!isCurrentlyInMeeting && !wasSynchronized) {
        totalDurationSeconds = existingAttendance?.totalDurationSeconds || 0
      }

      // Ensure instructor also accumulates duration properly (same as students)
      if (
        isInstructor &&
        hasJoinTime &&
        !existingAttendance &&
        durationSeconds > 0
      ) {
        totalDurationSeconds = durationSeconds
      }

      // Calculate total tardiness count - will be updated after status determination
      // We'll calculate this after finalStatus is determined to handle pending status correctly
      let totalTardinessCount = 0

      // Get instructorId from subject if available
      let instructorIdForRecord = null
      if (subject && subject.instructorId) {
        instructorIdForRecord = subject.instructorId
      } else if (session.subjectId) {
        // If subject wasn't loaded, fetch it to get instructorId
        const subjectWithInstructor = await Subject.findById(
          session.subjectId
        ).select('instructorId')
        if (subjectWithInstructor && subjectWithInstructor.instructorId) {
          instructorIdForRecord = subjectWithInstructor.instructorId
        }
      }

      // Determine status using simplified utility functions
      const statusResult = determineFinalStatus({
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
      })

      let finalStatus = statusResult.finalStatus
      let pendingSince = statusResult.pendingSince

      // Apply tardiness and instructor lateness rules
      finalStatus = applyStatusRules(finalStatus, {
        isTardy: tardinessResult.isTardy,
        sessionIsDuringAddDrop,
        instructorLate,
        firstThirdThreshold: session.firstThirdThreshold,
        leaveDate
      })

      // Enforce instructor lateness first-third rule (students shouldn't be marked absent)
      if (!shouldCountAsAbsent && finalStatus === 'absent') {
        finalStatus = 'present'
        pendingSince = null
      }

      // Calculate total tardiness count AFTER status determination to handle pending status correctly
      // Only count finalized tardiness (not pending)
      if (session.subjectId) {
        if (!cachedSubjectSessionIds) {
          const allSessions = await Session.find({
            subjectId: session.subjectId
          }).select('_id')
          cachedSubjectSessionIds = allSessions.map(s => s._id)
          cachedSubjectSessionIdsExcludingCurrent =
            cachedSubjectSessionIds.filter(
              id => id.toString() !== session._id.toString()
            )
        }

        const comparableSessionIds =
          cachedSubjectSessionIdsExcludingCurrent || []
        if (comparableSessionIds.length > 0) {
          const cacheKey = user._id.toString()
          if (!tardinessCountCache.has(cacheKey)) {
            const tardyCount = await Attendance.countDocuments({
              userId: user._id,
              sessionId: { $in: comparableSessionIds },
              isTardy: true,
              isExcused: false,
              isDuringAddDrop: false,
              status: { $ne: 'pending' } // Exclude pending status from tardiness count
            })
            tardinessCountCache.set(cacheKey, tardyCount)
          }

          totalTardinessCount = tardinessCountCache.get(cacheKey)
          if (
            tardinessResult.isTardy &&
            !sessionIsDuringAddDrop &&
            finalStatus !== 'pending'
          ) {
            totalTardinessCount += 1
          }
        }
      } else {
        // No subjectId, just count this session if tardy and finalized
        if (
          tardinessResult.isTardy &&
          !sessionIsDuringAddDrop &&
          finalStatus !== 'pending'
        ) {
          totalTardinessCount = 1
        }
      }

      // Phase 3 Task 1: Create or update attendance record with subjectId
      const attendanceData = {
        sessionId: session._id,
        userId: user._id,
        subjectId: session.subjectId || subjectIdFinal || null, // Phase 3 Task 1: Inherit subjectId from session
        instructorId: instructorIdForRecord || undefined, // Set instructorId if available
        studentName:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
          participantName, // Snapshot of student name
        // IMPORTANT: Never overwrite an existing time with null.
        // Some extension payloads contain leaveTime but omit joinTime; in that case we must preserve
        // the already-recorded joinTime/firstJoinTime so Session History can display Time In.
        joinTime: joinTime || existingAttendance?.joinTime || null,
        leaveTime: leaveTime || existingAttendance?.leaveTime || null,
        duration: totalDurationSeconds, // Sync with totalDurationSeconds for consistency
        status: finalStatus,
        // Leave/return cycle tracking
        leaveCount: leaveCount,
        returnCount: returnCount,
        lastLeaveTime: lastLeaveTime,
        lastReturnTime: lastReturnTime,
        isCurrentlyInMeeting: isCurrentlyInMeeting,
        totalDurationSeconds: totalDurationSeconds,
        // First join tracking (for tardiness calculation)
        firstJoinTime:
          firstJoinTime || existingAttendance?.firstJoinTime || null,
        timeToEnterSeconds: computeTimeToEnterSeconds(
          session.startTime,
          firstJoinTime || joinDate
        ),
        isVerifiedParticipant: true,
        // Timeout synchronization tracking
        timeoutSynchronized:
          wasSynchronized || existingAttendance?.timeoutSynchronized || false,
        // Pending status tracking
        pendingSince: pendingSince,
        // Tardiness tracking
        isTardy:
          tardinessResult.isTardy &&
          !sessionIsDuringAddDrop &&
          finalStatus !== 'pending', // Only mark as tardy if not during add/drop and not pending
        tardinessCount: totalTardinessCount, // Store cumulative count
        isDuringAddDrop: sessionIsDuringAddDrop,
        isExcused: existingAttendance?.isExcused || false // Preserve existing excused status
      }

      let attendance
      try {
        // Phase 3 Task 1: Ensure Attendance records inherit subjectId from session
        const attendanceSubjectId = session.subjectId || subjectIdFinal || null
        console.log('📋 === CREATING/UPDATING ATTENDANCE RECORD ===')
        console.log('   User:', user.firstName, user.lastName)
        console.log('   Session ID:', session._id)
        console.log('   Session subjectId:', session.subjectId)
        console.log('   Attendance subjectId:', attendanceSubjectId)
        if (!attendanceSubjectId) {
          console.warn(
            '   ⚠️ WARNING: Attendance record will have null subjectId'
          )
          console.warn('   💡 This is expected for unauthenticated submissions')
        } else {
          console.log('   ✅ Attendance record will have subjectId set')
        }

        attendance = await Attendance.findOneAndUpdate(
          { sessionId: session._id, userId: user._id },
          attendanceData,
          { upsert: true, new: true }
        )

        if (!attendance) {
          console.error(
            `❌ Attendance update returned null for user: ${user._id}`
          )
          continue // Skip this record
        }

        // Phase 3 Task 1: Verify subjectId is set in both Session and Attendance (for History filtering)
        console.log('📋 === ATTENDANCE RECORD SAVED ===')
        console.log('   Attendance ID:', attendance._id)
        console.log('   Session ID:', session._id)
        console.log('   Session subjectId:', session.subjectId)
        console.log('   Attendance subjectId:', attendance.subjectId)
        console.log('   Status:', attendanceData.status || 'N/A')
        console.log(
          `   ⏱️ Duration: ${totalDurationSeconds}s (from extension: ${durationSeconds}s)`
        )

        if (session && session.subjectId) {
          console.log(`✅ Session has subjectId: ${session.subjectId}`)
          if (attendance.subjectId) {
            console.log(`✅ Attendance has subjectId: ${attendance.subjectId}`)
            if (
              attendance.subjectId.toString() === session.subjectId.toString()
            ) {
              console.log(
                '   ✅ SubjectId matches between Session and Attendance'
              )
            } else {
              console.warn(
                '   ⚠️ WARNING: SubjectId mismatch between Session and Attendance!'
              )
            }
          } else {
            console.warn(
              '   ⚠️ WARNING: Attendance record missing subjectId even though Session has it!'
            )
            console.warn('   💡 This may cause History filtering issues')
          }
        } else {
          console.warn(`⚠️ Session missing subjectId!`)
          console.warn(`   💡 This is expected for unauthenticated submissions`)
          console.warn(
            `   💡 History will show warning for unauthenticated records`
          )
        }

        attendanceRecords.push(attendance)
      } catch (dbError) {
        console.error(
          `❌ Database error saving attendance for user ${user._id}:`,
          dbError
        )
        // Add warning but continue processing other participants
        attendanceWarnings.push({
          type: 'DATABASE_SAVE_FAILED',
          participantName: participantName,
          userId: user._id.toString(),
          message: `Failed to save attendance record: ${dbError.message}`
        })
        continue // Skip this record and continue with others
      }

      // Use final status for status label
      const finalStatusLabel = formatStatusLabel(finalStatus)

      emittedRows.push({
        userId: user._id,
        userName:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
          participantName,
        studentId: user.studentId || null,
        durationSeconds: attendance.totalDurationSeconds || durationSeconds, // Use total duration
        joinTime: attendance.joinTime || joinTime,
        joinTimeIso: joinDate
          ? joinDate.toISOString()
          : participant.joinTimeIso || null,
        leaveTime: attendance.leaveTime || leaveTime,
        leaveTimeIso: leaveDate
          ? leaveDate.toISOString()
          : participant.leaveTimeIso || null,
        status: finalStatusLabel,
        rawStatus: finalStatus, // Use final status as raw status
        isTardy: attendance.isTardy || false,
        tardinessCount: attendance.tardinessCount || 0,
        meetCode,
        sessionDate: session.sessionDate
          ? session.sessionDate.toISOString()
          : sessionDate.toISOString(),
        hasDuplicateName: hasDuplicateName,
        potentialMatches: hasDuplicateName ? potentialMatches : [],
        // Include tracking fields for real-time updates
        isCurrentlyInMeeting: attendance.isCurrentlyInMeeting || false,
        leaveCount: attendance.leaveCount || 0,
        returnCount: attendance.returnCount || 0,
        totalDurationSeconds: attendance.totalDurationSeconds || 0
      })
    }

    if (unmatchedParticipantsLog.length > 0) {
      try {
        await Session.findByIdAndUpdate(session._id, {
          $push: {
            unmatchedParticipants: {
              $each: unmatchedParticipantsLog,
              $slice: -MAX_UNMATCHED_HISTORY
            }
          }
        })
      } catch (unmatchedError) {
        console.error(
          '❌ Failed to record unmatched participants:',
          unmatchedError
        )
      }
    }

    // Auto-finalize pending statuses when instructor leaves OR when instructor detection fails
    // Fallback: If instructor not detected, finalize pending statuses based on meeting duration threshold (30 minutes)
    const shouldFinalizePending =
      (instructorLeaveTimeIso && session.meetingEnded) || // Instructor left (normal case)
      (instructorDetectionFailed && session.startTime && session.endTime) // Instructor detection failed - use meeting duration

    // Check if meeting has exceeded reasonable duration threshold (30 minutes after scheduled end or last activity)
    const MEETING_TIMEOUT_MINUTES = 30
    const meetingDurationThreshold = session.endTime
      ? new Date(
          session.endTime.getTime() + MEETING_TIMEOUT_MINUTES * 60 * 1000
        )
      : null
    const now = new Date()
    const hasExceededTimeout =
      meetingDurationThreshold && now > meetingDurationThreshold

    if (shouldFinalizePending || hasExceededTimeout) {
      const reason =
        instructorLeaveTimeIso && session.meetingEnded
          ? 'instructor left'
          : hasExceededTimeout
          ? 'meeting timeout exceeded'
          : 'instructor detection failed'
      console.log(
        `🔄 Auto-finalizing pending attendance records (${reason})...`
      )

      // Find all pending attendance records for this session
      // Include both records NOT in current batch AND records in current batch that are still pending
      const processedUserIds = new Set(
        attendanceRecords.map(a => a.userId.toString())
      )
      const pendingAttendancesNotInBatch = await Attendance.find({
        sessionId: session._id,
        status: 'pending',
        userId: { $nin: Array.from(processedUserIds) }
      })

      // Also check records in current batch that might still be pending
      const pendingAttendancesInBatch = attendanceRecords.filter(
        a => a.status === 'pending'
      )

      // Combine both sets
      const pendingAttendances = [
        ...pendingAttendancesNotInBatch,
        ...pendingAttendancesInBatch
      ]

      let cachedSubjectForFinalize = null
      const getSubjectForFinalize = async () => {
        if (!session.subjectId) return null
        if (cachedSubjectForFinalize) return cachedSubjectForFinalize
        cachedSubjectForFinalize = await Subject.findById(session.subjectId)
        return cachedSubjectForFinalize
      }

      // Finalize each pending attendance record
      // Improved logic to handle all leave/return scenarios including rapid cycles
      for (const attendance of pendingAttendances) {
        let finalStatus = 'absent' // Default to absent if student didn't return

        // Priority 1: Check if student had synchronized timeout (was still in meeting when instructor left)
        if (attendance.timeoutSynchronized) {
          // Student was still in meeting when instructor left - mark as present
          finalStatus = 'present'
        }
        // Priority 2: Check if student is currently in meeting (most recent state)
        else if (attendance.isCurrentlyInMeeting) {
          // Student is currently in meeting - should be present
          finalStatus = 'present'
        }
        // Priority 3: Check if student returned after leaving (handles rapid cycles)
        else if (attendance.lastReturnTime && attendance.lastLeaveTime) {
          // Check if student returned after their last leave (handles multiple cycles)
          if (attendance.lastReturnTime > attendance.lastLeaveTime) {
            // Student returned - check if they should be present or late
            // If they have sufficient duration, mark as present
            if (attendance.totalDurationSeconds > 0) {
              // Check tardiness if needed - use firstJoinTime instead of lastReturnTime
              const subjectForFinalize = await getSubjectForFinalize()
              if (subjectForFinalize) {
                const attendanceForTardiness = {
                  joinTime: attendance.joinTime,
                  joinTimeIso: attendance.firstJoinTime
                    ? attendance.firstJoinTime.toISOString()
                    : attendance.lastReturnTime
                    ? attendance.lastReturnTime.toISOString()
                    : null
                }
                const scheduleStartFinalize = subjectForFinalize?.schedule
                  ?.startTime
                  ? mergeScheduleTime(
                      parseSessionDay(
                        session.startTime || session.sessionDate || new Date()
                      ),
                      subjectForFinalize.schedule.startTime
                    )
                  : null
                const scheduleEndFinalize = subjectForFinalize?.schedule
                  ?.endTime
                  ? mergeScheduleTime(
                      parseSessionDay(
                        session.startTime || session.sessionDate || new Date()
                      ),
                      subjectForFinalize.schedule.endTime
                    )
                  : null

                const tardinessContextFinalize = {
                  lateRuleTime: 15,
                  tardinessThresholdPercent: 0.25,
                  instructorJoinTime: session.instructorJoinTime || null,
                  scheduledStartTime:
                    scheduleStartFinalize || session.startTime,
                  scheduledEndTime: scheduleEndFinalize || session.endTime
                }

                const sessionForTardinessFinalize = {
                  ...session.toObject(),
                  startTime: tardinessContextFinalize.scheduledStartTime,
                  endTime: tardinessContextFinalize.scheduledEndTime
                }

                const tardinessResultFinalize = calculateTardiness(
                  sessionForTardinessFinalize,
                  attendanceForTardiness,
                  tardinessContextFinalize
                )

                if (
                  tardinessResultFinalize.isTardy &&
                  !attendance.isDuringAddDrop
                ) {
                  finalStatus = 'late'
                } else {
                  finalStatus = 'present'
                }
              } else {
                finalStatus = 'present'
              }
            } else {
              finalStatus = 'absent' // No duration means they didn't actually attend
            }
          } else {
            // Student left and never returned - absent
            finalStatus = 'absent'
          }
        }
        // Priority 4: Check if student has join time but no leave/return cycle
        else if (attendance.firstJoinTime || attendance.lastReturnTime) {
          // Student joined at some point - check duration and tardiness
          if (attendance.totalDurationSeconds > 0) {
            const subjectForFinalize = await getSubjectForFinalize()
            if (subjectForFinalize) {
              const attendanceForTardiness = {
                joinTime: attendance.joinTime,
                joinTimeIso: attendance.firstJoinTime
                  ? attendance.firstJoinTime.toISOString()
                  : null
              }
              const scheduleStartFinalize = subjectForFinalize?.schedule
                ?.startTime
                ? mergeScheduleTime(
                    parseSessionDay(
                      session.startTime || session.sessionDate || new Date()
                    ),
                    subjectForFinalize.schedule.startTime
                  )
                : null
              const scheduleEndFinalize = subjectForFinalize?.schedule?.endTime
                ? mergeScheduleTime(
                    parseSessionDay(
                      session.startTime || session.sessionDate || new Date()
                    ),
                    subjectForFinalize.schedule.endTime
                  )
                : null

              const tardinessContextFinalize = {
                lateRuleTime: 15,
                tardinessThresholdPercent: 0.25,
                instructorJoinTime: session.instructorJoinTime || null,
                scheduledStartTime: scheduleStartFinalize || session.startTime,
                scheduledEndTime: scheduleEndFinalize || session.endTime
              }

              const sessionForTardinessFinalize = {
                ...session.toObject(),
                startTime: tardinessContextFinalize.scheduledStartTime,
                endTime: tardinessContextFinalize.scheduledEndTime
              }

              const tardinessResultFinalize = calculateTardiness(
                sessionForTardinessFinalize,
                attendanceForTardiness,
                tardinessContextFinalize
              )

              if (
                tardinessResultFinalize.isTardy &&
                !attendance.isDuringAddDrop
              ) {
                finalStatus = 'late'
              } else {
                finalStatus = 'present'
              }
            } else {
              finalStatus = 'present'
            }
          } else {
            finalStatus = 'absent'
          }
        }
        // Default: absent (no join time or insufficient duration)

        // Update attendance record with final status
        attendance.status = finalStatus
        attendance.isCurrentlyInMeeting = false // Meeting has ended
        attendance.pendingSince = null // Clear pending timestamp
        await attendance.save()

        console.log(
          `✅ Auto-finalized attendance for user ${attendance.userId}: ${finalStatus}`
        )
      }

      // If instructor detection failed, also update session to mark meeting as ended
      if (instructorDetectionFailed && !session.meetingEnded) {
        try {
          const updateResult = await Session.findByIdAndUpdate(
            session._id,
            {
              $set: {
                meetingEnded: true,
                status: 'completed' // Also update status to completed
              }
            },
            { new: true }
          )

          if (updateResult) {
            session.meetingEnded = true
            session.status = 'completed'
            console.log(
              `✅ Updated session ${session._id} to completed (instructor detection failed)`
            )
          } else {
            console.warn(
              `⚠️ Session update returned null for meeting end (instructor detection failed)`
            )
          }
        } catch (dbError) {
          console.error(
            `❌ Database error updating session meeting end:`,
            dbError
          )
        }
      }
    }

    // Emit realtime update with comprehensive error handling
    try {
      const io = req.app.get('io')
      if (io) {
        // Load subject information for emission (if not already loaded)
        let subjectForEmission = subject
        if (!subjectForEmission && session.subjectId) {
          subjectForEmission = await Subject.findById(session.subjectId).select(
            'subjectName'
          )
        }

        // Prepare common payload fields for room-based broadcasting
        const targetSubjectId = session.subjectId || subjectIdFinal
        const targetSubjectName = subjectForEmission?.subjectName || null
        const targetMeetCode = session.meetCode || meetCode
        const sessionDateIso = session.sessionDate
          ? session.sessionDate.toISOString()
          : sessionDate
          ? new Date(sessionDate).toISOString()
          : new Date().toISOString()

        // Determine room name for room-based broadcasting
        const roomName = targetSubjectId
          ? `subject:${targetSubjectId.toString()}`
          : null

        // If instructor left, emit two updates: first "left meeting" (UI transition), then final status (persisted)
        if (instructorLeaveTimeIso && session.meetingEnded) {
          // Phase 1: Show "Left Meeting" status for UI transition effect
          const leftMeetingRows = emittedRows.map(row => ({
            ...row,
            status: 'Left Meeting',
            rawStatus: 'left',
            statusTransition: 'leaving' // Indicate this is a transition state
          }))

          const leftMeetingPayload = {
            type: 'attendance_saved',
            sessionId: session._id,
            attendance: leftMeetingRows,
            timestamp: new Date().toISOString(),
            meetingEnded: true,
            instructorLeaveTime: session.instructorLeaveTime || null,
            statusTransition: 'leaving', // Indicate transition in progress
            subjectId: targetSubjectId,
            subjectName: targetSubjectName,
            meetCode: targetMeetCode,
            sessionDate: sessionDateIso
          }

          try {
            if (roomName) {
              io.to(roomName).emit('attendance:update', leftMeetingPayload)
              console.log(
                `📡 Successfully emitted left meeting status update to room: ${roomName}`
              )
            } else {
              // Fallback to catch-all room for unauthenticated updates
              const catchAllRoom = 'subject:unauthenticated'
              io.to(catchAllRoom).emit('attendance:update', leftMeetingPayload)
              console.log(
                `📡 Successfully emitted left meeting status update to catch-all room: ${catchAllRoom} (no subjectId)`
              )
            }
          } catch (emitError) {
            console.error(
              '❌ Failed to emit left meeting status update:',
              emitError
            )
          }

          // Phase 2: Emit final status IMMEDIATELY (already persisted in auto-finalization above)
          // This ensures clients receive final status even if server crashes before timeout
          // The timeout below is only for UI transition effect, not for data persistence
          const finalStatusRows = emittedRows.map(row => {
            // Find the corresponding attendance record (already finalized above)
            const attendanceRecord = attendanceRecords.find(
              a => a.userId.toString() === row.userId.toString()
            )

            // Use the final status from the attendance record (already persisted)
            if (attendanceRecord) {
              const finalStatus = attendanceRecord.status || row.rawStatus
              const finalStatusLabel = formatStatusLabel(finalStatus)

              return {
                ...row,
                status: finalStatusLabel,
                rawStatus: finalStatus,
                statusTransition: 'finalized' // Indicate this is the final state
              }
            }
            // Fallback to original row if attendance record not found
            return {
              ...row,
              statusTransition: 'finalized'
            }
          })

          const finalizedPayload = {
            type: 'attendance_saved',
            sessionId: session._id,
            attendance: finalStatusRows,
            timestamp: new Date().toISOString(),
            meetingEnded: true,
            instructorLeaveTime: session.instructorLeaveTime || null,
            statusTransition: 'finalized', // Indicate transition complete
            subjectId: targetSubjectId,
            subjectName: targetSubjectName,
            meetCode: targetMeetCode,
            sessionDate: sessionDateIso
          }

          try {
            if (roomName) {
              io.to(roomName).emit('attendance:update', finalizedPayload)
              console.log(
                `📡 Successfully emitted finalized status update to room: ${roomName}`
              )
            } else {
              // Fallback to catch-all room for unauthenticated updates
              const catchAllRoom = 'subject:unauthenticated'
              io.to(catchAllRoom).emit('attendance:update', finalizedPayload)
              console.log(
                `📡 Successfully emitted finalized status update to catch-all room: ${catchAllRoom} (no subjectId)`
              )
            }
          } catch (emitError) {
            console.error(
              '❌ Failed to emit finalized status update:',
              emitError
            )
          }

          // Phase 3: Delayed emission for UI transition effect (optional, non-critical)
          // This is only for visual effect - data is already persisted and emitted above
          timeoutManager.setTimeout({
            sessionId: session._id,
            delay: 1500,
            callback: () => {
              // Re-emit final status for any clients that might have missed it
              // This is a safety net, not required for data consistency
              try {
                if (roomName) {
                  io.to(roomName).emit('attendance:update', finalizedPayload)
                  console.log(
                    `📡 Successfully emitted delayed finalized status update to room: ${roomName}`
                  )
                } else {
                  // Fallback to catch-all room for unauthenticated updates
                  const catchAllRoom = 'subject:unauthenticated'
                  io.to(catchAllRoom).emit(
                    'attendance:update',
                    finalizedPayload
                  )
                  console.log(
                    `📡 Successfully emitted delayed finalized status update to catch-all room: ${catchAllRoom} (no subjectId)`
                  )
                }
              } catch (emitError) {
                console.error(
                  '❌ Failed to emit delayed finalized status update:',
                  emitError
                )
              }
            }
          })
        } else {
          // Normal emission when instructor hasn't left
          const normalPayload = {
            type: 'attendance_saved',
            sessionId: session._id,
            attendance: emittedRows,
            timestamp: new Date().toISOString(),
            meetingEnded: session.meetingEnded || false,
            instructorLeaveTime: session.instructorLeaveTime || null,
            subjectId: targetSubjectId,
            subjectName: targetSubjectName,
            meetCode: targetMeetCode,
            sessionDate: sessionDateIso
          }

          try {
            if (roomName) {
              io.to(roomName).emit('attendance:update', normalPayload)
              console.log(
                `📡 Successfully emitted normal attendance update to room: ${roomName}`
              )
            } else {
              // Fallback to catch-all room for unauthenticated updates
              const catchAllRoom = 'subject:unauthenticated'
              io.to(catchAllRoom).emit('attendance:update', normalPayload)
              console.log(
                `📡 Successfully emitted normal attendance update to catch-all room: ${catchAllRoom} (no subjectId)`
              )
            }
          } catch (emitError) {
            console.error(
              '❌ Failed to emit normal attendance update:',
              emitError
            )
          }
        }
      }
    } catch (e) {
      console.error('❌ Error in realtime update emission:', e)
    }

    // After successfully persisting attendance, expire/consume all tokens tied to this session
    try {
      await expireTokensForSession({
        sessionId: session._id,
        consumedBy: req.auth?.userId || req.auth?._id || null
      })
    } catch (tokenError) {
      console.warn(
        '⚠️ Failed to expire attendance tokens for session:',
        session._id?.toString?.() || session._id,
        tokenError.message
      )
    }

    // Build response with warnings if instructor detection had issues
    const response = {
      success: true,
      message: 'Attendance data saved successfully',
      sessionId: session._id,
      attendanceCount: attendanceRecords.length,
      attendance: emittedRows
    }

    // Combine all warnings
    const allWarnings = []

    if (instructorDetectionWarnings.length > 0) {
      allWarnings.push(...instructorDetectionWarnings)
    }

    if (
      typeof attendanceWarnings !== 'undefined' &&
      attendanceWarnings.length > 0
    ) {
      allWarnings.push(...attendanceWarnings)
    }

    // Add warnings to response if any exist
    if (allWarnings.length > 0) {
      response.warnings = allWarnings
      response.instructorDetectionFailed = instructorDetectionFailed

      // Add user-friendly warning message
      const userNotFoundWarnings = allWarnings.filter(
        w => w.type === 'USER_NOT_FOUND'
      )
      if (instructorDetectionFailed) {
        response.warningMessage =
          'WARNING: Instructor was not detected in the meeting. Meeting end tracking is unavailable and attendance records may be incomplete.'
      } else if (userNotFoundWarnings.length > 0) {
        response.warningMessage = `WARNING: ${userNotFoundWarnings.length} participant(s) not found in database and were skipped. Please register all participants in NE-Attend.`
      } else {
        response.warningMessage =
          'Attendance saved with warnings. Please review.'
      }
    }

    res.json(response)
  } catch (error) {
    console.error('❌ Error saving attendance:', error)
    // Use standardized error handler for consistent error response format
    handleError(res, error, 'Failed to save attendance data')
  }
})

router.get('/session/:sessionId/summary', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid session id' })
    }

    const session = await Session.findById(sessionId)
      .select(
        'subjectId sessionDate startTime endTime meetCode status attendanceCount'
      )
      .lean()
    if (!session) {
      return res
        .status(404)
        .json({ success: false, error: 'Session not found' })
    }

    if (req.auth.role === 'student') {
      return res.status(403).json({ success: false, error: 'Forbidden' })
    }

    const tokens = await AttendanceToken.find({ sessionId })
      .select(
        'userId validFrom expiresAt consumed consumedAt consumedBy issuedAutomatically'
      )
      .lean()

    const attendanceRecords = await Attendance.find({ sessionId })
      .select('userId status isTardy isVerifiedParticipant')
      .lean()

    const summary = {
      session,
      tokenStats: {
        totalIssued: tokens.length,
        consumed: tokens.filter(t => t.consumed).length,
        automatic: tokens.filter(t => t.issuedAutomatically).length,
        manual: tokens.filter(t => !t.issuedAutomatically).length
      },
      attendanceStats: {
        total: attendanceRecords.length,
        present: attendanceRecords.filter(r => r.status === 'present').length,
        late: attendanceRecords.filter(r => r.status === 'late').length,
        pending: attendanceRecords.filter(r => r.status === 'pending').length
      }
    }

    return res.json({ success: true, data: summary })
  } catch (error) {
    console.error('Error fetching session summary:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/attendance/session/:sessionId/enrolled - Get ALL enrolled students with attendance for a session
// Returns attendance records for ALL enrolled students including those who are absent
// This is used to display complete class roster in Session History
router.get('/session/:sessionId/enrolled', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid session ID' })
    }

    const sessionObjectId = new mongoose.Types.ObjectId(sessionId)

    // 1. Get session with subject info
    const session = await Session.findById(sessionObjectId)
      .populate('subjectId', 'subjectName subjectCode sections')
      .lean()

    if (!session) {
      return res
        .status(404)
        .json({ success: false, error: 'Session not found' })
    }

    if (!session.subjectId) {
      return res.status(400).json({
        success: false,
        error: 'Session has no associated subject',
        message:
          'Cannot determine enrolled students without subject information'
      })
    }

    const subject = session.subjectId
    const sections = subject.sections || []

    // 2. Get ALL enrolled students for this subject (by section matching)
    const enrolledStudents = await User.find({
      role: 'student',
      section: { $in: sections.filter(Boolean) }
    })
      .select(
        '_id firstName lastName email studentId section schoolYear semester'
      )
      .lean()

    console.log(
      `📋 Found ${enrolledStudents.length} enrolled students for subject ${subject.subjectName}`
    )

    // 3. Get all existing attendance records for this session
    const existingAttendance = await Attendance.find({
      sessionId: sessionObjectId
    })
      .populate(
        'userId',
        'firstName lastName email studentId section schoolYear semester role'
      )
      .lean()

    console.log(
      `📋 Found ${existingAttendance.length} existing attendance records`
    )

    // 4. Create a map of userId -> attendance record
    const attendanceByUserId = new Map()
    existingAttendance.forEach(record => {
      if (record.userId) {
        const id = record.userId._id?.toString() || record.userId.toString()
        attendanceByUserId.set(id, record)
      }
    })

    // 5. Build complete roster: enrolled students with their attendance
    const completeRoster = enrolledStudents.map(student => {
      const studentId = student._id.toString()
      const attendanceRecord = attendanceByUserId.get(studentId)

      if (attendanceRecord) {
        // Student has attendance record - use it
        const user = attendanceRecord.userId || {}
        // Parse joinTime to ISO format for frontend display
        // Use firstJoinTime as fallback when joinTime string is not available
        const sessionDateBase = session.sessionDate
          ? new Date(session.sessionDate)
          : new Date()
        sessionDateBase.setHours(0, 0, 0, 0)
        const joinTimeIso = attendanceRecord.joinTime
          ? toIsoWithBase(
              attendanceRecord.joinTime,
              sessionDateBase
            )?.toISOString()
          : attendanceRecord.firstJoinTime
          ? new Date(attendanceRecord.firstJoinTime).toISOString()
          : null
        const leaveTimeIso = attendanceRecord.leaveTime
          ? toIsoWithBase(
              attendanceRecord.leaveTime,
              sessionDateBase
            )?.toISOString()
          : null

        const derivedJoinTimeIso = (() => {
          if (joinTimeIso) return null
          if (!leaveTimeIso) return null
          const durationSeconds =
            attendanceRecord.totalDurationSeconds ||
            attendanceRecord.duration ||
            0
          if (!durationSeconds || durationSeconds <= 0) return null
          const leave = new Date(leaveTimeIso)
          if (Number.isNaN(leave.getTime())) return null
          const derived = new Date(leave.getTime() - durationSeconds * 1000)
          return Number.isNaN(derived.getTime()) ? null : derived.toISOString()
        })()

        return {
          attendanceId: attendanceRecord._id,
          sessionId: sessionObjectId,
          userId: student._id,
          fullName:
            `${user.firstName || student.firstName || ''} ${
              user.lastName || student.lastName || ''
            }`.trim() || 'Unknown',
          studentId: user.studentId || student.studentId,
          email: user.email || student.email,
          section: user.section || student.section,
          schoolYear: user.schoolYear || student.schoolYear,
          semester: user.semester || student.semester,
          status: attendanceRecord.status || 'absent',
          joinTime:
            attendanceRecord.joinTime ||
            (attendanceRecord.firstJoinTime
              ? formatHmsFromDate(new Date(attendanceRecord.firstJoinTime))
              : null) ||
            (derivedJoinTimeIso
              ? formatHmsFromDate(new Date(derivedJoinTimeIso))
              : null),
          joinTimeIso: joinTimeIso || derivedJoinTimeIso,
          firstJoinTime: attendanceRecord.firstJoinTime
            ? attendanceRecord.firstJoinTime.toISOString()
            : null,
          leaveTime: attendanceRecord.leaveTime,
          leaveTimeIso: leaveTimeIso,
          duration:
            attendanceRecord.totalDurationSeconds ||
            attendanceRecord.duration ||
            0,
          isTardy: attendanceRecord.isTardy || false,
          isExcused: attendanceRecord.isExcused || false,
          isVerifiedParticipant: attendanceRecord.isVerifiedParticipant ?? true,
          hasRecord: true
        }
      } else {
        // Student has NO attendance record - they are absent
        return {
          attendanceId: null,
          sessionId: sessionObjectId,
          userId: student._id,
          fullName:
            `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
            'Unknown',
          studentId: student.studentId,
          email: student.email,
          section: student.section,
          schoolYear: student.schoolYear,
          semester: student.semester,
          status: 'absent',
          joinTime: null,
          firstJoinTime: null,
          leaveTime: null,
          duration: 0,
          isTardy: false,
          isExcused: false,
          isVerifiedParticipant: true,
          hasRecord: false
        }
      }
    })

    // 6. Calculate statistics
    const stats = {
      totalEnrolled: enrolledStudents.length,
      present: completeRoster.filter(s => s.status === 'present').length,
      late: completeRoster.filter(s => s.status === 'late').length,
      absent: completeRoster.filter(s => s.status === 'absent').length,
      pending: completeRoster.filter(s => s.status === 'pending').length
    }

    console.log(`📊 Session ${sessionId} attendance stats:`, stats)

    return res.json({
      success: true,
      data: {
        session: {
          _id: session._id,
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          meetCode: session.meetCode,
          status: session.status
        },
        subject: {
          _id: subject._id,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          sections: sections
        },
        students: completeRoster,
        stats
      }
    })
  } catch (error) {
    console.error('Error fetching enrolled attendance:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

router.get(
  '/subject/:subjectId/schedule-window',
  requireAuth,
  async (req, res) => {
    try {
      const { subjectId } = req.params
      if (!mongoose.Types.ObjectId.isValid(subjectId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid subject id' })
      }

      const subjectObjectId = new mongoose.Types.ObjectId(subjectId)
      const lookaheadMinutes = Number(req.query.lookahead || 720)
      const windowStart = new Date()
      const windowEnd = new Date(
        windowStart.getTime() + lookaheadMinutes * 60000
      )

      const sessions = await Session.find({
        subjectId: subjectObjectId,
        startTime: { $gte: windowStart, $lte: windowEnd }
      })
        .select('sessionDate startTime endTime status meetCode attendanceCount')
        .sort({ startTime: 1 })
        .lean()

      const tokenMap = await AttendanceToken.aggregate([
        {
          $match: {
            subjectId: subjectObjectId,
            sessionId: { $in: sessions.map(s => s._id) }
          }
        },
        {
          $group: {
            _id: '$sessionId',
            total: { $sum: 1 },
            consumed: { $sum: { $cond: ['$consumed', 1, 0] } }
          }
        }
      ])

      const tokenStats = tokenMap.reduce((acc, curr) => {
        acc[curr._id.toString()] = curr
        return acc
      }, {})

      const data = sessions.map(session => {
        const stats = tokenStats[session._id.toString()] || {
          total: 0,
          consumed: 0
        }
        return {
          ...session,
          tokens: stats,
          progress: session.attendanceCount || 0
        }
      })

      return res.json({ success: true, data })
    } catch (error) {
      console.error('Error fetching schedule window:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
  }
)

// GET /api/attendance/summary/:subjectId - Get attendance summary for a subject (role-aware)
router.get('/summary/:subjectId', requireAuth, async (req, res) => {
  try {
    const { subjectId } = req.params

    const pipeline = [
      {
        $lookup: {
          from: 'sessions',
          localField: 'sessionId',
          foreignField: '_id',
          as: 'session'
        }
      },
      { $unwind: '$session' },
      ...(subjectId
        ? [
            {
              $match: { 'session.subjectId': subjectId }
            }
          ]
        : []),
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' }
    ]

    if (req.auth?.role === 'instructor') {
      const mongoose = require('mongoose')
      pipeline.unshift({
        $match: { instructorId: new mongoose.Types.ObjectId(req.auth.userId) }
      })
    }

    // Filter out add/drop period absences from counts
    const summaryPipeline = pipeline.concat([
      {
        $match: {
          $or: [
            { 'session.isDuringAddDrop': false },
            { 'session.isDuringAddDrop': { $exists: false } }
          ]
        }
      },
      {
        $group: {
          _id: '$userId',
          firstName: { $first: '$user.firstName' },
          lastName: { $first: '$user.lastName' },
          presentCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'present'] },
                    { $ne: ['$isExcused', true] }
                  ]
                },
                1,
                0
              ]
            }
          },
          lateCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'late'] },
                    { $ne: ['$isExcused', true] }
                  ]
                },
                1,
                0
              ]
            }
          },
          absentCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'absent'] },
                    { $ne: ['$isExcused', true] }
                  ]
                },
                1,
                0
              ]
            }
          },
          tardinessCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isTardy', true] },
                    { $ne: ['$isExcused', true] }
                  ]
                },
                1,
                0
              ]
            }
          },
          totalSessions: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 1,
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          presentCount: 1,
          lateCount: 1,
          absentCount: 1,
          tardinessCount: 1,
          totalSessions: 1,
          attendanceRate: {
            $multiply: [{ $divide: ['$presentCount', '$totalSessions'] }, 100]
          }
        }
      }
    ])

    const summary = await Attendance.aggregate(summaryPipeline)

    // Enrich with consecutive weeks, contact hours, and D/F eligibility
    const enrichedSummary = await Promise.all(
      summary.map(async student => {
        const [consecutiveWeeks, contactHours, dfEligibility] =
          await Promise.all([
            calculateConsecutiveWeeksAbsent(student._id, subjectId),
            calculateContactHoursAbsent(student._id, subjectId),
            checkDFGradeEligibility(student._id, subjectId)
          ])

        return {
          ...student,
          consecutiveWeeksAbsent: consecutiveWeeks.consecutiveWeeks,
          contactHoursAbsentPercentage: contactHours.percentage,
          isDFEligible: dfEligibility.isEligible,
          dfEligibilityReasons: dfEligibility.reasons
        }
      })
    )

    res.json({
      success: true,
      data: enrichedSummary
    })
  } catch (error) {
    console.error('Error fetching attendance summary:', error)
    res.status(500).json({
      error: 'Failed to fetch attendance summary',
      message: error.message
    })
  }
})

// GET /api/attendance/sessions - Get all sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.find()
      .populate('subjectId', 'subjectName')
      .sort({ createdAt: -1 })
      .limit(50)

    res.json({
      success: true,
      data: sessions
    })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    res.status(500).json({
      error: 'Failed to fetch sessions',
      message: error.message
    })
  }
})

// GET /api/attendance/recent - Latest attendance records (role-aware)
// ENHANCED: Increased limit to support displaying ALL enrolled students including absent
router.get('/recent', requireAuth, async (req, res) => {
  try {
    // Increased default limit to 500 and max to 1000 to support larger class rosters
    // This ensures all enrolled students (including absent) are returned
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 1000)

    let query = {}

    // Enhanced filtering for instructors: Filter by Session.subjectId matching instructor's subjects
    // This handles legacy records without instructorId and provides more accurate filtering
    // CRITICAL FIX: Also includes unauthenticated records by matching meetCode to instructor's subjects' meetingLink
    if (req.auth?.role === 'instructor') {
      const instructorId = req.auth.userId

      // Fetch instructor's subjects to get their subjectIds AND meetingLinks
      const instructorSubjects = await Subject.find({
        instructorId: instructorId,
        isActive: { $ne: false }
      })
        .select('_id meetingLink')
        .lean()

      const instructorSubjectIds = instructorSubjects.map(s => s._id)

      // CRITICAL FIX: Extract meetCodes from instructor's subjects' meetingLinks
      // This allows matching unauthenticated sessions (subjectId: null) by meetCode
      const instructorMeetCodes = []
      instructorSubjects.forEach(subject => {
        if (subject.meetingLink) {
          // Extract meetCode from Google Meet URLs (format: xxx-xxxx-xxx)
          const meetCodeMatch = subject.meetingLink.match(
            /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
          )
          if (meetCodeMatch && meetCodeMatch[1]) {
            instructorMeetCodes.push(meetCodeMatch[1].toLowerCase())
          }
        }
      })

      console.log('📋 === INSTRUCTOR FILTERING ===')
      console.log(`   Subject IDs: ${instructorSubjectIds.length}`)
      console.log(
        `   MeetCodes from meetingLinks: ${instructorMeetCodes.length}`,
        instructorMeetCodes
      )

      if (instructorSubjectIds.length > 0 || instructorMeetCodes.length > 0) {
        // Find all sessions that belong to the instructor's subjects
        const instructorSessions = await Session.find({
          subjectId: { $in: instructorSubjectIds }
        })
          .select('_id')
          .lean()

        const instructorSessionIds = instructorSessions.map(s => s._id)

        // CRITICAL FIX: Also find unauthenticated sessions (subjectId: null) where meetCode matches
        // These are sessions created by unauthenticated submissions for instructor's subjects
        let unauthenticatedSessionIds = []
        if (instructorMeetCodes.length > 0) {
          const unauthenticatedSessions = await Session.find({
            $or: [{ subjectId: null }, { subjectId: { $exists: false } }],
            meetCode: { $in: instructorMeetCodes }
          })
            .select('_id meetCode')
            .lean()

          unauthenticatedSessionIds = unauthenticatedSessions.map(s => s._id)

          if (unauthenticatedSessionIds.length > 0) {
            console.log(
              `   ✅ Found ${unauthenticatedSessionIds.length} unauthenticated session(s) matching meetCodes`
            )
            unauthenticatedSessions.forEach(s => {
              console.log(`      - Session ${s._id}: meetCode=${s.meetCode}`)
            })
          }
        }

        // Combine all session IDs
        const allSessionIds = [
          ...instructorSessionIds,
          ...unauthenticatedSessionIds
        ]
        console.log(
          `   Total sessions to query: ${allSessionIds.length} (${instructorSessionIds.length} authenticated, ${unauthenticatedSessionIds.length} unauthenticated)`
        )

        // Build query that matches either:
        // 1. Attendance.instructorId matches (for new records with instructorId set)
        // 2. Attendance.sessionId matches instructor's sessions (authenticated)
        // 3. Attendance.sessionId matches unauthenticated sessions with matching meetCode (CRITICAL FIX)
        query.$or = [
          { instructorId: instructorId },
          { sessionId: { $in: allSessionIds } }
        ]
      } else {
        // No subjects found - fallback to instructorId only (may return empty results)
        query.instructorId = instructorId
      }
    } else if (req.auth?.role === 'student') {
      // Students should only see their own attendance records
      // This includes baseline records where they were marked absent
      query.userId = req.auth.userId
      console.log(`📋 Student filtering: userId=${req.auth.userId}`)
    }

    // PHASE 3.3: Log query details for debugging
    console.log('📥 === FETCHING ATTENDANCE RECORDS ===')
    if (req.auth?.role === 'instructor') {
      console.log(`   Instructor ID: ${req.auth.userId}`)
      console.log(`   Query:`, JSON.stringify(query, null, 2))
    }

    const recentRecords = await Attendance.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate(
        'userId',
        'firstName lastName studentId email section schoolYear semester role'
      )
      .populate({
        path: 'sessionId',
        select: 'meetCode subjectId sessionDate startTime endTime',
        populate: {
          path: 'subjectId',
          select: 'subjectName'
        }
      })
      .lean()

    console.log(`✅ Found ${recentRecords.length} attendance record(s)`)
    if (recentRecords.length > 0) {
      const withSubjectId = recentRecords.filter(r => {
        const session = r.sessionId || {}
        const subjectId =
          typeof session.subjectId === 'object' && session.subjectId?._id
            ? session.subjectId._id
            : session.subjectId
        return !!subjectId
      })
      console.log(
        `   Records with subjectId: ${withSubjectId.length}/${recentRecords.length}`
      )
      if (withSubjectId.length < recentRecords.length) {
        console.warn(
          `   ⚠️ ${
            recentRecords.length - withSubjectId.length
          } record(s) missing subjectId`
        )
      }
    }

    const normalized = recentRecords.map(record => {
      const user = record.userId || {}
      const session = record.sessionId || {}
      const subject = session.subjectId || {}
      const sessionDate = session.sessionDate
        ? new Date(session.sessionDate)
        : null
      // Try to parse joinTime from string, or use firstJoinTime as fallback
      const joinDate =
        toIsoWithBase(record.joinTime, sessionDate || record.createdAt) ||
        (record.firstJoinTime ? new Date(record.firstJoinTime) : null)
      const leaveDate = toIsoWithBase(
        record.leaveTime,
        sessionDate || record.updatedAt || record.createdAt
      )

      // Last-resort time-in derivation:
      // If joinTime/firstJoinTime are missing but we have leaveDate and duration, compute joinDate.
      // This fixes the common case where only Time Out is stored/displayed.
      const derivedJoinDate = (() => {
        if (joinDate) return null
        if (!leaveDate || Number.isNaN(leaveDate.getTime())) return null
        const rawDurationSeconds =
          typeof record.totalDurationSeconds === 'number' &&
          !Number.isNaN(record.totalDurationSeconds)
            ? record.totalDurationSeconds
            : typeof record.duration === 'number' &&
              !Number.isNaN(record.duration)
            ? record.duration
            : 0
        if (!rawDurationSeconds || rawDurationSeconds <= 0) return null
        const derived = new Date(
          leaveDate.getTime() - rawDurationSeconds * 1000
        )
        return Number.isNaN(derived.getTime()) ? null : derived
      })()

      // FIX: Default to 'absent' to match Mongoose schema default
      // Students who never joined should show as absent, not present
      const rawStatus = record.status || 'absent'
      const status = formatStatusLabel(rawStatus)

      const normalizeId = value => {
        if (!value) return null
        if (typeof value === 'string') return value
        if (typeof value === 'object') {
          if (value._id) {
            const nested = value._id
            if (typeof nested === 'string') return nested
            if (nested && typeof nested.toString === 'function') {
              return nested.toString()
            }
          }
          if (typeof value.toString === 'function') {
            return value.toString()
          }
        }
        return `${value}`
      }

      const normalizedUserId = normalizeId(user._id || record.userId) || null
      const normalizedInstructorId = normalizeId(record.instructorId)
      const isInstructorRecord =
        normalizedInstructorId &&
        normalizedUserId &&
        normalizedInstructorId === normalizedUserId

      // Prefer totalDurationSeconds (canonical accumulated duration),
      // fall back to legacy duration field if needed for older records
      const hasTotalDuration =
        typeof record.totalDurationSeconds === 'number' &&
        !Number.isNaN(record.totalDurationSeconds)
      const hasLegacyDuration =
        typeof record.duration === 'number' && !Number.isNaN(record.duration)
      const rawDuration = hasTotalDuration
        ? record.totalDurationSeconds
        : hasLegacyDuration
        ? record.duration
        : 0

      // Extract subjectName from populated subject
      const subjectName = subject.subjectName || null
      const subjectIdValue =
        typeof session.subjectId === 'object' && session.subjectId?._id
          ? session.subjectId._id
          : session.subjectId || null

      // CRITICAL FIX: Mark records as unauthenticated if subjectId is null
      // This allows frontend to display warning badge for unauthenticated records
      const isUnauthenticated = !subjectIdValue

      return {
        attendanceId: record._id,
        userId: user._id || null,
        studentId: user.studentId || null,
        participantName:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
        fullName:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown', // Alias for backward compatibility
        meetCode: session.meetCode || null,
        subjectId: subjectIdValue,
        subjectName: subjectName, // Current system field
        groupName: subjectName, // Backward compatibility field (maps to subjectName)
        sessionDate: sessionDate ? sessionDate.toISOString() : null,
        joinTime:
          record.joinTime ||
          (joinDate ? formatHmsFromDate(joinDate) : null) ||
          (record.firstJoinTime
            ? formatHmsFromDate(new Date(record.firstJoinTime))
            : null) ||
          (derivedJoinDate ? formatHmsFromDate(derivedJoinDate) : null),
        joinTimeIso: joinDate
          ? joinDate.toISOString()
          : record.firstJoinTime
          ? new Date(record.firstJoinTime).toISOString()
          : derivedJoinDate
          ? derivedJoinDate.toISOString()
          : null,
        firstJoinTime: record.firstJoinTime
          ? record.firstJoinTime.toISOString()
          : null,
        leaveTime:
          record.leaveTime || (leaveDate ? formatHmsFromDate(leaveDate) : null),
        leaveTimeIso: leaveDate ? leaveDate.toISOString() : null,
        durationSeconds: rawDuration,
        duration: rawDuration, // Alias for backward compatibility
        status,
        rawStatus,
        isTardy: record.isTardy || false,
        tardinessCount: record.tardinessCount || 0,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        instructorId: normalizedInstructorId,
        isInstructorRecord,
        // CRITICAL FIX: Flag unauthenticated records for frontend display
        isUnauthenticated: isUnauthenticated,
        authWarning: isUnauthenticated, // Backward compatibility
        // Include nested user object for filtering
        user: {
          _id: user._id || null,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          studentId: user.studentId || null,
          email: user.email || null,
          section: user.section || null,
          schoolYear: user.schoolYear || null,
          semester: user.semester || null,
          role: user.role || null
        }
      }
    })

    res.json({ success: true, data: normalized })
  } catch (error) {
    console.error('Error fetching recent attendance:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent attendance',
      message: error.message
    })
  }
})

// PUT /api/attendance/:id/status - Update attendance status
router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    // Accept both capitalized and lowercase status values
    const validStatuses = [
      'Present',
      'Absent',
      'Late',
      'present',
      'absent',
      'late'
    ]
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid status. Must be Present, Absent, or Late (case-insensitive)'
      })
    }

    // Normalize status to lowercase before saving (database stores lowercase)
    const normalizedStatus = status.toLowerCase()

    const existing = await Attendance.findById(id)
      .populate('userId', 'firstName lastName email studentId notifications')
      .populate('sessionId', 'meetCode sessionDate startTime endTime')

    const attendance = await Attendance.findByIdAndUpdate(
      id,
      { status: normalizedStatus },
      { new: true }
    )
      .populate('userId', 'firstName lastName email studentId')
      .populate('sessionId', 'meetCode date startTime stopTime')

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      })
    }

    // Create in-app notification for student
    const oldStatus = existing?.status || 'absent'
    try {
      const instructor = req.auth?.userId
        ? await User.findById(req.auth.userId)
            .select('firstName lastName')
            .lean()
            .catch(() => null)
        : null

      await createStatusChangeNotification(
        attendance,
        oldStatus,
        normalizedStatus,
        instructor
      )
    } catch (notifyError) {
      console.error('Failed to create in-app notification:', notifyError)
    }

    // Notify student via email if enabled.
    try {
      const student = existing?.userId
      const studentEmail = student?.email
      const allowEmail = student?.notifications?.emailAlerts !== false

      if (studentEmail && allowEmail) {
        const meetCode =
          existing?.sessionId?.meetCode || attendance?.sessionId?.meetCode
        const sessionDate = existing?.sessionId?.sessionDate
          ? new Date(existing.sessionId.sessionDate).toLocaleDateString(
              'en-US',
              {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              }
            )
          : 'N/A'

        const subjectLine = 'NE-ATTEND: Attendance Status Updated'
        const textBody =
          `Your attendance status has been updated by your instructor.\n\n` +
          `Meet Code: ${meetCode || 'N/A'}\n` +
          `Session Date: ${sessionDate}\n` +
          `Previous Status: ${oldStatus}\n` +
          `New Status: ${normalizedStatus}\n\n` +
          `If you believe this is incorrect, please contact your instructor.`

        sendMail(studentEmail, subjectLine, textBody).catch(err => {
          console.error(
            'Attendance status update email failed for',
            studentEmail,
            err
          )
        })
      }
    } catch (notifyError) {
      console.error(
        'Failed to send attendance update notification:',
        notifyError
      )
    }

    res.json({
      success: true,
      message: 'Attendance status updated successfully',
      data: attendance
    })
  } catch (error) {
    console.error('Error updating attendance status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update attendance status',
      message: error.message
    })
  }
})

// POST /api/attendance/:sessionId/finalize - Finalize attendance when meeting ends (instructor leaves)
router.post('/:sessionId/finalize', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params

    // Verify session exists
    const session = await Session.findById(sessionId)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      })
    }

    const requesterRole = req.auth?.role || 'student'
    const requesterId = req.auth?.userId
    let subjectForFinalize = null
    if (session.subjectId) {
      subjectForFinalize = await Subject.findById(session.subjectId).select(
        'instructorId subjectName schedule'
      )
    }
    const isAdmin = requesterRole === 'admin' || requesterRole === 'superadmin'
    const isInstructor =
      subjectForFinalize &&
      subjectForFinalize.instructorId &&
      requesterId &&
      subjectForFinalize.instructorId.toString() === requesterId.toString()

    if (!isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message:
          'Only the assigned instructor or an administrator can finalize this session.'
      })
    }

    // Find all attendance records for this session with 'pending' status
    const pendingAttendances = await Attendance.find({
      sessionId: session._id,
      status: 'pending'
    })

    if (pendingAttendances.length === 0) {
      return res.json({
        success: true,
        message: 'No pending attendance records to finalize',
        finalizedCount: 0
      })
    }

    // Finalize each pending attendance record
    const finalizedRecords = []
    for (const attendance of pendingAttendances) {
      let finalStatus = 'absent' // Default to absent if student didn't return

      const buildScheduleTime = (baseDate, timeStr) => {
        if (!timeStr) return null
        const [h = '0', m = '0'] = String(timeStr).split(':')
        const d = new Date(baseDate)
        return new Date(
          Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            parseInt(h, 10) || 0,
            parseInt(m, 10) || 0,
            0,
            0
          )
        )
      }

      // Check if student had synchronized timeout (was still in meeting when instructor left)
      if (attendance.timeoutSynchronized) {
        // Student was still in meeting when instructor left - mark as present
        finalStatus = 'present'
      }
      // Check if student returned after leaving
      else if (attendance.lastReturnTime && attendance.lastLeaveTime) {
        if (attendance.lastReturnTime > attendance.lastLeaveTime) {
          // Student returned - check if they should be present or late
          // If they have sufficient duration, mark as present
          if (attendance.totalDurationSeconds > 0) {
            // Check tardiness if needed - use firstJoinTime instead of lastReturnTime
            const subjectForTardiness = subjectForFinalize
            if (subjectForTardiness) {
              const attendanceForTardiness = {
                joinTime: attendance.joinTime,
                joinTimeIso: attendance.firstJoinTime
                  ? attendance.firstJoinTime.toISOString()
                  : attendance.lastReturnTime
                  ? attendance.lastReturnTime.toISOString()
                  : null
              }

              const scheduleBaseDate = parseSessionDay(
                session.startTime || session.sessionDate || new Date()
              )
              const scheduleStart = subjectForTardiness?.schedule?.startTime
                ? buildScheduleTime(
                    scheduleBaseDate,
                    subjectForTardiness.schedule.startTime
                  )
                : null
              const scheduleEnd = subjectForTardiness?.schedule?.endTime
                ? buildScheduleTime(
                    scheduleBaseDate,
                    subjectForTardiness.schedule.endTime
                  )
                : null

              const tardinessContextFinalize = {
                lateRuleTime: 15,
                tardinessThresholdPercent: 0.25,
                instructorJoinTime: session.instructorJoinTime || null,
                scheduledStartTime: scheduleStart || session.startTime,
                scheduledEndTime: scheduleEnd || session.endTime
              }

              const sessionForTardinessFinalize = {
                ...session.toObject(),
                startTime: tardinessContextFinalize.scheduledStartTime,
                endTime: tardinessContextFinalize.scheduledEndTime
              }

              const tardinessResult = calculateTardiness(
                sessionForTardinessFinalize,
                attendanceForTardiness,
                tardinessContextFinalize
              )

              if (tardinessResult.isTardy && !attendance.isDuringAddDrop) {
                finalStatus = 'late'
              } else {
                finalStatus = 'present'
              }
            } else {
              finalStatus = 'present'
            }
          } else {
            finalStatus = 'absent' // No duration means they didn't actually attend
          }
        }
      } else if (attendance.isCurrentlyInMeeting) {
        // Student is currently in meeting - should be present
        finalStatus = 'present'
      }

      // Update attendance record with final status
      attendance.status = finalStatus
      attendance.isCurrentlyInMeeting = false // Meeting has ended
      attendance.pendingSince = null // Clear pending timestamp
      await attendance.save()

      finalizedRecords.push({
        userId: attendance.userId,
        status: finalStatus,
        totalDurationSeconds: attendance.totalDurationSeconds
      })
    }

    // Emit realtime update
    try {
      const io = req.app.get('io')
      if (io) {
        io.emit('attendance:update', {
          type: 'attendance_finalized',
          sessionId: session._id,
          finalizedCount: finalizedRecords.length,
          records: finalizedRecords,
          timestamp: new Date().toISOString()
        })
      }
    } catch (e) {
      console.error('Error emitting finalization update:', e)
    }

    res.json({
      success: true,
      message: 'Attendance finalized successfully',
      finalizedCount: finalizedRecords.length,
      records: finalizedRecords
    })
  } catch (error) {
    console.error('Error finalizing attendance:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to finalize attendance',
      message: error.message
    })
  }
})

// GET /api/attendance/eligibility-check/:subjectId - Refresh eligibility status for a subject
router.get('/eligibility-check/:subjectId', requireAuth, async (req, res) => {
  try {
    const { subjectId } = req.params

    // Verify subject exists
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Check if user has access
    if (
      req.auth?.role === 'instructor' &&
      subject.instructorId.toString() !== req.auth.userId
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You are not the instructor of this subject.'
      })
    }

    // Get eligibility summary
    const { getEligibilitySummary } = require('../services/gradeAssignment')
    const summary = await getEligibilitySummary(subjectId)

    res.json({
      success: true,
      data: summary,
      message: 'Eligibility status refreshed'
    })
  } catch (error) {
    console.error('Error checking eligibility:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to check eligibility',
      message: error.message
    })
  }
})

// GET /api/attendance/get-credentials - Returns error (endpoint requires POST)
router.get('/get-credentials', (req, res) => {
  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
    message:
      'This endpoint requires POST method. Please use POST with meetCode and userId in the request body.',
    allowedMethods: ['POST']
  })
})

// POST /api/attendance/get-credentials - Get authentication credentials for extension
router.post('/get-credentials', async (req, res) => {
  console.log('📥 POST /api/attendance/get-credentials - Request received')
  console.log('   Request body:', JSON.stringify(req.body, null, 2))
  console.log('   Request headers:', JSON.stringify(req.headers, null, 2))
  console.log('   Request URL:', req.url)
  console.log('   Request method:', req.method)

  try {
    const { meetCode, userId } = req.body

    if (!meetCode || !userId) {
      console.warn('⚠️ Missing required fields:', {
        meetCode: !!meetCode,
        userId: !!userId
      })
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'meetCode and userId are required',
        received: {
          meetCode: meetCode || null,
          userId: userId || null
        }
      })
    }

    console.log(
      `🔍 Processing credentials request: meetCode=${meetCode}, userId=${userId}`
    )

    // Verify user exists
    console.log(`👤 Looking up user: ${userId}`)
    const user = await User.findById(userId)
    if (!user) {
      console.error(`❌ User not found: ${userId}`)
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: `Invalid userId: ${userId}`,
        debug: {
          userId: userId,
          userIdType: typeof userId
        }
      })
    }
    console.log(
      `✅ User found: ${user.firstName} ${user.lastName} (${user.email})`
    )

    // Find subject associated with this meetCode
    console.log(`🔍 Finding subject for meetCode: ${meetCode}`)
    let subjectId = null
    let subject = null

    // Strategy 1: Try to find a session with this meetCode and get its subjectId
    const session = await Session.findOne({ meetCode }).sort({ createdAt: -1 })
    if (session && session.subjectId) {
      subjectId = session.subjectId
      console.log(`✅ Found session with subjectId: ${subjectId}`)
    } else if (session) {
      console.log(`⚠️ Found session but subjectId is null`)
    } else {
      console.log(`⚠️ No session found for meetCode: ${meetCode}`)
    }

    // Strategy 2: Search for subject by meeting link containing meetCode
    // Subjects store meetingLink directly
    if (!subjectId) {
      console.log(
        `🔍 Searching for subject by meeting link containing: ${meetCode}`
      )

      // Try multiple search patterns:
      // 1. Exact meetCode match in URL (e.g., meet.google.com/vsc-fimw-ajy)
      // 2. MeetCode anywhere in the meetingLink string
      const searchPatterns = [
        { meetingLink: { $regex: `/${meetCode}`, $options: 'i' } }, // URL path format
        { meetingLink: { $regex: meetCode, $options: 'i' } } // Anywhere in link
      ]

      for (const pattern of searchPatterns) {
        subject = await Subject.findOne(pattern).select(
          '_id instructorId subjectName meetingLink sections'
        )
        if (subject) {
          subjectId = subject._id
          console.log(
            `✅ Found subject by meeting link (pattern: ${JSON.stringify(
              pattern
            )}): ${subjectId} (${subject.subjectName})`
          )
          break
        }
      }

      if (!subject) {
        console.log(`⚠️ No subject found by meeting link`)
      }
    }

    // Strategy 3: If still not found and user is instructor, search their subjects
    if (!subjectId && userId) {
      console.log(
        `🔍 Searching instructor's subjects for meetCode: ${meetCode}`
      )
      const instructorSubjects = await Subject.find({
        instructorId: userId,
        isActive: true
      }).select('_id subjectName meetingLink sections')

      console.log(
        `   Found ${instructorSubjects.length} active subjects for instructor`
      )

      // Check each subject's meetingLink for the meetCode
      for (const instructorSubject of instructorSubjects) {
        if (instructorSubject.meetingLink) {
          // Extract meetCode from meetingLink if it's a full URL
          const meetCodeMatch = instructorSubject.meetingLink.match(
            /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
          )
          const extractedMeetCode = meetCodeMatch ? meetCodeMatch[1] : null

          // Check if meetCode matches (case-insensitive)
          if (
            extractedMeetCode &&
            extractedMeetCode.toLowerCase() === meetCode.toLowerCase()
          ) {
            subject = instructorSubject
            subjectId = instructorSubject._id
            console.log(
              `✅ Found subject in instructor's subjects: ${subjectId} (${subject.subjectName})`
            )
            break
          }
        }
      }
    }

    if (!subjectId) {
      console.error(`❌ No subject found for meetCode: ${meetCode}`)
      console.error(
        `   Searched: sessions, subjects.meetingLink, instructor's subjects`
      )
      console.error(`   User ID: ${userId}`)

      // Provide helpful error message
      let errorMessage = `No subject found for meeting code "${meetCode}". `
      if (userId) {
        errorMessage += `Please ensure:\n`
        errorMessage += `1. The meeting code matches a subject's meeting link in NE-Attend\n`
        errorMessage += `2. You are the instructor of the subject\n`
        errorMessage += `3. The subject is active`
      } else {
        errorMessage += `Please ensure the meeting is associated with a subject in NE-Attend.`
      }

      return res.status(404).json({
        success: false,
        error: 'Subject not found',
        message: errorMessage,
        debug: {
          meetCode: meetCode,
          userId: userId,
          searchedIn: ['sessions', 'subjects.meetingLink', 'instructorSubjects']
        }
      })
    }

    // Check if user is instructor of the subject
    // If we already have the subject from previous search, use it; otherwise load it
    if (!subject) {
      console.log(`👥 Loading subject: ${subjectId}`)
      subject = await Subject.findById(subjectId).select(
        '_id instructorId subjectName meetingLink sections'
      )
    } else {
      console.log(`👥 Using already loaded subject: ${subjectId}`)
      // Ensure we have all needed fields
      if (!subject.sections) {
        subject = await Subject.findById(subjectId).select(
          '_id instructorId subjectName meetingLink sections'
        )
      }
    }

    if (!subject) {
      console.error(`❌ Subject not found in database: ${subjectId}`)
      return res.status(404).json({
        success: false,
        error: 'Subject not found',
        message: `Subject with ID ${subjectId} not found in database`,
        debug: {
          subjectId: subjectId,
          subjectIdType: typeof subjectId
        }
      })
    }
    console.log(
      `✅ Subject loaded: ${subject.subjectName} (instructorId: ${subject.instructorId})`
    )

    // Verify user is the instructor of this subject
    const isInstructor =
      subject.instructorId &&
      subject.instructorId.toString() === userId.toString()

    console.log(`🔐 Access check: isInstructor=${isInstructor}`)

    if (!isInstructor) {
      console.error(
        `❌ Access denied: User ${userId} is not instructor of subject ${subjectId}`
      )
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: `You do not have access to this meeting. User ${userId} is not the instructor of subject ${subject.subjectName}.`,
        debug: {
          userId: userId,
          subjectId: subjectId.toString(),
          subjectInstructorId: subject.instructorId
            ? subject.instructorId.toString()
            : null
        }
      })
    }

    // Get roster from subject sections (students assigned to subject by section)
    const rosterUserIds = []
    if (subject.instructorId) {
      rosterUserIds.push(subject.instructorId)
    }

    // Get all students whose section matches the subject's sections
    if (Array.isArray(subject.sections) && subject.sections.length > 0) {
      const normalizeSection = section => {
        if (!section || typeof section !== 'string') return ''
        return section.trim().toLowerCase()
      }
      const normalizedSections = subject.sections.map(s => normalizeSection(s))
      const matchingStudents = await User.find({
        role: 'student',
        active: { $ne: false },
        $or: [
          { section: { $in: subject.sections } },
          { section: { $in: normalizedSections } }
        ]
      })
        .select('_id')
        .lean()

      matchingStudents.forEach(student => {
        rosterUserIds.push(student._id)
      })

      console.log(
        `👥 Found ${
          matchingStudents.length
        } students in subject sections: ${subject.sections.join(', ')}`
      )
    }

    const rosterUsers =
      rosterUserIds.length > 0
        ? await User.find({ _id: { $in: rosterUserIds } })
            .select('_id firstName lastName email studentId role')
            .lean()
        : []

    const rosterPayload = rosterUsers.map(userDoc => ({
      userId: userDoc._id.toString(),
      firstName: userDoc.firstName || '',
      lastName: userDoc.lastName || '',
      email: userDoc.email || '',
      studentId: userDoc.studentId || '',
      role: userDoc.role || null,
      normalizedName: normalizeNameKey(
        `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim()
      )
    }))

    // Generate or retrieve verification token for this subject
    let tokenRecord = await AttendanceToken.findOne({
      subjectId: subjectId,
      consumed: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 })

    // If no valid token exists, create a new one
    if (!tokenRecord) {
      const token = AttendanceToken.generateToken
        ? AttendanceToken.generateToken()
        : `neattend_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      const sessionDate = new Date() // Use current date as session date
      sessionDate.setHours(0, 0, 0, 0) // Normalize to start of day

      tokenRecord = new AttendanceToken({
        token: token,
        subjectId: subjectId,
        userId: userId, // Use userId instead of createdBy
        sessionDate: sessionDate,
        expiresAt: expiresAt,
        consumed: false
      })

      await tokenRecord.save()
      console.log('✅ Created new verification token for subject:', subjectId)
    } else {
      console.log(
        '✅ Using existing verification token for subject:',
        subjectId
      )
    }

    console.log(
      `✅ Credentials issued successfully: subjectId=${subjectId}, tokenLength=${tokenRecord.token.length}, rosterSize=${rosterPayload.length}`
    )

    res.json({
      success: true,
      verificationToken: tokenRecord.token,
      subjectId: subjectId.toString(),
      expiresAt: tokenRecord.expiresAt.toISOString(),
      roster: rosterPayload,
      subjectName: subject.subjectName,
      message: 'Authentication credentials retrieved successfully'
    })
  } catch (error) {
    console.error('❌ Error getting credentials:', error)
    console.error('   Error stack:', error.stack)
    console.error('   Request body:', req.body)
    res.status(500).json({
      success: false,
      error: 'Failed to get credentials',
      message: error.message,
      debug:
        process.env.NODE_ENV === 'development'
          ? {
              errorName: error.name,
              errorStack: error.stack
            }
          : undefined
    })
  }
})

// POST /api/attendance/progress - DISABLED: Using server.js implementation instead
// The server.js implementation has PHASE 1/2 fixes, liveParticipantsCache updates,
// extension activity tracking, and comprehensive unauthenticated handling.
// This endpoint is shadowed by server.js app.post('/api/attendance/progress')
// which must be registered BEFORE the router mount in server.js.
//
// If you need to re-enable this, comment out the server.js progress endpoint
// and uncomment this block (lines 3626-3924).
/* DISABLED - Using server.js implementation
router.post('/progress', async (req, res) => {
  try {
    const payload = req.body || {}
    const io = req.app.get('io')

    // Normalize payload structure - handle both participants and currentParticipants keys
    const participants =
      payload.participants || payload.currentParticipants || []
    const normalizedPayload = {
      ...payload,
      participants: participants
    }
    delete normalizedPayload.currentParticipants

    const meetCode =
      normalizedPayload.meetCode ||
      (normalizedPayload.participant &&
        normalizedPayload.participant.meetCode) ||
      null
    const timestampIso = normalizedPayload.timestamp || new Date().toISOString()
    const sessionDate =
      normalizedPayload.sessionDate || normalizedPayload.date || timestampIso
    const verificationToken = normalizedPayload.verificationToken
    const subjectId = normalizedPayload.subjectId || null

    // Validate required fields
    if (!meetCode) {
      console.warn(
        '⚠️ Progress update missing meetCode - cannot create session'
      )
      // Still allow broadcasting for real-time updates even without meetCode
    }

    // Make verificationToken and subjectId optional for real-time monitoring
    let tokenRecord = null
    let subject = null
    if (verificationToken && subjectId) {
      try {
        tokenRecord = await AttendanceToken.findOne({
          token: verificationToken,
          subjectId,
          consumed: false
        })

        if (tokenRecord && new Date() >= tokenRecord.expiresAt) {
          tokenRecord = null // Token expired
        }

        if (tokenRecord) {
          subject = await Subject.findById(subjectId).select(
            '_id instructorId subjectName'
          )
        }
      } catch (tokenError) {
        console.warn(
          '⚠️ Token validation error (continuing for real-time updates):',
          tokenError.message
        )
      }
    } else if (meetCode) {
      // If no token/subjectId, try to find subject by meetCode from sessions
      try {
        const session = await Session.findOne({ meetCode }).sort({
          createdAt: -1
        })
        if (session && session.subjectId) {
          subject = await Subject.findById(session.subjectId).select(
            '_id instructorId subjectName'
          )
        }
      } catch (subjectError) {
        console.warn(
          '⚠️ Subject lookup error (continuing for real-time updates):',
          subjectError.message
        )
      }
    }

    // Get session to check instructor leave time and meeting end state
    let session = null
    let instructorLeaveTimeIso = null
    let meetingEnded = false

    if (meetCode) {
      const sessionDateParsed = parseSessionDay(sessionDate)

      try {
        const timestampDate = new Date(timestampIso)
        const placeholderEndTime = new Date(
          timestampDate.getTime() + 60 * 60 * 1000
        )

        const upsertResult = await upsertSessionByMeetCodeAndDate({
          meetCode,
          sessionDate: sessionDateParsed,
          insert: {
            startTime: timestampDate,
            endTime: placeholderEndTime,
            subjectId: subjectId || subject?._id || null,
            status: 'scheduled',
            sessionId: `prog_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 8)}`
          }
        })

        session = upsertResult.session
        if (session) {
          if (upsertResult.duplicateResolved) {
            console.log(
              `✅ Found existing session for progress endpoint: ${meetCode}`
            )
          } else if (upsertResult.attempts === 1) {
            console.log(
              `📝 Created placeholder session for progress tracking: ${session._id} (meetCode: ${meetCode})`
            )
          }
          instructorLeaveTimeIso = session.instructorLeaveTime
          meetingEnded = session.meetingEnded || false
        }
      } catch (error) {
        console.error(
          `❌ Failed to find/create session for progress endpoint: ${error.message}`
        )
        session = null
      }
    }

    let broadcastPayload

    if (
      normalizedPayload.type === 'join' ||
      normalizedPayload.type === 'leave'
    ) {
      const participant = await normalizeParticipant(
        normalizedPayload.participant || {},
        {
          meetCode,
          timestamp: timestampIso,
          sessionDate,
          defaultMeetCode: meetCode,
          instructorLeaveTimeIso: instructorLeaveTimeIso,
          meetingEnded: meetingEnded
        }
      )

      const currentParticipants = await normalizeParticipantsList(
        normalizedPayload.participants || [],
        {
          meetCode,
          timestamp: timestampIso,
          sessionDate,
          defaultMeetCode: meetCode,
          instructorLeaveTimeIso: instructorLeaveTimeIso,
          meetingEnded: meetingEnded
        }
      )

      broadcastPayload = {
        type: 'participant_change',
        eventType: normalizedPayload.type,
        meetCode,
        subjectId: subjectId || subject?._id || null,
        subjectName: subject?.subjectName || null,
        participant,
        participants: currentParticipants,
        timestamp: timestampIso,
        sessionDate,
        meetingStatus:
          normalizedPayload.meetingStatus || MEETING_STATUS.SCRAPING,
        meetingEnded: meetingEnded,
        instructorLeaveTime: instructorLeaveTimeIso
      }

      console.log(
        `📡 Broadcasted ${normalizedPayload.type} event for: ${participant.name}`
      )
    } else {
      const participants = await normalizeParticipantsList(
        normalizedPayload.participants || [],
        {
          meetCode,
          timestamp: timestampIso,
          sessionDate,
          defaultMeetCode: meetCode,
          instructorLeaveTimeIso: instructorLeaveTimeIso,
          meetingEnded: meetingEnded
        }
      )

      broadcastPayload = {
        type: 'attendance_progress',
        meetCode,
        subjectId: subjectId || subject?._id || null,
        subjectName: subject?.subjectName || null,
        participants,
        timestamp: timestampIso,
        sessionDate,
        meetingStatus:
          normalizedPayload.meetingStatus || MEETING_STATUS.SCRAPING,
        meetingEnded: meetingEnded,
        instructorLeaveTime: instructorLeaveTimeIso
      }

      // Log host information for debugging
      const hostCount = participants.filter(p => p.isHost === true).length
      const participantCount = participants.length
      console.log(
        `📡 Broadcasted progress update: ${participantCount} participants, ${hostCount} host(s)`
      )
      if (hostCount > 0) {
        const hostNames = participants
          .filter(p => p.isHost === true)
          .map(h => h.name || 'Unknown')
          .join(', ')
        console.log(`   👑 Host(s) in broadcast: ${hostNames}`)
      }
    }

    // Emit real-time update with error handling - broadcast to ALL relevant rooms
    if (io && broadcastPayload) {
      try {
        const targetSubjectId = broadcastPayload.subjectId
        const targetMeetCode = broadcastPayload.meetCode
        const catchAllRoom = 'subject:unauthenticated'

        // ALWAYS emit to catch-all room so all dashboards can receive updates
        // This ensures updates aren't lost due to room membership issues
        io.to(catchAllRoom).emit('attendance:update', broadcastPayload)
        console.log(
          `📡 Emitted attendance update to catch-all room: ${catchAllRoom}`
        )

        // ALSO emit to specific rooms for efficiency (dashboards subscribe to their rooms)
        if (targetSubjectId) {
          const roomName = `subject:${targetSubjectId}`
          io.to(roomName).emit('attendance:update', broadcastPayload)
          console.log(`📡 Also emitted to subject room: ${roomName}`)
        }

        if (targetMeetCode) {
          const roomName = `meet:${targetMeetCode}`
          io.to(roomName).emit('attendance:update', broadcastPayload)
          console.log(`📡 Also emitted to meet room: ${roomName}`)
        }
      } catch (emitError) {
        console.error('❌ Failed to emit Socket.IO update:', emitError)
        // Continue processing - don't fail the request due to Socket.IO issues
      }
    }

    res.json({
      success: true,
      message: 'Update broadcasted',
      payload: broadcastPayload
    })
  } catch (error) {
    console.error('❌ Error in progress endpoint:', error)

    let statusCode = 500
    let errorMessage = 'Internal server error'

    if (error.name === 'ValidationError') {
      statusCode = 400
      errorMessage = `Validation error: ${error.message}`
    } else if (error.name === 'CastError') {
      statusCode = 400
      errorMessage = `Invalid data format: ${error.message}`
    } else if (error.code === 11000) {
      statusCode = 409
      errorMessage = 'Duplicate entry conflict'
    } else if (error.message) {
      errorMessage = error.message
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      type: error.name || 'UnknownError'
    })
  }
})
END DISABLED */

// POST /api/participants/resolve - Resolve scraped names to real names from database
router.post('/participants/resolve', async (req, res) => {
  try {
    const { names } = req.body || {}

    if (!Array.isArray(names)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: names must be an array'
      })
    }

    if (names.length === 0) {
      return res.json({
        success: true,
        resolved: {}
      })
    }

    // Remove duplicates and empty values
    const uniqueNames = [
      ...new Set(
        names.filter(name => name && typeof name === 'string' && name.trim())
      )
    ]

    if (uniqueNames.length === 0) {
      return res.json({
        success: true,
        resolved: {}
      })
    }

    // Resolve all names in parallel
    const resolutionPromises = uniqueNames.map(async scrapedName => {
      const identity = await resolveParticipantIdentity(scrapedName)
      return {
        scrapedName,
        realName: identity.displayName || scrapedName
      }
    })

    const resolutions = await Promise.all(resolutionPromises)

    // Build the resolved mapping
    const resolved = {}
    resolutions.forEach(({ scrapedName, realName }) => {
      resolved[scrapedName] = realName
    })

    res.json({
      success: true,
      resolved
    })
  } catch (error) {
    console.error('❌ Error in participants/resolve endpoint:', error)

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      type: error.name || 'UnknownError'
    })
  }
})

/**
 * POST /api/attendance/meeting-ended
 * Notifies that a meeting has ended (host ended meeting)
 * This endpoint clears the live cache and broadcasts meeting:ended event
 */
router.post('/meeting-ended', async (req, res) => {
  try {
    const { meetCode, subjectId, reason, timestamp, isUnauthenticated } =
      req.body

    console.log('🛑 === MEETING ENDED NOTIFICATION ===')
    console.log('   MeetCode:', meetCode)
    console.log('   SubjectId:', subjectId)
    console.log('   Reason:', reason)
    console.log('   Timestamp:', timestamp)
    console.log('   IsUnauthenticated:', isUnauthenticated)

    // Get Socket.IO instance from app
    const io = req.app.get('io')

    // Update session to mark meeting as ended
    if (meetCode) {
      try {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        const session = await Session.findOneAndUpdate(
          {
            meetCode: { $regex: new RegExp(`^${meetCode}$`, 'i') },
            sessionDate: { $gte: today, $lt: tomorrow }
          },
          {
            $set: {
              meetingEnded: true,
              instructorLeaveTime: timestamp || new Date().toISOString(),
              status: 'completed'
            }
          },
          { new: true }
        )

        if (session) {
          console.log(`✅ Updated session ${session._id} - meeting ended`)
        }
      } catch (sessionError) {
        console.warn('⚠️ Could not update session:', sessionError.message)
      }
    }

    // Broadcast meeting:ended event via Socket.IO
    if (io) {
      const meetingEndPayload = {
        meetCode,
        subjectId,
        reason: reason === 'host_leave' ? 'host_ended' : reason,
        timestamp: timestamp || new Date().toISOString()
      }

      // Broadcast to subject room if available
      if (subjectId) {
        io.to(`subject:${subjectId}`).emit('meeting:ended', meetingEndPayload)
        console.log(`📡 Broadcasted meeting:ended to subject:${subjectId}`)
      }

      // Also broadcast globally for unauthenticated updates
      io.emit('meeting:ended', meetingEndPayload)
      console.log('📡 Broadcasted meeting:ended globally')
    }

    res.json({
      success: true,
      message: 'Meeting ended notification processed',
      meetCode,
      subjectId,
      reason
    })
  } catch (error) {
    console.error('❌ Error in meeting-ended endpoint:', error)

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    })
  }
})

/**
 * DELETE /api/attendance/clear-session/:meetCode
 * Deletes Session and Attendance records for a specific meetCode
 * Used when Clear Display is clicked to ensure database is also cleared
 */
router.delete('/clear-session/:meetCode', async (req, res) => {
  try {
    const { meetCode } = req.params
    const { sessionDate, subjectId } = req.query

    if (!meetCode) {
      return res.status(400).json({
        success: false,
        error: 'meetCode is required'
      })
    }

    console.log(`🗑️ === CLEAR SESSION REQUEST ===`)
    console.log(`   MeetCode: ${meetCode}`)
    console.log(`   SessionDate: ${sessionDate || 'today'}`)
    console.log(`   SubjectId: ${subjectId || 'any'}`)

    // Build query for sessions
    const sessionQuery = { meetCode: meetCode.toLowerCase() }

    // If sessionDate provided, filter by that date
    if (sessionDate) {
      const date = new Date(sessionDate)
      date.setHours(0, 0, 0, 0)
      sessionQuery.sessionDate = date
    } else {
      // Default to today's sessions only
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      sessionQuery.sessionDate = { $gte: today }
    }

    // If subjectId provided, filter by that
    if (subjectId) {
      sessionQuery.subjectId = subjectId
    }

    // Find sessions to delete
    const sessions = await Session.find(sessionQuery).select('_id meetCode')

    if (sessions.length === 0) {
      console.log(`ℹ️ No sessions found to delete for meetCode: ${meetCode}`)
      return res.json({
        success: true,
        message: 'No sessions found to delete',
        deletedSessions: 0,
        deletedAttendance: 0
      })
    }

    const sessionIds = sessions.map(s => s._id)
    console.log(`   Found ${sessions.length} session(s) to delete`)

    // Delete attendance records for these sessions
    const attendanceResult = await Attendance.deleteMany({
      sessionId: { $in: sessionIds }
    })
    console.log(
      `   Deleted ${attendanceResult.deletedCount} attendance record(s)`
    )

    // Delete the sessions themselves
    const sessionResult = await Session.deleteMany({
      _id: { $in: sessionIds }
    })
    console.log(`   Deleted ${sessionResult.deletedCount} session(s)`)

    // Clear from live cache if exists
    const io = req.app.get('io')
    if (io) {
      // Get liveParticipantsCache from parent app
      const liveParticipantsCache = req.app.get('liveParticipantsCache')
      if (liveParticipantsCache) {
        liveParticipantsCache.delete(meetCode.toLowerCase())
        console.log(`   Cleared live cache for meetCode: ${meetCode}`)
      }

      // Broadcast session:cleared event
      const clearPayload = {
        meetCode,
        deletedSessions: sessionResult.deletedCount,
        deletedAttendance: attendanceResult.deletedCount,
        timestamp: new Date().toISOString()
      }

      if (subjectId) {
        io.to(`subject:${subjectId}`).emit('session:cleared', clearPayload)
      }
      io.emit('session:cleared', clearPayload)
      console.log(`📡 Broadcasted session:cleared event`)
    }

    res.json({
      success: true,
      message: `Cleared ${sessionResult.deletedCount} session(s) and ${attendanceResult.deletedCount} attendance record(s)`,
      deletedSessions: sessionResult.deletedCount,
      deletedAttendance: attendanceResult.deletedCount,
      meetCode
    })
  } catch (error) {
    console.error('❌ Error in clear-session endpoint:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    })
  }
})

// ========================================================================
// END SESSION - Finalize and save attendance session
// Called when instructor clicks "End Session" in extension popup
// ========================================================================
router.post('/end-session', async (req, res) => {
  const {
    meetCode,
    sessionStartTime,
    sessionEndTime,
    participants,
    hostInfo,
    totalParticipants,
    subjectId,
    groupId
  } = req.body

  console.log('🛑 === END SESSION REQUEST ===')
  console.log(`   Meet Code: ${meetCode}`)
  console.log(`   Participants: ${totalParticipants}`)
  console.log(`   Start: ${sessionStartTime}`)
  console.log(`   End: ${sessionEndTime}`)

  try {
    if (!meetCode) {
      return res.status(400).json({
        success: false,
        error: 'meetCode is required'
      })
    }

    // Calculate session duration
    const startTime = new Date(sessionStartTime || Date.now())
    const endTime = new Date(sessionEndTime || Date.now())
    const durationMs = endTime - startTime
    const durationMinutes = Math.floor(durationMs / (1000 * 60))

    // Resolve subject schedule window (authoritative for tardiness) when possible
    // Note: /end-session may be called without subjectId from the extension.
    // In that case, resolve subject by meetCode (matching meetingLink).
    let resolvedSubjectId = subjectId || null
    let subjectForSchedule = null
    if (resolvedSubjectId) {
      subjectForSchedule = await Subject.findById(resolvedSubjectId).catch(
        () => null
      )
    }
    if (!subjectForSchedule && meetCode) {
      const meetCodeLower = String(meetCode).toLowerCase()
      subjectForSchedule = await Subject.findOne({
        isActive: { $ne: false },
        meetingLink: { $regex: meetCodeLower, $options: 'i' }
      })
        .sort({ updatedAt: -1 })
        .catch(() => null)

      if (subjectForSchedule?._id) {
        resolvedSubjectId = subjectForSchedule._id
      }
    }

    const sessionDateBase = parseSessionDay(startTime)
    const buildDateTimeFromSchedule = (baseDate, timeStr) => {
      if (!timeStr) return null
      const [hourStr = '0', minuteStr = '0'] = String(timeStr).split(':')
      const date = new Date(baseDate)
      date.setHours(
        parseInt(hourStr, 10) || 0,
        parseInt(minuteStr, 10) || 0,
        0,
        0
      )
      return Number.isNaN(date.getTime()) ? null : date
    }

    const scheduledStartTime = subjectForSchedule?.schedule?.startTime
      ? buildDateTimeFromSchedule(
          sessionDateBase,
          subjectForSchedule.schedule.startTime
        )
      : null
    const scheduledEndTime = subjectForSchedule?.schedule?.endTime
      ? buildDateTimeFromSchedule(
          sessionDateBase,
          subjectForSchedule.schedule.endTime
        )
      : null

    // Build roster indexes for reliable identity matching
    let rosterIndexes = {
      byId: new Map(),
      byEmail: new Map(),
      byStudentId: new Map(),
      byName: new Map()
    }
    if (subjectForSchedule) {
      const approvedMemberIds = new Set()
      if (subjectForSchedule.instructorId) {
        approvedMemberIds.add(subjectForSchedule.instructorId.toString())
      }

      if (
        Array.isArray(subjectForSchedule.sections) &&
        subjectForSchedule.sections.length > 0
      ) {
        const normalizeSection = section => {
          if (!section || typeof section !== 'string') return ''
          return section.trim().toLowerCase()
        }
        const normalizedSections = subjectForSchedule.sections.map(s =>
          normalizeSection(s)
        )
        const matchingStudents = await User.find({
          role: 'student',
          active: { $ne: false },
          $or: [
            { section: { $in: subjectForSchedule.sections } },
            { section: { $in: normalizedSections } }
          ]
        }).select('_id firstName lastName email studentId role')

        matchingStudents.forEach(student => {
          approvedMemberIds.add(student._id.toString())
        })
      }

      const rosterUserIds = Array.from(approvedMemberIds)
      const rosterUsers =
        rosterUserIds.length > 0
          ? await User.find({ _id: { $in: rosterUserIds } }).select(
              '_id firstName lastName email studentId role'
            )
          : []

      rosterIndexes = buildRosterIndexes(rosterUsers)
    }

    // Find or create session
    let session = await Session.findOne({
      meetCode: meetCode.toLowerCase()
    }).sort({ createdAt: -1 })

    if (!session) {
      // Create new session with only valid schema fields
      session = new Session({
        meetCode: meetCode.toLowerCase(),
        subjectId: resolvedSubjectId || null,
        groupId: groupId || null,
        startTime: startTime,
        endTime: endTime,
        status: 'completed', // Must use enum value: scheduled, active, completed, cancelled
        meetingEnded: true,
        instructorLeaveTime: hostInfo?.leaveTime
          ? new Date(hostInfo.leaveTime)
          : endTime,
        attendanceCount: totalParticipants || 0,
        notes: hostInfo?.name ? `Host: ${hostInfo.name}` : null
      })
      await session.save()
      console.log(`   Created new session: ${session._id}`)
    } else {
      // Update existing session with only valid schema fields
      if (!session.subjectId && resolvedSubjectId) {
        session.subjectId = resolvedSubjectId
      }
      session.endTime = endTime
      session.status = 'completed' // Must use enum value
      session.meetingEnded = true
      session.instructorLeaveTime = hostInfo?.leaveTime
        ? new Date(hostInfo.leaveTime)
        : endTime
      session.attendanceCount =
        totalParticipants || session.attendanceCount || 0
      await session.save()
      console.log(`   Updated existing session: ${session._id}`)
    }

    // Ensure baseline attendance for all roster students so absentees appear in Session History.
    // This creates missing Attendance docs with status 'absent' and does not overwrite existing ones.
    if (session.subjectId) {
      await ensureBaselineAttendanceForSession({
        sessionId: session._id
      })
    }

    // Save/update attendance records
    let savedCount = 0
    let updatedCount = 0

    if (participants && Array.isArray(participants)) {
      for (const participant of participants) {
        // Skip host from attendance records
        if (participant.isHost) {
          continue
        }

        // Resolve identity using roster first (consistent with /api/attendance)
        const participantDisplayName =
          participant.name || participant.scrapedName
        const normalizedParticipantName = normalizeNameKey(
          participantDisplayName
        )

        let matchedUser = null
        if (participant.participantId) {
          matchedUser =
            rosterIndexes.byId.get(participant.participantId.toString()) || null
        }
        if (!matchedUser && participant.email) {
          matchedUser =
            rosterIndexes.byEmail.get(
              String(participant.email).toLowerCase()
            ) || null
        }
        if (!matchedUser && participant.studentId) {
          matchedUser =
            rosterIndexes.byStudentId.get(
              String(participant.studentId).toLowerCase()
            ) || null
        }
        if (!matchedUser && normalizedParticipantName) {
          matchedUser =
            rosterIndexes.byName.get(normalizedParticipantName) || null
        }

        const identity = matchedUser
          ? {
              userId: String(matchedUser._id),
              studentId: matchedUser.studentId || null,
              displayName:
                `${matchedUser.firstName || ''} ${
                  matchedUser.lastName || ''
                }`.trim() || participantDisplayName
            }
          : await resolveParticipantIdentity(participantDisplayName)

        // Skip participants without a valid userId (required field in Attendance model)
        if (!identity.userId) {
          console.log(
            `   Skipping unidentified participant: ${
              participant.name || participant.scrapedName
            }`
          )
          continue
        }

        // Parse participant times reliably (supports ISO or HH:MM:SS)
        const joinDate =
          toIsoWithBase(
            participant.joinTimeIso || participant.joinTime,
            sessionDateBase
          ) || null
        const leaveDate =
          toIsoWithBase(
            participant.leaveTimeIso || participant.leaveTime,
            sessionDateBase
          ) || null

        const joinTime =
          participant.joinTime || formatHmsFromDate(joinDate) || null
        const leaveTime =
          participant.leaveTime || formatHmsFromDate(leaveDate) || null

        const durationSeconds =
          participant.duration ||
          (joinDate && leaveDate
            ? Math.floor((leaveDate - joinDate) / 1000)
            : 0)

        // Check if attendance record exists for this user in this session
        let attendance = await Attendance.findOne({
          sessionId: session._id,
          userId: identity.userId
        })

        // Compute final status on backend (do NOT trust popup-provided 'late')

        // Parse times for early-leave detection
        const hostLeaveTime =
          toIsoWithBase(
            hostInfo?.leaveTimeIso || hostInfo?.leaveTime,
            sessionDateBase
          ) || endTime
        const studentJoinTime = joinDate
        const studentLeaveTime = leaveDate

        const hostLeaveValid =
          hostLeaveTime instanceof Date &&
          !Number.isNaN(hostLeaveTime.getTime())
        const studentJoinValid =
          studentJoinTime instanceof Date &&
          !Number.isNaN(studentJoinTime.getTime())
        const studentLeaveValid =
          studentLeaveTime instanceof Date &&
          !Number.isNaN(studentLeaveTime.getTime())

        let finalStatus = 'present'

        if (!studentJoinValid) {
          finalStatus = 'absent'
        } else if (
          hostLeaveValid &&
          studentLeaveValid &&
          studentLeaveTime < hostLeaveTime
        ) {
          // Early leave relative to instructor -> absent
          finalStatus = 'absent'
        } else {
          const tardinessContext = {
            lateRuleTime: 15,
            tardinessThresholdPercent: 0.25,
            instructorJoinTime:
              toIsoWithBase(
                hostInfo?.joinTimeIso || hostInfo?.joinTime,
                sessionDateBase
              ) || null,
            scheduledStartTime: scheduledStartTime || startTime,
            scheduledEndTime: scheduledEndTime || endTime
          }

          const attendanceForTardiness = {
            joinTime: formatHmsFromDate(studentJoinTime) || joinTime,
            joinTimeIso: studentJoinTime.toISOString()
          }

          const sessionForTardiness = {
            ...session.toObject(),
            startTime: tardinessContext.scheduledStartTime,
            endTime: tardinessContext.scheduledEndTime
          }

          const tardinessResult = calculateTardiness(
            sessionForTardiness,
            attendanceForTardiness,
            tardinessContext
          )

          finalStatus = tardinessResult.isTardy ? 'late' : 'present'
        }

        if (attendance) {
          // Update existing record with valid schema fields
          // Preserve/restore time-in fields if they were missing (critical for Session History Time In column)
          if (!attendance.joinTime && joinTime) {
            attendance.joinTime = joinTime
          }
          if (!attendance.firstJoinTime && studentJoinValid) {
            attendance.firstJoinTime = studentJoinTime
          }
          attendance.leaveTime = leaveTime
          attendance.duration = durationSeconds
          attendance.totalDurationSeconds = durationSeconds
          attendance.status = finalStatus
          attendance.isCurrentlyInMeeting = false
          attendance.timeoutSynchronized = true
          await attendance.save()
          updatedCount++
        } else {
          // Create new attendance record with only valid schema fields
          attendance = new Attendance({
            sessionId: session._id,
            userId: identity.userId,
            studentName: participant.name || participant.scrapedName,
            joinTime: joinTime,
            leaveTime: leaveTime,
            duration: durationSeconds,
            totalDurationSeconds: durationSeconds,
            status: finalStatus,
            isCurrentlyInMeeting: false,
            timeoutSynchronized: true,
            firstJoinTime: studentJoinValid ? studentJoinTime : null
          })
          await attendance.save()
          savedCount++
        }
      }
    }

    console.log(
      `   Saved ${savedCount} new, updated ${updatedCount} attendance records`
    )

    // Clear from live cache
    const liveParticipantsCache = req.app.get('liveParticipantsCache')
    if (liveParticipantsCache) {
      liveParticipantsCache.delete(meetCode.toLowerCase())
      console.log(`   Cleared live cache for: ${meetCode}`)
    }

    // Broadcast session:ended event
    const io = req.app.get('io')
    if (io) {
      const endPayload = {
        meetCode,
        sessionId: session._id,
        duration: durationMinutes,
        totalParticipants,
        savedRecords: savedCount,
        updatedRecords: updatedCount,
        endTime: endTime.toISOString()
      }

      if (subjectId) {
        io.to(`subject:${subjectId}`).emit('session:ended', endPayload)
      }
      io.emit('session:ended', endPayload)
      console.log(`📡 Broadcasted session:ended event`)
    }

    // Create in-app notifications for all students in this session
    try {
      const recordsToNotify = await Attendance.find({ sessionId: session._id })
        .populate('userId', 'email firstName lastName notifications')
        .lean()

      // Get subject name for notifications
      const subjectName = subjectForSchedule?.subjectName || 'Unknown Subject'

      // Create bulk in-app notifications
      await createBulkAttendanceNotifications(recordsToNotify, {
        meetCode,
        subjectName,
        sessionDate: session.startTime || session.createdAt
      })

      // Also send email notifications
      for (const record of recordsToNotify) {
        const student = record.userId
        const studentEmail = student?.email
        const allowEmail = student?.notifications?.emailAlerts !== false

        if (!studentEmail || !allowEmail) continue

        const statusLabel = (record.status || 'absent').toString().toLowerCase()
        const subjectLine = 'NE-ATTEND: Attendance Status Recorded'
        const sessionDateText = session.startTime
          ? new Date(session.startTime).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })
          : 'N/A'

        const textBody =
          `Your attendance has been recorded.\n\n` +
          `Meet Code: ${meetCode || 'N/A'}\n` +
          `Session Date: ${sessionDateText}\n` +
          `Status: ${statusLabel}\n\n` +
          `If you believe this is incorrect, please contact your instructor.`

        sendMail(studentEmail, subjectLine, textBody).catch(err => {
          console.error(
            'Attendance end-session notification email failed for',
            studentEmail,
            err
          )
        })
      }
    } catch (notifyError) {
      console.error(
        'Failed to send end-session attendance notifications:',
        notifyError
      )
    }

    return res.json({
      success: true,
      message: 'Session ended and attendance saved successfully',
      sessionId: session._id,
      savedCount,
      updatedCount,
      totalParticipants
    })
  } catch (error) {
    console.error('❌ Error in end-session:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to end session'
    })
  }
})

// REGENERATE TOKEN - Create makeup session and issue tokens
// Called by instructor to create a makeup class for an existing session
// ========================================================================
router.post(
  '/sessions/:sessionId/regenerate-token',
  requireAuth,
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const { makeupDate, makeupTime, makeupEndTime, makeupReason, meetCode } =
        req.body

      // Validate sessionId
      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({
          success: false,
          error: 'InvalidSessionId',
          message: 'Invalid session ID format'
        })
      }

      // Only instructors and admins can regenerate tokens
      if (req.auth.role !== 'instructor' && req.auth.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message:
            'Only instructors or admins can regenerate tokens for makeup classes'
        })
      }

      // Find the original session
      const originSession = await Session.findById(sessionId)
      if (!originSession) {
        return res.status(404).json({
          success: false,
          error: 'SessionNotFound',
          message: 'Original session not found'
        })
      }

      // Verify instructor owns this session's subject
      if (originSession.subjectId) {
        const subject = await Subject.findById(originSession.subjectId)
        if (subject && req.auth.role !== 'admin') {
          if (String(subject.instructorId) !== String(req.auth.userId)) {
            return res.status(403).json({
              success: false,
              error: 'Forbidden',
              message: 'You can only regenerate tokens for your own subjects'
            })
          }
        }
      }

      // Parse makeup date/time
      let makeupStart = new Date()
      if (makeupDate) {
        makeupStart = new Date(makeupDate)
        if (makeupTime) {
          const [hours, minutes] = makeupTime.split(':').map(Number)
          makeupStart.setHours(hours || 0, minutes || 0, 0, 0)
        }
      }

      let makeupEnd = null
      if (makeupEndTime) {
        makeupEnd = new Date(makeupStart)
        const [hours, minutes] = makeupEndTime.split(':').map(Number)
        makeupEnd.setHours(hours || 0, minutes || 0, 0, 0)
      }

      // Import the service function
      const {
        createMakeupSessionAndTokens
      } = require('../services/attendanceTokenService')

      // Create makeup session and issue tokens
      const result = await createMakeupSessionAndTokens({
        originSessionId: sessionId,
        makeupStart,
        makeupEnd,
        reason: makeupReason,
        meetCode: meetCode || originSession.meetCode,
        logger: console
      })

      console.log(`✅ Regenerate token completed for session ${sessionId}`)
      console.log(`   Created makeup session: ${result.session._id}`)
      console.log(`   Tokens issued: ${result.tokensIssued}`)

      res.json({
        success: true,
        message: `Makeup session created with ${result.tokensIssued} token(s) issued`,
        data: {
          makeupSession: {
            _id: result.session._id,
            sessionId: result.session.sessionId,
            meetCode: result.session.meetCode,
            startTime: result.session.startTime,
            endTime: result.session.endTime,
            isOutscheduled: result.session.isOutscheduled,
            originSessionId: result.session.originSessionId,
            makeupReason: result.session.makeupReason
          },
          tokensIssued: result.tokensIssued,
          totalStudents: result.totalStudents,
          students: result.students
        }
      })
    } catch (error) {
      console.error('❌ Error in regenerate-token:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to regenerate tokens'
      })
    }
  }
)

module.exports = router
