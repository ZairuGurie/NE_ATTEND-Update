/* eslint-env node */
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const http = require('http')
const { Server } = require('socket.io')
require('dotenv').config()
const {
  getStatus,
  connectivity,
  getCloudConnection,
  getLocalConnection,
  isCloudOnline
} = require('./db/connectionManager')
const { startSyncWorker } = require('./services/syncWorker')
const { getModel } = require('./services/dataStore')
const { handleAttendanceProgress } = require('./services/attendanceRealtime')
const {
  PARTICIPANT_CACHE_TTL,
  participantIdentityCache,
  resolveParticipantIdentity
} = require('./services/participantIdentity')
const { registerSocketHandlers } = require('./socketHandlers')
const {
  startScheduleEngine,
  previewScheduledSessions,
  getScheduleEngineState
} = require('./services/scheduleEngine')
const { cleanupExpiredTokens } = require('./services/attendanceTokenService')
const { startReportScheduler } = require('./services/reportScheduler')

const Session = getModel('Session')
const AttendanceToken = getModel('AttendanceToken')
// PHASE 1.4: Track recent progress requests for debug endpoint
const recentProgressRequests = [] // Array of {timestamp, meetCode, subjectId, isUnauthenticated, participantCount}
const MAX_RECENT_REQUESTS = 50 // Keep last 50 requests

// REAL-TIME FIX: Live participants cache for Dashboard polling fallback
// This cache stores the most recent participants data for each meetCode
// Dashboard can poll this to get live data when Socket.IO doesn't work
const liveParticipantsCache = new Map() // Map<meetCode, {participants, timestamp, subjectId, meetingStatus}>
const LIVE_CACHE_TTL = 120000 // 120 seconds - cache expires after 2 minutes of inactivity (increased from 60s for reliability)
const SCHEDULE_ENGINE_ENABLED = process.env.SCHEDULE_ENGINE_ENABLED !== 'false'
const TOKEN_CLEANUP_INTERVAL_MINUTES = Number(
  process.env.TOKEN_CLEANUP_INTERVAL_MINUTES || 30
)
// Use shared timeout manager to prevent race conditions
const _timeoutManager = require('./utils/timeoutManager') // Reserved for future use
// Canonical meeting status values shared across realtime pipeline
const {
  MEETING_STATUS,
  normalizeMeetingStatus,
  buildMeetingStatusPayload: _buildMeetingStatusPayload
} = require('./utils/meetingStatus')
const { deriveMeetingLifecycle } = require('./utils/meetingLifecycle')
// Use shared status utilities for consistent status determination
const {
  deriveRawStatus,
  formatStatusLabel,
  toIsoWithBase,
  formatHmsFromDate
} = require('./utils/statusUtils')
// Tokenization utilities for consistent token generation
const {
  tokenizeParticipant,
  tokenizePayload: _tokenizePayload, // Reserved for batch tokenization
  generateSessionToken
} = require('./utils/tokenization')

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

  app.get('/api/schedule/preview', async (req, res) => {
    try {
      const lookaheadMinutes = req.query.lookahead
        ? Number(req.query.lookahead)
        : undefined
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const windowStart = req.query.windowStart
      const windowEnd = req.query.windowEnd

      const preview = await previewScheduledSessions({
        lookaheadMinutes,
        limit,
        windowStart,
        windowEnd
      })

      res.json({
        success: true,
        ...preview
      })
    } catch (error) {
      console.error('❌ Error in schedule preview endpoint:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  app.get('/api/schedule/engine-state', (req, res) => {
    try {
      res.json({
        success: true,
        enabled: SCHEDULE_ENGINE_ENABLED,
        state: getScheduleEngineState()
      })
    } catch (error) {
      console.error('❌ Error in schedule engine state endpoint:', error)
      res.status(500).json({
        success: false,
        error: error.message
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
    // CRITICAL: Preserve avatarUrl for participant identification/deduplication
    avatarUrl: participant.avatarUrl || null,
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
    // Duration: preserve both field names for compatibility
    durationSeconds,
    attendedDuration: durationSeconds, // Preserve original field name
    status: statusLabel,
    rawStatus,
    // CRITICAL: Preserve isHost flag from extension
    isHost: participant.isHost || false,
    isLive: rawStatus !== 'left' && rawStatus !== 'absent',
    isCurrentlyInMeeting:
      participant.isLive || (rawStatus !== 'left' && rawStatus !== 'absent'),
    timeoutSynchronized: participant.timeoutSynchronized || false,
    lastSeen: new Date().toISOString()
  }
}

async function normalizeParticipantsList (participants = [], options = {}) {
  return Promise.all(
    participants.map(participant => normalizeParticipant(participant, options))
  )
}

// Parse CORS origins from environment variable
// Supports comma-separated list or single origin
// Falls back to development defaults if not set
const parseCorsOrigins = () => {
  const envOrigins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN

  if (envOrigins) {
    // Split by comma and trim whitespace
    return envOrigins
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  }

  // Default development origins
  return [
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8000',
    'http://localhost:5173',
    'http://localhost:8000',
    'http://localhost:3000',
    'https://meet.google.com', // Required for browser extension content scripts
    'chrome-extension://nijfoalijgchbemnefmollbgbgmllhjb' // NE-Attend browser extension
  ]
}

const allowedOrigins = parseCorsOrigins()
if (process.env.NODE_ENV === 'production') {
  const rawCors = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN
  if (!rawCors) {
    console.error(
      '❌ CRITICAL: In production, CORS_ORIGINS or CORS_ORIGIN must be set explicitly.'
    )
    console.error(
      `   Current allowed origins fallback: ${allowedOrigins.join(', ')}`
    )
    process.exit(1)
  }
}

// Track origins that have already been warned about (to reduce log spam)
const warnedOrigins = new Set()

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
})
app.set('io', io)
app.set('liveParticipantsCache', liveParticipantsCache) // Expose cache for routes to clear on session delete
const PORT = process.env.PORT || 8000

// Middleware
// CORS configuration - allow frontend origin and common development origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
    if (!origin) return callback(null, true)

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, allow any origin for easier testing
      // WARNING: This is a security risk if deployed without proper NODE_ENV=production
      if (
        process.env.NODE_ENV === undefined ||
        process.env.NODE_ENV === 'development'
      ) {
        // Only warn once per origin to reduce log spam
        if (!warnedOrigins.has(origin)) {
          warnedOrigins.add(origin)
          console.warn(
            `⚠️  CORS: Allowing origin ${origin} in development mode. Ensure NODE_ENV=production in production!`
          )
        }
      }
      callback(null, true)
    } else {
      // In production, strictly enforce allowed origins
      // Only warn once per rejected origin
      if (!warnedOrigins.has(origin)) {
        warnedOrigins.add(origin)
        console.warn(
          `❌ CORS: Rejected origin ${origin}. Allowed origins: ${allowedOrigins.join(
            ', '
          )}`
        )
      }
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}

app.use(cors(corsOptions))
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ extended: true }))

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(
      `📥 ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`
    )
  })
  next()
})

