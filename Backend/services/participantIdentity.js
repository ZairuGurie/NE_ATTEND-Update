const { getModel } = require('../services/dataStore')

// Participant identity cache shared across realtime and attendance routes
const PARTICIPANT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const participantIdentityCache = new Map()

function escapeRegex (value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function resolveParticipantIdentity (name) {
  const key = (name || '').trim().toLowerCase()
  if (!key) {
    return { displayName: 'Unknown' }
  }

  const cached = participantIdentityCache.get(key)
  if (cached && Date.now() - cached.cachedAt < PARTICIPANT_CACHE_TTL) {
    return cached
  }

  const nameParts = key.split(/\s+/).filter(Boolean)
  const [first = '', ...rest] = nameParts
  const last = rest.join(' ')

  const User = getModel('User')

  const query = {}
  if (first) {
    query.firstName = { $regex: new RegExp(`^${escapeRegex(first)}`, 'i') }
  }
  if (last) {
    query.lastName = { $regex: new RegExp(`^${escapeRegex(last)}`, 'i') }
  }

  let user = null
  if (Object.keys(query).length) {
    user = await User.findOne(query)
      .select('_id firstName lastName studentId')
      .lean()
      .catch(() => null)
  }

  if (!user && first) {
    user = await User.findOne({
      $or: [
        { firstName: { $regex: new RegExp(`^${escapeRegex(first)}`, 'i') } },
        { lastName: { $regex: new RegExp(`^${escapeRegex(first)}`, 'i') } },
        { studentId: { $regex: new RegExp(`^${escapeRegex(first)}`, 'i') } }
      ]
    })
      .select('_id firstName lastName studentId')
      .lean()
      .catch(() => null)
  }

  const identity = user
    ? {
        userId: String(user._id),
        studentId: user.studentId || null,
        displayName:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || name
      }
    : { displayName: name }

  participantIdentityCache.set(key, { ...identity, cachedAt: Date.now() })
  return identity
}

module.exports = {
  PARTICIPANT_CACHE_TTL,
  participantIdentityCache,
  resolveParticipantIdentity
}
