const mongoose = require('mongoose')
const { getModel } = require('./dataStore')
const { summarizeRisk } = require('../utils/attendanceRisk')

const Attendance = getModel('Attendance')
const Session = getModel('Session')

const VERIFIED_MATCH = {
  $or: [
    { isVerifiedParticipant: { $exists: false } },
    { isVerifiedParticipant: true }
  ]
}

const BASE_MATCH = {
  status: { $ne: 'pending' },
  isDuringAddDrop: { $ne: true }
}

function wrapMatchClauses (clauses = []) {
  const filtered = clauses.filter(Boolean)
  if (filtered.length === 0) {
    return {}
  }
  if (filtered.length === 1) {
    return filtered[0]
  }
  return { $and: filtered }
}

async function buildSubjectClause (subjectId) {
  if (!subjectId) return null
  const subjectObjectId = new mongoose.Types.ObjectId(subjectId)

  const fallbackSessions = await Session.find({ subjectId: subjectObjectId })
    .select('_id')
    .lean()
  const sessionIds = fallbackSessions.map(s => s._id)

  if (sessionIds.length === 0) {
    return { subjectId: subjectObjectId }
  }

  return {
    $or: [
      { subjectId: subjectObjectId },
      {
        $and: [
          { $or: [{ subjectId: null }, { subjectId: { $exists: false } }] },
          { sessionId: { $in: sessionIds } }
        ]
      }
    ]
  }
}

function buildGroupingStage () {
  return {
    _id: '$userId',
    totalSessions: { $sum: 1 },
    presentCount: {
      $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
    },
    lateCount: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
    absentCount: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
    tardinessCount: {
      $sum: { $cond: [{ $eq: ['$isTardy', true] }, 1, 0] }
    },
    excusedCount: { $sum: { $cond: [{ $eq: ['$isExcused', true] }, 1, 0] } },
    lastAttendanceAt: { $max: '$updatedAt' }
  }
}

function buildProjectionStage () {
  return {
    userId: '$_id',
    stats: {
      totalSessions: '$totalSessions',
      presentCount: '$presentCount',
      lateCount: '$lateCount',
      absentCount: '$absentCount',
      tardinessCount: '$tardinessCount',
      excusedCount: '$excusedCount'
    },
    lastAttendanceAt: '$lastAttendanceAt',
    user: {
      _id: '$user._id',
      firstName: '$user.firstName',
      lastName: '$user.lastName',
      studentId: '$user.studentId',
      email: '$user.email',
      section: '$user.section'
    }
  }
}

function formatRiskDocument (doc = {}, riskOverrides = {}) {
  const stats = {
    totalSessions: doc.stats?.totalSessions || 0,
    presentCount: doc.stats?.presentCount || 0,
    lateCount: doc.stats?.lateCount || 0,
    absentCount: doc.stats?.absentCount || 0,
    tardinessCount: doc.stats?.tardinessCount || 0,
    excusedCount: doc.stats?.excusedCount || 0
  }

  return {
    userId: doc.userId?.toString(),
    user: doc.user || null,
    stats,
    lastAttendanceAt: doc.lastAttendanceAt || null,
    risk: summarizeRisk(stats, riskOverrides)
  }
}

async function aggregateRiskDocuments ({ match, limit, offset, sort }) {
  const pipeline = [
    { $match: match },
    { $group: buildGroupingStage() },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: {
        path: '$user',
        preserveNullAndEmptyArrays: true
      }
    },
    { $project: buildProjectionStage() }
  ]

  if (sort) {
    pipeline.push({ $sort: sort })
  }
  if (typeof offset === 'number' && offset > 0) {
    pipeline.push({ $skip: offset })
  }
  if (typeof limit === 'number' && limit > 0) {
    pipeline.push({ $limit: limit })
  }

  return Attendance.aggregate(pipeline)
}

async function listSubjectRisk (subjectId, options = {}) {
  if (!subjectId) {
    throw new Error('subjectId is required')
  }

  const subjectClause = await buildSubjectClause(subjectId)
  const match = wrapMatchClauses([BASE_MATCH, VERIFIED_MATCH, subjectClause])

  const sort = options.sort || {
    'stats.absentCount': -1,
    'stats.tardinessCount': -1
  }
  const docs = await aggregateRiskDocuments({
    match,
    limit: options.limit || 200,
    offset: options.offset || 0,
    sort
  })

  return docs.map(doc => formatRiskDocument(doc, options.riskOverrides))
}

async function getStudentRiskForSubject (studentId, subjectId, options = {}) {
  if (!studentId) {
    throw new Error('studentId is required')
  }
  if (!subjectId) {
    throw new Error('subjectId is required')
  }

  const subjectClause = await buildSubjectClause(subjectId)
  const clauses = [
    BASE_MATCH,
    VERIFIED_MATCH,
    subjectClause,
    { userId: new mongoose.Types.ObjectId(studentId) }
  ]
  const match = wrapMatchClauses(clauses)

  const docs = await aggregateRiskDocuments({ match, limit: 1 })
  if (!docs.length) {
    return formatRiskDocument(
      { userId: studentId, stats: {} },
      options.riskOverrides
    )
  }
  return formatRiskDocument(docs[0], options.riskOverrides)
}

module.exports = {
  listSubjectRisk,
  getStudentRiskForSubject
}