// Initialize connections
const localConn = getLocalConnection()
const cloudConn = getCloudConnection()

const logStatus = (label, status) => {
  const masked = uri => {
    if (!uri) return '<none>'
    try {
      return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')
    } catch {
      return uri
    }
  }
  const info = masked(status.uri)
  console.log(`🔌 ${label} (${info}) → ${status.status}`)
  if (status.lastError) {
    console.log(
      `   ↳ last error: ${status.lastError.message || status.lastError}`
    )
  }
}

// Promise to wait for at least one database connection
function waitForConnection () {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const status = getStatus()
      const hasConnection =
        status.local.status === 'connected' ||
        status.cloud.status === 'connected'
      if (!hasConnection) {
        console.error('')
        console.error('❌ No database connection available after 10 seconds')
        console.error('')
        console.error('   Possible solutions:')
        console.error('   1. Start MongoDB service:')
        console.error('      - Windows: Check Services app for MongoDB')
        console.error('      - Mac: brew services start mongodb-community')
        console.error('      - Linux: sudo systemctl start mongod')
        console.error('')
        console.error('   2. Configure MongoDB connection:')
        console.error('      - Set MONGODB_URI in .env file')
        console.error(
          '      - Or use MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas'
        )
        console.error('')
        console.error('   3. Use simple-server.js (no MongoDB required):')
        console.error('      - Run: npm run dev:simple')
        console.error('      - Or: npm run simple-dev')
        console.error('      - Uses JSON file database (limited functionality)')
        console.error('')
        reject(new Error('No database connection available'))
      } else {
        resolve()
      }
    }, 10000) // 10 second timeout

    // Check if already connected
    const checkConnection = () => {
      const status = getStatus()
      const hasConnection =
        status.local.status === 'connected' ||
        status.cloud.status === 'connected'
      if (hasConnection) {
        clearTimeout(timeout)
        resolve()
      }
    }

    // Listen for connection events
    if (localConn) {
      connectivity.once('local:connected', () => {
        console.log('✅ Local MongoDB ready')
        checkConnection()
      })
    }

    if (cloudConn) {
      connectivity.once('cloud:connected', () => {
        console.log('✅ Cloud MongoDB ready')
        checkConnection()
      })
      connectivity.on('cloud:error', err => {
        console.error('⚠️  Cloud Mongo error:', err.message)
      })
    }

    // Check immediately in case already connected
    checkConnection()

    connectivity.on('status', status => {
      logStatus('Cloud', status.cloud)
      logStatus('Local', status.local)
      checkConnection()
    })
  })
}

