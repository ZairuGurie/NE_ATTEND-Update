const mongoose = require('mongoose')
const { getModel } = require('./dataStore')

const Attendance = getModel('Attendance')

function buildObjectId (value, fieldName = 'id') {
  if (!value) return null
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value)
  }
  throw new Error(`Invalid ${fieldName}`)
}

function buildDateFilter ({ from, to }) {
  if (!from && !to) return null
  const range = {}
  if (from) {
    const fromDate = new Date(from)
    if (Number.isNaN(fromDate.getTime())) {
      throw new Error('Invalid "from" date')
    }
    range.$gte = fromDate
  }
  if (to) {
    const toDate = new Date(to)
    if (Number.isNaN(toDate.getTime())) {
      throw new Error('Invalid "to" date')
    }
    range.$lte = toDate
  }
  return range
}

function buildMatchStage ({ instructorId, status }) {
  const match = {
    instructorId: buildObjectId(instructorId, 'instructorId')
  }

  if (status && typeof status === 'string') {
    match.status = status.toLowerCase()
  }

  return match
}

function buildFacetPipeline ({ includeDetails, limit, skip }) {
  const facets = {
    summary: [
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          excusedCount: {
            $sum: { $cond: ['$isExcused', 1, 0] }
          },
          tardyCount: {
            $sum: {
              $cond: [{ $or: ['$isTardy', { $eq: ['$status', 'late'] }] }, 1, 0]
            }
          },
          sessions: { $addToSet: '$sessionId' }
        }
      },
      {
        $project: {
          _id: 0,
          totalRecords: 1,
          presentCount: 1,
          lateCount: 1,
          absentCount: 1,
          pendingCount: 1,
          excusedCount: 1,
          tardyCount: 1,
          totalSessions: { $size: '$sessions' }
        }
      }
    ],
    bySubject: [
      {
        $group: {
          _id: '$subjectId',
          subjectName: { $first: '$subject.subjectName' },
          subjectCode: { $first: '$subject.subjectCode' },
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
          }
        }
      },
      { $sort: { subjectName: 1 } }
    ],
    bySection: [
      {
        $group: {
          _id: { $ifNull: ['$student.section', 'Unspecified'] },
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]
  }

  if (includeDetails) {
    facets.details = [
      { $sort: { 'session.startTime': -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          attendanceId: '$_id',
          status: 1,
          isExcused: 1,
          isTardy: 1,
          userId: 1,
          studentName: 1,
          sessionId: 1,
          subjectId: '$subjectId',
          subjectName: '$subject.subjectName',
          subjectCode: '$subject.subjectCode',
          sessionDate: '$session.sessionDate',
          startTime: '$session.startTime',
          endTime: '$session.endTime',
          sections: '$subject.sections',
          studentSection: '$student.section'
        }
      }
    ]
  }

  return facets
}

function computeEffectiveAbsence (summaryDoc) {
  if (!summaryDoc) {
    return {
      totalRecords: 0,
      totalSessions: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      pendingCount: 0,
      excusedCount: 0,
      tardyCount: 0,
      attendanceRate: 0,
      effectiveAbsences: 0,
      tardinessConvertedToAbsences: 0
    }
  }

  const attended = summaryDoc.presentCount + summaryDoc.lateCount
  const attendanceRate = summaryDoc.totalRecords
    ? Math.round((attended / summaryDoc.totalRecords) * 100)
    : 0
  const tardinessConvertedToAbsences = Math.floor(summaryDoc.tardyCount / 3)
  const effectiveAbsences =
    summaryDoc.absentCount + tardinessConvertedToAbsences

  return {
    ...summaryDoc,
    attendanceRate,
    effectiveAbsences,
    tardinessConvertedToAbsences
  }
}

async function getInstructorAttendanceSummary ({
  instructorId,
  from,
  to,
  subjectId,
  section,
  status,
  includeDetails = false,
  limit = 50,
  page = 1
}) {
  if (!instructorId) {
    throw new Error('instructorId is required')
  }

  const skip = Math.max(0, (Number(page) - 1) * Number(limit))
  const cappedLimit = Math.min(Number(limit) || 50, 200)

  const matchStage = buildMatchStage({ instructorId, status })

  const pipeline = [{ $match: matchStage }]

  pipeline.push(
    {
      $lookup: {
        from: 'sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    {
      $lookup: {
        from: 'subjects',
        localField: 'session.subjectId',
        foreignField: '_id',
        as: 'subject'
      }
    },
    { $unwind: { path: '$subject', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } }
  )

  const dateRange = buildDateFilter({ from, to })
  if (dateRange) {
    pipeline.push({ $match: { 'session.startTime': dateRange } })
  }

  if (subjectId) {
    pipeline.push({
      $match: {
        'session.subjectId': buildObjectId(subjectId, 'subjectId')
      }
    })
  }

  if (section) {
    pipeline.push({ $match: { 'student.section': section } })
  }

  pipeline.push(
    {
      $addFields: {
        subjectId: '$subject._id'
      }
    },
    {
      $facet: buildFacetPipeline({
        includeDetails,
        limit: cappedLimit,
        skip
      })
    }
  )

  const [result] = await Attendance.aggregate(pipeline)

  const summaryDoc = (result.summary || [])[0]
  const summary = computeEffectiveAbsence(summaryDoc)

  return {
    summary,
    breakdown: {
      bySubject: result.bySubject || [],
      bySection: result.bySection || []
    },
    details: includeDetails ? result.details || [] : []
  }
}

module.exports = {
  getInstructorAttendanceSummary
}
