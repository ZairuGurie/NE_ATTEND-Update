const { normalizeMeetingStatus } = require('../utils/meetingStatus')
const { deriveMeetingLifecycle } = require('../utils/meetingLifecycle')
const { sendMail } = require('../utils/email')

const meetingStartEmailCache = new Map()
const MEETING_START_EMAIL_TTL_MS = 6 * 60 * 60 * 1000

function getMeetingStartDateKey (sessionDate) {
  const base = sessionDate ? new Date(sessionDate) : new Date()
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }
  base.setHours(0, 0, 0, 0)
  return base.toISOString().slice(0, 10)
}

function getMeetingStartEmailCacheKey ({ meetCode, subjectId, sessionDate }) {
  const meet = meetCode ? String(meetCode).toLowerCase() : 'unknown'
  const subj = subjectId ? subjectId.toString() : 'unknown'
  const dateKey = getMeetingStartDateKey(sessionDate)
  return `${meet}:${subj}:${dateKey}`
}

function cleanupMeetingStartEmailCache () {
  const now = Date.now()
  for (const [key, entry] of meetingStartEmailCache.entries()) {
    if (!entry || now - entry.timestamp > MEETING_START_EMAIL_TTL_MS) {
      meetingStartEmailCache.delete(key)
    }
  }
}

function hasActiveHost (participants) {
  if (!Array.isArray(participants) || participants.length === 0) return false
  return participants.some(p => p?.isHost && p?.isLive !== false)
}

function queueMeetingStartedEmails ({
  meetCode,
  subjectId,
  sessionDate,
  getModel
}) {
  if (!getModel || !subjectId) return
  if (!meetCode && !subjectId) return

  cleanupMeetingStartEmailCache()

  const cacheKey = getMeetingStartEmailCacheKey({
    meetCode,
    subjectId,
    sessionDate
  })

  if (meetingStartEmailCache.has(cacheKey)) {
    return
  }

  meetingStartEmailCache.set(cacheKey, { timestamp: Date.now() })

  setImmediate(async () => {
    try {
      const Subject = getModel('Subject')
      const User = getModel('User')

      const subject = await Subject.findById(subjectId)
        .select('subjectName meetingLink sections')
        .lean()

      if (!subject) return

      const sections = Array.isArray(subject.sections) ? subject.sections : []
      if (sections.length === 0) return

      const students = await User.find({
        role: 'student',
        section: { $in: sections }
      })
        .select('email firstName lastName notifications section')
        .lean()

      if (!Array.isArray(students) || students.length === 0) return

      const subjectName = subject.subjectName || 'Your class'
      const subjectLine = `Meeting started: ${subjectName}`
      const loginUrl = `${
        process.env.FRONTEND_BASE_URL || 'http://localhost:5173'
      }/login`
      const deliveredTo = new Set()

      for (const student of students) {
        const studentEmail = student?.email
        const allowEmail = student?.notifications?.emailAlerts !== false
        if (!studentEmail || !allowEmail) continue
        if (deliveredTo.has(studentEmail)) continue
        deliveredTo.add(studentEmail)

        const studentName =
          [student?.firstName, student?.lastName].filter(Boolean).join(' ') ||
          'Student'

        const textBody =
          `Hello ${studentName},\n\n` +
          `Your instructor has started the meeting for: ${subjectName}.\n\n` +
          `To join, please log in to NE-Attend first, then use the Join button inside the app.\n\n` +
          `Login: ${loginUrl}\n\n` +
          `This is an automated message from NE-Attend.`

        sendMail(studentEmail, subjectLine, textBody).catch(err => {
          console.error(
            'Meeting-start email failed for',
            studentEmail,
            err?.message || err
          )
        })
      }
    } catch (error) {
      console.error('Meeting-start email handler failed:', error)
    }
  })
}