// Emit initial status snapshot
const initialStatus = getStatus()
logStatus('Cloud', initialStatus.cloud)
logStatus('Local', initialStatus.local)

startSyncWorker()

// Start report scheduler for periodic report generation
startReportScheduler()

// Import routes
console.log('📦 Loading route modules...')
const attendanceRoutes = require('./routes/attendance')
const attendanceRiskRoutes = require('./routes/attendanceRisk')
const appealsRoutes = require('./routes/appeals')
const userRoutes = require('./routes/users')
const authRoutes = require('./routes/auth')
const notesRoutes = require('./routes/notes')
const communicationsRoutes = require('./routes/communications')
const subjectRoutes = require('./routes/subjects')
const groupsRoutes = require('./routes/groups')
const gradesRoutes = require('./routes/grades')
const instructorReportRoutes = require('./routes/instructorReports')
const systemRoutes = require('./routes/system')
const notificationsRoutes = require('./routes/notifications')
console.log('✅ All route modules loaded')

// Use routes
console.log('🔗 Registering API routes...')

// CRITICAL: The /api/attendance/progress endpoint MUST be registered BEFORE the attendance router
// because the router also has a /progress endpoint that would shadow this more comprehensive one.
// This endpoint has PHASE 1/2 fixes, liveParticipantsCache updates, and extension activity tracking.
// See line 424+ for the actual handler.
console.log(
  '   ⚡ /api/attendance/progress registered BEFORE router (real-time updates)'
)

app.use('/api/attendance', attendanceRoutes)
app.use('/api/attendance/risk', attendanceRiskRoutes)
app.use('/api/appeals', appealsRoutes)
console.log('   ✅ /api/attendance routes registered')
app.use('/api/users', userRoutes)
console.log('   ✅ /api/users routes registered')
app.use('/api/auth', authRoutes)
console.log('   ✅ /api/auth routes registered')
app.use('/api/notes', notesRoutes)
console.log('   ✅ /api/notes routes registered')
app.use('/api/communications', communicationsRoutes)
console.log('   ✅ /api/communications routes registered')
app.use('/api/subjects', subjectRoutes)
console.log('   ✅ /api/subjects routes registered')
app.use('/api/groups', groupsRoutes)
console.log('   ✅ /api/groups routes registered')
app.use('/api/grades', gradesRoutes)
console.log('   ✅ /api/grades routes registered')
app.use('/api/instructor/reports', instructorReportRoutes)
console.log('   ✅ /api/instructor/reports routes registered')
app.use('/api/system', systemRoutes)
console.log('   ✅ /api/system routes registered')
app.use('/api/notifications', notificationsRoutes)
console.log('   ✅ /api/notifications routes registered')
console.log('✅ All API routes registered successfully')

// Realtime progress endpoint for live monitoring without persisting
app.post('/api/attendance/progress', async (req, res) => {
  await handleAttendanceProgress(req, res, {
    AttendanceToken,
    Session,
    getModel,
    liveParticipantsCache,
    recentProgressRequests,
    MAX_RECENT_REQUESTS,
    extensionActivityTracker,
    normalizeParticipant,
    normalizeParticipantsList,
    tokenizeParticipant,
    generateSessionToken
  })
})

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'NE-Attend API is running',
    timestamp: new Date().toISOString(),
    db: {
      cloudOnline: isCloudOnline(),
      connections: getStatus()
    }
  })
})

