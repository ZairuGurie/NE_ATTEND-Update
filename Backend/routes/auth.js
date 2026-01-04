const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { JWT_SECRET } = require('../config/jwt')
const { getModel } = require('../services/dataStore')
const { requireAuth } = require('../middleware/auth')
const { sendErrorResponse, handleError } = require('../utils/errorHandler')
const User = getModel('User')
const VerificationCode = getModel('VerificationCode')
const Subject = getModel('Subject')
const nodemailer = require('nodemailer')
const { getCredentialsEmailTemplate } = require('../utils/emailTemplates')
const { normalizeWeeklySchedule } = require('../utils/scheduleUtils')
const {
  assignNewStudentToMatchingSubjects
} = require('../services/assignmentService')
// Using Nodemailer (SMTP) only for verification code delivery

const router = express.Router()

// Validate JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error(
    '❌ CRITICAL: JWT_SECRET environment variable is required in production!'
  )
  console.error('   Please set JWT_SECRET in your .env file')
  process.exit(1)
}

if (
  JWT_SECRET === 'dev-secret-change-me' &&
  process.env.NODE_ENV === 'production'
) {
  console.warn(
    '⚠️  WARNING: Using default JWT_SECRET in production is insecure!'
  )
  console.warn('   Please set a strong, unique JWT_SECRET in your .env file')
}

