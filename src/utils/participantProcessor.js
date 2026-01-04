/**
 * NE-ATTEND Participant Processor
 *
 * Processes participant data from Socket.IO updates to match
 * the browser extension's scraping and tracking behavior.
 *
 * This module mirrors the extension's:
 * - track_attendance() data collection
 * - detectJoinLeaveEvents() event detection
 * - Status derivation and formatting
 * - Duration tracking
 */

import {
  tokenizeParticipant,
  tokenizePayload,
  detectDuplicates,
  mergeParticipantData,
  normalizeName,
  formatDurationFromSeconds
} from './tokenization'

// Status constants matching extension
export const PARTICIPANT_STATUS = {
  PRESENT: 'present',
  LATE: 'late',
  LEFT: 'left',
  JOINED: 'joined',
  ABSENT: 'absent',
  PENDING: 'pending'
}

// Status labels matching extension's formatStatusLabel()
export const STATUS_LABELS = {
  present: 'Present',
  late: 'Late',
  left: 'Left Meeting',
  joined: 'Just Joined',
  absent: 'Absent',
  pending: 'Pending'
}

/**
 * Derive raw status from participant data
 * Mirrors extension's deriveRawStatus() function
 * @param {Object} participant - Participant data
 * @returns {string} - Raw status value
 */
export const deriveRawStatus = participant => {
  if (!participant) return PARTICIPANT_STATUS.JOINED

  // Check explicit rawStatus first
  if (participant.rawStatus && typeof participant.rawStatus === 'string') {
    return participant.rawStatus.trim().toLowerCase()
  }

  // Check status field
  if (participant.status && typeof participant.status === 'string') {
    return participant.status.trim().toLowerCase()
  }

  // Infer from state
  if (participant.isCurrentlyInMeeting) {
    return PARTICIPANT_STATUS.PRESENT
  }

  if (participant.isTardy) {
    return PARTICIPANT_STATUS.LATE
  }

  // Check for leave time indicators
  if (
    participant.leaveTime ||
    participant.leaveTimeIso ||
    participant.timeOut
  ) {
    return PARTICIPANT_STATUS.LEFT
  }

  return PARTICIPANT_STATUS.JOINED
}

/**
 * Format status label for display
 * Mirrors extension's formatStatusLabel() function
 * @param {string} rawStatus - Raw status value
 * @returns {string} - Formatted status label
 */
export const formatStatusLabel = rawStatus => {
  const status = (rawStatus || '').toLowerCase()
  return STATUS_LABELS[status] || STATUS_LABELS.present
}

/**
 * Determine participant status based on meeting state
 * Mirrors extension's status logic in buildDisplayRow()
 * @param {Object} participant - Participant data
 * @param {Object} options - Additional context (hostLeaveTime, meetingEnded, etc.)
 * @returns {string} - Computed status
 */
