const MEETING_STATUS = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  SCRAPING: 'scraping',
  DATA_RECEIVED: 'data_received',
  PAUSED: 'paused'
})

// Canonical meeting status values used across the realtime pipeline
const CANONICAL_MEETING_STATUS_VALUES = new Set(Object.values(MEETING_STATUS))

function normalizeMeetingStatus (rawStatus) {
  if (!rawStatus) {
    return MEETING_STATUS.SCRAPING
  }

  const normalized = String(rawStatus).toLowerCase()

  if (CANONICAL_MEETING_STATUS_VALUES.has(normalized)) {
    return normalized
  }

  switch (normalized) {
    case 'connecting':
      return MEETING_STATUS.SCRAPING
    case 'live':
      return MEETING_STATUS.ACTIVE
    case 'ended':
      return MEETING_STATUS.IDLE
    case 'error':
      return MEETING_STATUS.SCRAPING
    default:
      console.warn(
        `⚠️ Unknown meetingStatus value received in progress endpoint: '${normalized}' - defaulting to '${MEETING_STATUS.SCRAPING}'`
      )
      return MEETING_STATUS.SCRAPING
  }
}

function buildMeetingStatusPayload ({
  meetCode,
  status,
  timestamp,
  subjectId,
  groupId
}) {
  const payload = {
    meetCode,
    status,
    timestamp
  }

  if (subjectId !== undefined && subjectId !== null) {
    payload.subjectId = subjectId
  }

  if (groupId !== undefined && groupId !== null) {
    payload.groupId = groupId
  }

  return payload
}

module.exports = {
  MEETING_STATUS,
  normalizeMeetingStatus,
  buildMeetingStatusPayload
}
