/* eslint-env node */

const { deriveMeetingLifecycle } = require('./utils/meetingLifecycle')

function registerSocketHandlers ({
  io,
  liveParticipantsCache,
  extensionConnections,
  _MEETING_STATUS,
  normalizeMeetingStatus,
  _buildMeetingStatusPayload
}) {
  if (!io) {
    throw new Error('Socket.IO instance is required to register handlers')
  }

  // Socket.IO connection handling
  io.on('connection', socket => {
    console.log('✅ Socket.IO client connected:', socket.id)
    console.log('   Transport:', socket.conn.transport.name)
    console.log('   IP:', socket.handshake.address)

    // Handle extension registration
    socket.on('extension:register', data => {
      console.log('📝 Extension registered:', socket.id, data)
      extensionConnections.set(socket.id, {
        type: 'extension',
        instructorId: data.instructorId || null,
        meetCode: data.meetCode || null,
        groupId: data.groupId || null,
        lastHeartbeat: new Date(),
        registeredAt: new Date()
      })

      // Broadcast extension connection status to all instructor dashboards
      io.emit('extension:connected', {
        socketId: socket.id,
        timestamp: new Date().toISOString()
      })
    })

    // Handle instructor dashboard room joining
    // Client emits this event to request joining rooms for real-time updates
    // Phase 2 Task 3: Handle instructor joining rooms (including catch-all room)
    socket.on('instructor:join-rooms', data => {
      try {
        const {
          subjectIds = [],
          groupIds = [],
          additionalRooms = []
        } = data || {}
        const roomsJoined = []

        // Phase 2 Task 3: Always join catch-all room for unauthenticated updates
        const catchAllRoom = 'subject:unauthenticated'
        socket.join(catchAllRoom)
        roomsJoined.push(catchAllRoom)
        console.log(
          `✅ Socket ${socket.id} joined catch-all room: ${catchAllRoom}`
        )

        // Validate and join subject rooms (primary method)
        if (Array.isArray(subjectIds) && subjectIds.length > 0) {
          subjectIds.forEach(subjectId => {
            if (subjectId) {
              const subjectIdStr = subjectId.toString()
              const roomName = `subject:${subjectIdStr}`
              socket.join(roomName)
              roomsJoined.push(roomName)
            }
          })
        }

        // Validate and join group rooms (legacy support)
        if (Array.isArray(groupIds) && groupIds.length > 0) {
          groupIds.forEach(groupId => {
            if (groupId) {
              const groupIdStr = groupId.toString()
              const roomName = `group:${groupIdStr}`
              socket.join(roomName)
              roomsJoined.push(roomName)
            }
          })
        }

        // Phase 2 Task 3: Join any additional rooms specified
        if (Array.isArray(additionalRooms) && additionalRooms.length > 0) {
          additionalRooms.forEach(roomName => {
            if (roomName && typeof roomName === 'string') {
              socket.join(roomName)
              roomsJoined.push(roomName)
              console.log(
                `✅ Socket ${socket.id} joined additional room: ${roomName}`
              )
            }
          })
        }

        if (roomsJoined.length > 0) {
          console.log(`✅ === SOCKET ROOM JOIN SUCCESS ===`)
          console.log(`   Socket ID: ${socket.id}`)
          console.log(`   Rooms joined: ${roomsJoined.length}`)
          console.log(`   Room names:`, roomsJoined)
          console.log(`   SubjectIds:`, subjectIds)
          console.log(`   GroupIds:`, groupIds)
          console.log(
            `✅ Socket ${socket.id} joined ${roomsJoined.length} room(s):`,
            roomsJoined
          )

          // Emit confirmation back to requesting socket
          socket.emit('rooms:joined', {
            success: true,
            rooms: roomsJoined,
            subjectIds: subjectIds,
            groupIds: groupIds,
            timestamp: new Date().toISOString()
          })
          console.log(
            `📡 Emitted rooms:joined confirmation to socket ${socket.id}`
          )
        } else {
          console.log(`ℹ️ === SOCKET ROOM JOIN - NO ROOMS ===`)
          console.log(`   Socket ID: ${socket.id}`)
          console.log(`   Reason: No valid subjectIds or groupIds provided`)
          console.log(`   SubjectIds received:`, subjectIds)
          console.log(`   GroupIds received:`, groupIds)
          console.log(
            `ℹ️ Socket ${socket.id} requested room join but no valid rooms provided`
          )

          // Emit confirmation even when no rooms (so client knows the request was processed)
          socket.emit('rooms:joined', {
            success: true,
            rooms: [],
            subjectIds: subjectIds,
            groupIds: groupIds,
            timestamp: new Date().toISOString(),
            message: 'No valid rooms provided to join'
          })
        }
      } catch (error) {
        console.error(
          `❌ Error joining rooms for socket ${socket.id}:`,
          error.message
        )

        // Emit error confirmation
        socket.emit('rooms:joined', {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        })
        console.log(
          `📡 Emitted rooms:joined error confirmation to socket ${socket.id}`
        )
      }
    })

    // Handle instructor clear cache request
    // This clears the live participants cache when instructor clicks "Clear Display"
    socket.on('instructor:clear-cache', data => {
      console.log('🧹 === INSTRUCTOR CLEAR CACHE REQUEST ===')
      console.log('   Socket ID:', socket.id)
      console.log('   Subject IDs:', data.subjectIds || [])
      console.log('   Group IDs:', data.groupIds || [])
      console.log('   Timestamp:', data.timestamp)

      let clearedCount = 0

      // Clear cache entries that match the instructor's subjects/groups
      const subjectIds = new Set(
        (data.subjectIds || []).map(id => id.toString())
      )
      const groupIds = new Set((data.groupIds || []).map(id => id.toString()))

      for (const [meetCode, cacheData] of liveParticipantsCache.entries()) {
        // Check if this cache entry belongs to one of the instructor's subjects/groups
        const cacheSubjectId = cacheData.subjectId?.toString()
        const cacheGroupId = cacheData.groupId?.toString()

        if (
          (cacheSubjectId && subjectIds.has(cacheSubjectId)) ||
          (cacheGroupId && groupIds.has(cacheGroupId))
        ) {
          liveParticipantsCache.delete(meetCode)
          clearedCount++
          console.log(`   🗑️ Cleared cache for meetCode: ${meetCode}`)
        }
      }

      console.log(`✅ Cleared ${clearedCount} cache entries for instructor`)

      // Also broadcast meeting:ended to notify other dashboards/extensions
      if (subjectIds.size > 0 || groupIds.size > 0) {
        // Emit to subject rooms
        subjectIds.forEach(subjectId => {
          io.to(`subject:${subjectId}`).emit('meeting:ended', {
            subjectId,
            reason: 'instructor_cleared',
            timestamp: new Date().toISOString()
          })
        })

        // Emit to group rooms
        groupIds.forEach(groupId => {
          io.to(`group:${groupId}`).emit('meeting:ended', {
            groupId,
            reason: 'instructor_cleared',
            timestamp: new Date().toISOString()
          })
        })
      }

      // Send confirmation back to requesting socket
      socket.emit('cache:cleared', {
        success: true,
        clearedCount,
        timestamp: new Date().toISOString()
      })
    })

    // Handle extension heartbeat
    // eslint-disable-next-line no-unused-vars
    socket.on('extension:heartbeat', data => {
      const connection = extensionConnections.get(socket.id)
      if (connection) {
        connection.lastHeartbeat = new Date()
        // Respond with pong
        socket.emit('extension:pong', {
          timestamp: new Date().toISOString()
        })

        // Broadcast heartbeat to instructor dashboards
        io.emit('extension:heartbeat', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Handle extension data (attendance progress)
    socket.on('extension:data', data => {
      const connection = extensionConnections.get(socket.id)
      if (connection) {
        console.log(
          '📊 Extension data received from:',
          socket.id,
          'Type:',
          data.type
        )

        // Broadcast to instructor dashboards based on groupId or meetCode
        // Note: broadcastPayload is constructed for future use but currently not used directly
        // as we emit via attendance:update event instead
        const _broadcastPayload = {
          ...data,
          source: 'extension',
          socketId: socket.id,
          timestamp: new Date().toISOString()
        }

        const normalizedMeetingStatus = data.meetingStatus
          ? normalizeMeetingStatus(data.meetingStatus)
          : null

        const lifecycle = deriveMeetingLifecycle({
          meetingStatus: normalizedMeetingStatus,
          meetingEnded: false,
          hasParticipants:
            Array.isArray(data.participants) && data.participants.length > 0
        })

        console.log(
          '   Meeting lifecycle phase (Socket.IO extension:data):',
          lifecycle.phase
        )

        // Realtime Socket.IO streaming to instructor dashboards is disabled.
        if (data.type === 'attendance_progress') {
          console.log(
            'ℹ️ extension:data attendance_progress received; no attendance:update emitted.'
          )
        } else if (data.type === 'attendance_final') {
          console.log(
            'ℹ️ extension:data attendance_final received; no attendance:update emitted.'
          )
        }

        // Meeting status updates are also suppressed for web dashboards.
        if (normalizedMeetingStatus) {
          console.log(
            'ℹ️ extension:data meeting status event suppressed; status:',
            normalizedMeetingStatus
          )
        }
      }
    })

    socket.on('disconnect', reason => {
      // Expected disconnects in development (React Strict Mode, HMR, page refresh)
      const expectedReasons = [
        'transport close',
        'client namespace disconnect',
        'ping timeout'
      ]
      const isExpected = expectedReasons.includes(reason)

      if (isExpected) {
        // Less alarming log for expected disconnects
        console.log(
          `🔌 Socket ${socket.id} disconnected (${reason}) - normal in dev`
        )
      } else {
        console.log('❌ Socket.IO client disconnected:', socket.id)
        console.log('   Reason:', reason)
      }

      // Check if it was an extension connection
      const connection = extensionConnections.get(socket.id)
      if (connection && connection.type === 'extension') {
        console.log('🔌 Extension disconnected:', socket.id)
        extensionConnections.delete(socket.id)

        // Broadcast extension disconnection to instructor dashboards
        io.emit('extension:disconnected', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        })
      }
    })

    socket.on('error', error => {
      console.error('⚠️ Socket.IO error for client', socket.id, ':', error)
    })

    socket.conn.on('upgrade', () => {
      console.log(
        '🔄 Socket.IO transport upgraded to:',
        socket.conn.transport.name
      )
    })
  })
}

module.exports = {
  registerSocketHandlers
}