// REAL-TIME FIX: Live participants endpoint for Dashboard polling fallback
// This provides guaranteed real-time data access even when Socket.IO fails
app.get('/api/attendance/live-participants', (req, res) => {
  try {
    const now = Date.now()
    const allLiveData = []

    // Clean up expired entries and collect active ones
    for (const [meetCode, data] of liveParticipantsCache.entries()) {
      const age = now - data.timestamp
      if (age > LIVE_CACHE_TTL) {
        // Expired - remove from cache
        liveParticipantsCache.delete(meetCode)
        console.log(`🧹 Cleaned up expired live cache entry: ${meetCode}`)
      } else {
        // Active - include in response
        allLiveData.push({
          meetCode,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          participants: data.participants,
          participantCount: data.participants?.length || 0,
          meetingStatus: data.meetingStatus || MEETING_STATUS.ACTIVE,
          timestamp: new Date(data.timestamp).toISOString(),
          ageSeconds: Math.floor(age / 1000),
          isUnauthenticated: data.isUnauthenticated || false
        })
      }
    }

    // Sort by timestamp (most recent first)
    allLiveData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    const hasActiveMeetings = allLiveData.length > 0
    const totalParticipants = allLiveData.reduce(
      (sum, m) => sum + (m.participantCount || 0),
      0
    )

    // Only log if there are active meetings (avoid spam)
    if (hasActiveMeetings) {
      console.log(
        `📡 Live participants request: ${allLiveData.length} active meeting(s), ${totalParticipants} total participants`
      )
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      hasActiveMeetings,
      meetingCount: allLiveData.length,
      totalParticipants,
      meetings: allLiveData
    })
  } catch (error) {
    console.error('❌ Error in live-participants endpoint:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// REAL-TIME POLLING: Get latest attendance progress for Dashboard fallback polling
// This endpoint returns the most recent progress updates for real-time display
app.get('/api/attendance/realtime-status', (req, res) => {
  try {
    const now = Date.now()
    const recentThreshold = 30000 // 30 seconds

    // Get recent extension activity from tracker
    const recentActivity = []
    for (const [key, activity] of extensionActivityTracker.entries()) {
      const age = now - activity.lastActivity
      if (age < recentThreshold) {
        recentActivity.push({
          key,
          meetCode: activity.meetCode,
          subjectId: activity.subjectId,
          lastActivity: activity.lastActivity,
          participantCount: activity.participantCount,
          firstSeen: activity.firstSeen,
          ageSeconds: Math.floor(age / 1000)
        })
      }
    }

    // Get recent progress requests
    const recentRequests = recentProgressRequests.slice(-10).map(req => ({
      ...req,
      ageSeconds: Math.floor((now - new Date(req.timestamp).getTime()) / 1000)
    }))

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      extensionActivity: {
        count: recentActivity.length,
        items: recentActivity
      },
      recentProgressRequests: recentRequests,
      hasActiveExtension: recentActivity.length > 0
    })
  } catch (error) {
    console.error('❌ Error in realtime-status endpoint:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// PHASE 1.4: Debug status endpoint for instructor-side diagnostics
app.get('/api/attendance/debug-status', (req, res) => {
  try {
    const io = req.app.get('io')

    // Get Socket.IO room status
    const rooms = io.sockets.adapter.rooms
    const roomStatus = {}
    const connectedClientsPerRoom = {}

    // Iterate through all rooms
    for (const [roomName, room] of rooms.entries()) {
      // Only include subject: and group: rooms
      if (roomName.startsWith('subject:') || roomName.startsWith('group:')) {
        const sockets = Array.from(room)
        roomStatus[roomName] = {
          size: room.size,
          sockets: sockets.length
        }
        connectedClientsPerRoom[roomName] = sockets
      }
    }

    // Get all connected sockets info
    const allSockets = Array.from(io.sockets.sockets.values())
    const socketInfo = allSockets.map(socket => ({
      id: socket.id,
      rooms: Array.from(socket.rooms),
      connected: socket.connected,
      transport: socket.conn?.transport?.name || 'unknown'
    }))

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      recentProgressRequests: recentProgressRequests.slice(-20), // Last 20 requests
      socketIO: {
        totalConnectedClients: allSockets.length,
        rooms: roomStatus,
        connectedClientsPerRoom: Object.keys(connectedClientsPerRoom).reduce(
          (acc, roomName) => {
            acc[roomName] = connectedClientsPerRoom[roomName].length
            return acc
          },
          {}
        ),
        socketDetails: socketInfo.slice(0, 50) // Limit to first 50 sockets
      },
      extensionConnections: Array.from(extensionConnections.entries()).map(
        ([socketId, conn]) => ({
          socketId,
          ...conn
        })
      )
    })
  } catch (error) {
    console.error('❌ Error in debug-status endpoint:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// PHASE 1.5: Per-meeting debug endpoint for realtime diagnostics
// Returns live cache snapshot, recent progress requests, and extension activity
// for a specific meetCode. This is read-only and does not alter any state.
app.get('/api/attendance/meeting-debug', (req, res) => {
  try {
    const rawMeetCode = req.query.meetCode

    if (!rawMeetCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameter: meetCode'
      })
    }

    const normalizedMeetCode = String(rawMeetCode).toLowerCase()
    const now = Date.now()

    // Live cache snapshot for this meetCode (if any)
    const liveEntry = liveParticipantsCache.get(normalizedMeetCode) || null
    const liveCache =
      liveEntry && liveEntry.timestamp
        ? {
            ...liveEntry,
            ageSeconds: Math.floor((now - liveEntry.timestamp) / 1000)
          }
        : null

    // Filter recent progress requests for this meetCode
    const recentRequests = recentProgressRequests
      .filter(reqItem => {
        if (!reqItem || !reqItem.meetCode) return false
        return reqItem.meetCode.toLowerCase() === normalizedMeetCode
      })
      .slice(-20)
      .map(reqItem => ({
        ...reqItem,
        ageSeconds: Math.floor(
          (now - new Date(reqItem.timestamp).getTime()) / 1000
        )
      }))

    // Extension activity entries for this meetCode
    const extensionActivity = []
    for (const [key, activity] of extensionActivityTracker.entries()) {
      if (
        activity &&
        activity.meetCode &&
        activity.meetCode.toLowerCase() === normalizedMeetCode
      ) {
        const age = now - activity.lastActivity
        extensionActivity.push({
          key,
          meetCode: activity.meetCode,
          subjectId: activity.subjectId,
          lastActivity: activity.lastActivity,
          firstSeen: activity.firstSeen,
          participantCount: activity.participantCount,
          ageSeconds: Math.floor(age / 1000)
        })
      }
    }

    // Infer a best-effort meeting status
    let inferredMeetingStatus = null
    if (liveCache && liveCache.meetingStatus) {
      inferredMeetingStatus = liveCache.meetingStatus
    } else if (recentRequests.length > 0) {
      const latest = recentRequests[recentRequests.length - 1]
      inferredMeetingStatus = latest.meetingStatus || null
    }

    // Derive lifecycle phases for diagnostics
    let liveLifecyclePhase = null
    if (liveCache && liveCache.meetingStatus) {
      const liveLifecycle = deriveMeetingLifecycle({
        meetingStatus: liveCache.meetingStatus,
        meetingEnded: false,
        hasParticipants:
          Array.isArray(liveCache.participants) &&
          liveCache.participants.length > 0
      })
      liveLifecyclePhase = liveLifecycle.phase
    }

    let inferredLifecyclePhase = null
    if (inferredMeetingStatus) {
      const inferredLifecycle = deriveMeetingLifecycle({
        meetingStatus: inferredMeetingStatus,
        meetingEnded: false,
        hasParticipants: !!(
          liveCache &&
          Array.isArray(liveCache.participants) &&
          liveCache.participants.length > 0
        )
      })
      inferredLifecyclePhase = inferredLifecycle.phase
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      meetCode: normalizedMeetCode,
      liveCache,
      extensionActivity: {
        count: extensionActivity.length,
        items: extensionActivity
      },
      recentProgressRequests: recentRequests,
      inferredMeetingStatus,
      liveLifecyclePhase,
      inferredLifecyclePhase
    })
  } catch (error) {
    console.error('❌ Error in meeting-debug endpoint:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// SAVE ATTENDANCE SESSION: Endpoint to save attendance session to database
// This is called by the frontend when saving attendance history
app.post('/api/attendance/save-session', async (req, res) => {
  try {
    const {
      sessionId,
      meetCode,
      sessionDate,
      startTime,
      endTime,
      participants,
      participantCount,
      hostCount,
      subjectName,
      subjectId
    } = req.body

    if (!meetCode || !participants || participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: meetCode and participants'
      })
    }

    console.log(
      `💾 Saving attendance session: ${meetCode} with ${participants.length} participants`
    )

    // Try to use database if available
    let savedToDatabase = false
    let dbSession = null

    try {
      // Check if Session model is available
      const Session = getModel ? getModel('Session') : null

      if (Session) {
        // Find or create session in database
        dbSession = await Session.findOneAndUpdate(
          { meetCode: meetCode.toLowerCase() },
          {
            $set: {
              meetCode: meetCode.toLowerCase(),
              sessionDate:
                sessionDate || new Date().toISOString().split('T')[0],
              startTime: startTime || new Date().toISOString(),
              endTime: endTime || new Date().toISOString(),
              participantCount: participantCount || participants.length,
              hostCount: hostCount || 0,
              subjectName: subjectName || null,
              subjectId: subjectId || null,
              status: 'completed',
              meetingEnded: true,
              updatedAt: new Date()
            },
            $setOnInsert: {
              createdAt: new Date()
            }
          },
          { upsert: true, new: true }
        )

        // Save participants to AttendanceRecord model if available
        const AttendanceRecord = getModel ? getModel('AttendanceRecord') : null

        if (AttendanceRecord && dbSession) {
          for (const participant of participants) {
            await AttendanceRecord.findOneAndUpdate(
              {
                sessionId: dbSession._id,
                participantName: participant.name
              },
              {
                $set: {
                  sessionId: dbSession._id,
                  participantName: participant.name,
                  participantAvatar: participant.avatarUrl,
                  joinTime: participant.joinTime,
                  leaveTime: participant.leaveTime,
                  durationSeconds: participant.durationSeconds || 0,
                  status: participant.status || 'present',
                  isHost: participant.isHost || false,
                  studentId: participant.studentId,
                  email: participant.email,
                  userId: participant.userId,
                  isUnauthenticated: participant.isUnauthenticated || false,
                  updatedAt: new Date()
                },
                $setOnInsert: {
                  createdAt: new Date()
                }
              },
              { upsert: true, new: true }
            )
          }
        }

        savedToDatabase = true
        console.log(
          `✅ Session ${meetCode} saved to database with ${participants.length} attendance records`
        )
      }
    } catch (dbError) {
      console.warn(
        `⚠️ Database save failed (will use memory cache):`,
        dbError.message
      )
    }

    // Always cache in memory as fallback
    const cacheKey = `session-${sessionId || meetCode}-${Date.now()}`
    if (!global.savedSessionsCache) {
      global.savedSessionsCache = new Map()
    }
    global.savedSessionsCache.set(cacheKey, {
      sessionId,
      meetCode,
      sessionDate,
      startTime,
      endTime,
      participants,
      participantCount,
      hostCount,
      subjectName,
      subjectId,
      savedAt: new Date().toISOString()
    })

    // Cleanup old cache entries (keep max 100)
    if (global.savedSessionsCache.size > 100) {
      const keys = Array.from(global.savedSessionsCache.keys())
      for (let i = 0; i < keys.length - 100; i++) {
        global.savedSessionsCache.delete(keys[i])
      }
    }

    res.json({
      success: true,
      savedToDatabase,
      message: savedToDatabase
        ? `Session ${meetCode} saved to database successfully`
        : `Session ${meetCode} cached in memory (database unavailable)`,
      sessionId: dbSession?._id || cacheKey
    })
  } catch (error) {
    console.error('❌ Error saving attendance session:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to save attendance session',
      error: error.message
    })
  }
})

// Diagnostic endpoint to query actual room membership for a specific socket
app.get('/api/socket/rooms', (req, res) => {
  try {
    const io = req.app.get('io')
    const socketId = req.query.socketId

    if (!socketId) {
      return res.status(400).json({
        success: false,
        error: 'socketId query parameter is required'
      })
    }

    // Get the socket instance
    const socket = io.sockets.sockets.get(socketId)
    if (!socket) {
      return res.status(404).json({
        success: false,
        error: 'Socket not found',
        socketId: socketId
      })
    }

    // Get all rooms the socket is in
    const allRooms = Array.from(socket.rooms || [])
    const subjectRooms = allRooms.filter(r => r.startsWith('subject:'))
    const groupRooms = allRooms.filter(r => r.startsWith('group:'))
    const otherRooms = allRooms.filter(
      r => !r.startsWith('subject:') && !r.startsWith('group:')
    )

    res.json({
      success: true,
      socketId: socketId,
      connected: socket.connected,
      totalRooms: allRooms.length,
      rooms: allRooms,
      subjectRooms: subjectRooms,
      groupRooms: groupRooms,
      otherRooms: otherRooms,
      transport: socket.conn?.transport?.name || 'unknown',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error in socket/rooms endpoint:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Error:', err.stack)

  // Database connection errors
  if (err.message && err.message.includes('No database connection available')) {
    return res.status(503).json({
      success: false,
      error: 'Database unavailable',
      message: 'Database connection is not available. Please try again later.',
      details: err.message
    })
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      message: err.message,
      details: err.errors
    })
  }

  // Mongoose cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid data format',
      message: `Invalid ${err.path}: ${err.value}`
    })
  }

  // Duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0]
    return res.status(400).json({
      success: false,
      error: 'Duplicate entry',
      message: `${field} already exists`
    })
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    error: 'Internal server error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong!'
        : err.message
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  })
})

// Export app for Vercel serverless functions
module.exports = app

// Only start the server if this file is run directly (not imported)
if (require.main === module) {
  // Wait for database connection before starting server
  waitForConnection()
    .then(() => {
      if (SCHEDULE_ENGINE_ENABLED) {
        startScheduleEngine()
      } else {
        console.log(
          '⏹️  Schedule engine disabled via SCHEDULE_ENGINE_ENABLED=false'
        )
      }
      if (TOKEN_CLEANUP_INTERVAL_MINUTES > 0) {
        const cleanup = () => {
          cleanupExpiredTokens({
            olderThanMinutes: TOKEN_CLEANUP_INTERVAL_MINUTES
          }).catch(err => {
            console.error('❌ Token cleanup failed:', err.message)
          })
        }
        cleanup()
        setInterval(cleanup, TOKEN_CLEANUP_INTERVAL_MINUTES * 60000).unref?.()
      }
      server.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`)
        console.log(`📊 API Health Check: http://localhost:${PORT}/api/health`)
        const status = getStatus()
        if (status.local.status === 'connected') {
          console.log('✅ Using local MongoDB database')
        }
        if (status.cloud.status === 'connected') {
          console.log('✅ Using cloud MongoDB database')
        }
      })
      server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
          console.error(`❌ Port ${PORT} is already in use`)
          console.error(`   Please either:`)
          console.error(`   1. Kill the process using port ${PORT}`)
          console.error(
            `   2. Set a different PORT in .env file (e.g., PORT=8001)`
          )
          console.error(
            `   3. On Windows: netstat -ano | findstr :${PORT} then taskkill /PID <pid> /F`
          )
          console.error(`   4. On Linux/Mac: lsof -ti:${PORT} | xargs kill -9`)
          process.exit(1)
        } else {
          console.error('❌ Server error:', err)
          process.exit(1)
        }
      })
    })
    .catch(error => {
      console.error('')
      console.error('❌ Failed to start server:', error.message)
      console.error('')
      console.error('   The server requires a MongoDB connection to start.')
      console.error('   See error messages above for troubleshooting steps.')
      console.error('')
      console.error("   💡 Tip: Use simple-server.js if you don't have MongoDB:")
      console.error('      npm run dev:simple')
      console.error('')
      process.exit(1)
    })
}

