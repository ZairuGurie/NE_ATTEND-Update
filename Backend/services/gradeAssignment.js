const { getModel } = require('./dataStore')
const {
  calculateConsecutiveWeeksAbsent,
  calculateContactHoursAbsent
} = require('./absenceTracker')

const _User = getModel('User')
const Subject = getModel('Subject')

/**
 * Check if a student is eligible for D/F grade
 * Eligibility criteria:
 * 1. 3+ consecutive weeks of unexcused absences, OR
 * 2. >17% of total contact hours as unexcused absences
 *
 * @param {string} userId - User ID
 * @param {string} subjectId - Subject ID
 * @returns {Object} { isEligible: boolean, reasons: Array, consecutiveWeeks: number, contactHoursPercentage: number }
 */
async function checkDFGradeEligibility (userId, subjectId) {
  try {
    const [consecutiveWeeks, contactHours] = await Promise.all([
      calculateConsecutiveWeeksAbsent(userId, subjectId),
      calculateContactHoursAbsent(userId, subjectId)
    ])

    const reasons = []
    let isEligible = false

    if (consecutiveWeeks.isEligible) {
      isEligible = true
      reasons.push(
        `3 or more consecutive weeks of unexcused absences (${consecutiveWeeks.consecutiveWeeks} weeks)`
      )
    }

    if (contactHours.isEligible) {
      isEligible = true
      reasons.push(
        `More than 17% of contact hours absent (${contactHours.percentage.toFixed(
          2
        )}%)`
      )
    }

    return {
      isEligible,
      reasons,
      consecutiveWeeks: consecutiveWeeks.consecutiveWeeks,
      contactHoursPercentage: contactHours.percentage,
      details: {
        consecutiveWeeks,
        contactHours
      }
    }
  } catch (error) {
    console.error('Error checking D/F grade eligibility:', error)
    return {
      isEligible: false,
      reasons: [],
      consecutiveWeeks: 0,
      contactHoursPercentage: 0,
      error: error.message
    }
  }
}

/**
 * Get all students eligible for D/F grade in a subject
 *
 * @param {string} subjectId - Subject ID
 * @returns {Array} Array of student eligibility objects
 */
async function getDFEligibleStudents (subjectId) {
  try {
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return []
    }

    // Get students by section matching
    const User = getModel('User')
    const students = await User.find({
      role: 'student',
      active: { $ne: false },
      section: { $in: subject.sections || [] }
    })

    const eligibleStudents = []

    // Check each student
    for (const student of students) {
      const eligibility = await checkDFGradeEligibility(student._id, subjectId)

      if (eligibility.isEligible) {
        eligibleStudents.push({
          userId: student._id,
          studentName: `${student.firstName} ${student.lastName}`,
          studentId: student.studentId || null,
          ...eligibility
        })
      }
    }

    return eligibleStudents
  } catch (error) {
    console.error('Error getting D/F eligible students:', error)
    return []
  }
}

/**
 * Get eligibility summary for all students in a subject
 * Returns both eligible and non-eligible students with their status
 *
 * @param {string} subjectId - Subject ID
 * @returns {Object} { eligible: Array, atRisk: Array, safe: Array, summary: Object }
 */
async function getEligibilitySummary (subjectId) {
  try {
    const subject = await Subject.findById(subjectId)
    if (!subject) {
      return {
        eligible: [],
        atRisk: [],
        safe: [],
        summary: {
          total: 0,
          eligible: 0,
          atRisk: 0,
          safe: 0
        }
      }
    }

    // Get students by section matching
    const User = getModel('User')
    const students = await User.find({
      role: 'student',
      active: { $ne: false },
      section: { $in: subject.sections || [] }
    })

    const eligible = []
    const atRisk = []
    const safe = []

    // Check each student
    for (const student of students) {
      const eligibility = await checkDFGradeEligibility(student._id, subjectId)

      const studentInfo = {
        userId: student._id,
        studentName: `${student.firstName} ${student.lastName}`,
        studentId: student.studentId || null,
        ...eligibility
      }

      if (eligibility.isEligible) {
        eligible.push(studentInfo)
      } else if (
        eligibility.consecutiveWeeks >= 2 ||
        eligibility.contactHoursPercentage > 10
      ) {
        // At risk: 2 consecutive weeks or >10% contact hours
        atRisk.push(studentInfo)
      } else {
        safe.push(studentInfo)
      }
    }

    return {
      eligible,
      atRisk,
      safe,
      summary: {
        total: students.length,
        eligible: eligible.length,
        atRisk: atRisk.length,
        safe: safe.length
      }
    }
  } catch (error) {
    console.error('Error getting eligibility summary:', error)
    return {
      eligible: [],
      atRisk: [],
      safe: [],
      summary: {
        total: 0,
        eligible: 0,
        atRisk: 0,
        safe: 0
      },
      error: error.message
    }
  }
}

module.exports = {
  checkDFGradeEligibility,
  getDFEligibleStudents,
  getEligibilitySummary
}
