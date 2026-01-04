// Enhanced popup logic with real-time monitoring table view
;(function () {
  // Safe fetch wrapper for popup context
  // Popups don't have the same PNA restrictions as content scripts
  // but we provide a consistent API that falls back to regular fetch
  const safeFetch = (function () {
    // Check if targetAddressSpace is supported
    function isTargetAddressSpaceSupported () {
      try {
        const testUrl = 'http://localhost:8000'
        // Test if Request constructor accepts targetAddressSpace option
        new Request(testUrl, { targetAddressSpace: 'local' })
        return true
      } catch {
        return false
      }
    }

    const supported = isTargetAddressSpaceSupported()

    return async function (url, options = {}) {
      const urlString = typeof url === 'string' ? url : url.url || String(url)

      // Detect if localhost/local network
      try {
        const urlObj = new URL(urlString)
        const hostname = urlObj.hostname.toLowerCase()
        const isLocal =
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '[::1]'

        if (isLocal && supported) {
          try {
            const request = new Request(urlString, {
              ...options,
              targetAddressSpace: 'local'
            })
            return fetch(request)
          } catch {
            // Fall back to regular fetch
          }
        }
      } catch {
        // URL parsing failed, use regular fetch
      }

      return fetch(urlString, options)
    }
  })()

  const monitor = document.getElementById('monitor')
  const monitorMeta = document.getElementById('monitorMeta')
  const participantList = document.getElementById('participantList')
  const attendanceTable = document.getElementById('attendanceTable')
  const attendanceTableBody = document.getElementById('attendanceTableBody')
  const toggleExtensionBtn = document.getElementById('toggleExtension')
  const showRealtimeBtn = document.getElementById('showRealtime')
  const refreshMonitor = document.getElementById('refreshMonitor')
  const exportData = document.getElementById('exportData')
  const toggleView = document.getElementById('toggleView')
  const refreshTokenBtn = document.getElementById('refreshToken')
  const tokenStatus = document.getElementById('tokenStatus')
  const tokenStatusText = document.getElementById('tokenStatusText')

  let currentView = 'table' // 'table' or 'list'
  let attendanceData = new Map()
  let isMonitoring = false
  let lastSnapshot = null
  let nameResolutionCache = new Map() // Cache for resolved names: scrapedName -> realName
  let nameResolutionInProgress = false // Flag to prevent concurrent resolution requests
  let groupNameCache = null // Cache for group name from token
  let meetingStartTime = null // Track meeting start time for late detection
  let hostLeftTime = null // Track when host left
  let realTimeDurationInterval = null // Interval ID for real-time duration updates

  // Clean participant name by removing unwanted text patterns
  function cleanParticipantName (name) {
    if (!name || typeof name !== 'string') {
      return ''
    }

    let cleaned = name.trim()

    // Remove "frame_person" (case-insensitive)
    cleaned = cleaned.replace(/frame_person/gi, '').trim()

    // Remove mic status messages (case-insensitive)
    cleaned = cleaned.replace(/your mic is off/gi, '').trim()
    cleaned = cleaned.replace(/mic is off/gi, '').trim()
    cleaned = cleaned.replace(/your microphone is off/gi, '').trim()
    cleaned = cleaned.replace(/microphone is off/gi, '').trim()
    cleaned = cleaned.replace(/mic off/gi, '').trim()

    // Remove other common unwanted patterns
    cleaned = cleaned.replace(/'s profile picture/gi, '').trim()
    cleaned = cleaned.replace(/profile picture/gi, '').trim()

    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim()

    return cleaned
  }

  function normalizeRawStatus (participant) {
    const explicit =
      participant && (participant.rawStatus || participant.status)
    if (explicit && String(explicit).trim()) {
      return String(explicit).trim().toLowerCase()
    }
    if (
      participant &&
      (participant.leaveTime || participant.leaveTimeIso || participant.timeOut)
    ) {
      return 'left'
    }
    if (!participant || !participant.attendedDuration) return 'joined'
    if ((participant.attendedDuration || 0) < 60) return 'late'
    return 'present'
  }

  function statusLabelFor (rawStatus) {
    switch ((rawStatus || '').toLowerCase()) {
      case 'left':
      case 'left meeting':
        return 'Left Meeting'
      case 'joined':
        return 'Just Joined'
      case 'late':
        return 'Late'
      case 'pending':
        return 'Pending'
      case 'absent':
        return 'Absent'
      case 'present':
      default:
        return 'Present'
    }
  }

  function parseTimestamp (value) {
    if (!value) return null
    if (value instanceof Date) return value
    const isoCandidate = new Date(value)
    if (!Number.isNaN(isoCandidate.getTime())) return isoCandidate
    if (typeof value === 'string') {
      const match = value.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
      if (match) {
        const [, hh, mm, ss = '0'] = match
        const date = new Date()
        date.setHours(
          parseInt(hh, 10) || 0,
          parseInt(mm, 10) || 0,
          parseInt(ss, 10) || 0,
          0
        )
        return date
      }
    }
    return null
  }

  function formatTimestamp (value, fallback) {
    const parsed = value instanceof Date ? value : parseTimestamp(value)
    if (!parsed) return fallback || 'N/A'
    return parsed.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // Enhanced render function with table view
  function renderSnapshot (snap) {
    console.log('📊 renderSnapshot called with:', snap)

    if (!snap) {
      console.warn('⚠️ No snapshot provided')
      monitor.style.display = 'none'
      lastSnapshot = null
      return
    }

    if (!snap.participants) {
      console.warn('⚠️ No participants array in snapshot:', snap)
      console.warn('   Snapshot keys:', Object.keys(snap))
      // Don't hide - show status message instead
      if (snap.message) {
        monitorMeta.textContent = snap.message
      } else {
        monitorMeta.textContent = 'No participants detected yet.'
      }
      monitor.style.display = 'block'
      lastSnapshot = snap

      // Clear table/list
      attendanceTableBody.innerHTML = ''
      participantList.innerHTML = ''
      const hostSection = document.getElementById('hostSection')
      const participantsLabel = document.getElementById('participantsLabel')
      if (hostSection) hostSection.style.display = 'none'
      if (participantsLabel) participantsLabel.style.display = 'none'
      return
    }

    if (!Array.isArray(snap.participants)) {
      console.warn(
        '⚠️ Participants is not an array:',
        typeof snap.participants,
        snap.participants
      )
      monitorMeta.textContent = snap.message || 'Invalid snapshot data.'
      monitor.style.display = 'block'
      lastSnapshot = snap

      // Clear table/list
      attendanceTableBody.innerHTML = ''
      participantList.innerHTML = ''
      const hostSection = document.getElementById('hostSection')
      const participantsLabel = document.getElementById('participantsLabel')
      if (hostSection) hostSection.style.display = 'none'
      if (participantsLabel) participantsLabel.style.display = 'none'
      return
    }

    // Handle empty participants array
    if (snap.participants.length === 0) {
      console.log('📭 Empty participants array - showing waiting state')
      monitor.style.display = 'block'
      lastSnapshot = snap

      // Update metadata with status
      const now = new Date()
      const updatedTime = snap.updatedAt
        ? new Date(snap.updatedAt).toLocaleTimeString()
        : now.toLocaleTimeString()
      const statusMsg =
        snap.message ||
        (snap.status === 'waiting'
          ? 'Waiting for participants...'
          : 'No participants detected.')
      monitorMeta.textContent = `Meet: ${
        snap.meetCode || '-'
      } | Updated: ${updatedTime} | ${statusMsg}`

      // Clear table/list
      attendanceTableBody.innerHTML = ''
      participantList.innerHTML = ''
      const hostSection = document.getElementById('hostSection')
      const participantsLabel = document.getElementById('participantsLabel')
      if (hostSection) hostSection.style.display = 'none'
      if (participantsLabel) participantsLabel.style.display = 'none'

      return
    }

    console.log(`✅ Rendering ${snap.participants.length} participant(s)`)
    monitor.style.display = 'block'
    lastSnapshot = snap

    // Update attendance data first (now async)
    updateAttendanceData(snap.participants || []).then(() => {
      // Resolve participant names to real names
      resolveParticipantNames(snap.participants || []).then(() => {
        // Re-render after name resolution completes
        if (currentView === 'table') {
          renderTableView()
        } else {
          renderListView()
        }
      })
    })

    // Count hosts and participants
    const allData = Array.from(attendanceData.values())
    const hostCount = allData.filter(d => d.isHost).length
    const participantCount = allData.filter(d => !d.isHost).length

    // Update metadata
    const now = new Date()
    const updatedTime = snap.updatedAt
      ? new Date(snap.updatedAt).toLocaleTimeString()
      : now.toLocaleTimeString()
    monitorMeta.textContent = `Meet: ${
      snap.meetCode || '-'
    } | Updated: ${updatedTime} | Host: ${hostCount} | Participants: ${participantCount}`

    // Render based on current view (initial render, will re-render after name resolution)
    if (currentView === 'table') {
      renderTableView()
    } else {
      renderListView()
    }

    // Start real-time duration updates if monitoring is active
    if (isMonitoring || monitor.style.display !== 'none') {
      startRealTimeDurationUpdate()
    }
  }

  // Determine log status based on meeting state and participant behavior
  function determineLogStatus (
    participant,
    allParticipants,
    currentParticipants
  ) {
    const isHostUser =
      participant.isHost || isHost(participant, allParticipants)
    const hasLeft =
      participant.rawStatus === 'left' ||
      participant.leaveTime ||
      participant.leaveTimeIso

    // Check if participant is currently in the meeting
    const participantKey =
      participant.avatarUrl || participant.name || 'Unknown'
    const isCurrentlyPresent = currentParticipants.some(p => {
      const pKey = p.avatarUrl || p.name || 'Unknown'
      return pKey === participantKey
    })

    // If participant has left
    if (hasLeft) {
      // Check if host is still present in current participants
      const hostStillPresent = currentParticipants.some(p => {
        const pIsHost = p.isHost || isHost(p, currentParticipants)
        return pIsHost
      })

      // If host left
      if (isHostUser) {
        hostLeftTime = participant.leaveTimeIso
          ? new Date(participant.leaveTimeIso)
          : new Date()
        // Host left - mark as "Left Meeting" for display
        return 'left'
      } else {
        // Regular participant left
        if (hostStillPresent) {
          // Host still in meeting - participant is absent
          return 'absent'
        } else {
          // Host also left - check if they left together
          // Check if all participants (including host) left together
          const allParticipantsLeft = allParticipants.filter(p => {
            const pHasLeft =
              p.rawStatus === 'left' || p.leaveTime || p.leaveTimeIso
            return pHasLeft
          })
          const totalParticipants = allParticipants.length

          // If all participants (including host) left, mark as present
          if (
            allParticipantsLeft.length === totalParticipants &&
            totalParticipants > 0
          ) {
            return 'present'
          }

          // Check if participant left within 5 minutes of host
          if (hostLeftTime) {
            const participantLeaveTime = participant.leaveTimeIso
              ? new Date(participant.leaveTimeIso)
              : new Date()
            const timeDiff = Math.abs(
              participantLeaveTime.getTime() - hostLeftTime.getTime()
            )
            // If left within 5 minutes of host, consider it "together" - mark as present
            if (timeDiff < 5 * 60 * 1000) {
              return 'present'
            }
          }
          // Host left before participant - participant is present
          return 'present'
        }
      }
    }

    // Participant is still in meeting
    if (isCurrentlyPresent) {
      // During meeting - all participants' Log status must remain "pending" unless they leave
      // Check if late (but still return 'pending' during meeting)
      const joinTime = parseTimestamp(
        participant.joinTimeIso || participant.joinTime
      )
      if (joinTime && meetingStartTime) {
        const lateThreshold = 15 * 60 * 1000 // 15 minutes in milliseconds
        const timeDiff = joinTime.getTime() - meetingStartTime.getTime()
        if (timeDiff > lateThreshold) {
          // Participant is late, but during meeting status is still 'pending'
          // The 'late' status will be applied when they leave (handled in attendance rules)
          return 'pending'
        }
      }
      // During meeting - status is pending
      return 'pending'
    }

    // Default fallback
    return participant.log || 'pending'
  }

  // Update attendance data with complete structure matching instructor dashboard
  async function updateAttendanceData (participants) {
    const now = new Date()
    const currentDate = now.toISOString().split('T')[0]

    // Update meeting start time if not set
    if (!meetingStartTime && participants.length > 0) {
      meetingStartTime = now
    }

    // Get group name
    const groupName = await getGroupName()

    // Create processedKeys Set BEFORE processing participants to prevent duplicates within the same batch
    const processedKeys = new Set()
    // Track hosts separately to prevent duplication
    const hostKeys = new Set()

    // Pre-process to identify hosts and create key mappings
    const participantKeyMap = new Map()
    participants.forEach((p, index) => {
      // Clean the scraped name first
      let scrapedName = cleanParticipantName(p.name || 'Unknown')
      if (!scrapedName || scrapedName === 'Unknown') {
        scrapedName = 'Unknown'
      }

      // Use avatarUrl as primary key if available (matches attendance.js), otherwise use normalized name
      const avatarKey = p.avatarUrl || null
      const nameKey = scrapedName.toLowerCase().trim()
      // Create a more robust key combining avatarUrl and normalized name
      const key = avatarKey || `name_${nameKey}`

      // Store mapping for duplicate detection
      participantKeyMap.set(index, { p, key, avatarKey, nameKey, scrapedName })
    })

    participants.forEach((p, index) => {
      const { key, avatarKey, nameKey, scrapedName } =
        participantKeyMap.get(index)

      // Skip if already processed in this batch
      if (processedKeys.has(key)) {
        return // Skip duplicate within same snapshot
      }

      // Check for duplicates by avatarUrl (if available) in existing attendanceData
      if (avatarKey) {
        const existingByAvatar = Array.from(attendanceData.values()).find(
          existing => existing.avatarUrl === avatarKey
        )
        if (existingByAvatar) {
          // Participant with same avatarUrl already exists, skip
          return
        }
      }

      // Check for duplicates by normalized name (when avatarUrl is not available)
      if (!avatarKey && nameKey && nameKey !== 'unknown') {
        const existingByName = Array.from(attendanceData.values()).find(
          existing => {
            const existingNameKey = (
              existing.scrapedName ||
              existing.name ||
              ''
            )
              .toLowerCase()
              .trim()
            return existingNameKey === nameKey && !existing.avatarUrl
          }
        )
        if (existingByName) {
          // Participant with same normalized name already exists (and no avatarUrl), skip
          return
        }
      }

      // Trust isHost flag from data if present, otherwise detect
      const isHostUser =
        p.isHost !== undefined ? p.isHost : isHost(p, participants)

      // If this is a host, check host duplication BEFORE processing
      if (isHostUser) {
        // Check if host key already processed in this batch
        if (hostKeys.has(key)) {
          return // Host already processed in this batch
        }

        // Check if host exists in attendanceData by avatarUrl or name
        const existingHost = Array.from(attendanceData.values()).find(
          existing =>
            existing.isHost === true &&
            ((avatarKey && existing.avatarUrl === avatarKey) ||
              (!avatarKey &&
                (existing.scrapedName || existing.name || '')
                  .toLowerCase()
                  .trim() === nameKey))
        )
        if (existingHost) {
          return // Host already exists, skip to prevent duplication
        }

        hostKeys.add(key)
      }

      // Mark as processed
      processedKeys.add(key)

      const existing = attendanceData.get(key)
      const joinDate = parseTimestamp(p.joinTimeIso || p.joinTime)
      const joinTimeFormatted = formatTimestamp(
        joinDate || p.joinTime,
        p.joinTime || '09:00 AM'
      )
      const joinTimeIso = joinDate
        ? joinDate.toISOString()
        : p.joinTimeIso || null
      const leaveDate = parseTimestamp(p.leaveTimeIso || p.leaveTime)
      const leaveTimeFormatted = leaveDate
        ? formatTimestamp(leaveDate, null)
        : formatTimestamp(p.leaveTime, null)
      const leaveTimeIso = leaveDate
        ? leaveDate.toISOString()
        : p.leaveTimeIso || null
      const rawStatus = normalizeRawStatus(p)

      // Determine log status based on rules (only for participants still in meeting)
      // For participants who left, status will be determined in the "left participants" section below
      let logStatus
      if (rawStatus === 'left' || leaveTimeIso) {
        // Participant has left - will be handled in the "left participants" section
        logStatus = 'left'
      } else {
        // Participant is still in meeting - determine status
        logStatus = determineLogStatus(p, participants, participants)
      }
      const statusLabel = statusLabelFor(logStatus)
      const isLive = p.isLive !== undefined ? p.isLive : rawStatus !== 'left'

      if (existing) {
        // Update existing participant
        existing.duration = formatDuration(p.attendedDuration || 0)
        existing.lastUpdate = now
        existing.rawStatus = rawStatus
        existing.status = statusLabel
        existing.log = logStatus
        existing.attendedDuration = p.attendedDuration || 0
        existing.isHost = isHostUser
        existing.isLive = isLive
        existing.avatarUrl = p.avatarUrl || existing.avatarUrl
        if (joinTimeFormatted) existing.timeIn = joinTimeFormatted
        if (joinTimeIso) existing.joinTime = joinTimeIso
        if (typeof p.joinTime === 'string') existing.joinTimeRaw = p.joinTime
        if (leaveTimeFormatted) existing.timeOut = leaveTimeFormatted
        if (leaveTimeIso) {
          existing.leaveTime = leaveTimeIso
          existing.leaveTimeIso = leaveTimeIso
        }
        if (typeof p.leaveTime === 'string') existing.leaveTimeRaw = p.leaveTime
        // Update name if resolved
        const realName = nameResolutionCache.get(scrapedName)
        if (realName) {
          existing.name = realName
          existing.realName = realName
        }
        if (!existing.scrapedName) {
          existing.scrapedName = scrapedName
        }
        // Update group name
        if (groupName) {
          existing.group = groupName
        }
        attendanceData.set(key, existing)
      } else {
        // Add new participant with complete structure
        const realName = nameResolutionCache.get(scrapedName) || scrapedName
        attendanceData.set(key, {
          group: groupName,
          date: currentDate,
          codelink: generateCodeLink(key),
          participantId: generateParticipantId(key),
          name: realName, // Use real name if available, otherwise scraped name
          scrapedName: scrapedName, // Store original scraped name
          avatarUrl: p.avatarUrl || null,
          timeIn: joinTimeFormatted,
          timeOut: leaveTimeFormatted || '',
          duration: formatDuration(p.attendedDuration || 0),
          log: logStatus,
          status: statusLabel,
          rawStatus,
          lastUpdate: now,
          isNew: true,
          isHost: isHostUser,
          isLive,
          joinTime: joinTimeIso || p.joinTime || now.toISOString(),
          joinTimeIso: joinTimeIso,
          joinTimeRaw: p.joinTime || null,
          leaveTime: leaveTimeIso || null,
          leaveTimeIso: leaveTimeIso,
          leaveTimeRaw: p.leaveTime || null,
          attendedDuration: p.attendedDuration || 0
        })
      }
    })

    // Mark participants who left (not in current participants list)
    // Clean names when creating currentKeys set
    const currentKeys = new Set(
      participants.map(p => {
        const cleanedName = cleanParticipantName(p.name || 'Unknown')
        return p.avatarUrl || cleanedName || 'Unknown'
      })
    )
    const allData = Array.from(attendanceData.values())
    const currentHosts = allData.filter(
      d => d.isHost && currentKeys.has(d.avatarUrl || d.name || '')
    )
    const hostStillPresent = currentHosts.length > 0

    attendanceData.forEach((data, key) => {
      const participantKey = data.avatarUrl || data.name || key
      if (!currentKeys.has(participantKey)) {
        // Participant has left
        const parsedLeave = parseTimestamp(
          data.leaveTime || data.leaveTimeIso || data.leaveTimeRaw
        )
        if (!data.timeOut) {
          data.timeOut = formatTimestamp(
            parsedLeave,
            new Date().toLocaleTimeString()
          )
        }
        data.rawStatus = 'left'
        data.isLive = false
        data.lastUpdate = new Date()

        // Apply log status rules for leaving participants
        if (data.isHost) {
          // Host left - track time and mark as "Left Meeting"
          hostLeftTime = parsedLeave || new Date()
          data.status = 'Left Meeting'
          data.log = 'Left Meeting'
          // Host is handled separately in host section, skip further processing
          return
        } else {
          // Regular participant left
          if (hostStillPresent) {
            // Host still in meeting - participant is absent
            data.status = 'Absent'
            data.log = 'Absent'
          } else {
            // Host also left - check if all participants left together
            const allParticipantsLeft = allData.filter(d => {
              const dHasLeft =
                d.rawStatus === 'left' || d.leaveTime || d.leaveTimeIso
              return dHasLeft && !d.isHost
            })
            const totalNonHostParticipants = allData.filter(
              d => !d.isHost
            ).length

            // If all participants (including host) left together, mark as present
            if (
              allParticipantsLeft.length === totalNonHostParticipants &&
              totalNonHostParticipants > 0
            ) {
              data.status = 'Present'
              data.log = 'Present'
            } else if (hostLeftTime && parsedLeave) {
              // Check if participant left within 5 minutes of host
              const timeDiff = Math.abs(
                parsedLeave.getTime() - hostLeftTime.getTime()
              )
              // If left within 5 minutes of host, consider it "together" - mark as present
              if (timeDiff < 5 * 60 * 1000) {
                data.status = 'Present'
                data.log = 'Present'
              } else {
                data.status = 'Left Meeting'
                data.log = 'Left Meeting'
              }
            } else {
              // Host left before - participant is present
              data.status = 'Present'
              data.log = 'Present'
            }

            // Check if participant was late (apply attendance rules for late participants)
            const joinTime = parseTimestamp(data.joinTimeIso || data.joinTime)
            if (joinTime && meetingStartTime) {
              const lateThreshold = 15 * 60 * 1000 // 15 minutes in milliseconds
              const timeDiff = joinTime.getTime() - meetingStartTime.getTime()
              if (timeDiff > lateThreshold) {
                // Participant was late - mark as late
                data.status = 'Late'
                data.log = 'Late'
              }
            }
          }
        }
      }
    })
  }

  // Get backend URL from configuration
  async function getBackendUrl () {
    return new Promise(resolve => {
      chrome.storage.sync.get(['neattend_config'], result => {
        const config = result.neattend_config || {
          backendUrl: 'http://localhost:8000'
        }
        resolve(config.backendUrl || 'http://localhost:8000')
      })
    })
  }

  // Get group name from token credentials
  async function getGroupName () {
    // Return cached value if available
    if (groupNameCache) {
      return groupNameCache
    }

    return new Promise(resolve => {
      extractMeetCodeFromUrl().then(meetCode => {
        if (!meetCode) {
          resolve('IT ELECTIVE') // Fallback
          return
        }

        chrome.storage.sync.get([`neattend_token_${meetCode}`], result => {
          const tokenData = result[`neattend_token_${meetCode}`]
          if (tokenData && (tokenData.subjectName || tokenData.groupName)) {
            const groupName = tokenData.subjectName || tokenData.groupName
            groupNameCache = groupName
            resolve(groupName)
          } else {
            resolve('IT ELECTIVE') // Fallback
          }
        })
      })
    })
  }

  // Resolve participant names from scraped names to real names
  async function resolveParticipantNames (participants) {
    if (!participants || participants.length === 0) {
      return
    }

    // Collect unique scraped names that aren't already resolved
    const scrapedNames = new Set()
    participants.forEach(p => {
      // Check both name and scrapedName fields
      const name = p.name || p.scrapedName
      if (name && name !== 'Unknown' && !nameResolutionCache.has(name)) {
        scrapedNames.add(name)
      }
    })

    // Also check attendanceData for scraped names that need resolution
    attendanceData.forEach((data, _key) => {
      const scrapedName = data.scrapedName || data.name
      if (
        scrapedName &&
        scrapedName !== 'Unknown' &&
        !nameResolutionCache.has(scrapedName)
      ) {
        scrapedNames.add(scrapedName)
      }
    })

    if (scrapedNames.size === 0) {
      return // All names already resolved
    }

    // Prevent concurrent resolution requests
    if (nameResolutionInProgress) {
      return
    }

    nameResolutionInProgress = true

    try {
      const backendUrl = await getBackendUrl()
      const url = `${backendUrl}/api/attendance/participants/resolve`

      console.log(
        `🔍 Resolving ${scrapedNames.size} participant name(s) via ${url}`
      )

      // Use safeFetch to handle Chrome's local network request restrictions
      const response = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: Array.from(scrapedNames) })
      })

      if (!response.ok) {
        // Handle different error status codes
        if (response.status === 404) {
          console.warn(`⚠️ Name resolution endpoint not found (404): ${url}`)
          console.warn(
            '   This may indicate the backend server needs to be restarted or the route is missing.'
          )
        } else if (response.status === 500) {
          console.error(`❌ Server error during name resolution (500): ${url}`)
          try {
            const errorData = await response.json()
            console.error('   Server error details:', errorData)
          } catch {
            console.error('   Could not parse error response')
          }
        } else {
          console.warn(
            `⚠️ Failed to resolve participant names: ${response.status} ${response.statusText}`
          )
        }

        // Gracefully degrade: continue with scraped names
        console.log('   Continuing with scraped names (graceful degradation)')
        nameResolutionInProgress = false
        return
      }

      const data = await response.json()
      if (data.success && data.resolved) {
        const resolvedCount = Object.keys(data.resolved).length
        console.log(
          `✅ Successfully resolved ${resolvedCount} of ${scrapedNames.size} participant name(s)`
        )

        // Update cache with resolved names
        Object.entries(data.resolved).forEach(([scrapedName, realName]) => {
          nameResolutionCache.set(scrapedName, realName)
        })

        // Update attendanceData with real names
        attendanceData.forEach((data, _key) => {
          const scrapedName = data.scrapedName || data.name
          if (scrapedName && nameResolutionCache.has(scrapedName)) {
            data.realName = nameResolutionCache.get(scrapedName)
            data.name = data.realName // Update the display name
          }
        })

        // Re-render to show real names
        if (currentView === 'table') {
          renderTableView()
        } else {
          renderListView()
        }
      } else {
        console.warn('⚠️ Name resolution returned unsuccessful response:', data)
        // Gracefully degrade: continue with scraped names
      }
    } catch (error) {
      // Handle network errors, CORS issues, etc.
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error(
          '❌ Network error resolving participant names - backend may be unreachable'
        )
        console.error('   Error:', error.message)
        console.error(
          '   Check that the backend server is running and accessible'
        )
      } else {
        console.error('❌ Error resolving participant names:', error)
        console.error('   Error type:', error.name)
        console.error('   Error message:', error.message)
      }

      // Gracefully degrade: continue with scraped names
      console.log('   Continuing with scraped names (graceful degradation)')
    } finally {
      nameResolutionInProgress = false
    }
  }

  // Get real name for a participant (from cache or fallback to scraped name)
  function getRealName (participant) {
    const scrapedName = participant.name || participant.scrapedName || 'Unknown'
    return nameResolutionCache.get(scrapedName) || scrapedName
  }

  // Generate a simple participant ID for display
  function generateParticipantId (name) {
    const hash = name.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0)
      return a & a
    }, 0)
    return `2025-${Math.abs(hash).toString().padStart(3, '0')}`
  }

  // Detect if participant is the host/instructor
  function isHost (participant, allParticipants) {
    // Method 1: Check if participant name contains "host", "instructor", "teacher", "prof"
    const nameLower = (participant.name || '').toLowerCase()
    const hostKeywords = [
      'host',
      'instructor',
      'teacher',
      'prof',
      'dr.',
      'mr.',
      'ms.',
      'mrs.'
    ]
    if (hostKeywords.some(keyword => nameLower.includes(keyword))) {
      return true
    }

    // Method 2: Check if this is the first participant (meeting creator)
    // In many cases, the first person in the list is the host
    if (
      allParticipants.length > 0 &&
      allParticipants[0].name === participant.name
    ) {
      return true
    }

    // Method 3: Check if participant has special properties indicating host status
    if (
      participant.isHost ||
      participant.role === 'host' ||
      participant.presenter
    ) {
      return true
    }

    return false
  }

  // Format duration from seconds to HH:MM:SS
  function formatDuration (seconds) {
    if (typeof seconds !== 'number') return '00:00:00'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Update real-time durations for active participants
  function updateRealTimeDurations () {
    const now = Date.now()

    // Update durations in attendanceData for active participants
    attendanceData.forEach((data, key) => {
      // Only update for live participants who haven't left
      if (data.isLive !== false && !data.leaveTimeIso && data.joinTimeIso) {
        try {
          const joinTime = new Date(data.joinTimeIso)
          if (!isNaN(joinTime.getTime())) {
            const elapsedSeconds = Math.floor((now - joinTime.getTime()) / 1000)
            if (elapsedSeconds >= 0) {
              data.attendedDuration = elapsedSeconds
              data.duration = formatDuration(elapsedSeconds)
              data.lastUpdate = new Date(now)
            }
          }
        } catch (e) {
          console.warn(
            'Error updating real-time duration for participant:',
            key,
            e
          )
        }
      }
    })

    // Update duration display in DOM without full re-render
    updateDurationDisplay()
  }

  // Update duration display in table and host section
  function updateDurationDisplay () {
    // Update host duration if host section is visible
    const hostSection = document.getElementById('hostSection')
    if (hostSection && hostSection.style.display !== 'none') {
      const allData = Array.from(attendanceData.values())
      const hosts = allData.filter(data => data.isHost === true)
      if (hosts.length > 0) {
        const host = hosts[0]
        const hostKey = host.avatarUrl || host.name || 'host'

        // Update in table view host section
        if (currentView === 'table') {
          const hostDurationElement = hostSection.querySelector(
            `[data-duration-key="${hostKey}"]`
          )
          if (hostDurationElement) {
            hostDurationElement.textContent = host.duration || '00:00:00'
          }
        } else {
          // Update in list view host section
          const hostDurationElement = hostSection.querySelector(
            `[data-duration-key="${hostKey}"]`
          )
          if (hostDurationElement) {
            hostDurationElement.textContent = host.duration || '00:00:00'
          }
        }
      }
    }

    // Update participant durations in table view
    if (currentView === 'table' && attendanceTable.style.display !== 'none') {
      attendanceData.forEach((data, key) => {
        if (data.isHost === true) return // Skip host

        // Find row by participant key
        const participantKey =
          data.avatarUrl || data.name || data.scrapedName || key
        const durationCell = attendanceTableBody.querySelector(
          `td[data-duration-key="${participantKey}"]`
        )
        if (durationCell) {
          durationCell.textContent = data.duration || '00:00:00'
        }
      })
    }

    // Update participant durations in list view
    if (currentView === 'list' && participantList.style.display !== 'none') {
      attendanceData.forEach((data, key) => {
        if (data.isHost === true) return // Skip host

        const participantKey =
          data.avatarUrl || data.name || data.scrapedName || key
        const listItem = participantList.querySelector(
          `li[data-participant-key="${participantKey}"]`
        )
        if (listItem) {
          const durationElement = listItem.querySelector('[data-duration-key]')
          if (durationElement) {
            durationElement.textContent = data.duration || '00:00:00'
          }
        }
      })
    }
  }

  // Start real-time duration update timer
  function startRealTimeDurationUpdate () {
    // Clear any existing interval
    stopRealTimeDurationUpdate()

    // Update immediately
    updateRealTimeDurations()

    // Set up interval to update every second
    realTimeDurationInterval = setInterval(() => {
      updateRealTimeDurations()
    }, 1000)

    console.log('✅ Real-time duration update started')
  }

  // Stop real-time duration update timer
  function stopRealTimeDurationUpdate () {
    if (realTimeDurationInterval) {
      clearInterval(realTimeDurationInterval)
      realTimeDurationInterval = null
      console.log('🛑 Real-time duration update stopped')
    }
  }

  // Determine attendance status based on participant data
  function _determineAttendanceStatus (participant) {
    const rawStatus = normalizeRawStatus(participant)
    const label = statusLabelFor(rawStatus)
    if (label) return label

    const attendedDuration = participant.attendedDuration || 0
    const joinTime =
      parseTimestamp(
        participant.joinTimeIso ||
          participant.joinTime ||
          participant.joinTimeRaw
      ) || new Date()
    const meetingStartTime = new Date() // Fallback baseline

    const lateThreshold = 15 * 60 // 15 minutes in seconds
    const isLate =
      attendedDuration < lateThreshold &&
      meetingStartTime - joinTime > lateThreshold * 1000

    if (attendedDuration < 60) return 'Absent'
    if (isLate) return 'Late'
    return 'Present'
  }

  // Generate code link based on name
  function generateCodeLink (name) {
    const codes = [
      'abc-defg-hij',
      'xyz-1234-567',
      'mno-pqr-stu',
      'vwx-yza-bcd',
      'efg-hij-klm',
      'nop-qrs-tuv',
      'wxy-zab-cde',
      'fgh-ijk-lmn'
    ]

    const hash = name.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0)
      return a & a
    }, 0)

    return codes[Math.abs(hash) % codes.length]
  }

  // Get status color for styling
  function getStatusColor (status) {
    if (status === 'Present') return '#2ecc40'
    if (status === 'Absent') return '#ff4136'
    if (status === 'Late') return '#ffb700'
    if (status === 'Pending') return '#ff9800'
    if (status === 'Left Meeting') return '#6c757d'
    return '#888'
  }

  // Render table view matching the instructor dashboard design
  function renderTableView () {
    const hostSection = document.getElementById('hostSection')
    const hostInfo = document.getElementById('hostInfo')
    const participantsLabel = document.getElementById('participantsLabel')

    attendanceTable.style.display = 'block'
    participantList.style.display = 'none'

    attendanceTableBody.innerHTML = ''

    // Separate hosts from participants
    const allData = Array.from(attendanceData.values())
    const hosts = allData.filter(data => data.isHost === true)
    const participants = allData.filter(data => data.isHost !== true)

    // Render host section
    if (hosts.length > 0) {
      hostSection.style.display = 'block'
      participantsLabel.style.display = 'block'

      const host = hosts[0] // Typically only one host
      const hostDisplayName =
        host.realName ||
        host.name ||
        host.scrapedName ||
        getRealName(host) ||
        'Unknown'
      const hostKey = host.avatarUrl || host.name || 'host'
      hostInfo.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 10px;">
          <div>
            <div style="color: #666; font-weight: 600; margin-bottom: 2px;">NAME</div>
            <div style="color: #23225c; font-weight: 700; font-size: 11px;">${hostDisplayName}</div>
          </div>
          <div>
            <div style="color: #666; font-weight: 600; margin-bottom: 2px;">PARTICIPANT ID</div>
            <div style="color: #23225c; font-weight: 700; font-size: 11px; font-family: monospace;">${
              host.participantId ||
              generateParticipantId(host.name || host.scrapedName)
            }</div>
          </div>
          <div>
            <div style="color: #666; font-weight: 600; margin-bottom: 2px;">TIME IN</div>
            <div style="color: #23225c; font-weight: 700; font-size: 11px;">${
              host.timeIn || '09:00 AM'
            }</div>
          </div>
          <div>
            <div style="color: #666; font-weight: 600; margin-bottom: 2px;">DURATION</div>
            <div style="color: #23225c; font-weight: 700; font-size: 11px; font-family: monospace;" data-duration-key="${hostKey}">${
        host.duration || '00:00:00'
      }</div>
          </div>
        </div>
      `
    } else {
      hostSection.style.display = 'none'
      participantsLabel.style.display = 'none'
    }

    // Sort participants by status: pending first, then present, then late, then absent, then left meeting
    const sortedParticipants = participants.sort((a, b) => {
      const statusOrder = {
        Pending: 0,
        Present: 1,
        Late: 2,
        Absent: 3,
        'Left Meeting': 4
      }
      return (statusOrder[a.log] ?? 99) - (statusOrder[b.log] ?? 99)
    })

    // Render participants table
    sortedParticipants.forEach((data, index) => {
      const row = document.createElement('tr')
      const timeOutDisplay =
        data.timeOut ||
        formatTimestamp(
          data.leaveTimeIso || data.leaveTime || data.leaveTimeRaw,
          '—'
        )

      // Alternating row colors
      if (index % 2 === 0) {
        row.style.backgroundColor = 'white'
      } else {
        row.style.backgroundColor = '#f9f9f9'
      }

      row.style.borderBottom = '1px solid #e0e0e0'

      const displayName =
        data.realName ||
        data.name ||
        data.scrapedName ||
        getRealName(data) ||
        'Unknown'
      // Ensure host is never in participants table (double-check)
      if (data.isHost === true) {
        return // Skip rendering host in participants table
      }
      const participantKey =
        data.avatarUrl || data.name || data.scrapedName || 'unknown'
      row.innerHTML = `
        <td style="padding: 6px 4px; font-size: 9px; color: #333; font-weight: 600;">${
          data.group || 'IT ELECTIVE'
        }</td>
        <td style="padding: 6px 4px; font-size: 9px; color: #333;">${
          data.date || new Date().toISOString().split('T')[0]
        }</td>
        <td style="padding: 6px 4px; font-size: 9px; color: #333; font-family: monospace;">${
          data.participantId ||
          generateParticipantId(data.scrapedName || data.name)
        }</td>
        <td style="padding: 6px 4px; font-size: 9px; color: #333; font-weight: 500;">${displayName}</td>
        <td style="padding: 6px 4px; font-size: 9px; color: #333;">${
          data.timeIn || '09:00 AM'
        }</td>
        <td style="padding: 6px 4px; font-size: 9px; color: #333;">${timeOutDisplay}</td>
        <td style="padding: 6px 4px; font-size: 9px; color: #333; font-family: monospace;" data-duration-key="${participantKey}">${
        data.duration || '00:00:00'
      }</td>
        <td style="padding: 6px 4px; font-size: 9px; color: ${getStatusColor(
          data.log
        )}; font-weight: 700;">${data.log}</td>
      `

      // Add animation for new participants
      if (data.isNew) {
        row.style.animation = 'pulse 2s ease-in-out'
        setTimeout(() => {
          row.style.animation = ''
          data.isNew = false
        }, 2000)
      }

      attendanceTableBody.appendChild(row)
    })
  }

  // Generate group codes similar to the image (iro-xroa-zoc format)
  function _generateGroupCode (name) {
    const codes = [
      'iro-xroa-zoc',
      'itf-wayw-awc',
      'tru-zzvk-tne',
      'pnb-avog-ybj',
      'igc-fjsp-fjs',
      'efp-nnwy-xyd',
      'abc-defg-hij',
      'xyz-1234-567'
    ]

    // Use name hash to consistently assign group codes
    const hash = name.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0)
      return a & a
    }, 0)

    return codes[Math.abs(hash) % codes.length]
  }

  // Render simple list view
  function renderListView () {
    const hostSection = document.getElementById('hostSection')
    const hostInfo = document.getElementById('hostInfo')
    const participantsLabel = document.getElementById('participantsLabel')

    attendanceTable.style.display = 'none'
    participantList.style.display = 'block'

    // Separate hosts from participants
    const allData = Array.from(attendanceData.values())
    const hosts = allData.filter(data => data.isHost === true)
    const participants = allData.filter(data => data.isHost !== true)

    // Show host section in list view too
    if (hosts.length > 0) {
      hostSection.style.display = 'block'
      participantsLabel.style.display = 'block'

      const host = hosts[0]
      const hostDisplayName =
        host.realName ||
        host.name ||
        host.scrapedName ||
        getRealName(host) ||
        'Unknown'
      const hostKey = host.avatarUrl || host.name || 'host'
      hostInfo.innerHTML = `
        <div style="font-size: 11px; line-height: 1.6;">
          <div><strong style="color: #23225c;">${hostDisplayName}</strong> <span style="color: #FFD600;">👑</span></div>
          <div style="color: #666;">Duration: <strong style="color: #28a745;" data-duration-key="${hostKey}">${
        host.duration || '00:00:00'
      }</strong></div>
        </div>
      `
    } else {
      hostSection.style.display = 'none'
      participantsLabel.style.display = 'none'
    }

    participantList.innerHTML = ''
    participants.forEach(data => {
      // Ensure host is never in participants list (double-check)
      if (data.isHost === true) {
        return // Skip rendering host in participants list
      }
      const displayName =
        data.realName ||
        data.name ||
        data.scrapedName ||
        getRealName(data) ||
        'Unknown'
      const participantKey =
        data.avatarUrl || data.name || data.scrapedName || 'unknown'
      const li = document.createElement('li')
      li.setAttribute('data-participant-key', participantKey)
      li.style.margin = '4px 0'
      li.style.fontSize = '11px'
      li.style.padding = '4px'
      li.style.background = 'rgba(255,255,255,0.05)'
      li.style.borderRadius = '4px'
      li.innerHTML = `
        <strong>${displayName}</strong> 
        <span style="color: #28a745;" data-duration-key="${participantKey}">(${
        data.duration || '00:00:00'
      })</span> 
        <span style="color: #ffc107;">${data.log}</span>
      `
      participantList.appendChild(li)
    })
  }

  function updateToggleButton (enabled) {
    toggleExtensionBtn.textContent = enabled
      ? '🟢 Disable Extension'
      : '🔴 Enable Extension'
    toggleExtensionBtn.style.opacity = enabled ? 1 : 0.9
  }

  // Helper function to update status message
  function setStatus (message, isError = false) {
    const statusElement = document.getElementById('status')
    if (statusElement) {
      statusElement.textContent = message
      statusElement.style.color = isError ? '#ff6b6b' : '#4ecdc4'
    } else {
      console.log('Status:', message)
    }
  }

  // Export attendance data as CSV
  function exportAttendanceData () {
    const data = Array.from(attendanceData.values())
    if (data.length === 0) {
      alert('No attendance data to export')
      return
    }

    const csvContent = [
      'ROLE,GROUP,DATE,PARTICIPANT_ID,PARTICIPANT_NAME,TIME_IN,TIME_OUT,DURATION,LOG',
      ...data.map(
        row =>
          `${row.isHost ? 'Host' : 'Participant'},${
            row.group || 'IT ELECTIVE'
          },${row.date || new Date().toISOString().split('T')[0]},${
            row.participantId ||
            generateParticipantId(row.name || row.scrapedName)
          },"${row.name || row.scrapedName}",${row.timeIn || '09:00 AM'},${
            row.timeOut ||
            formatTimestamp(
              row.leaveTimeIso || row.leaveTime || row.leaveTimeRaw,
              '—'
            )
          },${row.duration},${row.log}`
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Auto-refresh mechanism
  function startAutoRefresh () {
    if (isMonitoring) return
    isMonitoring = true

    // Start real-time duration updates
    startRealTimeDurationUpdate()

    const refreshInterval = setInterval(() => {
      try {
        chrome.storage.local.get(['realtimeMonitoring'], res => {
          if (res && res.realtimeMonitoring) {
            renderSnapshot(res.realtimeMonitoring)
          }
        })
      } catch {
        /* ignore refresh errors */
      }
    }, 2000) // Refresh every 2 seconds

    // Store interval ID for cleanup
    window.refreshInterval = refreshInterval
  }

  function stopAutoRefresh () {
    if (window.refreshInterval) {
      clearInterval(window.refreshInterval)
      window.refreshInterval = null
    }

    // Stop real-time duration updates
    stopRealTimeDurationUpdate()

    isMonitoring = false
  }

  // Initialize toggle state
  try {
    chrome.storage.local.get(['extEnabled'], res => {
      const enabled = res.extEnabled !== false // default true
      updateToggleButton(enabled)
    })
  } catch {
    /* ignore storage errors */
  }

  // Event handlers
  toggleExtensionBtn.addEventListener('click', () => {
    try {
      chrome.storage.local.get(['extEnabled'], res => {
        const current = res.extEnabled !== false
        const next = !current
        chrome.storage.local.set({ extEnabled: next }, () =>
          updateToggleButton(next)
        )
      })
    } catch {
      /* ignore storage errors */
    }
  })

  // Show realtime monitor on demand
  showRealtimeBtn.addEventListener('click', () => {
    try {
      console.log('🔘 Show Realtime button clicked')
      chrome.storage.local.get(['realtimeMonitoring'], res => {
        console.log('📦 Storage read result:', res)
        const snapshot = res && res.realtimeMonitoring
        if (snapshot) {
          console.log('✅ Found snapshot, rendering...')
          renderSnapshot(snapshot)
        } else if (lastSnapshot) {
          console.log('⚠️ Using cached snapshot')
          renderSnapshot(lastSnapshot)
        } else {
          console.warn('❌ No snapshot available')
          monitorMeta.textContent =
            'No data available. Make sure you are in a meeting and participants panel is open.'
          monitor.style.display = 'block'
        }
        monitor.style.display = 'block'
        startAutoRefresh()
      })
    } catch (e) {
      console.error('❌ Error showing realtime monitor:', e)
      monitor.style.display = 'block'
      startAutoRefresh()
    }
  })

  // Refresh monitor button
  refreshMonitor.addEventListener('click', () => {
    try {
      chrome.storage.local.get(['realtimeMonitoring'], res => {
        const snapshot = res && res.realtimeMonitoring
        if (snapshot) {
          renderSnapshot(snapshot)
          setStatus('Snapshot refreshed.')
        } else if (lastSnapshot) {
          renderSnapshot(lastSnapshot)
          setStatus('Using latest cached snapshot (no new data).')
        } else {
          setStatus('No realtime snapshot available yet.')
        }
      })
    } catch {
      /* ignore storage errors */
    }
  })

  // Export data button
  exportData.addEventListener('click', exportAttendanceData)

  // Toggle view button
  toggleView.addEventListener('click', () => {
    currentView = currentView === 'table' ? 'list' : 'table'
    toggleView.textContent = currentView === 'table' ? '📋 Table' : '📝 List'

    if (currentView === 'table') {
      renderTableView()
    } else {
      renderListView()
    }
  })

  // Token refresh and status functions
  function extractMeetCodeFromUrl () {
    // Get current tab URL
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs && tabs[0] && tabs[0].url) {
          const url = tabs[0].url
          // Try to extract meetCode from URL
          const match = url.match(
            /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
          )
          resolve(match ? match[1].toLowerCase() : null)
        } else {
          resolve(null)
        }
      })
    })
  }

  async function checkTokenStatus () {
    const meetCode = await extractMeetCodeFromUrl()
    if (!meetCode) {
      if (tokenStatus) {
        tokenStatus.style.display = 'block'
      }
      if (tokenStatusText) {
        tokenStatusText.innerHTML =
          '<span style="color: #ffc107;">⚠️ Not on a Google Meet page</span>'
      }
      return
    }

    return new Promise(resolve => {
      chrome.storage.sync.get([`neattend_token_${meetCode}`], result => {
        const tokenData = result[`neattend_token_${meetCode}`]
        if (tokenStatus) {
          tokenStatus.style.display = 'block'
        }

        if (!tokenData) {
          if (tokenStatusText) {
            tokenStatusText.innerHTML = `
              <span style="color: #f44336;">❌ No token found</span><br>
              <span style="font-size: 10px; opacity: 0.8;">MeetCode: ${meetCode}</span><br>
              <span style="font-size: 10px; opacity: 0.8;">💡 Join through NE-Attend dashboard</span>
            `
          }
          resolve(false)
          return
        }

        if (!tokenData.expiresAt) {
          if (tokenStatusText) {
            tokenStatusText.innerHTML = `
              <span style="color: #ff9800;">⚠️ Invalid token format</span><br>
              <span style="font-size: 10px; opacity: 0.8;">MeetCode: ${meetCode}</span>
            `
          }
          resolve(false)
          return
        }

        const expiresAt = new Date(tokenData.expiresAt)
        const now = new Date()
        const timeRemaining = Math.floor((expiresAt - now) / 1000 / 60)

        if (now >= expiresAt) {
          if (tokenStatusText) {
            tokenStatusText.innerHTML = `
              <span style="color: #f44336;">⏰ Token expired</span><br>
              <span style="font-size: 10px; opacity: 0.8;">Expired: ${expiresAt.toLocaleString()}</span><br>
              <span style="font-size: 10px; opacity: 0.8;">💡 Generate new token from dashboard</span>
            `
          }
          resolve(false)
        } else {
          const subjectName =
            tokenData.subjectName || tokenData.groupName || 'Unknown'
          if (tokenStatusText) {
            tokenStatusText.innerHTML = `
              <span style="color: #4caf50;">✅ Token valid</span><br>
              <span style="font-size: 10px; opacity: 0.8;">Subject: ${subjectName}</span><br>
              <span style="font-size: 10px; opacity: 0.8;">Expires in: ${timeRemaining} minutes</span><br>
              <span style="font-size: 10px; opacity: 0.8;">MeetCode: ${meetCode}</span>
            `
          }
          resolve(true)
        }
      })
    })
  }

  // Refresh token button - only add listener if button exists
  if (refreshTokenBtn) {
    refreshTokenBtn.addEventListener('click', async () => {
      refreshTokenBtn.disabled = true
      refreshTokenBtn.textContent = '🔄 Refreshing...'
      if (tokenStatusText) {
        tokenStatusText.textContent = 'Checking token...'
      }

      // Clear any cached tokens and check again
      chrome.storage.sync.get(null, allItems => {
        const tokenKeys = Object.keys(allItems).filter(k =>
          k.startsWith('neattend_token_')
        )
        console.log('Available tokens:', tokenKeys)
      })

      // Wait a moment then check status
      setTimeout(async () => {
        const isValid = await checkTokenStatus()
        refreshTokenBtn.disabled = false
        refreshTokenBtn.textContent = '🔄 Refresh Token'

        if (isValid) {
          setStatus('✅ Token refreshed successfully!')
        } else {
          setStatus('⚠️ No valid token found. Join through dashboard.')
        }
      }, 500)
    })
  }

  // Check token status on popup open (only if token status elements exist)
  if (tokenStatus || tokenStatusText) {
    checkTokenStatus()
  }

  // Initial load with enhanced error handling and retry mechanism
  let snapshotRetryCount = 0
  const MAX_SNAPSHOT_RETRIES = 2
  const SNAPSHOT_RETRY_DELAY = 1500 // 1.5 seconds

  function loadSnapshotWithRetry (isRetry = false) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const currentTab = tabs && tabs[0]
        const isMeetPage =
          currentTab &&
          currentTab.url &&
          currentTab.url.includes('meet.google.com')

        chrome.storage.local.get(['realtimeMonitoring', 'extEnabled'], res => {
          if (chrome.runtime.lastError) {
            console.error('❌ Storage API error:', chrome.runtime.lastError)
            monitorMeta.textContent =
              'Error accessing storage. Please try refreshing.'
            monitor.style.display = 'block'
            return
          }

          console.log('🔍 Initial load - storage result:', res)
          const snapshot = res && res.realtimeMonitoring
          const extEnabled = res.extEnabled !== false
          const storageKeys = Object.keys(res || {})

          if (snapshot) {
            console.log('✅ Found snapshot on initial load:', snapshot)
            console.log(
              '   Participant count:',
              snapshot.participantCount ||
                (snapshot.participants ? snapshot.participants.length : 0)
            )
            snapshotRetryCount = 0 // Reset retry count on success
            renderSnapshot(snapshot)
          } else {
            // Use info-level logging for expected scenarios
            if (isRetry) {
              console.log(
                'ℹ️ No snapshot found (retry attempt ' +
                  snapshotRetryCount +
                  '/' +
                  MAX_SNAPSHOT_RETRIES +
                  ')'
              )
            } else {
              console.log('ℹ️ No snapshot found on initial load')
            }
            console.log(
              '   Storage keys available:',
              storageKeys.length > 0 ? storageKeys : 'none'
            )

            // Determine context and show appropriate message
            let statusMessage = ''
            if (!isMeetPage) {
              statusMessage =
                'Not on a Google Meet page. Join a meeting to track attendance.'
              console.log('   Context: Not on Meet page')
            } else if (!extEnabled) {
              statusMessage =
                'Extension is disabled. Enable it to start tracking.'
              console.log('   Context: Extension disabled')
            } else {
              statusMessage =
                'Waiting for participants... Make sure participants panel is open.'
              console.log(
                '   Context: On Meet page, extension enabled, waiting for tracking to start'
              )
            }

            monitorMeta.textContent = statusMessage
            monitor.style.display = 'block'

            // Retry mechanism: Only retry if on Meet page and extension is enabled
            if (
              !isRetry &&
              isMeetPage &&
              extEnabled &&
              snapshotRetryCount < MAX_SNAPSHOT_RETRIES
            ) {
              snapshotRetryCount++
              console.log(
                `🔄 Retrying snapshot load in ${SNAPSHOT_RETRY_DELAY}ms (attempt ${snapshotRetryCount}/${MAX_SNAPSHOT_RETRIES})...`
              )
              setTimeout(() => {
                loadSnapshotWithRetry(true)
              }, SNAPSHOT_RETRY_DELAY)
            } else if (isRetry && snapshotRetryCount >= MAX_SNAPSHOT_RETRIES) {
              console.log(
                'ℹ️ Max retries reached. Snapshot will appear when attendance tracking starts.'
              )
            }
          }
        })
      })
    } catch (e) {
      console.error('❌ Error loading initial data:', e)
      monitorMeta.textContent = 'Error loading data. Please try refreshing.'
      monitor.style.display = 'block'
    }
  }

  // Initial load
  loadSnapshotWithRetry(false)

  // Live updates with enhanced monitoring
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.realtimeMonitoring) {
        console.log(
          '🔄 Storage changed - new snapshot:',
          changes.realtimeMonitoring.newValue
        )
        renderSnapshot(changes.realtimeMonitoring.newValue)
        if (monitor.style.display !== 'none') {
          startAutoRefresh()
        }
      }
    })
  } catch (e) {
    console.error('❌ Error setting up storage listener:', e)
  }

  // Cleanup on popup close (using modern pagehide event)
  window.addEventListener('pagehide', () => {
    stopAutoRefresh()
    stopRealTimeDurationUpdate()
  })

  // Also cleanup on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopRealTimeDurationUpdate()
    } else if (monitor && monitor.style.display !== 'none' && isMonitoring) {
      startRealTimeDurationUpdate()
    }
  })

  // ========================================================================
  // END SESSION FUNCTIONALITY
  // Allows instructor to end recording session and send final attendance data
  // ========================================================================

  const endSessionBtn = document.getElementById('endSession')
  const endSessionModal = document.getElementById('endSessionModal')
  const cancelEndSessionBtn = document.getElementById('cancelEndSession')
  const confirmEndSessionBtn = document.getElementById('confirmEndSession')
  const sessionStatusDiv = document.getElementById('sessionStatus')
  const sessionDot = document.getElementById('sessionDot')
  const sessionStatusText = document.getElementById('sessionStatusText')
  const summaryMeetCode = document.getElementById('summaryMeetCode')
  const summaryParticipants = document.getElementById('summaryParticipants')
  const summaryDuration = document.getElementById('summaryDuration')

  let sessionStartTime = null

  // Update session status UI
  function updateSessionStatus (
    isActive,
    meetCode = null,
    participantCount = 0
  ) {
    if (isActive) {
      sessionStatusDiv.classList.remove('inactive')
      sessionStatusDiv.classList.add('active')
      sessionDot.classList.remove('inactive')
      sessionDot.classList.add('active')
      sessionStatusText.textContent = `Recording: ${
        meetCode || 'Active'
      } (${participantCount} participants)`
      endSessionBtn.style.display = 'block'
    } else {
      sessionStatusDiv.classList.remove('active')
      sessionStatusDiv.classList.add('inactive')
      sessionDot.classList.remove('active')
      sessionDot.classList.add('inactive')
      sessionStatusText.textContent = 'No active session'
      endSessionBtn.style.display = 'none'
    }
  }

  // Check session status on popup open
  async function checkSessionStatus () {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(
          ['activeSession', 'realtimeMonitoring'],
          resolve
        )
      })

      const activeSession = result.activeSession
      const snapshot = result.realtimeMonitoring

      if (activeSession && activeSession.state === 'active') {
        sessionStartTime = new Date(activeSession.startTime)
        const participantCount = snapshot?.participants?.length || 0
        updateSessionStatus(true, activeSession.meetCode, participantCount)
      } else if (
        snapshot &&
        snapshot.participants &&
        snapshot.participants.length > 0
      ) {
        // Session might be active but not tracked - check if we're on a meet page
        const meetCode = snapshot.meetCode
        updateSessionStatus(true, meetCode, snapshot.participants.length)
      } else {
        updateSessionStatus(false)
      }
    } catch (e) {
      console.error('Error checking session status:', e)
      updateSessionStatus(false)
    }
  }

  // Format session duration
  function formatSessionDuration (startTime) {
    if (!startTime) return '00:00:00'
    const now = new Date()
    const diffMs = now - new Date(startTime)
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // Show end session modal with summary
  async function showEndSessionModal () {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(
          ['activeSession', 'realtimeMonitoring'],
          resolve
        )
      })

      const snapshot = result.realtimeMonitoring
      const activeSession = result.activeSession

      // Populate summary
      summaryMeetCode.textContent = `Meet Code: ${
        snapshot?.meetCode || activeSession?.meetCode || '--'
      }`
      summaryParticipants.textContent = `Participants: ${
        snapshot?.participants?.length || attendanceData.size || 0
      }`

      const startTime =
        activeSession?.startTime || sessionStartTime || meetingStartTime
      summaryDuration.textContent = `Duration: ${formatSessionDuration(
        startTime
      )}`

      // Show modal
      endSessionModal.classList.add('show')
    } catch (e) {
      console.error('Error showing end session modal:', e)
      alert('Error preparing session summary. Please try again.')
    }
  }

  // Hide end session modal
  function hideEndSessionModal () {
    endSessionModal.classList.remove('show')
  }

  // End session and send final data
  async function endSession () {
    try {
      updateRealTimeDurations()
      // Update UI to show ending state
      confirmEndSessionBtn.textContent = 'Ending...'
      confirmEndSessionBtn.disabled = true

      // Get current snapshot and session data
      const result = await new Promise(resolve => {
        chrome.storage.local.get(
          ['activeSession', 'realtimeMonitoring', 'neattend_config'],
          resolve
        )
      })

      const snapshot = result.realtimeMonitoring
      const activeSession = result.activeSession
      const config = result.neattend_config || {
        backendUrl: 'http://localhost:8000'
      }

      // Get meetCode from available sources
      let meetCode = snapshot?.meetCode || activeSession?.meetCode

      // Fallback: try to extract meet code from the current tab URL
      if (!meetCode) {
        try {
          meetCode = await extractMeetCodeFromUrl()
        } catch (err) {
          console.warn('⚠️ Failed to extract meet code from URL:', err)
        }
      }

      if (!meetCode) {
        console.error('❌ Cannot end session: No meetCode available')
        alert(
          'Cannot end session: Meeting code not found. Try opening this popup from the active Google Meet tab and try again.'
        )
        confirmEndSessionBtn.textContent = 'End Session'
        confirmEndSessionBtn.disabled = false
        return
      }

      // Prepare final attendance data
      const finalData = {
        meetCode: meetCode,
        sessionStartTime:
          activeSession?.startTime || sessionStartTime || meetingStartTime,
        sessionEndTime: new Date().toISOString(),
        participants: Array.from(attendanceData.values()).map(p => ({
          name: p.name,
          scrapedName: p.scrapedName,
          avatarUrl: p.avatarUrl,
          joinTime: p.joinTime || p.joinTimeIso,
          leaveTime: p.leaveTime || p.leaveTimeIso || new Date().toISOString(),
          duration: p.attendedDuration || 0,
          status: p.log || p.status || 'present',
          isHost: p.isHost || false
        })),
        hostInfo:
          Array.from(attendanceData.values()).find(p => p.isHost) || null,
        totalParticipants: attendanceData.size,
        subjectId: activeSession?.subjectId || null,
        groupId: activeSession?.groupId || null
      }

      console.log('🛑 Ending session with final data:', finalData)

      // Send to backend
      const backendUrl = config.backendUrl || 'http://localhost:8000'
      const response = await safeFetch(
        `${backendUrl}/api/attendance/end-session`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalData)
        }
      )

      if (response.ok) {
        const responseData = await response.json()
        console.log('✅ Session ended successfully:', responseData)

        // Clear session state
        await new Promise(resolve => {
          chrome.storage.local.set(
            {
              activeSession: null,
              realtimeMonitoring: {
                status: 'ended',
                message: 'Session ended and saved',
                participants: [],
                meetCode: null,
                updatedAt: new Date().toISOString()
              }
            },
            resolve
          )
        })

        // Clear local data
        attendanceData.clear()
        sessionStartTime = null
        meetingStartTime = null
        hostLeftTime = null

        // Update UI
        updateSessionStatus(false)
        hideEndSessionModal()

        // Notify content scripts on all Google Meet tabs to stop tracking
        chrome.tabs.query({ url: '*://meet.google.com/*' }, tabs => {
          if (!tabs || tabs.length === 0) {
            console.warn(
              'No Google Meet tabs found to notify about END_SESSION'
            )
            return
          }

          tabs.forEach(tab => {
            chrome.tabs.sendMessage(
              tab.id,
              { type: 'END_SESSION' },
              _response => {
                if (chrome.runtime.lastError) {
                  console.warn(
                    'Could not notify content script in tab',
                    tab.id,
                    ':',
                    chrome.runtime.lastError.message
                  )
                } else {
                  console.log(
                    '✅ Content script notified of session end in tab',
                    tab.id
                  )
                }
              }
            )
          })
        })

        // Show success message
        const statusEl = document.getElementById('status')
        if (statusEl) {
          statusEl.textContent = '✅ Session ended and attendance saved!'
          statusEl.style.background = 'rgba(40, 167, 69, 0.3)'
        }

        // Refresh the monitor view
        renderSnapshot({
          status: 'ended',
          message: 'Session ended',
          participants: []
        })
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.message || `Server returned ${response.status}`
        )
      }
    } catch (e) {
      console.error('❌ Error ending session:', e)
      alert(
        `Failed to end session: ${e.message}\n\nPlease try again or check your connection.`
      )
    } finally {
      confirmEndSessionBtn.textContent = 'End Session'
      confirmEndSessionBtn.disabled = false
    }
  }

  // Event listeners for End Session
  if (endSessionBtn) {
    endSessionBtn.addEventListener('click', showEndSessionModal)
  }

  if (cancelEndSessionBtn) {
    cancelEndSessionBtn.addEventListener('click', hideEndSessionModal)
  }

  if (confirmEndSessionBtn) {
    confirmEndSessionBtn.addEventListener('click', endSession)
  }

  // Close modal on overlay click
  if (endSessionModal) {
    endSessionModal.addEventListener('click', e => {
      if (e.target === endSessionModal) {
        hideEndSessionModal()
      }
    })
  }

  // Check session status on load
  checkSessionStatus()

  // Update session status when storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      (changes.activeSession || changes.realtimeMonitoring)
    ) {
      checkSessionStatus()
    }
  })
})()
