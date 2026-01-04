const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const fs = require('fs')
const path = require('path')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})
const PORT = process.env.PORT || 8000

// Middleware
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Simple JSON file database
const DATA_FILE = path.join(__dirname, 'data.json')

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        users: [],
        groups: [],
        sessions: [],
        attendance: []
      },
      null,
      2
    )
  )
}

// Helper functions for JSON database
function readData () {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading data file:', error)
    return { users: [], groups: [], sessions: [], attendance: [] }
  }
}

function writeData (data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.error('Error writing data file:', error)
    return false
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'NE-Attend API is running (JSON Database)',
    timestamp: new Date().toISOString()
  })
})

// Socket.io connections
io.on('connection', socket => {
  console.log('Client connected for realtime updates')
  socket.on('disconnect', () => console.log('Client disconnected'))
})

// Attendance endpoints
app.post('/api/attendance', (req, res) => {
  try {
    const { meetCode, date, startTime, stopTime, participants } = req.body

    if (!meetCode || !date || !participants) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'meetCode, date, and participants are required'
      })
    }

    const data = readData()

    // Create session
    const session = {
      id: Date.now().toString(),
      meetCode,
      sessionDate: new Date(date),
      startTime,
      endTime: stopTime,
      createdAt: new Date()
    }
    data.sessions.push(session)

    // Process participants
    const attendanceRecords = []

    for (const participant of participants) {
      // Find or create user
      let user = data.users.find(
        u =>
          u.firstName.toLowerCase() ===
          participant.name.split(' ')[0].toLowerCase()
      )

      if (!user) {
        const nameParts = participant.name.split(' ')
        user = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || 'User',
          email: `${nameParts[0].toLowerCase()}@example.com`,
          role: 'student',
          createdAt: new Date()
        }
        data.users.push(user)
      }

      // Create attendance record
      const attendance = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        sessionId: session.id,
        userId: user.id,
        joinTime: participant.joinTime,
        leaveTime: participant.leaveTime,
        duration: participant.attendedDuration || 0,
        status: 'present',
        createdAt: new Date()
      }

      data.attendance.push(attendance)
      attendanceRecords.push(attendance)
    }

    // Save data
    if (writeData(data)) {
      // Broadcast realtime update
      io.emit('attendance:update', {
        type: 'attendance_saved',
        session,
        attendance: attendanceRecords,
        timestamp: new Date().toISOString()
      })
      res.json({
        success: true,
        message: 'Attendance data saved successfully',
        sessionId: session.id,
        attendanceCount: attendanceRecords.length
      })
    } else {
      res.status(500).json({
        error: 'Failed to save data',
        message: 'Could not write to database file'
      })
    }
  } catch (error) {
    console.error('Error saving attendance:', error)
    res.status(500).json({
      error: 'Failed to save attendance data',
      message: error.message
    })
  }
})

// Realtime progress endpoint to broadcast partial data without persisting
app.post('/api/attendance/progress', (req, res) => {
  try {
    const payload = req.body
    io.emit('attendance:update', {
      type: 'attendance_progress',
      ...payload
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Helper function to escape regex special characters
function _escapeRegex (value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Helper function to resolve participant identity from scraped name
function resolveParticipantIdentity (name, users) {
  const key = (name || '').trim().toLowerCase()
  if (!key) {
    return { displayName: 'Unknown' }
  }

  const nameParts = key.split(/\s+/).filter(Boolean)
  const [first = '', ...rest] = nameParts
  const last = rest.join(' ')

  // Try to find user by first and last name
  let user = null
  if (first && last) {
    user = users.find(u => {
      const uFirst = (u.firstName || '').toLowerCase()
      const uLast = (u.lastName || '').toLowerCase()
      return uFirst.startsWith(first) && uLast.startsWith(last)
    })
  }

  // If not found, try by first name only
  if (!user && first) {
    user = users.find(u => {
      const uFirst = (u.firstName || '').toLowerCase()
      const uLast = (u.lastName || '').toLowerCase()
      const uStudentId = (u.studentId || '').toLowerCase()
      return (
        uFirst.startsWith(first) ||
        uLast.startsWith(first) ||
        uStudentId.startsWith(first)
      )
    })
  }

  if (user) {
    return {
      userId: user.id || user._id || null,
      studentId: user.studentId || null,
      displayName:
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || name
    }
  }

  return { displayName: name }
}

// POST /api/attendance/participants/resolve - Resolve scraped names to real names from database
app.post('/api/attendance/participants/resolve', (req, res) => {
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

    // Read users from JSON database
    const data = readData()
    const users = data.users || []

    // Resolve all names
    const resolved = {}
    uniqueNames.forEach(scrapedName => {
      const identity = resolveParticipantIdentity(scrapedName, users)
      resolved[scrapedName] = identity.displayName || scrapedName
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

// Get users
app.get('/api/users', (req, res) => {
  try {
    const data = readData()
    res.json({
      success: true,
      data: data.users
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch users',
      message: error.message
    })
  }
})

// Get groups
app.get('/api/groups', (req, res) => {
  try {
    const data = readData()
    res.json({
      success: true,
      data: data.groups
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch groups',
      message: error.message
    })
  }
})

// Get sessions
app.get('/api/attendance/sessions', (req, res) => {
  try {
    const data = readData()
    res.json({
      success: true,
      data: data.sessions
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch sessions',
      message: error.message
    })
  }
})

// Get attendance summary
app.get('/api/attendance/summary/:groupId', (req, res) => {
  try {
    const data = readData()
    const summary = data.attendance.map(att => {
      const user = data.users.find(u => u.id === att.userId)
      return {
        userId: att.userId,
        fullName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        presentCount: att.status === 'present' ? 1 : 0,
        lateCount: att.status === 'late' ? 1 : 0,
        absentCount: att.status === 'absent' ? 1 : 0,
        totalSessions: 1
      }
    })

    res.json({
      success: true,
      data: summary
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch attendance summary',
      message: error.message
    })
  }
})

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error(err.stack)
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  })
})

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📊 API Health Check: http://localhost:8000/api/health`)
  console.log(`💾 Using JSON file database: ${DATA_FILE}`)
  console.log(`✅ No MongoDB required!`)
})
