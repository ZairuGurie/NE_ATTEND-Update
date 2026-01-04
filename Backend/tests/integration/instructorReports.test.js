const express = require('express')
const http = require('http')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

const { JWT_SECRET } = require('../../config/jwt')
const instructorReportRoutes = require('../../routes/instructorReports')
const User = require('../../models/User')
const Subject = require('../../models/Subject')
const Session = require('../../models/Session')
const Attendance = require('../../models/Attendance')

async function clearCollections () {
  await Promise.all([
    Attendance.deleteMany({}),
    Session.deleteMany({}),
    Subject.deleteMany({}),
    User.deleteMany({})
  ])
}

function buildTestApp () {
  const app = express()
  app.use(express.json())
  app.use('/api/instructor/reports', instructorReportRoutes)
  return app
}

function performGetRequest (path, token) {
  const app = buildTestApp()
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      }

      const req = http.request(options, res => {
        let body = ''
        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => {
          server.close()
          try {
            const parsed = body ? JSON.parse(body) : null
            resolve({ status: res.statusCode, body: parsed })
          } catch (error) {
            reject(error)
          }
        })
      })

      req.on('error', error => {
        server.close()
        reject(error)
      })

      req.end()
    })
  })
}

describe('GET /api/instructor/reports/attendance-summary', () => {
  it('returns summary, breakdowns, and details for instructor-owned subject', async () => {
    await clearCollections()

    const instructor = await User.create({
      firstName: 'Ivy',
      lastName: 'Instructor',
      email: `ivy-${Date.now()}@example.com`,
      role: 'instructor'
    })

    const studentA = await User.create({
      firstName: 'Alice',
      lastName: 'Anderson',
      email: `alice-${Date.now()}@example.com`,
      role: 'student',
      section: 'A'
    })

    const studentB = await User.create({
      firstName: 'Bob',
      lastName: 'Brown',
      email: `bob-${Date.now()}@example.com`,
      role: 'student',
      section: 'B'
    })

    const subject = await Subject.create({
      subjectName: 'Integration Testing',
      subjectCode: `INT-${Date.now()}`,
      instructorId: instructor._id,
      sections: ['A', 'B'],
      department: 'QA',
      isActive: true
    })

    const now = new Date()
    const session = await Session.create({
      subjectId: subject._id,
      startTime: now,
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      sessionDate: now,
      meetCode: `int-${Date.now()}`,
      status: 'scheduled'
    })

    await Attendance.create([
      {
        sessionId: session._id,
        instructorId: instructor._id,
        userId: studentA._id,
        studentName: 'Alice Anderson',
        status: 'present'
      },
      {
        sessionId: session._id,
        instructorId: instructor._id,
        userId: studentB._id,
        studentName: 'Bob Brown',
        status: 'late'
      }
    ])

    const token = jwt.sign(
      { userId: instructor._id, role: 'instructor' },
      JWT_SECRET
    )

    const path = `/api/instructor/reports/attendance-summary?includeDetails=true&subjectId=${subject._id.toString()}&section=A`
    const response = await performGetRequest(path, token)

    expect(response.status).toBe(200)
    expect(response.body?.success).toBe(true)

    const { summary, breakdown, details } = response.body.data
    expect(summary.presentCount).toBe(1)
    expect(summary.lateCount).toBe(0)
    expect(summary.absentCount).toBe(0)
    expect(Array.isArray(breakdown.bySubject)).toBe(true)
    expect(Array.isArray(breakdown.bySection)).toBe(true)
    expect(details.length).toBe(1)
    expect(details[0].studentSection).toBe('A')
  })

  it('rejects access for non-instructor roles', async () => {
    await clearCollections()

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'Dent',
      email: `student-${Date.now()}@example.com`,
      role: 'student'
    })

    const token = jwt.sign({ userId: student._id, role: 'student' }, JWT_SECRET)

    const response = await performGetRequest(
      '/api/instructor/reports/attendance-summary',
      token
    )

    expect(response.status).toBe(403)
    expect(response.body?.success).toBe(false)
  })
})