// Register
router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      role = 'student',
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
      subjects,
      profilePhotoUrl
    } = req.body

    const normalizedEmail =
      typeof email === 'string' ? email.trim().toLowerCase() : ''
    const normalizedRole = (role || 'student').toLowerCase()
    const normalizedPhone =
      typeof phone === 'string' ? phone.replace(/\D/g, '') : ''

    const missingBase = []
    if (!firstName?.trim()) missingBase.push('firstName')
    if (!lastName?.trim()) missingBase.push('lastName')
    if (!normalizedEmail) missingBase.push('email')
    if (!password) missingBase.push('password')
    if (!normalizedPhone) missingBase.push('phone')

    if (missingBase.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `Missing: ${missingBase.join(', ')}`
      })
    }

    if (password.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Password too short',
        message: 'Password must be at least 10 characters'
      })
    }

    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Weak password',
        message: 'Password must include at least one uppercase letter'
      })
    }

    if (!/[0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Weak password',
        message: 'Password must include at least one number'
      })
    }

    if (!/[^a-zA-Z0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Weak password',
        message: 'Password must include at least one special character'
      })
    }

    if (!/[a-z]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Weak password',
        message: 'Password must include at least one lowercase letter'
      })
    }

    const roleErrors = []
    if (normalizedRole === 'student') {
      if (!studentId?.trim()) roleErrors.push('studentId')
      if (!section?.trim()) roleErrors.push('section')
      if (!yearLevel?.trim()) roleErrors.push('yearLevel')
      if (!dateOfBirth) roleErrors.push('dateOfBirth')
      if (!guardianName?.trim()) roleErrors.push('guardianName')
      if (!guardianPhone?.trim()) roleErrors.push('guardianPhone')
    }
    // Office location is optional for instructors and admins

    if (roleErrors.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing role-specific fields',
        message: `Missing: ${roleErrors.join(', ')}`
      })
    }

    let parsedDob
    if (dateOfBirth) {
      const dob = new Date(dateOfBirth)
      if (Number.isNaN(dob.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid dateOfBirth',
          message: 'dateOfBirth must be a valid date string'
        })
      }
      parsedDob = dob
    }

    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: 'User already exists' })
    }

    if (studentId?.trim()) {
      const existsStudent = await User.findOne({ studentId: studentId.trim() })
      if (existsStudent) {
        return res
          .status(400)
          .json({ success: false, error: 'Student ID already exists' })
      }
    }

    const user = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      userPassword: password,
      plaintextPassword: password, // Store plaintext for admin viewing
      role: normalizedRole,
      studentId: studentId?.trim() || undefined,
      phone: normalizedPhone,
      department,
      course,
      schoolYear,
      semester,
      section,
      yearLevel,
      dateOfBirth: parsedDob,
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
      profilePhotoUrl: profilePhotoUrl || undefined
    })

    try {
      await user.save()
    } catch (err) {
      if (err && err.code === 11000) {
        // Duplicate key (email or studentId)
        return res.status(400).json({
          success: false,
          error: 'Duplicate value',
          message: err.keyPattern?.email
            ? 'Email already exists'
            : err.keyPattern?.studentId
            ? 'Student ID already exists'
            : 'Duplicate key error'
        })
      }
      throw err
    }

    // Create subjects for instructor
    let createdSubjects = []
    if (
      normalizedRole === 'instructor' &&
      subjects &&
      Array.isArray(subjects) &&
      subjects.length > 0
    ) {
      console.log(
        `📝 Processing ${subjects.length} subject(s) for instructor ${user._id}`
      )
      console.log('Subject data:', JSON.stringify(subjects, null, 2))

      try {
        const subjectPromises = subjects.map(async (subjectData, index) => {
          try {
            console.log(
              `📝 Processing subject ${index + 1}/${subjects.length}:`,
              JSON.stringify(subjectData, null, 2)
            )

            let scheduleMeta = { value: null }
            if (
              subjectData.schedule &&
              Object.keys(subjectData.schedule).length > 0
            ) {
              console.log(
                `🕐 Normalizing schedule for subject ${index + 1}:`,
                JSON.stringify(subjectData.schedule, null, 2)
              )
              scheduleMeta = normalizeWeeklySchedule(subjectData.schedule)
              if (scheduleMeta.error) {
                console.error(
                  `❌ Schedule error for subject ${index + 1}:`,
                  scheduleMeta.error
                )
                throw new Error(scheduleMeta.error)
              }
              console.log(
                `✅ Schedule normalized for subject ${index + 1}:`,
                JSON.stringify(scheduleMeta.value, null, 2)
              )
            } else {
              console.warn(`⚠️ Subject ${index + 1} has no schedule data`)
            }

            const resolvedDay = subjectData.day?.trim() || scheduleMeta.dayLabel
            const resolvedTime =
              subjectData.time?.trim() || scheduleMeta.timeLabel

            // Ensure required fields are present
            const subjectDepartment = subjectData.department || department
            if (!subjectDepartment) {
              throw new Error('Department is required for subject')
            }

            const subjectPayload = {
              subjectName: subjectData.subjectName?.trim(),
              subjectCode: subjectData.subjectCode?.trim(),
              instructorId: user._id,
              sections: Array.isArray(subjectData.sections)
                ? subjectData.sections.map(s => s.trim()).filter(s => s)
                : [],
              day: resolvedDay,
              time: resolvedTime,
              schedule: scheduleMeta.value,
              room: subjectData.room?.trim(),
              meetingLink: subjectData.meetingLink?.trim(),
              department: subjectDepartment.trim(), // Required field
              schoolYear: subjectData.schoolYear || schoolYear,
              semester: subjectData.semester || semester,
              description: subjectData.description?.trim(),
              credits: subjectData.credits,
              isActive: true
            }

            // Validate required fields before creating
            if (!subjectPayload.subjectName) {
              throw new Error('subjectName is required')
            }
            if (!subjectPayload.subjectCode) {
              throw new Error('subjectCode is required')
            }
            if (!subjectPayload.department) {
              throw new Error('department is required')
            }

            // Check if subject code already exists
            const existingSubject = await Subject.findOne({
              subjectCode: subjectPayload.subjectCode
            })
            if (existingSubject) {
              console.warn(
                `⚠️ Subject code ${subjectPayload.subjectCode} already exists, skipping`
              )
              throw new Error(
                `Subject code ${subjectPayload.subjectCode} already exists`
              )
            }

            console.log(
              `💾 Creating subject ${index + 1} with payload:`,
              JSON.stringify(subjectPayload, null, 2)
            )

            const subject = new Subject(subjectPayload)
            const savedSubject = await subject.save()

            // Verify it was actually saved
            if (!savedSubject || !savedSubject._id) {
              throw new Error('Subject save returned null or no _id')
            }

            console.log(
              `✅ Successfully created subject ${index + 1}:`,
              savedSubject._id,
              savedSubject.subjectCode
            )

            return savedSubject
          } catch (subjectErr) {
            console.error(
              `❌ Error creating subject ${index + 1}:`,
              subjectErr.message,
              subjectErr.stack
            )
            throw subjectErr
          }
        })

        createdSubjects = await Promise.all(subjectPromises)
        console.log(
          `✅ Created ${createdSubjects.length} of ${subjects.length} subject(s) for instructor ${user._id}`
        )

        if (createdSubjects.length === 0) {
          console.error(
            `❌ CRITICAL: No subjects were created for instructor ${user._id}!`
          )
          console.error(
            'Subject data that failed:',
            JSON.stringify(subjects, null, 2)
          )
        }
      } catch (subjectError) {
        console.error('❌ Error creating subjects:', subjectError)
        console.error('Error stack:', subjectError.stack)
        console.error('Subject data:', JSON.stringify(subjects, null, 2))
        // Continue with registration even if subjects fail, but log the error
      }
    } else {
      if (normalizedRole === 'instructor') {
        console.warn(
          `⚠️ Instructor ${user._id} created but no subjects provided`,
          `subjects: ${subjects}`,
          `isArray: ${Array.isArray(subjects)}`,
          `length: ${subjects?.length}`
        )
      }
    }

    // Auto-assign student to matching subjects and groups
    if (normalizedRole === 'student' && section) {
      try {
        console.log(
          `🔄 Starting auto-assignment for new student ${user._id} (section: ${section})`
        )
        const assignmentSummary = await assignNewStudentToMatchingSubjects(
          user._id,
          section
        )
        console.log(`✅ Auto-assignment summary:`, assignmentSummary)
      } catch (assignmentError) {
        // Log error but don't fail account creation
        console.error(
          `❌ Auto-assignment failed for student ${user._id}:`,
          assignmentError.message
        )
      }
    }

    // Send credentials email (fire-and-forget pattern)
    // This runs in the background and doesn't block the response
    const emailStartTime = Date.now()
    console.log(
      `📧 Preparing to send credentials email to ${normalizedEmail}...`
    )

    const emailTemplate = getCredentialsEmailTemplate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password: password,
      role: normalizedRole
    })

    // Fire-and-forget: send email in background without blocking response
    sendVerificationEmail(
      normalizedEmail,
      emailTemplate.subject,
      emailTemplate.text,
      emailTemplate.html
    )
      .then(info => {
        const totalTime = Date.now() - emailStartTime
        console.log(
          `✅ Credentials email delivered to ${normalizedEmail} in ${totalTime}ms - Message ID: ${info.messageId}`
        )
      })
      .catch(error => {
        const totalTime = Date.now() - emailStartTime
        console.error(
          `❌ Credentials email delivery failed to ${normalizedEmail} after ${totalTime}ms:`,
          error.message
        )
        // Note: Account creation still succeeds even if email fails
      })

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: '7d'
    })

    let successMessage = 'Account created successfully'
    if (createdSubjects.length > 0) {
      successMessage = `Instructor account and ${createdSubjects.length} subject(s) created successfully`
    }

    res.status(201).json({
      success: true,
      message: successMessage,
      data: {
        user: user.toJSON(),
        token,
        subjectsCreated: createdSubjects.length
      }
    })
  } catch (e) {
    handleError(res, e, 'Failed to register')
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    // Detailed logging for debugging
    console.log('🔐 === LOGIN REQUEST START ===')
    console.log('   Method:', req.method)
    console.log('   URL:', req.url)
    console.log('   Headers:', {
      'content-type': req.headers['content-type'],
      origin: req.headers['origin'],
      referer: req.headers['referer'],
      authorization: req.headers['authorization'] ? 'Present' : 'Not present'
    })
    console.log('   Body keys:', Object.keys(req.body || {}))
    console.log('   Body email:', req.body?.email || 'missing')
    console.log(
      '   Body password:',
      req.body?.password ? '[REDACTED]' : 'missing'
    )

    const { email, password } = req.body

    // Validate request body
    if (!email || !password) {
      console.log('❌ Login failed: Missing credentials')
      console.log('   Email provided:', !!email)
      console.log('   Password provided:', !!password)
      console.log('🔐 === LOGIN REQUEST END ===')
      return sendErrorResponse(
        res,
        400,
        'Missing credentials',
        'Email and password are required'
      )
    }

    // Normalize email for lookup (lowercase)
    const normalizedEmail = email.toLowerCase().trim()
    console.log(`🔐 Login attempt for email: ${normalizedEmail}`)

    // Find user in database
    console.log('   Searching for user in database...')
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
      console.log(
        `❌ Login failed: User not found for email: ${normalizedEmail}`
      )
      console.log('   Attempted email lookup:', normalizedEmail)
      console.log('🔐 === LOGIN REQUEST END ===')
      return sendErrorResponse(
        res,
        401,
        'Invalid credentials',
        'Invalid email or password'
      )
    }

    console.log(`   ✅ User found: ${user._id} (${user.role})`)
    console.log(`   User email in DB: ${user.email}`)

    // Check password format for logging
    const hasPlaintextPassword =
      user.userPassword &&
      !user.userPassword.startsWith('$2a$') &&
      !user.userPassword.startsWith('$2b$')

    if (hasPlaintextPassword) {
      console.log(
        `⚠️ User ${user._id} (${normalizedEmail}) has plaintext password - will migrate on successful login`
      )
    } else {
      console.log(`   Password is hashed (bcrypt format)`)
    }

    // Compare password
    console.log('   Comparing password...')
    const ok = await user.comparePassword(password)

    if (!ok) {
      console.log(
        `❌ Login failed: Invalid password for user ${user._id} (${normalizedEmail})`
      )
      console.log('   Password comparison result: FAILED')
      console.log('🔐 === LOGIN REQUEST END ===')
      return sendErrorResponse(
        res,
        401,
        'Invalid credentials',
        'Invalid email or password'
      )
    }

    console.log('   ✅ Password comparison: SUCCESS')

    // Password is correct - migrate plaintext password to hashed if needed
    if (hasPlaintextPassword) {
      try {
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(password, saltRounds)
        user.userPassword = hashedPassword
        await user.save()
        console.log(
          `✅ Password migrated to hashed format for user ${user._id} (${normalizedEmail})`
        )
      } catch (hashError) {
        console.error(
          `⚠️ Failed to migrate password for user ${user._id}:`,
          hashError
        )
        // Continue with login even if migration fails - password is already correct
      }
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: '7d'
    })
    console.log(
      `✅ Login successful for user ${user._id} (${normalizedEmail}), role: ${user.role}`
    )
    console.log('   Token generated successfully')
    console.log('🔐 === LOGIN REQUEST END ===')

    res.json({ success: true, data: { user: user.toJSON(), token } })
  } catch (e) {
    console.error('❌ Login error:', e)
    console.error('   Error type:', e.constructor.name)
    console.error('   Error message:', e.message)
    console.error('   Error stack:', e.stack)
    console.log('🔐 === LOGIN REQUEST END (ERROR) ===')
    handleError(res, e, 'Failed to login')
  }
})