// Store extension connections and their associated instructors/meetings
const extensionConnections = new Map() // Map<socketId, {instructorId, meetCode, groupId, lastHeartbeat}>
// Track extension activity via REST API (for extensions that don't use Socket.IO)
const extensionActivityTracker = new Map() // Map<activityKey, {meetCode, subjectId, lastActivity, participantCount}>
const EXTENSION_ACTIVITY_TIMEOUT_MS = 10000 // 10 seconds - emit disconnected after no activity

// Socket.IO connection handling
registerSocketHandlers({
  io,
  liveParticipantsCache,
  extensionConnections,
  MEETING_STATUS,
  normalizeMeetingStatus,
  buildMeetingStatusPayload: _buildMeetingStatusPayload
})

// Handle Socket.IO errors
io.engine.on('connection_error', err => {
  console.error('❌ Socket.IO connection error:', err.message)
  console.error('   Code:', err.code)
  console.error('   Context:', err.context)
})

// PHASE 1.2: Check for inactive extensions and emit disconnected events
setInterval(() => {
  const now = Date.now()

  for (const [activityKey, activity] of extensionActivityTracker.entries()) {
    const timeSinceLastActivity = now - activity.lastActivity

    if (timeSinceLastActivity > EXTENSION_ACTIVITY_TIMEOUT_MS) {
      // Extension inactive for more than timeout period
      console.log(`⏰ === EXTENSION INACTIVITY TIMEOUT ===`)
      console.log(`   Activity Key: ${activityKey}`)
      console.log(`   MeetCode: ${activity.meetCode}`)
      console.log(`   SubjectId: ${activity.subjectId || 'unknown'}`)
      console.log(
        `   Last Activity: ${Math.round(timeSinceLastActivity / 1000)}s ago`
      )

      // Emit extension:disconnected event
      if (io) {
        try {
          io.emit('extension:disconnected', {
            meetCode: activity.meetCode,
            subjectId: activity.subjectId,
            timestamp: new Date().toISOString(),
            source: 'rest_api',
            reason: 'timeout',
            inactiveFor: Math.round(timeSinceLastActivity / 1000)
          })
          console.log(
            `📡 Emitted extension:disconnected event (REST API timeout)`
          )
        } catch (emitError) {
          console.error('❌ Failed to emit extension:disconnected:', emitError)
        }
      }

      // Clean up inactive entry
      extensionActivityTracker.delete(activityKey)
      console.log(`🧹 Cleaned up inactive extension: ${activityKey}`)
    }
  }
}, 5000) // Check every 5 seconds

