const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()

const { requireAuth } = require('../middleware/auth')
const { getModel } = require('../services/dataStore')
const {
  listSubjectRisk,
  getStudentRiskForSubject
} = require('../services/attendanceRiskService')

const Subject = getModel('Subject')

const ALLOWED_RISK_ROLES = new Set(['instructor', 'admin'])

function isValidObjectId (value) {
  return mongoose.Types.ObjectId.isValid(value)
}

async function ensureSubjectAccess (subjectId, requester) {
  if (!subjectId) {
    const error = new Error('Subject identifier required')
    error.status = 400
    throw error
  }

  const subject = await Subject.findById(subjectId)
    .select('instructorId subjectName')
    .lean()

  if (!subject) {
    const error = new Error('Subject not found')
    error.status = 404
    throw error
  }

  if (requester.role === 'admin') {
    return subject
  }

  if (requester.role !== 'instructor') {
    const error = new Error('Forbidden')
    error.status = 403
    throw error
  }

  if (
    subject.instructorId &&
    subject.instructorId.toString() !== requester.userId.toString()
  ) {
    const error = new Error('Subject not assigned to instructor')
    error.status = 403
    throw error
  }

  return subject
}

router.get('/subject/:subjectId', requireAuth, async (req, res) => {
  try {
    const { subjectId } = req.params
    if (!isValidObjectId(subjectId)) {
      return res.status(400).json({
        success: false,
        error: 'InvalidSubjectId'
      })
    }

    if (!ALLOWED_RISK_ROLES.has(req.auth.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' })
    }

    await ensureSubjectAccess(subjectId, req.auth)

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 200, 500)
    const riskData = await listSubjectRisk(subjectId, { limit })

    return res.json({
      success: true,
      data: riskData
    })
  } catch (error) {
    const status = error.status || 500
    console.error('Error fetching subject risk summary:', error)
    return res.status(status).json({
      success: false,
      error: error.message || 'Failed to fetch subject risk summary'
    })
  }
})

router.get(
  '/student/:studentId/subject/:subjectId',
  requireAuth,
  async (req, res) => {
    try {
      const { studentId, subjectId } = req.params
      if (!isValidObjectId(studentId) || !isValidObjectId(subjectId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid identifiers'
        })
      }

      if (req.auth.role === 'student') {
        if (req.auth.userId !== studentId) {
          return res.status(403).json({ success: false, error: 'Forbidden' })
        }
      } else if (req.auth.role === 'instructor') {
        await ensureSubjectAccess(subjectId, req.auth)
      } else if (req.auth.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden' })
      }

      const riskData = await getStudentRiskForSubject(studentId, subjectId)
      return res.json({ success: true, data: riskData })
    } catch (error) {
      const status = error.status || 500
      console.error('Error fetching student risk:', error)
      return res.status(status).json({
        success: false,
        error: error.message || 'Failed to fetch student risk'
      })
    }
  }
)

module.exports = router
