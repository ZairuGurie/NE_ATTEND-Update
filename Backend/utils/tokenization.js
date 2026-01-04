/**
 * NE-ATTEND Backend Tokenization Utilities
 *
 * Server-side tokenization for participant data to ensure
 * consistent token generation matching the frontend.
 */

/**
 * Generate a simple hash from a string
 * Matches frontend's simpleHash function
 * @param {string} str - String to hash
 * @returns {string} - Hash string
 */
function simpleHash (str) {
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
 * Generate a participant token for deduplication
 * @param {Object} participant - Participant data
 * @param {string} meetCode - Meeting code
 * @param {string} sessionDate - Session date
 * @returns {string} - Participant token
 */
function generateParticipantToken (participant, meetCode, sessionDate) {
  const identifier =
    participant.avatarUrl ||
    participant.participantId ||
    participant.userId ||
    participant.studentId ||
    `${(participant.name || 'unknown').trim().toLowerCase()}-${
      meetCode || 'unknown'
    }`

  const dateStr = sessionDate
    ? new Date(sessionDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  const tokenSource = `${identifier}|${meetCode || 'unknown'}|${dateStr}`
  return simpleHash(tokenSource)
}

/**
 * Generate a session token
 * @param {string} meetCode - Meeting code
 * @param {string} startTime - Session start time
 * @param {string} instructorId - Instructor ID (optional)
 * @returns {string} - Session token
 */
function generateSessionToken (meetCode, startTime, instructorId = null) {
  const dateStr = startTime
    ? new Date(startTime).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  const tokenSource = `${meetCode || 'unknown'}|${dateStr}|${
    instructorId || 'any'
  }`
  return simpleHash(tokenSource)
}

/**
 * Generate an entry token for a specific attendance entry
 * @param {Object} participant - Participant data
 * @param {string} meetCode - Meeting code
 * @returns {string} - Entry token
 */
function generateEntryToken (participant, meetCode) {
  const joinTimeIso = participant.joinTimeIso || participant.joinTime || ''
  const leaveTimeIso = participant.leaveTimeIso || participant.leaveTime || ''
  const sessionDate = participant.sessionDate || new Date().toISOString()

  const tokenParts = [
    participant.recordId || participant.entryId || '',
    participant.eventId || '',
    joinTimeIso,
    leaveTimeIso,
    sessionDate,
    participant.rawStatus || participant.status || ''
  ].filter(Boolean)

  if (tokenParts.length === 0) {
    return `${generateParticipantToken(
      participant,
      meetCode,
      sessionDate
    )}|${Date.now()}`
  }

  return simpleHash(tokenParts.join('|'))
}

/**
 * Add tokens to a participant object
 * @param {Object} participant - Participant data
 * @param {string} meetCode - Meeting code
 * @param {string} sessionDate - Session date
 * @returns {Object} - Participant with tokens
 */
function tokenizeParticipant (participant, meetCode, sessionDate) {
  if (!participant) return null

  return {
    ...participant,
    participantToken: generateParticipantToken(
      participant,
      meetCode,
      sessionDate
    ),
    entryToken: generateEntryToken(participant, meetCode),
    meetCode: meetCode || participant.meetCode || 'unknown',
    sessionDate:
      sessionDate || participant.sessionDate || new Date().toISOString()
  }
}

/**
 * Add tokens to a payload
 * @param {Object} payload - Broadcast payload
 * @param {string} meetCode - Meeting code
 * @param {string} sessionDate - Session date
 * @returns {Object} - Payload with tokens
 */
function tokenizePayload (payload, meetCode, sessionDate) {
  if (!payload) return null

  const sessionToken = generateSessionToken(
    meetCode || payload.meetCode,
    sessionDate || payload.sessionDate,
    payload.instructorId
  )

  // Tokenize all participants
  const participants = (payload.participants || []).map(p =>
    tokenizeParticipant(p, meetCode, sessionDate)
  )

  return {
    ...payload,
    sessionToken,
    participants,
    tokenizedAt: new Date().toISOString(),
    tokenVersion: '1.0'
  }
}

module.exports = {
  simpleHash,
  generateParticipantToken,
  generateSessionToken,
  generateEntryToken,
  tokenizeParticipant,
  tokenizePayload
}
