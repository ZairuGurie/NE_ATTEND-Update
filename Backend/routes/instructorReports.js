const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()

const { requireAuth } = require('../middleware/auth')
const { getInstructorAttendanceSummary } = require('../services/reportService')
const { getModel } = require('../services/dataStore')

const Subject = getModel('Subject')
const Attendance = getModel('Attendance')

const STATUS_FILTERS = ['present', 'late', 'absent', 'pending']
const ALLOWED_ROLES = ['instructor', 'admin']

function parseBoolean (value, fallback = false) {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  return value === 'true' || value === '1'
}

function normalizeLimit (value, defaultValue = 50) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return defaultValue
  return Math.min(Math.max(parsed, 1), 200)
}

function assertValidDate (value, label) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} date`)
  }
  return value
}

function assertObjectId (value, label) {
  if (!value) return null
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

router.get('/attendance-summary', requireAuth, async (req, res) => {
  try {
    if (!ALLOWED_ROLES.includes(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only instructors or admins can access reports'
      })
    }

    const isAdmin = req.auth.role === 'admin'
    const targetInstructorId =
      isAdmin && req.query.instructorId
        ? assertObjectId(req.query.instructorId, 'instructorId')
        : req.auth.userId

    assertObjectId(targetInstructorId, 'instructorId')

    const from = assertValidDate(req.query.from, 'from')
    const to = assertValidDate(req.query.to, 'to')
    const includeDetails = parseBoolean(req.query.includeDetails, true)
    const limit = includeDetails ? normalizeLimit(req.query.limit, 50) : 0
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1)
    const section = req.query.section?.trim()
    const status = req.query.status?.toLowerCase()

    if (status && !STATUS_FILTERS.includes(status)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid status filter supplied' })
    }

    let subjectId = null

    if (req.query.subjectId) {
      subjectId = assertObjectId(req.query.subjectId, 'subjectId')
      const subject = await Subject.findById(subjectId)
        .select('instructorId sections isActive')
        .lean()

      if (!subject) {
        return res
          .status(404)
          .json({ success: false, error: 'Subject not found for filter' })
      }

      if (!subject.isActive) {
        return res
          .status(400)
          .json({ success: false, error: 'Subject is inactive' })
      }

      if (
        !isAdmin &&
        String(subject.instructorId) !== String(targetInstructorId)
      ) {
        return res.status(403).json({
          success: false,
          error: 'Subject does not belong to instructor'
        })
      }

      if (
        section &&
        Array.isArray(subject.sections) &&
        subject.sections.length &&
        !subject.sections.includes(section)
      ) {
        return res.status(400).json({
          success: false,
          error: 'Section does not belong to the selected subject'
        })
      }
    }

    const report = await getInstructorAttendanceSummary({
      instructorId: targetInstructorId,
      from,
      to,
      subjectId,
      section,
      status,
      includeDetails,
      limit,
      page
    })

    return res.json({ success: true, data: report })
  } catch (error) {
    if (error.message && error.message.startsWith('Invalid')) {
      return res.status(400).json({ success: false, error: error.message })
    }
    console.error('[InstructorReports] Failed to build summary:', error)
    return res
      .status(500)
      .json({ success: false, error: 'Failed to build report' })
  }
})

/**
 * GET /api/instructor/reports/export
 * Export attendance data as CSV
 * Query params: from, to, subjectId, section, status, format (csv)
 */
router.get('/export', requireAuth, async (req, res) => {
  try {
    if (!ALLOWED_ROLES.includes(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only instructors or admins can export reports'
      })
    }

    const isAdmin = req.auth.role === 'admin'
    const targetInstructorId =
      isAdmin && req.query.instructorId
        ? assertObjectId(req.query.instructorId, 'instructorId')
        : req.auth.userId

    const from = assertValidDate(req.query.from, 'from')
    const to = assertValidDate(req.query.to, 'to')
    const status = req.query.status?.toLowerCase()
    const section = req.query.section?.trim()
    let subjectId = req.query.subjectId
      ? assertObjectId(req.query.subjectId, 'subjectId')
      : null

    // Get report data with details
    const report = await getInstructorAttendanceSummary({
      instructorId: targetInstructorId,
      from,
      to,
      subjectId,
      section,
      status,
      includeDetails: true,
      limit: 10000, // Large limit for export
      page: 1
    })

    // Generate CSV content
    const csvRows = []
    
    // Header row
    csvRows.push([
      'Date',
      'Subject Code',
      'Subject Name',
      'Student Name',
      'Section',
      'Status',
      'Tardy',
      'Excused',
      'Session Start',
      'Session End'
    ].join(','))

    // Data rows
    for (const detail of report.details) {
      const row = [
        detail.sessionDate ? new Date(detail.sessionDate).toLocaleDateString() : '',
        `"${(detail.subjectCode || '').replace(/"/g, '""')}"`,
        `"${(detail.subjectName || '').replace(/"/g, '""')}"`,
        `"${(detail.studentName || '').replace(/"/g, '""')}"`,
        `"${(detail.studentSection || '').replace(/"/g, '""')}"`,
        detail.status || '',
        detail.isTardy ? 'Yes' : 'No',
        detail.isExcused ? 'Yes' : 'No',
        detail.startTime ? new Date(detail.startTime).toLocaleTimeString() : '',
        detail.endTime ? new Date(detail.endTime).toLocaleTimeString() : ''
      ]
      csvRows.push(row.join(','))
    }

    const csvContent = csvRows.join('\n')

    // Set response headers for CSV download
    const filename = `attendance-report-${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvContent)

  } catch (error) {
    if (error.message && error.message.startsWith('Invalid')) {
      return res.status(400).json({ success: false, error: error.message })
    }
    console.error('[InstructorReports] Failed to export report:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to export report',
      message: error.message
    })
  }
})

/**
 * GET /api/instructor/reports/summary-export
 * Export summary statistics as CSV
 */
router.get('/summary-export', requireAuth, async (req, res) => {
  try {
    if (!ALLOWED_ROLES.includes(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only instructors or admins can export reports'
      })
    }

    const isAdmin = req.auth.role === 'admin'
    const targetInstructorId =
      isAdmin && req.query.instructorId
        ? assertObjectId(req.query.instructorId, 'instructorId')
        : req.auth.userId

    const from = assertValidDate(req.query.from, 'from')
    const to = assertValidDate(req.query.to, 'to')

    // Get report data
    const report = await getInstructorAttendanceSummary({
      instructorId: targetInstructorId,
      from,
      to,
      includeDetails: false
    })

    // Generate CSV for summary by subject
    const csvRows = []
    
    // Header row
    csvRows.push([
      'Subject Code',
      'Subject Name',
      'Total Records',
      'Present',
      'Late',
      'Absent',
      'Attendance Rate (%)'
    ].join(','))

    // Data rows for each subject
    for (const subjectData of report.breakdown.bySubject) {
      const total = subjectData.totalRecords || 0
      const attended = (subjectData.presentCount || 0) + (subjectData.lateCount || 0)
      const rate = total > 0 ? Math.round((attended / total) * 100) : 0

      const row = [
        `"${(subjectData.subjectCode || '').replace(/"/g, '""')}"`,
        `"${(subjectData.subjectName || '').replace(/"/g, '""')}"`,
        total,
        subjectData.presentCount || 0,
        subjectData.lateCount || 0,
        subjectData.absentCount || 0,
        rate
      ]
      csvRows.push(row.join(','))
    }

    // Add totals row
    csvRows.push('')
    csvRows.push([
      'TOTALS',
      '',
      report.summary.totalRecords || 0,
      report.summary.presentCount || 0,
      report.summary.lateCount || 0,
      report.summary.absentCount || 0,
      report.summary.attendanceRate || 0
    ].join(','))

    const csvContent = csvRows.join('\n')

    // Set response headers for CSV download
    const filename = `attendance-summary-${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvContent)

  } catch (error) {
    if (error.message && error.message.startsWith('Invalid')) {
      return res.status(400).json({ success: false, error: error.message })
    }
    console.error('[InstructorReports] Failed to export summary:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to export summary',
      message: error.message
    })
  }
})

module.exports = router