// CACHE CLEANUP: Periodic cleanup of liveParticipantsCache to prevent memory leaks
// This runs every 30 seconds to clean up expired entries proactively
setInterval(() => {
  const now = Date.now()
  let cleanedCount = 0

  for (const [meetCode, data] of liveParticipantsCache.entries()) {
    const age = now - data.timestamp
    if (age > LIVE_CACHE_TTL) {
      liveParticipantsCache.delete(meetCode)
      cleanedCount++
    }
  }

  // Only log if we cleaned something (avoid console spam)
  if (cleanedCount > 0) {
    console.log(
      `🧹 Cache cleanup: Removed ${cleanedCount} expired liveParticipantsCache entries`
    )
  }

  // Also enforce max cache size to prevent unbounded growth
  const MAX_CACHE_SIZE = 100
  if (liveParticipantsCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(liveParticipantsCache.entries())
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    // Remove oldest entries to get back to max size
    const toRemove = entries.slice(
      0,
      liveParticipantsCache.size - MAX_CACHE_SIZE
    )
    toRemove.forEach(([key]) => liveParticipantsCache.delete(key))
    console.log(
      `🧹 Cache cleanup: Removed ${toRemove.length} oldest entries (cache size exceeded ${MAX_CACHE_SIZE})`
    )
  }
}, 30000) // Run every 30 seconds

