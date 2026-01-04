const express = require('express')
const router = express.Router()
const { getModel } = require('../services/dataStore')
const { requireAuth } = require('../middleware/auth')
const {
  checkDFGradeEligibility,
  getDFEligibleStudents,
  getEligibilitySummary
} = require('../services/gradeAssignment')

const User = getModel('User')
const Subject = getModel('Subject')

/**
 * GET /api/grades/df-eligible/:subjectId
 * Get list of students eligible for D/F grade in a subject
 * Returns warnings/eligibility information (does NOT assign grades)
 */
router.get('/df-eligible/:subjectId', requireAuth, async (req, res) => {
  try {
    const { subjectId } = req.params

    // Verify subject exists and user has access
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Check if user is instructor of this subject or admin
    if (
      req.auth?.role === 'instructor' &&
      subject.instructorId.toString() !== req.auth.userId
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You are not the instructor of this subject.'
      })
    }

    const eligibleStudents = await getDFEligibleStudents(subjectId)

    res.json({
      success: true,
      data: eligibleStudents,
      message:
        'D/F eligible students retrieved. Grades are NOT automatically assigned - manual assignment required.'
    })
  } catch (error) {
    console.error('Error fetching D/F eligible students:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch D/F eligible students',
      message: error.message
    })
  }
})

/**
 * GET /api/grades/eligibility-summary/:subjectId
 * Get eligibility summary for all students in a subject
 * Returns eligible, at-risk, and safe students with detailed breakdown
 */
router.get('/eligibility-summary/:subjectId', requireAuth, async (req, res) => {
  try {
    const { subjectId } = req.params

    // Verify subject exists and user has access
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Check if user is instructor of this subject or admin
    if (
      req.auth?.role === 'instructor' &&
      subject.instructorId.toString() !== req.auth.userId
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You are not the instructor of this subject.'
      })
    }

    const summary = await getEligibilitySummary(subjectId)

    res.json({
      success: true,
      data: summary,
      message:
        'Eligibility summary retrieved. This is for informational purposes only - no grades are assigned.'
    })
  } catch (error) {
    console.error('Error fetching eligibility summary:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch eligibility summary',
      message: error.message
    })
  }
})

/**
 * GET /api/grades/:userId/:subjectId
 * Get grade eligibility information for a specific student
 */
router.get('/:userId/:subjectId', requireAuth, async (req, res) => {
  try {
    const { userId, subjectId } = req.params

    // Verify subject exists
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Check if user has access
    if (
      req.auth?.role === 'instructor' &&
      subject.instructorId.toString() !== req.auth.userId
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You are not the instructor of this subject.'
      })
    }

    // Check if requesting own data (student) or has access (instructor/admin)
    if (req.auth?.role === 'student' && req.auth.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view your own grade information.'
      })
    }

    const eligibility = await checkDFGradeEligibility(userId, subjectId)
    const user = await User.findById(userId)

    res.json({
      success: true,
      data: {
        userId,
        studentName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        studentId: user?.studentId || null,
        ...eligibility
      }
    })
  } catch (error) {
    console.error('Error fetching grade eligibility:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch grade eligibility',
      message: error.message
    })
  }
})

/**
 * POST /api/grades/assign-df
 * Manually assign D/F grade to a student
 * Note: This endpoint is for manual assignment only - system does NOT auto-assign
 * In a full implementation, this would create/update a Grade record
 */
router.post('/assign-df', requireAuth, async (req, res) => {
  try {
    const { userId, subjectId, reason } = req.body

    if (!userId || !subjectId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId and subjectId are required'
      })
    }

    // Verify subject exists
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Only instructors of the subject or admins can assign grades
    if (
      req.auth?.role !== 'admin' &&
      (req.auth?.role !== 'instructor' ||
        subject.instructorId.toString() !== req.auth.userId)
    ) {
      return res.status(403).json({
        success: false,
        error:
          'Access denied. Only the instructor of this subject or an admin can assign grades.'
      })
    }

    // Check eligibility before assigning
    const eligibility = await checkDFGradeEligibility(userId, subjectId)

    if (!eligibility.isEligible) {
      return res.status(400).json({
        success: false,
        error: 'Student is not eligible for D/F grade',
        eligibility
      })
    }

    // TODO: In a full implementation, create/update Grade record here
    // For now, we'll just return success with the eligibility info
    const user = await User.findById(userId)

    res.json({
      success: true,
      message: 'D/F grade assignment recorded (manual assignment)',
      data: {
        userId,
        subjectId,
        studentName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        studentId: user?.studentId || null,
        assignedBy: req.auth.userId,
        assignedAt: new Date(),
        reason: reason || eligibility.reasons.join('; '),
        eligibility
      },
      note: 'In a full implementation, this would create/update a Grade record in the database'
    })
  } catch (error) {
    console.error('Error assigning D/F grade:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to assign D/F grade',
      message: error.message
    })
  }
})

module.exports = router
