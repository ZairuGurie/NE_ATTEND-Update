const express = require('express')
const router = express.Router()
const { getModel } = require('../services/dataStore')
const { requireAuth } = require('../middleware/auth')
const { sendErrorResponse, handleError } = require('../utils/errorHandler')
const { normalizeWeeklySchedule } = require('../utils/scheduleUtils')
const {
  assignStudentsToSubjectBySection
} = require('../services/assignmentService')
const User = getModel('User')
const Subject = getModel('Subject')
const { sendMail } = require('../utils/email')

// GET /api/users - Get all users (with optional role filtering)
router.get('/', async (req, res) => {
  try {
    const { role } = req.query

    // Build query with optional role filter
    const query = {}
    if (
      role &&
      ['admin', 'instructor', 'student'].includes(role.toLowerCase())
    ) {
      query.role = role.toLowerCase()
    }

    const users = await User.find(query)
      .select('-userPassword')
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: users
    })
  } catch (error) {
    handleError(res, error, 'Failed to fetch users')
  }
})

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-userPassword')

    if (!user) {
      return sendErrorResponse(res, 404, 'User not found')
    }

    res.json({
      success: true,
      data: user
    })
  } catch (error) {
    handleError(res, error, 'Failed to fetch user')
  }
})

// GET /api/users/:id/password - Get user password (admin only)
// WARNING: This endpoint returns plaintext password for admin viewing purposes
// This is a security risk but requested by admin for user management
router.get('/:id/password', requireAuth, async (req, res) => {
  try {
    // Verify requester is admin
    if (req.auth?.role !== 'admin') {
      return sendErrorResponse(
        res,
        403,
        'Forbidden',
        'Only administrators can view passwords'
      )
    }

    // Find user and explicitly include plaintextPassword
    const user = await User.findById(req.params.id).select('+plaintextPassword')

    if (!user) {
      return sendErrorResponse(res, 404, 'User not found')
    }

    // Return the plaintext password if available
    res.json({
      success: true,
      data: {
        userId: user._id,
        email: user.email,
        password:
          user.plaintextPassword ||
          '(Password not available - set before this feature was added)'
      }
    })
  } catch (error) {
    handleError(res, error, 'Failed to fetch user password')
  }
})

// POST /api/users - Create new user
router.post('/', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password, // Added password field
      role,
      studentId,
      department,
      course,
      phone,
      schoolYear,
      semester,
      section,
      yearLevel,
      dateOfBirth,
      address,
      guardianName,
      guardianPhone,
      guardianRelation,
      emergencyContact,
      emergencyPhone,
      officeLocation,
      experience,
      specialization,
      bio
    } = req.body

    if (!firstName || !lastName || !email) {
      return sendErrorResponse(
        res,
        400,
        'Missing required fields',
        'firstName, lastName, and email are required'
      )
    }

    const user = new User({
      firstName,
      lastName,
      email,
      userPassword: password || undefined, // Set password if provided
      plaintextPassword: password || undefined, // Store plaintext for admin viewing
      role: role || 'student',
      studentId,
      department,
      course,
      phone,
      schoolYear,
      semester,
      section,
      yearLevel,
      dateOfBirth,
      address,
      guardianName,
      guardianPhone,
      guardianRelation,
      emergencyContact,
      emergencyPhone,
      officeLocation,
      experience,
      specialization,
      bio
    })

    await user.save()

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    })
  } catch (error) {
    handleError(res, error, 'Failed to create user')
  }
})