// Change password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    // Extract userId from JWT token (secure) instead of request body
    const userId = req.auth.userId
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return sendErrorResponse(
        res,
        400,
        'Missing required fields',
        'currentPassword and newPassword are required'
      )
    }

    if (newPassword.length < 8) {
      return sendErrorResponse(
        res,
        400,
        'Password too short',
        'New password must be at least 8 characters long'
      )
    }

    const user = await User.findById(userId)
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found')
    }

    const matches = await user.comparePassword(currentPassword)
    if (!matches) {
      return sendErrorResponse(
        res,
        400,
        'Invalid credentials',
        'Current password is incorrect'
      )
    }

    user.userPassword = newPassword
    await user.save()

    res.json({
      success: true,
      message: 'Password updated successfully'
    })
  } catch (error) {
    handleError(res, error, 'Failed to change password')
  }
})

// Verify token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.userId)
    if (!user) {
      return sendErrorResponse(
        res,
        401,
        'Invalid token',
        'User not found for token'
      )
    }
    res.json({ success: true, data: { user: user.toJSON() } })
  } catch (e) {
    handleError(res, e, 'Invalid token')
  }
})

module.exports = router

/**
 * Email confirmation: send & verify
 */
const { sendMail, MAIL_FROM, SMTP_ENABLED } = require('../utils/email')

