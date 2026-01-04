const { getModel } = require('./dataStore')

const Session = getModel('Session')

const DUPLICATE_KEY_CODE = 11000
const DEFAULT_MAX_RETRIES = 2

function normalizeSessionDate (value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid session date received')
  }
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    )
  )
}

function sanitizeMeetCode (meetCode) {
  if (!meetCode || typeof meetCode !== 'string') {
    return null
  }
  return meetCode.trim()
}

async function upsertSessionByMeetCodeAndDate ({
  meetCode,
  sessionDate,
  insert = {},
  set = {},
  maxRetries = DEFAULT_MAX_RETRIES,
  lean = false
}) {
  const normalizedMeetCode = sanitizeMeetCode(meetCode)
  if (!normalizedMeetCode) {
    throw new Error('meetCode is required to upsert a session')
  }

  const normalizedSessionDate = normalizeSessionDate(sessionDate)

  const query = {
    meetCode: normalizedMeetCode,
    sessionDate: normalizedSessionDate
  }

  const update = {}
  update.$setOnInsert = {
    meetCode: normalizedMeetCode,
    sessionDate: normalizedSessionDate,
    ...insert
  }

  if (set && Object.keys(set).length > 0) {
    update.$set = set
  }

  let attempt = 0
  while (attempt <= maxRetries) {
    try {
      const session = await Session.findOneAndUpdate(query, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
        lean
      })

      if (!session) {
        throw new Error('Session upsert returned null document')
      }

      return {
        session,
        sessionDate: normalizedSessionDate,
        meetCode: normalizedMeetCode,
        attempts: attempt + 1
      }
    } catch (error) {
      if (error?.code === DUPLICATE_KEY_CODE) {
        if (attempt >= maxRetries) {
          const existing = await Session.findOne(query).lean(lean)
          if (existing) {
            return {
              session: existing,
              sessionDate: normalizedSessionDate,
              meetCode: normalizedMeetCode,
              duplicateResolved: true,
              attempts: attempt + 1
            }
          }
        }

        attempt += 1
        await new Promise(resolve => setTimeout(resolve, 10 * attempt))
        continue
      }

      throw error
    }
  }

  const fallback = await Session.findOne(query).lean(lean)
  if (fallback) {
    return {
      session: fallback,
      sessionDate: normalizedSessionDate,
      meetCode: normalizedMeetCode,
      duplicateResolved: true,
      attempts: maxRetries + 1
    }
  }

  throw new Error('Failed to upsert session after retries')
}

module.exports = {
  normalizeSessionDate,
  upsertSessionByMeetCodeAndDate
}
