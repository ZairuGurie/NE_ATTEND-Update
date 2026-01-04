const express = require('express')
const { getModel } = require('../services/dataStore')
const { normalizeWeeklySchedule } = require('../utils/scheduleUtils')
const {
  assignStudentsToSubjectBySection
} = require('../services/assignmentService')
const {
  calculateInstructorScheduleMetrics,
  getStudentPolicyStatus
} = require('../services/instructorScheduleService')
const Subject = getModel('Subject')
const User = getModel('User')
const {
  getOrCreateTokenForSession,
  findUpcomingSessionForSubject
} = require('../services/attendanceTokenService')

const router = express.Router()

// Create a new subject
router.post('/', async (req, res) => {
  try {
    const {
      subjectName,
      subjectCode,
      instructorId,
      sections,
      day,
      time,
      room,
      meetingLink,
      department,
      schoolYear,
      semester,
      description,
      credits,
      schedule
    } = req.body

    // Validate required fields
    if (!subjectName || !subjectCode || !instructorId || !department) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message:
          'subjectName, subjectCode, instructorId, and department are required'
      })
    }

    // Check if subject code already exists
    const existing = await Subject.findOne({ subjectCode: subjectCode.trim() })
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Subject code already exists',
        message: `Subject with code ${subjectCode} already exists`
      })
    }

    // Validate instructor exists
    const instructor = await User.findById(instructorId)
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(400).json({
        success: false,
        error: 'Invalid instructor',
        message: 'Instructor not found or user is not an instructor'
      })
    }

    let scheduleMeta = { value: null }
    if (schedule && Object.keys(schedule).length > 0) {
      scheduleMeta = normalizeWeeklySchedule(schedule)
      if (scheduleMeta.error) {
        return res.status(400).json({
          success: false,
          error: scheduleMeta.error
        })
      }
    }

    const resolvedDay = (scheduleMeta.dayLabel || day || '').trim()
    const resolvedTime = (scheduleMeta.timeLabel || time || '').trim()

    // Create subject
    const subject = new Subject({
      subjectName: subjectName.trim(),
      subjectCode: subjectCode.trim(),
      instructorId,
      sections: Array.isArray(sections) ? sections.map(s => s.trim()) : [],
      day: resolvedDay || undefined,
      time: resolvedTime || undefined,
      schedule: scheduleMeta.value || undefined,
      room: room?.trim(),
      meetingLink: meetingLink?.trim(),
      department: department.trim(),
      schoolYear: schoolYear?.trim(),
      semester: semester?.trim(),
      description: description?.trim(),
      credits,
      isActive: true
    })

    await subject.save()

    // Auto-assign matching students to subject's groups
    let assignmentSummary = null
    try {
      console.log(`🔄 Starting auto-assignment for new subject ${subject._id}`)
      assignmentSummary = await assignStudentsToSubjectBySection(subject._id)
      console.log(`✅ Auto-assignment summary:`, assignmentSummary)
    } catch (assignmentError) {
      // Log error but don't fail subject creation
      console.error(
        `❌ Auto-assignment failed for subject ${subject._id}:`,
        assignmentError.message
      )
    }

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: subject,
      assignmentSummary: assignmentSummary || undefined
    })
  } catch (error) {
    console.error('Error creating subject:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create subject',
      message: error.message
    })
  }
})

// Get all subjects for a specific instructor
router.get('/instructor/:id', async (req, res) => {
  try {
    const { id } = req.params

    const subjects = await Subject.find({ instructorId: id, isActive: true })
      .populate('instructorId', 'firstName lastName email')
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: subjects,
      count: subjects.length
    })
  } catch (error) {
    console.error('Error fetching instructor subjects:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subjects',
      message: error.message
    })
  }
})

// Get subjects by section (for students)
router.get('/student/section/:section', async (req, res) => {
  try {
    const { section } = req.params

    // Find subjects that include this section
    const subjects = await Subject.find({
      sections: section,
      isActive: true
    })
      .populate('instructorId', 'firstName lastName email phone')
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: subjects,
      count: subjects.length
    })
  } catch (error) {
    console.error('Error fetching student subjects:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subjects',
      message: error.message
    })
  }
})

// Get all sections from instructor's subjects
router.get('/instructor/:id/sections', async (req, res) => {
  try {
    const { id } = req.params

    const subjects = await Subject.find({ instructorId: id, isActive: true })

    // Extract unique sections
    const sectionsSet = new Set()
    subjects.forEach(subject => {
      if (subject.sections && Array.isArray(subject.sections)) {
        subject.sections.forEach(section => sectionsSet.add(section))
      }
    })

    const sections = Array.from(sectionsSet).sort()

    res.json({
      success: true,
      data: sections,
      count: sections.length
    })
  } catch (error) {
    console.error('Error fetching sections:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sections',
      message: error.message
    })
  }
})

// Get a specific subject by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const subject = await Subject.findById(id).populate(
      'instructorId',
      'firstName lastName email phone'
    )

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    res.json({
      success: true,
      data: subject
    })
  } catch (error) {
    console.error('Error fetching subject:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subject',
      message: error.message
    })
  }
})