// POST /api/users/bulk-students - Bulk create student users (admin only)
router.post('/bulk-students', requireAuth, async (req, res) => {
  try {
    const authenticatedRole = req.auth.role
    if (authenticatedRole !== 'admin') {
      return sendErrorResponse(
        res,
        403,
        'Forbidden',
        'Only administrators can perform bulk student creation'
      )
    }

    const { students } = req.body

    if (!Array.isArray(students) || students.length === 0) {
      return sendErrorResponse(
        res,
        400,
        'Invalid payload',
        'students must be a non-empty array'
      )
    }

    const created = []
    const failures = []

    for (let index = 0; index < students.length; index++) {
      const student = students[index]
      try {
        const {
          firstName,
          lastName,
          email,
          password,
          studentId,
          department,
          course,
          phone,
          schoolYear,
          semester,
          section,
          yearLevel,
          dateOfBirth,
          address,
          guardianName,
          guardianPhone,
          guardianRelation,
          emergencyContact,
          emergencyPhone
        } = student

        if (!firstName || !lastName || !email || !password || !phone) {
          failures.push({
            rowIndex: index,
            reason:
              'Missing required base fields (firstName, lastName, email, password, phone)'
          })
          continue
        }

        const normalizedEmail = String(email).trim().toLowerCase()
        const normalizedPhone = String(phone).replace(/\D/g, '')

        const existingEmail = await User.findOne({ email: normalizedEmail })
        if (existingEmail) {
          failures.push({
            rowIndex: index,
            reason: 'Email already exists'
          })
          continue
        }

        if (studentId) {
          const existingStudent = await User.findOne({ studentId })
          if (existingStudent) {
            failures.push({
              rowIndex: index,
              reason: 'Student ID already exists'
            })
            continue
          }
        }

        const user = new User({
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          email: normalizedEmail,
          userPassword: password,
          plaintextPassword: password, // Store plaintext for admin viewing
          role: 'student',
          studentId: studentId || undefined,
          department,
          course,
          phone: normalizedPhone,
          schoolYear,
          semester,
          section,
          yearLevel,
          dateOfBirth,
          address,
          guardianName,
          guardianPhone,
          guardianRelation,
          emergencyContact,
          emergencyPhone
        })

        await user.save()
        created.push(user._id)

        // Fire-and-forget welcome email with credentials
        try {
          const subjectLine = 'Your NE-Attend student account'
          const textBody =
            `Hello ${firstName} ${lastName},\n\n` +
            'An account has been created for you on NE-Attend.\n\n' +
            `Login email: ${normalizedEmail}\n` +
            `Temporary password: ${password}\n\n` +
            'Please sign in and change your password as soon as possible.\n\n' +
            'This is an automated message.\n'

          // Do not await to avoid slowing down bulk upload
          sendMail(normalizedEmail, subjectLine, textBody).catch(err => {
            console.error(
              'Bulk student welcome email failed for',
              normalizedEmail,
              err.message
            )
          })
        } catch (mailError) {
          console.error('Bulk student welcome email error:', mailError.message)
        }
      } catch (err) {
        console.error('Bulk student create error:', err)
        failures.push({
          rowIndex: index,
          reason: err.message || 'Unexpected error while creating user'
        })
      }
    }

    res.status(201).json({
      success: true,
      message: 'Bulk student creation completed',
      data: {
        createdCount: created.length,
        failedCount: failures.length,
        failures
      }
    })
  } catch (error) {
    handleError(res, error, 'Failed to perform bulk student creation')
  }
})

