/* eslint-env node */

const { MEETING_STATUS } = require('./meetingStatus')

function deriveMeetingLifecycle ({
  meetingStatus,
  meetingEnded,
  hasParticipants
}) {
  const status = meetingStatus || null
  const endedFlag = Boolean(meetingEnded) || status === MEETING_STATUS.IDLE
  const hasPeople = Boolean(hasParticipants)

  let phase = 'pre_meeting'

  if (endedFlag) {
    phase = 'ended'
  } else if (status === MEETING_STATUS.PAUSED) {
    phase = hasPeople ? 'paused_with_participants' : 'paused'
  } else if (
    status === MEETING_STATUS.ACTIVE ||
    status === MEETING_STATUS.SCRAPING ||
    status === MEETING_STATUS.DATA_RECEIVED
  ) {
    phase = hasPeople ? 'live' : 'live_empty'
  }

  return {
    meetingStatus: status,
    meetingEnded: endedFlag,
    hasParticipants: hasPeople,
    isIdle: status === MEETING_STATUS.IDLE,
    isLive:
      status === MEETING_STATUS.ACTIVE ||
      status === MEETING_STATUS.SCRAPING ||
      status === MEETING_STATUS.DATA_RECEIVED,
    isPaused: status === MEETING_STATUS.PAUSED,
    phase
  }
}

module.exports = {
  deriveMeetingLifecycle
}