// Update a subject
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      subjectName,
      subjectCode,
      sections,
      day,
      time,
      room,
      meetingLink,
      department,
      schoolYear,
      semester,
      description,
      credits,
      schedule,
      isActive
    } = req.body

    const subject = await Subject.findById(id)

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Check if subject code is being changed and if new code already exists
    if (subjectCode && subjectCode !== subject.subjectCode) {
      const existing = await Subject.findOne({
        subjectCode: subjectCode.trim(),
        _id: { $ne: id }
      })
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Subject code already exists',
          message: `Subject with code ${subjectCode} already exists`
        })
      }
      subject.subjectCode = subjectCode.trim()
    }

    // Update fields
    if (subjectName !== undefined) subject.subjectName = subjectName.trim()
    if (sections !== undefined)
      subject.sections = Array.isArray(sections)
        ? sections.map(s => s.trim())
        : []

    if (schedule !== undefined) {
      if (schedule && Object.keys(schedule).length > 0) {
        const scheduleMeta = normalizeWeeklySchedule(schedule)
        if (scheduleMeta.error) {
          return res.status(400).json({
            success: false,
            error: scheduleMeta.error
          })
        }
        subject.schedule = scheduleMeta.value
        if (!day) {
          subject.day = scheduleMeta.dayLabel
        }
        if (!time) {
          subject.time = scheduleMeta.timeLabel
        }
      } else {
        subject.schedule = undefined
      }
    }

    if (day !== undefined) subject.day = day?.trim()
    if (time !== undefined) subject.time = time?.trim()
    if (room !== undefined) subject.room = room?.trim()
    if (meetingLink !== undefined) subject.meetingLink = meetingLink?.trim()
    if (department !== undefined) subject.department = department.trim()
    if (schoolYear !== undefined) subject.schoolYear = schoolYear?.trim()
    if (semester !== undefined) subject.semester = semester?.trim()
    if (description !== undefined) subject.description = description?.trim()
    if (credits !== undefined) subject.credits = credits
    if (isActive !== undefined) subject.isActive = isActive

    await subject.save()

    res.json({
      success: true,
      message: 'Subject updated successfully',
      data: subject
    })
  } catch (error) {
    console.error('Error updating subject:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update subject',
      message: error.message
    })
  }
})

// Delete a subject (hard delete - permanently removes from database)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const subject = await Subject.findById(id)

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Hard delete - permanently remove from database
    await Subject.findByIdAndDelete(id)

    res.json({
      success: true,
      message: 'Subject deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting subject:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete subject',
      message: error.message
    })
  }
})

// POST /api/subjects/:id/auto-assign - Manually trigger auto-assignment for a subject
router.post('/:id/auto-assign', async (req, res) => {
  try {
    const { id } = req.params

    const subject = await Subject.findById(id)
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    console.log(`🔄 Manually triggering auto-assignment for subject ${id}`)
    const assignmentSummary = await assignStudentsToSubjectBySection(id)

    res.json({
      success: true,
      message: `Auto-assignment completed. ${assignmentSummary.groupsAssigned} student-group assignment(s) made.`,
      data: {
        subject,
        assignmentSummary
      }
    })
  } catch (error) {
    console.error('Error in auto-assign endpoint:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to auto-assign students',
      message: error.message
    })
  }
})

// GET /api/subjects/:id/assignment-status - Get assignment status and counts
router.get('/:id/assignment-status', async (req, res) => {
  try {
    const { id } = req.params

    const subject = await Subject.findById(id)
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Count matching students (students whose section matches subject sections)
    const matchingStudents = await User.countDocuments({
      role: 'student',
      active: { $ne: false },
      section: { $in: subject.sections }
    })

    // For subjects, enrolled students are those matching by section
    // (subjects don't have explicit members like groups did)
    const enrolledStudentsCount = matchingStudents

    res.json({
      success: true,
      data: {
        subjectId: id,
        subjectName: subject.subjectName,
        sections: subject.sections,
        matchingStudentsCount: matchingStudents,
        enrolledStudentsCount: enrolledStudentsCount,
        assignmentCoverage: 100 // All matching students are considered enrolled
      }
    })
  } catch (error) {
    console.error('Error fetching assignment status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assignment status',
      message: error.message
    })
  }
})

// Get students enrolled in a subject (by section matching)
router.get('/:id/students', async (req, res) => {
  try {
    const { id } = req.params

    // Get the subject with its sections
    const subject = await Subject.findById(id)

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Find all students whose section matches any of the subject's sections
    const students = await User.find({
      role: 'student',
      section: { $in: subject.sections }
    }).select(
      'firstName lastName email phone section yearLevel schoolYear semester department course active studentId'
    )

    // Group students by section
    const studentsBySection = {}
    students.forEach(student => {
      const section = student.section
      if (!studentsBySection[section]) {
        studentsBySection[section] = []
      }
      studentsBySection[section].push(student)
    })

    res.json({
      success: true,
      data: {
        subject: {
          _id: subject._id,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          sections: subject.sections
        },
        students: students,
        studentsBySection: studentsBySection,
        totalStudents: students.length
      }
    })
  } catch (error) {
    console.error('Error fetching subject students:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students',
      message: error.message
    })
  }
})