// POST /api/users/bulk-instructors - Bulk create instructor users (admin only)
router.post('/bulk-instructors', requireAuth, async (req, res) => {
  try {
    const authenticatedRole = req.auth.role
    if (authenticatedRole !== 'admin') {
      return sendErrorResponse(
        res,
        403,
        'Forbidden',
        'Only administrators can perform bulk instructor creation'
      )
    }

    const { instructors } = req.body

    if (!Array.isArray(instructors) || instructors.length === 0) {
      return sendErrorResponse(
        res,
        400,
        'Invalid payload',
        'instructors must be a non-empty array'
      )
    }

    const created = []
    const failures = []
    const subjectResults = [] // Track subject creation results per instructor

    for (let index = 0; index < instructors.length; index++) {
      const instructorData = instructors[index]
      try {
        const {
          firstName,
          lastName,
          email,
          password,
          userId,
          department,
          course,
          phone,
          schoolYear,
          semester,
          experience,
          specialization,
          subjects
        } = instructorData

        if (!firstName || !lastName || !email || !password || !phone) {
          failures.push({
            rowIndex: index,
            reason:
              'Missing required base fields (firstName, lastName, email, password, phone)'
          })
          continue
        }

        if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
          failures.push({
            rowIndex: index,
            reason: 'At least one subject is required for each instructor'
          })
          continue
        }

        const normalizedEmail = String(email).trim().toLowerCase()
        const normalizedPhone = String(phone).replace(/\D/g, '')

        const existingEmail = await User.findOne({ email: normalizedEmail })
        if (existingEmail) {
          failures.push({
            rowIndex: index,
            reason: 'Email already exists'
          })
          continue
        }

        // Create instructor user
        // Note: For instructors, we can store userId similar to how students have studentId
        // This allows displaying the user ID from the CSV file instead of MongoDB _id
        const user = new User({
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          email: normalizedEmail,
          userPassword: password,
          plaintextPassword: password, // Store plaintext for admin viewing
          role: 'instructor',
          studentId: userId || undefined, // Use studentId field to store userId for instructors (field name is studentId but used for both)
          department,
          course,
          phone: normalizedPhone,
          schoolYear,
          semester,
          officeLocation: undefined, // Optional
          experience: experience || undefined,
          specialization: specialization || undefined
        })

        await user.save()
        created.push(user._id)

        console.log(
          `✅ Created instructor ${user._id} (${email}) with ${subjects.length} subject(s) to create`
        )

        // Create subjects for this instructor
        const subjectErrors = []
        let subjectsCreated = 0

        for (let subIndex = 0; subIndex < subjects.length; subIndex++) {
          const subjectData = subjects[subIndex]
          try {
            console.log(
              `📝 Processing subject ${subIndex + 1} for instructor ${
                user._id
              }:`,
              JSON.stringify(subjectData, null, 2)
            )

            // Extract data - structure should match CreateAccountForm format
            const {
              subjectName,
              subjectCode,
              sections, // Array from CreateAccountForm
              schedule, // Object with weekdays, startTime, endTime
              meetingLink,
              credits,
              description,
              room,
              department: subjectDepartment,
              schoolYear: subjectSchoolYear,
              semester: subjectSemester
            } = subjectData

            if (!subjectName || !subjectCode) {
              const errorMsg = `Subject ${
                subIndex + 1
              }: Missing subjectName or subjectCode`
              console.error(`❌ ${errorMsg}`)
              subjectErrors.push(errorMsg)
              continue
            }

            // Check if subject code already exists
            const existingSubject = await Subject.findOne({
              subjectCode: subjectCode.trim()
            })
            if (existingSubject) {
              subjectErrors.push(
                `Subject ${
                  subIndex + 1
                }: Subject code ${subjectCode} already exists`
              )
              continue
            }

            // Build schedule object - same approach as CreateAccountForm and /auth/register
            // The schedule should be an object with weekdays, startTime, endTime
            let scheduleMeta = { value: null }

            if (
              schedule &&
              schedule.weekdays &&
              Array.isArray(schedule.weekdays) &&
              schedule.weekdays.length > 0 &&
              schedule.startTime &&
              schedule.endTime
            ) {
              console.log(
                `🕐 Building schedule for subject ${subjectCode}:`,
                JSON.stringify(schedule, null, 2)
              )

              scheduleMeta = normalizeWeeklySchedule(schedule)
              if (scheduleMeta.error) {
                const errorMsg = `Subject ${subIndex + 1}: ${
                  scheduleMeta.error
                }`
                console.error(`❌ Schedule error: ${errorMsg}`)
                subjectErrors.push(errorMsg)
                continue
              }

              console.log(
                `✅ Schedule normalized for subject ${subjectCode}:`,
                JSON.stringify(scheduleMeta.value, null, 2)
              )
            } else {
              // If schedule data is missing, log it but don't fail
              console.warn(
                `⚠️ Subject ${
                  subIndex + 1
                } (${subjectCode}): Missing schedule data`,
                `schedule: ${JSON.stringify(schedule)}`
              )
            }

            const resolvedDay = scheduleMeta.dayLabel || undefined
            const resolvedTime = scheduleMeta.timeLabel || undefined

            // Ensure required fields are present (department is required in Subject model)
            const finalDepartment = subjectDepartment || department
            if (!finalDepartment) {
              throw new Error('Department is required for subject')
            }

            // Validate required fields
            if (!subjectName || !subjectName.trim()) {
              throw new Error('subjectName is required')
            }
            if (!subjectCode || !subjectCode.trim()) {
              throw new Error('subjectCode is required')
            }

            // Create subject - same structure as /auth/register endpoint
            const subject = new Subject({
              subjectName: subjectName.trim(),
              subjectCode: subjectCode.trim(),
              instructorId: user._id,
              sections: Array.isArray(sections)
                ? sections.map(s => String(s).trim()).filter(s => s)
                : [],
              day: resolvedDay,
              time: resolvedTime,
              schedule: scheduleMeta.value || undefined,
              room: room?.trim() || undefined,
              meetingLink: meetingLink?.trim() || undefined,
              department: finalDepartment.trim(), // Required field
              schoolYear: subjectSchoolYear || schoolYear || undefined,
              semester: subjectSemester || semester || undefined,
              description: description?.trim() || undefined,
              credits:
                credits !== undefined &&
                credits !== null &&
                credits !== '' &&
                !Number.isNaN(Number(credits))
                  ? Number(credits)
                  : undefined,
              isActive: true
            })

            await subject.save()
            subjectsCreated++

            console.log(
              `✅ Created subject ${subject.subjectCode} (${subject.subjectName}) for instructor ${user._id}`
            )

            // Auto-assign matching students to subject
            try {
              await assignStudentsToSubjectBySection(subject._id)
            } catch (assignmentError) {
              // Log but don't fail subject creation
              console.error(
                `Auto-assignment failed for subject ${subject._id}:`,
                assignmentError.message
              )
            }
          } catch (subjectErr) {
            console.error(
              `❌ Error creating subject ${subIndex + 1} for instructor ${
                user._id
              }:`,
              subjectErr.message,
              subjectErr.stack
            )
            console.error(
              'Subject data that failed:',
              JSON.stringify(subjectData, null, 2)
            )
            subjectErrors.push(
              `Subject ${subIndex + 1}: ${
                subjectErr.message || 'Unexpected error'
              }`
            )
          }
        }

        console.log(
          `📊 Instructor ${user._id}: Created ${subjectsCreated} of ${subjects.length} subject(s)`
        )

        // Track subject results for this instructor
        subjectResults.push({
          instructorId: user._id.toString(),
          email: normalizedEmail,
          subjectsAttempted: subjects.length,
          subjectsCreated,
          subjectsFailed: subjectErrors.length,
          errors: subjectErrors
        })

        if (subjectErrors.length > 0) {
          console.warn(
            `⚠️ Instructor ${user._id} created but ${subjectErrors.length} subject(s) failed:`,
            subjectErrors
          )
          // Note: Instructor is still created even if some subjects fail
        }

        if (subjectsCreated === 0 && subjects.length > 0) {
          console.error(
            `❌ WARNING: Instructor ${user._id} created but NO subjects were created!`,
            `Subject data:`,
            JSON.stringify(subjects, null, 2)
          )
        }
      } catch (err) {
        console.error('Bulk instructor create error:', err)
        failures.push({
          rowIndex: index,
          reason: err.message || 'Unexpected error while creating instructor'
        })
      }
    }

    // Calculate total subjects created/failed across all instructors
    const totalSubjectsCreated = subjectResults.reduce(
      (sum, r) => sum + r.subjectsCreated,
      0
    )
    const totalSubjectsFailed = subjectResults.reduce(
      (sum, r) => sum + r.subjectsFailed,
      0
    )
    const instructorsWithSubjectFailures = subjectResults.filter(
      r => r.subjectsFailed > 0
    )

    res.status(201).json({
      success: true,
      message: `Bulk instructor creation completed. ${
        created.length
      } instructor(s) created, ${totalSubjectsCreated} subject(s) assigned.${
        totalSubjectsFailed > 0
          ? ` ${totalSubjectsFailed} subject(s) failed.`
          : ''
      }`,
      data: {
        createdCount: created.length,
        failedCount: failures.length,
        failures,
        subjectsSummary: {
          totalCreated: totalSubjectsCreated,
          totalFailed: totalSubjectsFailed,
          details: subjectResults
        },
        instructorsWithSubjectFailures:
          instructorsWithSubjectFailures.length > 0
            ? instructorsWithSubjectFailures
            : undefined
      }
    })
  } catch (error) {
    handleError(res, error, 'Failed to perform bulk instructor creation')
  }
})