export const computeParticipantStatus = (participant, options = {}) => {
  if (!participant) return PARTICIPANT_STATUS.JOINED

  let rawStatus = deriveRawStatus(participant)

  // Host is always present (unless explicitly late)
  if (participant.isHost) {
    return rawStatus === PARTICIPANT_STATUS.LATE
      ? PARTICIPANT_STATUS.LATE
      : PARTICIPANT_STATUS.PRESENT
  }

  const participantLeaveTime =
    participant.leaveTimeIso || participant.leaveTime || participant.timeOut
  const hostLeaveTime =
    options.hostLeaveTime ||
    options.instructorLeaveTime ||
    participant.hostLeaveTime ||
    participant.instructorLeaveTime
  const meetingEnded = options.meetingEnded || participant.meetingEnded || false
  const isCurrentlyInMeeting =
    participant.isCurrentlyInMeeting !== undefined
      ? participant.isCurrentlyInMeeting
      : participant.isLive && !participantLeaveTime

  // During meeting (host present)
  if (!meetingEnded && !hostLeaveTime) {
    if (isCurrentlyInMeeting) {
      return participant.isTardy
        ? PARTICIPANT_STATUS.LATE
        : PARTICIPANT_STATUS.PRESENT
    } else if (participantLeaveTime) {
      return PARTICIPANT_STATUS.PENDING
    }
  }

  // Meeting ended (host left)
  if (meetingEnded && hostLeaveTime) {
    // Participant was synchronized
    if (participant.timeoutSynchronized) {
      return PARTICIPANT_STATUS.PRESENT
    }

    // Participant left - check timing relative to host
    if (participantLeaveTime) {
      try {
        const hostLeave = new Date(hostLeaveTime)
        const participantLeave = new Date(participantLeaveTime)

        if (!isNaN(hostLeave.getTime()) && !isNaN(participantLeave.getTime())) {
          const timeDiff = Math.abs(
            participantLeave.getTime() - hostLeave.getTime()
          )
          const fiveMinutes = 5 * 60 * 1000

          // Left together with host or after host = present
          if (participantLeave >= hostLeave || timeDiff <= fiveMinutes) {
            return PARTICIPANT_STATUS.PRESENT
          } else {
            return PARTICIPANT_STATUS.ABSENT
          }
        }
      } catch (e) {
        console.warn('Error parsing leave times:', e)
      }
    }

    // Still in meeting when host left = present
    if (isCurrentlyInMeeting) {
      return PARTICIPANT_STATUS.PRESENT
    }
  }

  // If meeting hasn't ended and participant is currently in meeting
  if (!meetingEnded && isCurrentlyInMeeting) {
    return participant.isTardy
      ? PARTICIPANT_STATUS.LATE
      : PARTICIPANT_STATUS.PRESENT
  }

  return rawStatus
}

/**
 * Parse timestamp from various formats
 * Mirrors extension's timestamp handling
 * @param {*} value - Timestamp value (Date, string, number)
 * @returns {Date|null} - Parsed Date or null
 */