// Also clean up recentProgressRequests periodically (every minute)
setInterval(() => {
  const MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes
  const now = Date.now()
  const beforeCount = recentProgressRequests.length

  // Filter out entries older than MAX_AGE_MS
  while (recentProgressRequests.length > 0) {
    const oldest = recentProgressRequests[0]
    if (oldest && now - new Date(oldest.timestamp).getTime() > MAX_AGE_MS) {
      recentProgressRequests.shift()
    } else {
      break
    }
  }

  const removed = beforeCount - recentProgressRequests.length
  if (removed > 0) {
    console.log(
      `🧹 Cleaned up ${removed} old progress request entries (older than 5 minutes)`
    )
  }
}, 60000) // Run every minute

// MEMORY LEAK FIX: Periodic cleanup of participantIdentityCache
// This runs every 2 minutes to remove expired entries and enforce max size
setInterval(() => {
  const now = Date.now()
  let cleanedCount = 0
  const MAX_CACHE_SIZE = 500 // Maximum participants to cache

  for (const [key, data] of participantIdentityCache.entries()) {
    const age = now - (data.cachedAt || 0)
    if (age > PARTICIPANT_CACHE_TTL) {
      participantIdentityCache.delete(key)
      cleanedCount++
    }
  }

  // Enforce max cache size
  if (participantIdentityCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(participantIdentityCache.entries())
    entries.sort((a, b) => (a[1].cachedAt || 0) - (b[1].cachedAt || 0))
    const toRemove = entries.slice(
      0,
      participantIdentityCache.size - MAX_CACHE_SIZE
    )
    toRemove.forEach(([key]) => participantIdentityCache.delete(key))
    cleanedCount += toRemove.length
  }

  if (cleanedCount > 0) {
    console.log(
      `🧹 Cleaned up ${cleanedCount} expired participantIdentityCache entries`
    )
  }
}, 120000) // Run every 2 minutes