// PUT /api/users/:id - Update user
router.put('/:id', requireAuth, async (req, res) => {
  try {
    // Verify that the authenticated user can only update their own profile (unless admin)
    const targetUserId = req.params.id
    const authenticatedUserId = req.auth.userId
    const authenticatedRole = req.auth.role

    // Only allow users to update their own profile, or admins to update any profile
    if (targetUserId !== authenticatedUserId && authenticatedRole !== 'admin') {
      return sendErrorResponse(
        res,
        403,
        'Forbidden',
        'You can only update your own profile'
      )
    }

    const {
      firstName,
      lastName,
      email,
      role,
      studentId,
      department,
      course,
      phone,
      schoolYear,
      semester,
      section,
      yearLevel,
      dateOfBirth,
      address,
      guardianName,
      guardianPhone,
      guardianRelation,
      emergencyContact,
      emergencyPhone,
      officeLocation,
      experience,
      specialization,
      bio,
      active,
      profilePicture,
      imageScale,
      notifications,
      units,
      gpa,
      linkedin,
      researchGate,
      certifications,
      subjects,
      sections,
      userPassword
    } = req.body

    // Build update object with only provided fields
    const updateData = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName
    if (email !== undefined) updateData.email = email
    if (role !== undefined) updateData.role = role
    if (studentId !== undefined) updateData.studentId = studentId
    if (department !== undefined) updateData.department = department
    if (course !== undefined) updateData.course = course
    if (phone !== undefined) updateData.phone = phone
    if (schoolYear !== undefined) updateData.schoolYear = schoolYear
    if (semester !== undefined) updateData.semester = semester
    if (section !== undefined) updateData.section = section
    if (yearLevel !== undefined) updateData.yearLevel = yearLevel
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth
    if (address !== undefined) updateData.address = address
    if (guardianName !== undefined) updateData.guardianName = guardianName
    if (guardianPhone !== undefined) updateData.guardianPhone = guardianPhone
    if (guardianRelation !== undefined)
      updateData.guardianRelation = guardianRelation
    if (emergencyContact !== undefined)
      updateData.emergencyContact = emergencyContact
    if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone
    if (officeLocation !== undefined) updateData.officeLocation = officeLocation
    if (experience !== undefined) updateData.experience = experience
    if (specialization !== undefined) updateData.specialization = specialization
    if (bio !== undefined) updateData.bio = bio
    if (active !== undefined) updateData.active = active
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture
    if (imageScale !== undefined) updateData.imageScale = imageScale
    if (notifications !== undefined) updateData.notifications = notifications
    if (units !== undefined) updateData.units = units
    if (gpa !== undefined) updateData.gpa = gpa
    if (linkedin !== undefined) updateData.linkedin = linkedin
    if (researchGate !== undefined) updateData.researchGate = researchGate
    if (certifications !== undefined) updateData.certifications = certifications
    if (subjects !== undefined) updateData.subjects = subjects
    if (sections !== undefined) updateData.sections = sections
    if (userPassword !== undefined) updateData.userPassword = userPassword

    const user = await User.findById(req.params.id)

    if (!user) {
      return sendErrorResponse(res, 404, 'User not found')
    }

    Object.entries(updateData).forEach(([key, value]) => {
      user[key] = value
    })

    await user.save()

    const sanitizedUser = user.toObject()
    delete sanitizedUser.userPassword

    res.json({
      success: true,
      message: 'User updated successfully',
      data: sanitizedUser
    })
  } catch (error) {
    handleError(res, error, 'Failed to update user')
  }
})

// DELETE /api/users/:id - Delete user
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // Only admins can delete users
    const authenticatedRole = req.auth.role
    if (authenticatedRole !== 'admin') {
      return sendErrorResponse(
        res,
        403,
        'Forbidden',
        'Only administrators can delete users'
      )
    }

    const user = await User.findByIdAndDelete(req.params.id)

    if (!user) {
      return sendErrorResponse(res, 404, 'User not found')
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    })
  } catch (error) {
    handleError(res, error, 'Failed to delete user')
  }
})

module.exports = router