export const parseTimestamp = value => {
  if (!value) return null
  if (value instanceof Date) return value

  // Try ISO format
  const isoCandidate = new Date(value)
  if (!Number.isNaN(isoCandidate.getTime())) return isoCandidate

  // Try HH:MM:SS format
  if (typeof value === 'string') {
    const hmsMatch = value.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
    if (hmsMatch) {
      const [, hh, mm, ss = '0'] = hmsMatch
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

/**
 * Format time for display
 * @param {*} value - Time value
 * @param {string} fallback - Fallback string if parsing fails
 * @returns {string} - Formatted time string
 */
export const formatTimeDisplay = (value, fallback = '—') => {
  const parsed = value instanceof Date ? value : parseTimestamp(value)
  if (!parsed) return fallback
  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Process a single participant from payload
 * Creates a complete display row matching Dashboard format
 * @param {Object} participant - Raw participant data
 * @param {Object} options - Processing options (meetCode, sessionDate, etc.)
 * @returns {Object} - Processed participant row
 */
export const processParticipant = (participant, options = {}) => {
  if (!participant) return null

  const {
    meetCode = 'unknown',
    sessionDate = new Date().toISOString(),
    subjectName = null,
    hostLeaveTime = null,
    meetingEnded = false,
    isLiveUpdate = true
  } = options

  // Tokenize first
  const tokenized = tokenizeParticipant(participant, meetCode, sessionDate)

  // Compute status
  const rawStatus = computeParticipantStatus(tokenized, {
    hostLeaveTime,
    meetingEnded
  })
  const statusLabel = formatStatusLabel(rawStatus)

  // Parse timestamps
  const joinDate = parseTimestamp(tokenized.joinTimeIso || tokenized.joinTime)
  const leaveDate = parseTimestamp(
    tokenized.leaveTimeIso || tokenized.leaveTime || tokenized.timeOut
  )

  // Get duration
  const durationSeconds =
    typeof tokenized.durationSeconds === 'number'
      ? tokenized.durationSeconds
      : typeof tokenized.attendedDuration === 'number'
      ? tokenized.attendedDuration
      : typeof tokenized.duration === 'number'
      ? tokenized.duration
      : 0

  // Determine group/subject name for display
  const groupDisplayName =
    subjectName ||
    tokenized.subjectName ||
    tokenized.groupName ||
    tokenized.group ||
    tokenized.meetCode ||
    meetCode

  // Build processed row
  return {
    // Identity
    key: tokenized.key || tokenized.participantToken,
    participantToken: tokenized.participantToken,
    entryToken: tokenized.entryToken,
    participantId: tokenized.participantId || tokenized.userId || null,
    studentId: tokenized.studentId || null,

    // Display fields
    name: normalizeName(
      tokenized.userName || tokenized.name || tokenized.displayName || 'Unknown'
    ),
    normalizedName: tokenized.normalizedName,
    avatarUrl: tokenized.avatarUrl || null,

    // Group/Session
    meetCode,
    group: groupDisplayName,
    sessionDate: tokenized.sessionDate || sessionDate,
    dateDisplay: sessionDate
      ? new Date(sessionDate).toISOString().split('T')[0]
      : null,

    // Status
    rawStatus,
    status: statusLabel,
    log: statusLabel,
    isHost: tokenized.isHost || false,
    isCurrentlyInMeeting:
      tokenized.isCurrentlyInMeeting || tokenized.isLive || false,
    timeoutSynchronized: tokenized.timeoutSynchronized || false,

    // Duration
    durationSeconds,
    duration: formatDurationFromSeconds(durationSeconds),

    // Timestamps
    joinTime: tokenized.joinTime || null,
    joinTimeIso: joinDate
      ? joinDate.toISOString()
      : tokenized.joinTimeIso || null,
    joinTimeDisplay: formatTimeDisplay(joinDate || tokenized.joinTime),
    leaveTime: tokenized.leaveTime || tokenized.timeOut || null,
    leaveTimeIso: leaveDate
      ? leaveDate.toISOString()
      : tokenized.leaveTimeIso || null,
    leaveTimeDisplay: formatTimeDisplay(
      leaveDate || tokenized.leaveTime || tokenized.timeOut
    ),
    timeOut: formatTimeDisplay(
      leaveDate || tokenized.leaveTime || tokenized.timeOut
    ),

    // State flags
    isLive: isLiveUpdate && rawStatus !== PARTICIPANT_STATUS.LEFT,
    isLeft: rawStatus === PARTICIPANT_STATUS.LEFT,
    isNew: rawStatus === PARTICIPANT_STATUS.JOINED,
    isUnauthenticated:
      tokenized.isUnauthenticated || tokenized.authWarning || false,

    // Metadata
    lastSeen: tokenized.lastSeen || new Date().toISOString(),
    recordId:
      tokenized.recordId ||
      tokenized.entryId ||
      tokenized.attendanceId ||
      tokenized._id ||
      null,
    entryId: tokenized.entryToken
  }
}

/**
 * Process an entire attendance update payload
 * @param {Object} payload - Socket.IO payload
 * @returns {Object} - Processed payload with tokenized participants
 */
export const processAttendanceUpdate = payload => {
  if (!payload) return null

  // Tokenize the payload first
  const tokenized = tokenizePayload(payload)

  const meetCode = tokenized.meetCode
  const sessionDate = tokenized.sessionDate
  const subjectName = tokenized.subjectName || tokenized.groupName

  // Extract host info for status calculations
  const participants = tokenized.participants || []
  const host = participants.find(p => p.isHost === true)
  const hostLeaveTime = host?.leaveTimeIso || host?.leaveTime || null

  // Process all participants
  const processedParticipants = participants
    .map(p =>
      processParticipant(p, {
        meetCode,
        sessionDate,
        subjectName,
        hostLeaveTime,
        meetingEnded: tokenized.meetingEnded || false,
        isLiveUpdate: true
      })
    )
    .filter(Boolean)

  // Detect and remove duplicates
  const { unique, duplicates } = detectDuplicates(processedParticipants)

  if (duplicates.length > 0) {
    console.log(`🔄 Removed ${duplicates.length} duplicate participant(s)`)
  }

  return {
    ...tokenized,
    participants: unique,
    processedAt: new Date().toISOString(),
    duplicatesRemoved: duplicates.length,
    participantCount: unique.length,
    hostCount: unique.filter(p => p.isHost).length
  }
}

/**
 * Detect join/leave events by comparing current and previous state
 * Mirrors extension's detectJoinLeaveEvents()
 * @param {Array} currentParticipants - Current participant list
 * @param {Array} previousParticipants - Previous participant list
 * @returns {Object} - { joined: Array, left: Array }
 */
export const detectJoinLeaveEvents = (
  currentParticipants,
  previousParticipants
) => {
  const current = new Map(
    (currentParticipants || []).map(p => [p.participantToken || p.key, p])
  )
  const previous = new Map(
    (previousParticipants || []).map(p => [p.participantToken || p.key, p])
  )

  const joined = []
  const left = []

  // Find newly joined participants
  for (const [token, participant] of current) {
    if (!previous.has(token)) {
      joined.push({
        ...participant,
        eventType: 'join',
        eventTime: new Date().toISOString()
      })
    }
  }

  // Find participants who left
  for (const [token, participant] of previous) {
    if (!current.has(token)) {
      left.push({
        ...participant,
        eventType: 'leave',
        eventTime: new Date().toISOString()
      })
    }
  }

  return { joined, left }
}

/**
 * Merge new participants into existing row state
 * Handles updates, new entries, and status changes
 * @param {Array} existingRows - Current rows in state
 * @param {Array} incomingParticipants - New participants from update
 * @param {Object} options - Merge options
 * @returns {Array} - Updated rows
 */
export const mergeParticipantRows = (
  existingRows,
  incomingParticipants,
  options = {}
) => {
  const {
    preserveLeft = true, // Keep participants who left in the list
    maxLeftAge = 300000 // Remove left participants after 5 minutes
  } = options

  const existingMap = new Map(
    (existingRows || []).map(r => [r.participantToken || r.key, r])
  )

  const now = Date.now()
  const updatedRows = []
  const processedTokens = new Set()

  // Process incoming participants
  for (const participant of incomingParticipants || []) {
    const token = participant.participantToken || participant.key
    processedTokens.add(token)

    const existing = existingMap.get(token)
    if (existing) {
      // Merge with existing
      const merged = mergeParticipantData(existing, participant)
      updatedRows.push(merged)
    } else {
      // New participant
      updatedRows.push(participant)
    }
  }

  // Handle participants not in current update (potentially left)
  if (preserveLeft) {
    for (const [token, existing] of existingMap) {
      if (!processedTokens.has(token)) {
        // Participant not in current update
        const lastSeenTime = existing.lastSeen
          ? new Date(existing.lastSeen).getTime()
          : 0
        const age = now - lastSeenTime

        if (age < maxLeftAge) {
          // Keep but mark as potentially left
          updatedRows.push({
            ...existing,
            isCurrentlyInMeeting: false,
            rawStatus: PARTICIPANT_STATUS.LEFT,
            status: formatStatusLabel(PARTICIPANT_STATUS.LEFT),
            isLive: false,
            isLeft: true
          })
        }
        // Otherwise, let the participant age out
      }
    }
  }

  return updatedRows
}

/**
 * Calculate meeting statistics from participant list
 * @param {Array} participants - Processed participants
 * @returns {Object} - Meeting statistics
 */
export const calculateMeetingStats = participants => {
  const list = participants || []

  return {
    total: list.length,
    present: list.filter(p => p.rawStatus === PARTICIPANT_STATUS.PRESENT)
      .length,
    late: list.filter(p => p.rawStatus === PARTICIPANT_STATUS.LATE).length,
    left: list.filter(p => p.rawStatus === PARTICIPANT_STATUS.LEFT).length,
    absent: list.filter(p => p.rawStatus === PARTICIPANT_STATUS.ABSENT).length,
    hosts: list.filter(p => p.isHost).length,
    inMeeting: list.filter(p => p.isCurrentlyInMeeting).length,
    unauthenticated: list.filter(p => p.isUnauthenticated).length,
    averageDuration:
      list.length > 0
        ? Math.round(
            list.reduce((sum, p) => sum + (p.durationSeconds || 0), 0) /
              list.length
          )
        : 0
  }
}

export default {
  PARTICIPANT_STATUS,
  STATUS_LABELS,
  deriveRawStatus,
  formatStatusLabel,
  computeParticipantStatus,
  parseTimestamp,
  formatTimeDisplay,
  processParticipant,
  processAttendanceUpdate,
  detectJoinLeaveEvents,
  mergeParticipantRows,
  calculateMeetingStats
}
