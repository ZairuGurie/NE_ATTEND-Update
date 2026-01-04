/**
 * NE-ATTEND Tokenization Utilities
 *
 * Provides tokenization functions to normalize and validate participant data
 * matching the browser extension's scraping behavior.
 *
 * Token Types:
 * - participantToken: Unique identifier for a participant within a session
 * - sessionToken: Unique identifier for a meeting session
 * - entryToken: Unique identifier for a specific join/leave event
 */

/**
 * Generate a simple hash from a string (for client-side use)
 * This is NOT cryptographically secure - just for deduplication
 * @param {string} str - String to hash
 * @returns {string} - Hash string
 */
export const simpleHash = str => {
  if (!str) return '0'
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Normalize a participant name to match extension behavior
 * Mirrors cleanParticipantName() from attendance.js
 * @param {string} name - Raw name from payload
 * @returns {string} - Normalized name
 */
export const normalizeName = name => {
  if (!name || typeof name !== 'string') return ''

  let cleaned = name.trim()

  // Remove common suffixes that appear in Google Meet
  const suffixPatterns = [
    /\s*\(Host\)$/i,
    /\s*\(You\)$/i,
    /\s*\(Presenting\)$/i,
    /\s*\(Guest\)$/i,
    /\s*\(External\)$/i,
    /\s*- Host$/i,
    /\s*- You$/i
  ]

  for (const pattern of suffixPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove any remaining parenthetical suffixes
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '')

  // Trim again after removals
  cleaned = cleaned.trim()

  return cleaned
}

/**
 * Generate a participant token for deduplication
 * Matches extension's key generation logic
 * @param {Object} participant - Participant data
 * @param {string} meetCode - Meeting code
 * @param {string} sessionDate - Session date (ISO string or date string)
 * @returns {string} - Participant token
 */
export const generateParticipantToken = (
  participant,
  meetCode,
  sessionDate
) => {
  // Priority order for participant identifier (matches extension)
  const identifier =
    participant.avatarUrl ||
    participant.participantId ||
    participant.userId ||
    participant.studentId ||
    `${normalizeName(
      participant.name || participant.displayName || 'unknown'
    )}-${meetCode || 'unknown'}`

  // Normalize the date to just the date portion
  const dateStr = sessionDate
    ? new Date(sessionDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  // Generate token from identifier + meetCode + date
  const tokenSource = `${identifier}|${meetCode || 'unknown'}|${dateStr}`
  return simpleHash(tokenSource)
}

/**
 * Generate a session token for session tracking
 * @param {string} meetCode - Meeting code
 * @param {string} startTime - Session start time (ISO string)
 * @param {string} instructorId - Instructor ID (optional)
 * @returns {string} - Session token
 */
export const generateSessionToken = (
  meetCode,
  startTime,
  instructorId = null
) => {
  const dateStr = startTime
    ? new Date(startTime).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  const tokenSource = `${meetCode || 'unknown'}|${dateStr}|${
    instructorId || 'any'
  }`
  return simpleHash(tokenSource)
}

/**
 * Generate an entry token for a specific join/leave event
 * @param {Object} participant - Participant data
 * @param {string} meetCode - Meeting code
 * @returns {string} - Entry token
 */
export const generateEntryToken = (participant, meetCode) => {
  const joinTimeIso = participant.joinTimeIso || participant.joinTime || ''
  const leaveTimeIso = participant.leaveTimeIso || participant.leaveTime || ''
  const sessionDate = participant.sessionDate || new Date().toISOString()

  // Include all relevant timestamps for uniqueness
  const tokenParts = [
    participant.recordId || participant.entryId || '',
    participant.eventId || '',
    joinTimeIso,
    leaveTimeIso,
    sessionDate,
    participant.rawStatus || participant.status || ''
  ].filter(Boolean)

  if (tokenParts.length === 0) {
    // Fallback to participant token + timestamp
    return `${generateParticipantToken(
      participant,
      meetCode,
      sessionDate
    )}|${Date.now()}`
  }

  return simpleHash(tokenParts.join('|'))
}

/**
 * Tokenize a single participant
 * Adds all token types to the participant object
 * @param {Object} participant - Raw participant data
 * @param {string} meetCode - Meeting code
 * @param {string} sessionDate - Session date
 * @returns {Object} - Participant with tokens added
 */
export const tokenizeParticipant = (participant, meetCode, sessionDate) => {
  if (!participant) return null

  const normalizedName = normalizeName(
    participant.name || participant.displayName || participant.userName
  )

  return {
    ...participant,
    // Normalized name
    normalizedName,
    // Token fields
    participantToken: generateParticipantToken(
      participant,
      meetCode,
      sessionDate
    ),
    entryToken: generateEntryToken(participant, meetCode),
    // Preserve original key if present, otherwise use participantToken
    key:
      participant.key ||
      generateParticipantToken(participant, meetCode, sessionDate),
    // Ensure these fields exist for consistency
    meetCode: meetCode || participant.meetCode || 'unknown',
    sessionDate:
      sessionDate || participant.sessionDate || new Date().toISOString()
  }
}

/**
 * Tokenize an entire payload of participants
 * @param {Object} payload - Socket.IO payload with participants
 * @returns {Object} - Payload with tokenized participants and session token
 */
export const tokenizePayload = payload => {
  if (!payload) return null

  const meetCode = payload.meetCode || payload.group || 'unknown'
  const sessionDate =
    payload.sessionDate || payload.date || new Date().toISOString()
  const startTime = payload.startTime || payload.sessionStartTime || sessionDate

  // Generate session token
  const sessionToken = generateSessionToken(
    meetCode,
    startTime,
    payload.instructorId
  )

  // Tokenize all participants
  const participants =
    payload.participants ||
    payload.currentParticipants ||
    payload.attendance ||
    []
  const tokenizedParticipants = participants.map(p =>
    tokenizeParticipant(p, meetCode, sessionDate)
  )

  return {
    ...payload,
    sessionToken,
    meetCode,
    sessionDate,
    participants: tokenizedParticipants,
    // Keep original arrays if they exist
    ...(payload.currentParticipants && {
      currentParticipants: tokenizedParticipants
    }),
    ...(payload.attendance && { attendance: tokenizedParticipants }),
    // Add metadata
    tokenizedAt: new Date().toISOString(),
    tokenVersion: '1.0'
  }
}

/**
 * Validate a participant token matches expected data
 * @param {Object} participant - Participant with token
 * @param {string} expectedMeetCode - Expected meeting code
 * @param {string} expectedDate - Expected session date
 * @returns {boolean} - True if token is valid
 */
export const validateParticipantToken = (
  participant,
  expectedMeetCode,
  expectedDate
) => {
  if (!participant || !participant.participantToken) return false

  const expectedToken = generateParticipantToken(
    participant,
    expectedMeetCode,
    expectedDate
  )
  return participant.participantToken === expectedToken
}

/**
 * Detect duplicate participants by token
 * @param {Array} participants - Array of tokenized participants
 * @returns {Object} - { unique: Array, duplicates: Array }
 */
export const detectDuplicates = participants => {
  if (!Array.isArray(participants)) return { unique: [], duplicates: [] }

  const seen = new Map()
  const unique = []
  const duplicates = []

  for (const participant of participants) {
    const token = participant.participantToken || participant.key

    if (seen.has(token)) {
      // Duplicate found - keep the one with more data or more recent
      const existing = seen.get(token)
      const existingTime = existing.lastSeen || existing.joinTimeIso || ''
      const currentTime = participant.lastSeen || participant.joinTimeIso || ''

      if (currentTime > existingTime) {
        // Current is more recent, replace
        const existingIndex = unique.findIndex(
          p => (p.participantToken || p.key) === token
        )
        if (existingIndex !== -1) {
          duplicates.push(unique[existingIndex])
          unique[existingIndex] = participant
        }
        seen.set(token, participant)
      } else {
        duplicates.push(participant)
      }
    } else {
      seen.set(token, participant)
      unique.push(participant)
    }
  }

  return { unique, duplicates }
}

/**
 * Merge participant data, preferring newer/more complete data
 * Matches extension's merging logic
 * @param {Object} existing - Existing participant data
 * @param {Object} incoming - New participant data
 * @returns {Object} - Merged participant data
 */
export const mergeParticipantData = (existing, incoming) => {
  if (!existing) return incoming
  if (!incoming) return existing

  // Start with existing, overlay with incoming
  const merged = { ...existing, ...incoming }

  // Fields where we should preserve existing if incoming is missing/empty
  const fieldsToPreserve = [
    'joinTime',
    'joinTimeIso',
    'joinTimeDisplay',
    'timeIn',
    'sessionDate',
    'dateDisplay',
    'participantToken',
    'entryToken'
  ]

  const isFieldEmpty = value =>
    value === undefined || value === null || value === '' || value === '—'

  for (const field of fieldsToPreserve) {
    if (isFieldEmpty(incoming?.[field]) && !isFieldEmpty(existing?.[field])) {
      merged[field] = existing[field]
    }
  }

  // Duration should always take the latest (larger) value
  if (typeof incoming?.durationSeconds === 'number') {
    merged.durationSeconds = incoming.durationSeconds
  } else if (typeof incoming?.attendedDuration === 'number') {
    merged.durationSeconds = incoming.attendedDuration
  } else if (typeof existing?.durationSeconds === 'number') {
    merged.durationSeconds = existing.durationSeconds
  }

  // Format duration if we have seconds
  if (typeof merged.durationSeconds === 'number') {
    merged.duration = formatDurationFromSeconds(merged.durationSeconds)
  }

  return merged
}

/**
 * Format duration from seconds to HH:MM:SS
 * Matches extension's formatDuration function
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration string
 */
export const formatDurationFromSeconds = seconds => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export default {
  simpleHash,
  normalizeName,
  generateParticipantToken,
  generateSessionToken,
  generateEntryToken,
  tokenizeParticipant,
  tokenizePayload,
  validateParticipantToken,
  detectDuplicates,
  mergeParticipantData,
  formatDurationFromSeconds
}
