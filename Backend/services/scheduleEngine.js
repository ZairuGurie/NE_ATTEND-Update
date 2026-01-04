const { getModel } = require('./dataStore')
const {
  upsertSessionByMeetCodeAndDate,
  normalizeSessionDate
} = require('./sessionService')
const { extractMeetCodeFromLink } = require('../utils/meetLinkUtils')
const { autoIssueTokensForSession } = require('./attendanceTokenService')
const {
  ensureBaselineAttendanceForSession
} = require('./attendanceBaselineService')

const Subject = getModel('Subject')

const JS_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

const DEFAULT_INTERVAL_MINUTES = Number(
  process.env.SCHEDULE_ENGINE_INTERVAL_MINUTES || 5
)
const DEFAULT_LOOKAHEAD_MINUTES = Number(
  process.env.SCHEDULE_ENGINE_LOOKAHEAD_MINUTES || 60
)
const DEFAULT_PREVIEW_LOOKAHEAD_MINUTES = 180
const MAX_PREVIEW_SESSIONS = 200

let intervalHandle = null
let isRunning = false
let lastRunSummary = null

function cloneAndNormalizeDay (value) {
  return normalizeSessionDate(new Date(value))
}

function buildDateTimeFromSchedule (baseDate, timeStr) {
  if (!timeStr) return null
  const [hourStr = '0', minuteStr = '0'] = String(timeStr).split(':')
  const date = new Date(baseDate)
  date.setHours(parseInt(hourStr, 10) || 0, parseInt(minuteStr, 10) || 0, 0, 0)
  return date
}

function isWithinDateRange (day, schedule = {}) {
  if (!schedule) return false
  if (schedule.startDate) {
    const start = cloneAndNormalizeDay(schedule.startDate)
    if (day < start) {
      return false
    }
  }
  if (schedule.endDate) {
    const end = cloneAndNormalizeDay(schedule.endDate)
    if (day > end) {
      return false
    }
  }
  return true
}

function buildInstancesForSubject ({ subject, windowStart, windowEnd }) {
  const schedule = subject?.schedule
  if (
    !schedule ||
    !Array.isArray(schedule.weekdays) ||
    schedule.weekdays.length === 0
  ) {
    return []
  }

  if (!schedule.startTime || !schedule.endTime) {
    return []
  }

  const normalizedWindowStart = cloneAndNormalizeDay(windowStart)
  const normalizedWindowEnd = cloneAndNormalizeDay(windowEnd)
  const days = []
  const cursor = new Date(normalizedWindowStart)

  while (cursor <= normalizedWindowEnd) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const targetWeekdays = schedule.weekdays.map(day => day.toLowerCase())
  const instances = []

  for (const day of days) {
    const weekdayName = JS_WEEKDAY_NAMES[day.getDay()].toLowerCase()
    if (!targetWeekdays.includes(weekdayName)) {
      continue
    }

    if (!isWithinDateRange(day, schedule)) {
      continue
    }

    const sessionStart = buildDateTimeFromSchedule(day, schedule.startTime)
    const sessionEnd = buildDateTimeFromSchedule(day, schedule.endTime)

    if (!sessionStart || !sessionEnd || sessionEnd <= sessionStart) {
      continue
    }

    if (sessionEnd < windowStart || sessionStart > windowEnd) {
      continue
    }

    instances.push({
      subjectId: subject._id,
      subjectName: subject.subjectName,
      meetingLink: subject.meetingLink,
      schedule,
      sessionDate: cloneAndNormalizeDay(day),
      startTime: sessionStart,
      endTime: sessionEnd
    })
  }

  return instances
}

async function fetchSchedulableSubjects () {
  return Subject.find({
    isActive: { $ne: false },
    'schedule.weekdays.0': { $exists: true },
    'schedule.startTime': { $exists: true },
    'schedule.endTime': { $exists: true }
  })
    .select('subjectName meetingLink schedule instructorId sections department')
    .lean()
}

