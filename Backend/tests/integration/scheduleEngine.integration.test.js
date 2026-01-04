/**
 * Integration tests for scheduleEngine.ensureSessionsForWindow using
 * a real MongoDB database.
 */

const Attendance = require('../../models/Attendance')
const AttendanceToken = require('../../models/AttendanceToken')
const Subject = require('../../models/Subject')
const Session = require('../../models/Session')
const User = require('../../models/User')
const { ensureSessionsForWindow } = require('../../services/scheduleEngine')

describe('scheduleEngine.ensureSessionsForWindow Integration', () => {
  it('creates scheduled sessions, issues tokens and baseline attendance', async () => {
    // Clean collections used by this test
    await Promise.all([
      Attendance.deleteMany({}),
      AttendanceToken.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const logger = {
      log: () => {},
      error: () => {}
    }

    // Instructor
    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'Sched',
      email: `inst-sched+${Date.now()}@example.com`,
      role: 'instructor'
    })

    // Two students in section A
    const student1 = await User.create({
      firstName: 'Stu',
      lastName: 'Sched1',
      email: `stu-sched1+${Date.now()}@example.com`,
      role: 'student',
      section: 'A'
    })

    const student2 = await User.create({
      firstName: 'Stu',
      lastName: 'Sched2',
      email: `stu-sched2+${Date.now()}@example.com`,
      role: 'student',
      section: 'A'
    })

    // Subject scheduled for a specific day and window
    // IMPORTANT: Use UTC-based dates so this test is stable across local timezones.
    const baseDate = new Date(Date.UTC(2024, 0, 1)) // 2024-01-01 UTC
    const weekdayName = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ][baseDate.getUTCDay()]

    const subject = await Subject.create({
      subjectName: 'Scheduled Subject',
      subjectCode: `SCHED-${Date.now()}`,
      instructorId: instructor._id,
      sections: ['A'],
      schedule: {
        startDate: baseDate,
        endDate: baseDate,
        weekdays: [weekdayName],
        startTime: '10:00',
        endTime: '11:00'
      },
      meetingLink: 'https://meet.google.com/abc-defg-hij',
      department: 'Scheduling'
    })

    const windowStart = new Date(Date.UTC(2024, 0, 1, 0, 0, 0))
    const windowEnd = new Date(Date.UTC(2024, 0, 1, 23, 59, 59))

    const summary = await ensureSessionsForWindow({
      windowStart,
      windowEnd,
      logger
    })

    expect(summary.subjectsProcessed).toBeGreaterThanOrEqual(1)
    expect(summary.sessionsEnsured).toBeGreaterThanOrEqual(1)
    expect(summary.sessionsCreated).toBeGreaterThanOrEqual(1)

    const sessions = await Session.find({ subjectId: subject._id }).lean()
    expect(sessions.length).toBe(1)

    const session = sessions[0]

    // Tokens should be issued for both students in section A
    const tokens = await AttendanceToken.find({ sessionId: session._id }).lean()
    expect(tokens.length).toBe(2)

    const tokenUserIds = tokens.map(t => t.userId.toString()).sort()
    const expectedUserIds = [
      student1._id.toString(),
      student2._id.toString()
    ].sort()
    expect(tokenUserIds).toEqual(expectedUserIds)

    // Baseline attendance records should exist for both students
    const attendance = await Attendance.find({ sessionId: session._id }).lean()
    expect(attendance.length).toBe(2)

    const absentCount = attendance.filter(a => a.status === 'absent').length
    expect(absentCount).toBe(2)
  })

  it('skips subjects without a valid meet link and creates no sessions', async () => {
    await Promise.all([
      Attendance.deleteMany({}),
      AttendanceToken.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const logger = {
      log: () => {},
      error: () => {}
    }

    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'NoLink',
      email: `inst-nolink+${Date.now()}@example.com`,
      role: 'instructor'
    })

    const baseDate = new Date(2024, 0, 2)
    const weekdayName = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ][baseDate.getDay()]

    await Subject.create({
      subjectName: 'No Link Subject',
      subjectCode: `NOLINK-${Date.now()}`,
      instructorId: instructor._id,
      sections: ['A'],
      schedule: {
        startDate: baseDate,
        endDate: baseDate,
        weekdays: [weekdayName],
        startTime: '10:00',
        endTime: '11:00'
      },
      meetingLink: '', // no valid meet code
      department: 'Scheduling'
    })

    const windowStart = new Date(2024, 0, 2, 0, 0, 0)
    const windowEnd = new Date(2024, 0, 2, 23, 59, 59)

    const summary = await ensureSessionsForWindow({
      windowStart,
      windowEnd,
      logger
    })

    expect(summary.subjectsProcessed).toBeGreaterThanOrEqual(1)
    expect(summary.subjectsSkipped).toBeGreaterThanOrEqual(1)
    expect(summary.sessionsEnsured).toBe(0)
    expect(summary.sessionsCreated).toBe(0)

    const sessions = await Session.find({}).lean()
    expect(sessions.length).toBe(0)
    const tokens = await AttendanceToken.find({}).lean()
    expect(tokens.length).toBe(0)
    const attendance = await Attendance.find({}).lean()
    expect(attendance.length).toBe(0)
  })
})
