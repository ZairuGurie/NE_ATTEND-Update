const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()

const { requireAuth } = require('../middleware/auth')
const {
  createAppeal,
  listAppealsForStudent,
  listAppealsForInstructor,
  getAppealById,
  updateAppealStatus,
  addAppealEvent,
  assertAppealAccess
} = require('../services/appealService')

const ALLOWED_STATUSES = ['pending', 'under_review', 'approved', 'denied']

function isValidObjectId (value) {
  return mongoose.Types.ObjectId.isValid(value)
}

router.post('/', requireAuth, async (req, res) => {
  try {
    if (req.auth.role !== 'student' && req.auth.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' })
    }

    const { attendanceId, reason, notes, attachments } = req.body || {}

    if (!attendanceId || !isValidObjectId(attendanceId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Attendance identifier required' })
    }

    const appeal = await createAppeal({
      attendanceId,
      studentId: req.auth.userId,
      reason,
      studentNotes: notes,
      attachments
    })

    return res.status(201).json({ success: true, data: appeal })
  } catch (error) {
    const status = error.status || 500
    console.error('Error creating appeal:', error)
    return res.status(status).json({ success: false, error: error.message })
  }
})

router.get('/', requireAuth, async (req, res) => {
  try {
    const { status } = req.query
    let data = []

    if (req.auth.role === 'student') {
      data = await listAppealsForStudent(req.auth.userId, { status })
    } else if (req.auth.role === 'instructor') {
      data = await listAppealsForInstructor(req.auth.userId, { status })
    } else if (req.auth.role === 'admin') {
      // Admins can view both student and instructor scopes
      const [studentAppeals, instructorAppeals] = await Promise.all([
        listAppealsForStudent(req.query.studentId, { status }),
        listAppealsForInstructor(req.query.instructorId, { status })
      ])
      const merged = new Map()
      for (const record of [...studentAppeals, ...instructorAppeals]) {
        merged.set(String(record._id), record)
      }
      data = Array.from(merged.values())
    } else {
      return res.status(403).json({ success: false, error: 'Forbidden' })
    }

    return res.json({ success: true, data })
  } catch (error) {
    const status = error.status || 500
    console.error('Error listing appeals:', error)
    return res.status(status).json({ success: false, error: error.message })
  }
})

router.get('/:appealId', requireAuth, async (req, res) => {
  try {
    const { appealId } = req.params
    if (!isValidObjectId(appealId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid appeal id' })
    }

    const appeal = await getAppealById(appealId)
    assertAppealAccess(appeal, req.auth)

    return res.json({ success: true, data: appeal })
  } catch (error) {
    const status = error.status || 500
    console.error('Error fetching appeal:', error)
    return res.status(status).json({ success: false, error: error.message })
  }
})

router.patch('/:appealId/status', requireAuth, async (req, res) => {
  try {
    if (req.auth.role !== 'instructor' && req.auth.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' })
    }

    const { appealId } = req.params
    const { status, notes } = req.body || {}

    if (!isValidObjectId(appealId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid appeal id' })
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' })
    }

    const appeal = await getAppealById(appealId)
    assertAppealAccess(appeal, req.auth)

    const updated = await updateAppealStatus({
      appealId,
      status,
      decidedBy: req.auth.userId,
      decisionNotes: notes
    })

    return res.json({ success: true, data: updated })
  } catch (error) {
    const status = error.status || 500
    console.error('Error updating appeal status:', error)
    return res.status(status).json({ success: false, error: error.message })
  }
})

router.post('/:appealId/events', requireAuth, async (req, res) => {
  try {
    const { appealId } = req.params
    const { message, type } = req.body || {}

    if (!isValidObjectId(appealId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid appeal id' })
    }

    if (!message || !message.trim()) {
      return res
        .status(400)
        .json({ success: false, error: 'Event message is required' })
    }

    const appeal = await getAppealById(appealId)
    assertAppealAccess(appeal, req.auth)

    const updated = await addAppealEvent({
      appealId,
      createdBy: req.auth.userId,
      message,
      type:
        type && ['comment', 'status-change', 'updated'].includes(type)
          ? type
          : 'comment'
    })

    return res.json({ success: true, data: updated })
  } catch (error) {
    const status = error.status || 500
    console.error('Error creating appeal event:', error)
    return res.status(status).json({ success: false, error: error.message })
  }
})

module.exports = router