// Test email configuration endpoint
router.get('/test-email-config', async (req, res) => {
  try {
    res.json({
      success: true,
      provider: SMTP_ENABLED ? 'smtp' : 'disabled',
      config: {
        mailFrom: MAIL_FROM,
        enabled: SMTP_ENABLED
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load email configuration',
      message: error.message
    })
  }
})

router.post('/send-code', async (req, res) => {
  const startTime = Date.now()

  try {
    const { email, purpose = 'register' } = req.body
    if (!email) return res.status(400).json({ error: 'Email is required' })

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Use Promise.all for parallel database operations
    const [_deleteResult, _createResult] = await Promise.all([
      VerificationCode.deleteMany({ email, purpose, consumed: false }),
      VerificationCode.create({ email, code, purpose, expiresAt })
    ])

    console.log(`📧 Preparing to send code to ${email}...`)

    const subject = 'NE-Attend code'
    const text = `Code: ${code} (expires in 10m)`

    // Fire-and-forget sending via shared mailer
    const emailPromise = sendMail(email, subject, text)

    // Respond immediately to client
    const responseTime = Date.now() - startTime
    console.log(`⚡ Response sent in ${responseTime}ms`)

    res.json({
      success: true,
      message: 'Code sent',
      code: code, // Include code for debugging (remove in production)
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`
    })

    // Handle email sending result (log only)
    emailPromise
      .then(info => {
        const totalTime = Date.now() - startTime
        console.log(
          `✅ Email delivered to ${email} in ${totalTime}ms - Message ID: ${info.messageId}`
        )
      })
      .catch(error => {
        const totalTime = Date.now() - startTime
        console.error(
          `❌ Email delivery failed to ${email} after ${totalTime}ms:`,
          error.message
        )
      })
  } catch (e) {
    const totalTime = Date.now() - startTime
    console.error(`❌ Error in send-code after ${totalTime}ms:`, e)
    res.status(500).json({
      error: 'Failed to send code',
      message: e.message,
      responseTime: `${totalTime}ms`
    })
  }
})

router.post('/verify-code', async (req, res) => {
  try {
    const { email, code, purpose = 'register' } = req.body
    if (!email || !code)
      return res.status(400).json({ error: 'Email and code are required' })

    const entry = await VerificationCode.findOne({
      email,
      purpose,
      consumed: false
    }).sort({ createdAt: -1 })
    if (!entry)
      return res
        .status(400)
        .json({ error: 'No active code. Please request a new one.' })
    if (entry.expiresAt < new Date())
      return res
        .status(400)
        .json({ error: 'Code expired. Please request a new one.' })
    if (entry.code !== code)
      return res.status(400).json({ error: 'Invalid code.' })

    entry.consumed = true
    await entry.save()
    res.json({ success: true, message: 'Code verified' })
  } catch (e) {
    res.status(500).json({ error: 'Failed to verify code', message: e.message })
  }
})

/**
 * Forgot password: request, verify, reset
 */
router.post('/forgot/request', async (req, res) => {
  const startTime = Date.now()
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email is required' })

    const normalizedEmail = String(email).toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
      // Explicit validation per request: email must exist
      return res
        .status(404)
        .json({ error: 'Email not found. Please check and try again.' })
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Parallel DB ops (delete old codes, create new one)
    await Promise.all([
      VerificationCode.deleteMany({
        email: normalizedEmail,
        purpose: 'reset',
        consumed: false
      }),
      VerificationCode.create({
        email: normalizedEmail,
        code,
        purpose: 'reset',
        expiresAt
      })
    ])

    // Respond immediately (email sending in background)
    const responseTime = Date.now() - startTime
    console.log(
      `Forgot request ready in ${responseTime}ms for ${normalizedEmail}`
    )
    res.json({
      success: true,
      message: 'If the email exists, a code has been sent'
    })

    // Background email send (fire-and-forget)
    sendVerificationEmail(
      normalizedEmail,
      'Reset your NE-Attend password',
      `Code: ${code} (expires in 10m)`,
      undefined
    )
      .then(() => {
        const total = Date.now() - startTime
        console.log(
          `✅ Forgot-password code delivered to ${normalizedEmail} in ${total}ms`
        )
      })
      .catch(err => {
        console.warn('Forgot-password email failed:', err.message)
      })
  } catch (e) {
    res
      .status(500)
      .json({ error: 'Failed to process request', message: e.message })
  }
})

router.post('/forgot/verify', async (req, res) => {
  try {
    const { email, code } = req.body
    if (!email || !code)
      return res.status(400).json({ error: 'Email and code are required' })
    const normalizedEmail = String(email).toLowerCase().trim()
    const entry = await VerificationCode.findOne({
      email: normalizedEmail,
      purpose: 'reset',
      consumed: false
    }).sort({ createdAt: -1 })
    if (!entry)
      return res
        .status(400)
        .json({ error: 'No active code. Request a new one.' })
    if (entry.expiresAt < new Date())
      return res.status(400).json({ error: 'Code expired.' })
    if (entry.code !== code)
      return res.status(400).json({ error: 'Invalid code.' })
    res.json({ success: true, message: 'Code valid' })
  } catch (e) {
    res.status(500).json({ error: 'Failed to verify code', message: e.message })
  }
})

router.post('/forgot/reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body
    if (!email || !code || !newPassword)
      return res.status(400).json({ error: 'Missing fields' })

    const normalizedEmail = String(email).toLowerCase().trim()
    const entry = await VerificationCode.findOne({
      email: normalizedEmail,
      purpose: 'reset',
      consumed: false
    }).sort({ createdAt: -1 })
    if (!entry)
      return res
        .status(400)
        .json({ error: 'No active code. Request a new one.' })
    if (entry.expiresAt < new Date())
      return res.status(400).json({ error: 'Code expired.' })
    if (entry.code !== code)
      return res.status(400).json({ error: 'Invalid code.' })

    const user = await User.findOne({ email: normalizedEmail })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const trimmedNew = String(newPassword)
    if (trimmedNew.length < 6)
      return res.status(400).json({ error: 'Password too short' })

    // Prevent reusing the current password
    // Use comparePassword to check if new password matches current (works with both hashed and plaintext)
    const isSamePassword = await user.comparePassword(trimmedNew)
    if (isSamePassword) {
      return res.status(400).json({
        error: 'New password must be different from your current password.'
      })
    }

    // Set new password - will be automatically hashed by User model pre-save hook
    user.userPassword = trimmedNew
    await user.save()

    entry.consumed = true
    await entry.save()

    res.json({ success: true, message: 'Password reset successful' })
  } catch (e) {
    res
      .status(500)
      .json({ error: 'Failed to reset password', message: e.message })
  }
})

// Check if a userId (studentId) already exists and has a password set
router.post('/check-user-id', async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing userId' })
    }
    const user = await User.findOne({ studentId: userId }).lean()
    if (!user) {
      return res.json({ success: true, exists: false, hasPassword: false })
    }
    const hasPassword =
      typeof user.userPassword === 'string' && user.userPassword.length > 0
    return res.json({ success: true, exists: true, hasPassword })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// Check if email exists
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res
        .status(400)
        .json({ success: false, error: 'Email is required' })
    }

    // Normalize email to lowercase for consistent checking
    const normalizedEmail = email.toLowerCase().trim()

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }
    })

    res.json({
      success: true,
      exists: !!user,
      message: user ? 'Email already exists' : 'Email is available'
    })
  } catch (error) {
    console.error('Error checking email:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to check email',
      message: error.message
    })
  }
})

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    // In a production app, you might want to blacklist the token
    // For now, we'll just return success since JWT tokens are stateless
    res.json({
      success: true,
      message: 'Logged out successfully'
    })
  } catch (error) {
    console.error('Error during logout:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to logout',
      message: error.message
    })
  }
})