async function ensureSessionsForWindow ({
  windowStart,
  windowEnd,
  logger = console
}) {
  const start = windowStart ? new Date(windowStart) : new Date()
  const end = windowEnd
    ? new Date(windowEnd)
    : new Date(start.getTime() + DEFAULT_LOOKAHEAD_MINUTES * 60000)

  if (end <= start) {
    throw new Error('scheduleEngine windowEnd must be after windowStart')
  }

  const subjects = await fetchSchedulableSubjects()
  let processedSessions = 0
  let skippedSubjects = 0
  let createdSessions = 0

  for (const subject of subjects) {
    const meetCode = extractMeetCodeFromLink(subject.meetingLink || '')
    if (!meetCode) {
      skippedSubjects += 1
      continue
    }

    const instances = buildInstancesForSubject({
      subject,
      windowStart: start,
      windowEnd: end
    })

    for (const instance of instances) {
      processedSessions += 1
      const durationMs = instance.endTime - instance.startTime
      const firstThirdThreshold = new Date(
        instance.startTime.getTime() + durationMs / 3
      )
      const sessionId = `sched_${instance.startTime.getTime()}_${
        subject._id
      }_${Math.random().toString(36).slice(2, 6)}`

      try {
        const result = await upsertSessionByMeetCodeAndDate({
          meetCode,
          sessionDate: instance.sessionDate,
          insert: {
            startTime: instance.startTime,
            endTime: instance.endTime,
            subjectId: subject._id,
            isDuringAddDrop: false,
            firstThirdThreshold,
            status: 'scheduled',
            sessionId
          }
        })

        if (result && !result.duplicateResolved && result.attempts === 1) {
          createdSessions += 1
          await autoIssueTokensForSession({
            sessionId: result.session._id,
            logger
          })
          await ensureBaselineAttendanceForSession({
            sessionId: result.session._id,
            logger
          })
        }
      } catch (error) {
        logger.error(
          `❌ Schedule engine failed to upsert session for subject ${subject._id}:`,
          error.message
        )
      }
    }
  }

  const summary = {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    subjectsProcessed: subjects.length,
    subjectsSkipped: skippedSubjects,
    sessionsEnsured: processedSessions,
    sessionsCreated: createdSessions,
    timestamp: new Date().toISOString()
  }

  lastRunSummary = summary

  if (processedSessions > 0) {
    logger.log(
      `📅 Schedule engine ensured ${processedSessions} session(s) (created ${createdSessions}) in window ${summary.windowStart} -> ${summary.windowEnd}`
    )
  }

  return summary
}

async function getUpcomingScheduleInstances ({
  windowStart,
  windowEnd,
  limit = MAX_PREVIEW_SESSIONS
}) {
  const start = windowStart ? new Date(windowStart) : new Date()
  const end = windowEnd
    ? new Date(windowEnd)
    : new Date(start.getTime() + DEFAULT_PREVIEW_LOOKAHEAD_MINUTES * 60000)

  const subjects = await fetchSchedulableSubjects()
  const instances = []

  for (const subject of subjects) {
    const meetCode = extractMeetCodeFromLink(subject.meetingLink || '')
    if (!meetCode) {
      continue
    }

    const subjectInstances = buildInstancesForSubject({
      subject,
      windowStart: start,
      windowEnd: end
    })

    for (const instance of subjectInstances) {
      instances.push({
        subjectId: subject._id,
        subjectName: subject.subjectName,
        meetCode,
        sessionDate: instance.sessionDate.toISOString(),
        startTime: instance.startTime.toISOString(),
        endTime: instance.endTime.toISOString()
      })
    }
  }

  instances.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))

  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    totalInstances: instances.length,
    instances: instances.slice(0, limit)
  }
}

async function previewScheduledSessions ({
  lookaheadMinutes = DEFAULT_PREVIEW_LOOKAHEAD_MINUTES,
  limit = MAX_PREVIEW_SESSIONS
} = {}) {
  const start = new Date()
  const end = new Date(start.getTime() + lookaheadMinutes * 60000)
  return getUpcomingScheduleInstances({
    windowStart: start,
    windowEnd: end,
    limit
  })
}

function startScheduleEngine ({
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  lookaheadMinutes = DEFAULT_LOOKAHEAD_MINUTES,
  logger = console
} = {}) {
  if (intervalHandle) {
    logger.log('📅 Schedule engine already running')
    return intervalHandle
  }

  const intervalMs = Math.max(intervalMinutes, 1) * 60000

  const execute = async () => {
    if (isRunning) {
      return
    }
    isRunning = true
    try {
      await ensureSessionsForWindow({
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + lookaheadMinutes * 60000),
        logger
      })
    } catch (error) {
      logger.error('❌ Schedule engine run failed:', error.message)
    } finally {
      isRunning = false
    }
  }

  execute()
  intervalHandle = setInterval(execute, intervalMs)
  intervalHandle.unref?.()

  logger.log(
    `🔁 Schedule engine started (interval: ${intervalMinutes}m, lookahead: ${lookaheadMinutes}m)`
  )
  return intervalHandle
}

function getScheduleEngineState () {
  return {
    isRunning,
    lastRunSummary
  }
}

module.exports = {
  startScheduleEngine,
  ensureSessionsForWindow,
  getUpcomingScheduleInstances,
  previewScheduledSessions,
  getScheduleEngineState
}