// POST /api/subjects/:id/generate-token - Generate attendance verification token
router.post('/:id/generate-token', async (req, res) => {
  try {
    const { id: subjectId } = req.params
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'userId is required'
      })
    }

    // Validate ObjectId format
    if (!subjectId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: 'Invalid subject ID format'
      })
    }

    // Find subject and verify user has access
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return res.status(404).json({
        error: 'Subject not found'
      })
    }

    // Get user to check their section
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      })
    }

    // Only students enrolled in subject sections may generate tokens
    if (user.role !== 'student') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only enrolled students may generate attendance tokens.'
      })
    }

    let isAuthorizedStudent = false
    if (user.section && Array.isArray(subject.sections)) {
      const normalizeSection = section =>
        typeof section === 'string' ? section.trim().toLowerCase() : ''
      const userSection = normalizeSection(user.section)
      isAuthorizedStudent = subject.sections.some(
        s => normalizeSection(s) === userSection
      )
    }

    if (!isAuthorizedStudent) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be enrolled in this subject to request a token.'
      })
    }

    // Calculate session date (today)
    const sessionDate = new Date()
    sessionDate.setHours(0, 0, 0, 0)

    // Calculate expiration (4 hours from now or end of scheduled session, whichever is later)
    const now = new Date()
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000)

    // If subject has a scheduled time, use end of session (assuming 2 hour class)
    let expiresAt = fourHoursFromNow
    if (subject.time) {
      // Try to parse time and calculate end time
      // This is a simplified calculation - adjust based on your time format
      const sessionEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2 hours from now
      if (sessionEnd > expiresAt) {
        expiresAt = sessionEnd
      }
    }

    const session = await findUpcomingSessionForSubject({
      subjectId,
      referenceTime: now
    })

    if (!session) {
      return res.status(409).json({
        success: false,
        error: 'NoScheduledSession',
        message:
          'No upcoming scheduled session was found for this subject. Please confirm the class schedule with your instructor.'
      })
    }

    const tokenRecord = await getOrCreateTokenForSession({
      userId,
      subjectId,
      session,
      meetCode: session.meetCode,
      issuedAutomatically: false
    })

    res.json({
      success: true,
      message: 'Token generated successfully',
      data: {
        token: tokenRecord.token,
        subjectId: tokenRecord.subjectId,
        sessionId: tokenRecord.sessionId,
        validFrom: tokenRecord.validFrom,
        expiresAt: tokenRecord.expiresAt
      }
    })
  } catch (error) {
    console.error('Error generating token:', error)
    res.status(500).json({
      error: 'Failed to generate token',
      message: error.message
    })
  }
})

// GET /api/subjects/:id/schedule-metrics - Get schedule metrics and policy calculations
router.get('/:id/schedule-metrics', async (req, res) => {
  try {
    const { id: subjectId } = req.params

    // Validate ObjectId format
    if (!subjectId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subject ID format'
      })
    }

    // Get subject to find instructor
    const subject = await Subject.findById(subjectId).lean()
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Calculate schedule metrics for this subject
    const metrics = await calculateInstructorScheduleMetrics(
      subject.instructorId,
      subjectId
    )

    if (!metrics.success) {
      return res.status(404).json({
        success: false,
        error: metrics.message || 'Failed to calculate schedule metrics'
      })
    }

    // Return the subject-specific metrics
    const subjectMetrics = metrics.data.subjects[0]
    if (!subjectMetrics) {
      return res.status(404).json({
        success: false,
        error: 'Schedule metrics not found for this subject'
      })
    }

    res.json({
      success: true,
      data: {
        subjectId,
        subjectName: subjectMetrics.subjectName,
        subjectCode: subjectMetrics.subjectCode,
        ...subjectMetrics
      }
    })
  } catch (error) {
    console.error('Error fetching schedule metrics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule metrics',
      message: error.message
    })
  }
})

// GET /api/subjects/:id/students-policy-status - Get policy status for all students
router.get('/:id/students-policy-status', async (req, res) => {
  try {
    const { id: subjectId } = req.params

    // Validate ObjectId format
    if (!subjectId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subject ID format'
      })
    }

    // Get subject
    const subject = await Subject.findById(subjectId).lean()
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      })
    }

    // Get all students enrolled in this subject
    const students = await User.find({
      role: 'student',
      section: { $in: subject.sections }
    })
      .select('_id firstName lastName email section')
      .lean()

    // Get policy status for each student
    const studentsPolicyStatus = await Promise.all(
      students.map(async student => {
        const status = await getStudentPolicyStatus(
          subjectId,
          student._id.toString()
        )
        return {
          student: {
            _id: student._id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            section: student.section
          },
          policyStatus: status.success ? status.data : null,
          error: status.success ? null : status.message
        }
      })
    )

    res.json({
      success: true,
      data: {
        subjectId,
        studentsPolicyStatus,
        totalStudents: studentsPolicyStatus.length
      }
    })
  } catch (error) {
    console.error('Error fetching students policy status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students policy status',
      message: error.message
    })
  }
})

module.exports = router
