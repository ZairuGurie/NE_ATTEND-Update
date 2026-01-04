/**
 * Integration tests for attendanceTokenService using a real MongoDB database.
 *
 * These tests verify that autoIssueTokensForSession issues tokens for all
 * students enrolled in the subject's sections.
 */

const AttendanceToken = require('../../models/AttendanceToken')
const Subject = require('../../models/Subject')
const Session = require('../../models/Session')
const User = require('../../models/User')
const {
  autoIssueTokensForSession
} = require('../../services/attendanceTokenService')

describe('attendanceTokenService Integration', () => {
  it('autoIssueTokensForSession issues tokens for all students in subject sections', async () => {
    // Clean collections used by this test
    await Promise.all([
      AttendanceToken.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    // Create instructor
    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'One',
      email: `inst1+${Date.now()}@example.com`,
      role: 'instructor'
    })

    // Create students in sections A and B
    const student1 = await User.create({
      firstName: 'Stu',
      lastName: 'One',
      email: `stu1+${Date.now()}@example.com`,
      role: 'student',
      section: 'A'
    })

    const student2 = await User.create({
      firstName: 'Stu',
      lastName: 'Two',
      email: `stu2+${Date.now()}@example.com`,
      role: 'student',
      section: 'B'
    })

    // Student in a different section should not receive a token
    await User.create({
      firstName: 'Stu',
      lastName: 'Other',
      email: `stu3+${Date.now()}@example.com`,
      role: 'student',
      section: 'C'
    })

    // Create subject with sections A and B
    const subject = await Subject.create({
      subjectName: 'Integration Testing 101',
      subjectCode: `INT101-${Date.now()}`,
      instructorId: instructor._id,
      sections: ['A', 'B'],
      meetingLink: 'https://meet.google.com/abc-defg-hij',
      department: 'Testing Department',
      isActive: true
    })

    const now = new Date()
    const session = await Session.create({
      subjectId: subject._id,
      startTime: now,
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      sessionDate: now,
      meetCode: 'abc-defg-hij',
      status: 'scheduled'
    })

    const result = await autoIssueTokensForSession({
      sessionId: session._id
    })

    // Should issue one token per matching student (sections A and B)
    expect(result.issued).toBe(2)

    const tokens = await AttendanceToken.find({ sessionId: session._id }).lean()
    expect(tokens.length).toBe(2)

    const issuedUserIds = tokens.map(t => t.userId.toString()).sort()
    const expectedUserIds = [
      student1._id.toString(),
      student2._id.toString()
    ].sort()

    expect(issuedUserIds).toEqual(expectedUserIds)
  })

  it('autoIssueTokensForSession returns reason when subject has no sections', async () => {
    // Clean collections used by this test
    await Promise.all([
      AttendanceToken.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'NoSec',
      email: `inst-nosec+${Date.now()}@example.com`,
      role: 'instructor'
    })

    const subject = await Subject.create({
      subjectName: 'No Sections Subject',
      subjectCode: `NOSEC-${Date.now()}`,
      instructorId: instructor._id,
      sections: [], // no sections
      meetingLink: 'https://meet.google.com/xyz-nosec-123',
      department: 'Testing Department',
      isActive: true
    })

    const now = new Date()
    const session = await Session.create({
      subjectId: subject._id,
      startTime: now,
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      sessionDate: now,
      meetCode: 'xyz-nosec-123',
      status: 'scheduled'
    })

    const result = await autoIssueTokensForSession({
      sessionId: session._id
    })

    expect(result.issued).toBe(0)
    expect(result.reason).toBe('subject_has_no_sections')

    const tokens = await AttendanceToken.find({ sessionId: session._id }).lean()
    expect(tokens.length).toBe(0)
  })
})