function sanitizeParticipantsArray (input) {
  if (Array.isArray(input)) {
    return input
  }

  if (input && typeof input === 'object') {
    return [input]
  }

  if (input != null) {
    console.warn(
      '⚠️ Unexpected participants payload type for progress endpoint:',
      { type: typeof input, hasLength: input && input.length }
    )
  }

  return []
}

async function handleAttendanceProgress (req, res, deps) {
  const {
    AttendanceToken,
    Session,
    getModel,
    recentProgressRequests,
    MAX_RECENT_REQUESTS,
    extensionActivityTracker,
    normalizeParticipant,
    normalizeParticipantsList
  } = deps || {}

  // Declare variables outside try block so they're accessible in catch block for error handling
  const payload = req.body || {}
  const io = req.app.get('io')
  const meetCode =
    payload.meetCode ||
    (payload.participant && payload.participant.meetCode) ||
    null
  let subjectId = payload.subjectId

  try {
    const timestampIso = payload.timestamp || new Date().toISOString()
    const sessionDate = payload.sessionDate || timestampIso
    const verificationToken = payload.verificationToken
    const meetingStatus = normalizeMeetingStatus(payload.meetingStatus) // Extract and normalize meetingStatus from payload
    const isUnauthenticated =
      payload.isUnauthenticated === true || !verificationToken // PHASE 1 FIX: Accept unauthenticated updates
    const participantsArray = sanitizeParticipantsArray(payload.participants)
    const currentParticipantsArray = sanitizeParticipantsArray(
      payload.currentParticipants
    )
    const participantCount =
      participantsArray.length || currentParticipantsArray.length || 0

    // PHASE 1 GUARDRAIL: Reject clearly invalid payloads with no meetCode and no participants
    if (!meetCode && participantCount === 0) {
      console.warn(
        '⚠️ === PROGRESS ENDPOINT - INVALID PAYLOAD (NO MEETCODE AND NO PARTICIPANTS) ==='
      )
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message:
          'meetCode or participants are required for real-time attendance updates'
      })
    }

    console.log(`📥 === PROGRESS ENDPOINT REQUEST ===`)
    console.log(`   MeetCode: ${meetCode}`)
    console.log(`   SubjectId: ${subjectId}`)
    console.log(
      `   VerificationToken: ${
        verificationToken
          ? 'present (' + verificationToken.length + ' chars)'
          : 'missing'
      }`
    )
    console.log(
      `   IsUnauthenticated: ${
        isUnauthenticated ? '⚠️ YES (will show with warnings)' : '✅ NO'
      }`
    )
    console.log(`   Payload type: ${payload.type || 'attendance_progress'}`)
    console.log(`   Participant count: ${participantCount}`)
    console.log(`   Meeting status: ${meetingStatus}`)

    // PHASE 1 FIX: Accept unauthenticated updates but mark them clearly
    if (!verificationToken && !isUnauthenticated) {
      console.warn(
        `⚠️ === PROGRESS ENDPOINT - MISSING TOKEN (LEGACY CHECK) ===`
      )
      console.warn(`   MeetCode: ${meetCode}`)
      console.warn(`   SubjectId: ${subjectId}`)
      console.warn(
        `   Reason: verificationToken is missing but isUnauthenticated flag not set`
      )
      console.warn(
        `   💡 Accepting as unauthenticated update (backward compatibility)`
      )
      // Continue processing as unauthenticated update
    }

    // PHASE 1 FIX: Only validate token if authenticated
    let tokenRecord = null
    if (!isUnauthenticated && verificationToken && AttendanceToken) {
      // Find token first (subjectId is optional in query for validation)
      tokenRecord = await AttendanceToken.findOne({
        token: verificationToken,
        consumed: false
      })

      if (!tokenRecord) {
        console.warn(
          `⚠️ === PROGRESS ENDPOINT - INVALID TOKEN (ACCEPTING AS UNAUTHENTICATED) ===`
        )
        console.warn(`   MeetCode: ${meetCode}`)
        console.warn(`   SubjectId: ${subjectId}`)
        console.warn(
          `   Reason: Token not found in database or already consumed`
        )
        console.warn(
          `   💡 Accepting as unauthenticated update - Dashboard will show with warnings`
        )
        // Continue processing as unauthenticated update instead of returning 401
      }
    } else if (isUnauthenticated) {
      console.log(`ℹ️ === PROGRESS ENDPOINT - UNAUTHENTICATED UPDATE ===`)
      console.log(`   MeetCode: ${meetCode}`)
      console.log(
        `   💡 Accepting unauthenticated update - Dashboard will show with warnings`
      )
    }

    // PHASE 1 FIX: Skip token validation for unauthenticated updates
    // For authenticated updates, validate token
    if (!isUnauthenticated && verificationToken) {
      if (!tokenRecord) {
        // Token was provided but not found - treat as unauthenticated
        console.warn(
          `⚠️ Token not found but verificationToken provided - treating as unauthenticated`
        )
        // Continue as unauthenticated update
      } else if (new Date() >= tokenRecord.expiresAt) {
        console.warn(`⚠️ Token expired - treating as unauthenticated update`)
        // Continue as unauthenticated update
      } else {
        // Token is valid - verify subjectId match
        const tokenSubjectId = tokenRecord.subjectId?.toString()
        const payloadSubjectId = subjectId?.toString()

        if (
          tokenSubjectId &&
          payloadSubjectId &&
          tokenSubjectId !== payloadSubjectId
        ) {
          console.error('❌ Token subjectId mismatch:', {
            tokenSubjectId,
            payloadSubjectId,
            meetCode,
            tokenId: tokenRecord._id
          })

          // Emit error event to Dashboard if subjectId available
          if (io && payloadSubjectId) {
            try {
              io.to(`subject:${payloadSubjectId}`).emit('attendance:error', {
                type: 'TokenMismatch',
                message: `Token subjectId (${tokenSubjectId}) does not match payload subjectId (${payloadSubjectId})`,
                statusCode: 403,
                meetCode: meetCode || null,
                subjectId: payloadSubjectId,
                timestamp: new Date().toISOString()
              })
            } catch (emitError) {
              console.error('❌ Failed to emit error event:', emitError)
            }
          }

          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Token subjectId does not match payload subjectId'
          })
        }

        console.log(`✅ === TOKEN VALIDATION SUCCESS ===`)
        console.log(`   Token ID: ${tokenRecord._id}`)
        console.log(`   Token subjectId: ${tokenRecord.subjectId}`)
        console.log(`   Token groupId: ${tokenRecord.groupId}`)
        console.log(`   Token expiresAt: ${tokenRecord.expiresAt}`)
      }
    }

    // PHASE 1 FIX: Handle subjectId for both authenticated and unauthenticated updates
    // For authenticated updates, validate and use token's subjectId
    // For unauthenticated updates, use payload's subjectId or meetCode-based lookup
    if (!isUnauthenticated && tokenRecord) {
      const tokenSubjectId = tokenRecord.subjectId?.toString()
      const payloadSubjectId = subjectId?.toString()

      // Verify token's subjectId matches payload's subjectId (security check)
      if (
        tokenSubjectId &&
        payloadSubjectId &&
        tokenSubjectId !== payloadSubjectId
      ) {
        console.error('❌ Token subjectId mismatch:', {
          tokenSubjectId,
          payloadSubjectId,
          meetCode,
          tokenId: tokenRecord._id
        })

        // Emit error event to Dashboard if subjectId available
        if (io && payloadSubjectId) {
          try {
            io.to(`subject:${payloadSubjectId}`).emit('attendance:error', {
              type: 'TokenMismatch',
              message: `Token subjectId (${tokenSubjectId}) does not match payload subjectId (${payloadSubjectId})`,
              statusCode: 403,
              meetCode: meetCode || null,
              subjectId: payloadSubjectId,
              timestamp: new Date().toISOString()
            })
          } catch (emitError) {
            console.error('❌ Failed to emit error event:', emitError)
          }
        }

        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Token subjectId (${tokenSubjectId}) does not match payload subjectId (${payloadSubjectId})`
        })
      }

      // If token has subjectId but payload doesn't, use token's subjectId
      if (tokenSubjectId && !payloadSubjectId) {
        subjectId = tokenRecord.subjectId
        console.log('📝 Using subjectId from token:', subjectId)
      } else if (!tokenSubjectId && payloadSubjectId) {
        // If payload has subjectId but token doesn't, use payload's subjectId (backward compatibility)
        console.log(
          '📝 Using subjectId from payload (token has no subjectId):',
          payloadSubjectId
        )
      }
    }

    // PHASE 1 FIX: For unauthenticated updates, try to find subjectId from meetCode if not provided
    if (isUnauthenticated && !subjectId && meetCode && getModel) {
      try {
        // Try to find subject by meetingLink containing meetCode
        const Subject = getModel('Subject')
        const subject = await Subject.findOne({
          meetingLink: { $regex: meetCode, $options: 'i' }
        })
          .select('_id subjectName')
          .lean()

        if (subject) {
          subjectId = subject._id
          console.log(
            `📝 Found subjectId from meetCode lookup: ${subjectId} (${subject.subjectName})`
          )
        } else {
          console.warn(`⚠️ Could not find subjectId from meetCode: ${meetCode}`)
          console.warn(
            `   💡 Unauthenticated update will be broadcast globally (no room filtering)`
          )
        }
      } catch (err) {
        console.warn(
          `⚠️ Error looking up subjectId from meetCode:`,
          err.message
        )
      }
    }

    // PHASE 1 FIX: Only require subjectId for authenticated updates
    // Unauthenticated updates can proceed without subjectId (will broadcast globally)
    if (!isUnauthenticated && !subjectId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'subjectId is required for authenticated real-time updates'
      })
    }

    // PHASE 1 FIX: Only validate subject exists for authenticated updates
    // Unauthenticated updates can proceed without subject validation
    if (!isUnauthenticated && subjectId && getModel) {
      const Subject = getModel('Subject')
      const subject = await Subject.findById(subjectId)
        .select('_id instructorId')
        .lean()
      if (!subject) {
        return res.status(404).json({
          success: false,
          error: 'Subject not found',
          message:
            'Unable to authorize real-time updates without a valid subject'
        })
      }
    }

    // LIVE MONITORING FIX: Do NOT create Session in database during live monitoring
    // Session should only be created when meeting ENDS (via /api/attendance endpoint)
    // This endpoint only caches data in liveParticipantsCache for real-time display
    let session = null
    let instructorLeaveTimeIso = null
    let meetingEnded = false

    if (meetCode && Session) {
      const sessionDateParsed = new Date(sessionDate)
      sessionDateParsed.setHours(0, 0, 0, 0)

      // Only LOOK for existing session, do NOT create new ones
      // Sessions are created by the main /api/attendance endpoint at meeting end
      try {
        session = await Session.findOne({
          meetCode,
          sessionDate: sessionDateParsed
        }).sort({ createdAt: -1 })

        if (session) {
          // Found existing session - use it for status determination
          console.log(
            `✅ Found existing session for progress endpoint: ${meetCode}`
          )
          instructorLeaveTimeIso = session.instructorLeaveTime
          meetingEnded = session.meetingEnded || false
        } else {
          // No session found - this is normal for live monitoring
          // Session will be created when meeting ends via /api/attendance
          console.log(
            `ℹ️ No session in database for live monitoring: ${meetCode} (will be created at meeting end)`
          )
        }
      } catch (error) {
        console.error(
          `❌ Failed to find session for progress endpoint: ${error.message}`
        )
        // Continue without session - live monitoring works with cache only
        session = null
      }
    }

    const lifecycle = deriveMeetingLifecycle({
      meetingStatus,
      meetingEnded,
      hasParticipants: participantCount > 0
    })

    console.log(`   Meeting lifecycle phase: ${lifecycle.phase}`)

    const shouldTriggerMeetingStartEmail =
      Boolean(subjectId) &&
      lifecycle.phase === 'live' &&
      !meetingEnded &&
      hasActiveHost(
        participantsArray.length > 0
          ? participantsArray
          : currentParticipantsArray
      )

    if (shouldTriggerMeetingStartEmail) {
      queueMeetingStartedEmails({
        meetCode,
        subjectId,
        sessionDate,
        getModel
      })
    }

    // PHASE 1.4: Track recent progress requests for debug endpoint
    if (recentProgressRequests && Array.isArray(recentProgressRequests)) {
      recentProgressRequests.push({
        timestamp: new Date().toISOString(),
        meetCode,
        subjectId: subjectId?.toString() || null,
        isUnauthenticated,
        participantCount,
        meetingStatus,
        lifecyclePhase: lifecycle.phase
      })
      // Keep only last MAX_RECENT_REQUESTS
      if (
        typeof MAX_RECENT_REQUESTS === 'number' &&
        recentProgressRequests.length > MAX_RECENT_REQUESTS
      ) {
        recentProgressRequests.shift()
      }
    }

    let broadcastPayload

    if (payload.type === 'join' || payload.type === 'leave') {
      const participant = await normalizeParticipant(
        payload.participant || {},
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
        currentParticipantsArray,
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
        eventType: payload.type,
        meetCode,
        participant,
        currentParticipants,
        timestamp: timestampIso,
        sessionDate,
        meetingEnded: meetingEnded,
        instructorLeaveTime: instructorLeaveTimeIso,
        subjectId: subjectId, // Include subjectId for frontend filtering
        meetingStatus: meetingStatus // Include meetingStatus for real-time status display
      }

      // Broadcast meeting end event if instructor left
      // Note: Main attendance route (/api/attendance) is authoritative for final status
      // This endpoint only provides real-time progress updates, not final status
      if (payload.type === 'leave' && meetingEnded && instructorLeaveTimeIso) {
        console.log(
          '🔄 Meeting ended. Broadcasting real-time progress update (final status handled by /api/attendance)...'
        )

        // Update session status to 'completed' when instructor leaves
        if (session && session._id && Session) {
          try {
            const updateResult = await Session.findByIdAndUpdate(
              session._id,
              {
                $set: {
                  meetingEnded: true,
                  instructorLeaveTime: instructorLeaveTimeIso,
                  status: 'completed' // Update status to completed
                }
              },
              { new: false }
            )

            if (updateResult) {
              console.log(
                `✅ Updated session ${session._id} to completed in progress endpoint`
              )
            } else {
              console.warn(
                `⚠️ Session update returned null for meeting end in progress endpoint`
              )
            }
          } catch (dbError) {
            console.error(
              `❌ Database error updating session in progress endpoint:`,
              dbError
            )
          }
        }

        if (io) {
          // Emit real-time progress update (not final status)
          // Final status will be emitted by the main attendance route
          const progressPayload = {
            ...broadcastPayload,
            type: 'meeting_ended_progress',
            meetCode,
            sessionId: session?._id || null,
            instructorLeaveTime: instructorLeaveTimeIso,
            timestamp: timestampIso,
            statusTransition: 'in_progress', // Indicate this is progress, not final
            note: 'Final status will be updated by attendance route'
          }

          // Emit to subject-specific room for security and efficiency
          // Fallback to global emit if subjectId not available (legacy support)
          if (subjectId) {
            io.to(`subject:${subjectId.toString()}`).emit(
              'attendance:update',
              progressPayload
            )
            console.log(
              `📡 Emitted meeting_ended_progress to room: subject:${subjectId.toString()}`
            )
          } else {
            // Phase 2 Task 2: Legacy fallback: emit to catch-all room if no subjectId
            const catchAllRoom = 'subject:unauthenticated'
            io.to(catchAllRoom).emit('attendance:update', progressPayload)
            console.log(
              `📡 Emitted meeting_ended_progress to catch-all room: ${catchAllRoom} (no subjectId - legacy mode)`
            )
          }
        }
      }

      console.log(
        `📡 Broadcasted ${payload.type} event for: ${participant.name}`
      )
    } else {
      const rawParticipantsForNormalization =
        participantsArray.length > 0
          ? participantsArray
          : currentParticipantsArray

      const participants = await normalizeParticipantsList(
        rawParticipantsForNormalization,
        {
          meetCode,
          timestamp: timestampIso,
          sessionDate,
          defaultMeetCode: meetCode,
          instructorLeaveTimeIso: instructorLeaveTimeIso,
          meetingEnded: meetingEnded
        }
      )

      // Get subject name if subjectId is available
      let subjectName = null
      if (subjectId) {
        try {
          const Subject = require('../models/Subject')
          const subject = await Subject.findById(subjectId)
            .select('subjectName')
            .lean()
          subjectName = subject?.subjectName || null
        } catch (err) {
          console.warn('⚠️ Could not fetch subject name:', err.message)
        }
      }

      // TOKENIZATION: Add tokens to participants for consistent deduplication
      const tokenizedParticipants = participants.map(p =>
        deps.tokenizeParticipant
          ? deps.tokenizeParticipant(p, meetCode, sessionDate)
          : p
      )

      // Generate session token for tracking
      const sessionToken = deps.generateSessionToken
        ? deps.generateSessionToken(
            meetCode,
            timestampIso,
            subjectId?.toString()
          )
        : null

      broadcastPayload = {
        type: 'attendance_progress',
        meetCode,
        participants: tokenizedParticipants,
        timestamp: timestampIso,
        sessionDate,
        meetingEnded: meetingEnded,
        instructorLeaveTime: instructorLeaveTimeIso,
        subjectId: subjectId, // Include subjectId for frontend filtering
        subjectName: subjectName, // Include subjectName for display
        meetingStatus: meetingStatus, // Include meetingStatus for real-time status display
        isUnauthenticated: isUnauthenticated, // PHASE 1 FIX: Flag for unauthenticated updates
        authWarning: isUnauthenticated, // Backward compatibility flag
        // Token fields for consistent tracking
        sessionToken: sessionToken,
        tokenizedAt: new Date().toISOString(),
        tokenVersion: sessionToken ? '1.0' : null
      }

      if (sessionToken) {
        console.log(`🔑 === BACKEND TOKENIZATION ===`)
        console.log(`   Session token: ${sessionToken}`)
        console.log(
          `   Tokenized participants: ${tokenizedParticipants.length}`
        )
      }

      // NOTE: liveParticipantsCache usage removed; real-time web polling is deprecated.

      if (isUnauthenticated) {
        console.log(
          '📡 Broadcasted unauthenticated progress update (will show with warnings in Dashboard)'
        )
      } else {
        console.log('📡 Broadcasted authenticated progress update')
      }
    }

    // PHASE 1.1: Track extension activity via REST API and emit status events
    if (io && meetCode && extensionActivityTracker) {
      try {
        const activityKey = `${meetCode}_${subjectId || 'unknown'}`
        const lastActivity = extensionActivityTracker.get(activityKey)
        const now = Date.now()

        if (!lastActivity) {
          // New extension connection detected via REST API
          console.log(`✅ === NEW EXTENSION CONNECTION DETECTED (REST API) ===`)
          console.log(`   Activity Key: ${activityKey}`)
          console.log(`   MeetCode: ${meetCode}`)
          console.log(`   SubjectId: ${subjectId || 'unknown'}`)
          console.log(`   Participant Count: ${participantCount}`)

          // Emit extension:connected event to all dashboards
          io.emit('extension:connected', {
            meetCode,
            subjectId: subjectId || null,
            timestamp: new Date().toISOString(),
            source: 'rest_api', // Indicate this is from REST API, not Socket.IO
            participantCount
          })

          console.log(`📡 Emitted extension:connected event (REST API source)`)
        } else {
          // Existing extension - update activity
          const timeSinceLastActivity = now - lastActivity.lastActivity
          if (timeSinceLastActivity > 5000) {
            // More than 5 seconds since last update - extension was inactive but now active again
            console.log(
              `🔄 Extension reconnected after ${Math.round(
                timeSinceLastActivity / 1000
              )}s inactivity`
            )
            io.emit('extension:connected', {
              meetCode,
              subjectId: subjectId || null,
              timestamp: new Date().toISOString(),
              source: 'rest_api',
              participantCount
            })
          }
        }

        // Update activity tracker
        extensionActivityTracker.set(activityKey, {
          meetCode,
          subjectId: subjectId || null,
          lastActivity: now,
          participantCount,
          firstSeen: (lastActivity && lastActivity.firstSeen) || now
        })

        // Emit heartbeat event with each progress update
        io.emit('extension:heartbeat', {
          meetCode,
          subjectId: subjectId || null,
          timestamp: new Date().toISOString(),
          source: 'rest_api',
          participantCount
        })

        if (!lastActivity || now - lastActivity.lastActivity > 3000) {
          // Only log heartbeat if it's been more than 3 seconds (avoid spam)
          console.log(
            `💓 Extension heartbeat (REST API): ${meetCode}, ${participantCount} participants`
          )
        }
      } catch (trackingError) {
        console.error('❌ Error tracking extension activity:', trackingError)
        // Don't fail the request if tracking fails
      }
    }

    // Emit real-time update with error handling
    if (io && broadcastPayload) {
      try {
        // Realtime Socket.IO streaming for web dashboards has been disabled.
        console.log(
          'ℹ️ /api/attendance/progress processed payload without Socket.IO streaming. Type:',
          broadcastPayload.type
        )
      } catch (emitError) {
        console.error('❌ Failed during realtime logging:', emitError)
        // Continue processing - don't fail the request due to logging issues
      }
    }

    res.json({
      success: true,
      message: 'Update broadcasted',
      payload: broadcastPayload
    })
  } catch (error) {
    console.error('❌ Error in progress endpoint:', error)

    // Provide more specific error messages based on error type
    let statusCode = 500
    let errorMessage = 'Internal server error'
    let errorType = error.name || 'UnknownError'

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

    // Emit error event to Dashboard via Socket.IO if subjectId is available
    // This provides user-visible feedback when backend rejects updates
    if (io && subjectId) {
      try {
        io.to(`subject:${subjectId.toString()}`).emit('attendance:error', {
          type: errorType,
          message: errorMessage,
          statusCode: statusCode,
          meetCode: meetCode || null,
          subjectId: subjectId,
          timestamp: new Date().toISOString()
        })
        console.log(
          `📡 Emitted error event to room: subject:${subjectId.toString()}`
        )
      } catch (emitError) {
        console.error('❌ Failed to emit error event:', emitError)
        // Continue - don't fail the response due to Socket.IO issues
      }
    } else if (io && !subjectId) {
      // Fallback: emit globally if no subjectId (legacy support)
      try {
        io.emit('attendance:error', {
          type: errorType,
          message: errorMessage,
          statusCode: statusCode,
          meetCode: meetCode || null,
          timestamp: new Date().toISOString()
        })
        console.log(
          '📡 Emitted error event globally (no subjectId - legacy mode)'
        )
      } catch (emitError) {
        console.error('❌ Failed to emit error event:', emitError)
      }
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      type: errorType
    })
  }
}

module.exports = {
  handleAttendanceProgress
}
