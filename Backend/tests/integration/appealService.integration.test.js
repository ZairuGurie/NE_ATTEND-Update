/**
 * Integration tests for appealService using a real MongoDB database.
 *
 * These tests cover createAppeal and updateAppealStatus working against
 * real Attendance/Session/Subject/User documents.
 */

const Appeal = require('../../models/Appeal')
const Attendance = require('../../models/Attendance')
const Session = require('../../models/Session')
const Subject = require('../../models/Subject')
const User = require('../../models/User')
const mongoose = require('mongoose')
const {
  createAppeal,
  updateAppealStatus,
  listAppealsForStudent,
  getAppealById
} = require('../../services/appealService')

describe('appealService Integration', () => {
  it('createAppeal persists appeal with resolved context and attachments, and updateAppealStatus updates status', async () => {
    // Clean relevant collections
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    // Instructor and student
    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'Appeal',
      email: `inst-appeal+${Date.now()}@example.com`,
      role: 'instructor'
    })

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'Appeal',
      email: `stu-appeal+${Date.now()}@example.com`,
      role: 'student'
    })

    // Subject and session
    const subject = await Subject.create({
      subjectName: 'Appeals Subject',
      subjectCode: `APPEAL-${Date.now()}`,
      instructorId: instructor._id,
      sections: ['A'],
      department: 'Appeals'
    })

    const startTime = new Date('2024-01-01T10:00:00Z')
    const endTime = new Date('2024-01-01T11:00:00Z')

    const session = await Session.create({
      subjectId: subject._id,
      sessionDate: startTime,
      startTime,
      endTime,
      meetCode: 'appeal-meet-1',
      status: 'completed'
    })

    // Attendance record for the student
    const attendance = await Attendance.create({
      sessionId: session._id,
      userId: student._id,
      instructorId: instructor._id,
      studentName: `${student.firstName} ${student.lastName}`,
      status: 'absent'
    })

    // Create appeal
    const reason = 'I had connectivity issues during the class.'
    const notes = 'My internet went down for 30 minutes.'

    const appeal = await createAppeal({
      attendanceId: attendance._id,
      studentId: student._id,
      reason,
      studentNotes: notes,
      attachments: [
        {
          url: 'https://example.com/proof.png',
          name: 'Proof',
          mimeType: 'image/png'
        }
      ]
    })

    expect(appeal).toBeDefined()
    expect(appeal.attendanceId.toString()).toBe(attendance._id.toString())
    expect(appeal.sessionId.toString()).toBe(session._id.toString())
    expect(appeal.subjectId.toString()).toBe(subject._id.toString())
    expect(appeal.studentId.toString()).toBe(student._id.toString())
    expect(appeal.instructorId.toString()).toBe(instructor._id.toString())
    expect(appeal.status).toBe('pending')
    expect(appeal.attachments.length).toBe(1)
    expect(appeal.events.length).toBe(1)
    expect(appeal.events[0].type).toBe('submitted')

    // Calling createAppeal again for same attendance/student should return existing appeal
    const appealAgain = await createAppeal({
      attendanceId: attendance._id,
      studentId: student._id,
      reason,
      studentNotes: notes
    })

    expect(appealAgain._id.toString()).toBe(appeal._id.toString())

    const appealCount = await Appeal.countDocuments({})
    expect(appealCount).toBe(1)

    // Update status to approved
    const updated = await updateAppealStatus({
      appealId: appeal._id,
      status: 'approved',
      decidedBy: instructor._id,
      decisionNotes: 'Approved after reviewing connectivity evidence.'
    })

    expect(updated.status).toBe('approved')
    expect(updated.resolution.decidedBy.toString()).toBe(
      instructor._id.toString()
    )
    expect(updated.resolution.decisionNotes).toBe(
      'Approved after reviewing connectivity evidence.'
    )
    expect(updated.resolution.decidedAt).toBeDefined()

    // Status-change event should be appended
    const updatedAppeal = await Appeal.findById(appeal._id).lean()
    const statusEvents = (updatedAppeal.events || []).filter(
      e => e.type === 'status-change'
    )
    expect(statusEvents.length).toBe(1)

    // listAppealsForStudent should include the updated appeal
    const studentAppeals = await listAppealsForStudent(student._id)
    expect(studentAppeals.length).toBe(1)
    expect(studentAppeals[0].status).toBe('approved')
  })

  it('getAppealById throws for invalid ObjectId', async () => {
    await Appeal.deleteMany({})

    const promise = getAppealById('not-a-valid-id')
    await expect(promise).rejects.toThrow()
  })

  it('updateAppealStatus throws when appeal does not exist', async () => {
    await Appeal.deleteMany({})

    const fakeId = new mongoose.Types.ObjectId().toString()
    const promise = updateAppealStatus({
      appealId: fakeId,
      status: 'approved',
      decidedBy: fakeId
    })

    await expect(promise).rejects.toThrow()
  })

  it('createAppeal throws when attendance does not belong to student', async () => {
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'WrongOwn',
      email: `inst-wrongown+${Date.now()}@example.com`,
      role: 'instructor'
    })

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'Correct',
      email: `stu-correct+${Date.now()}@example.com`,
      role: 'student'
    })

    const otherStudent = await User.create({
      firstName: 'Stu',
      lastName: 'Other',
      email: `stu-other+${Date.now()}@example.com`,
      role: 'student'
    })

    const subject = await Subject.create({
      subjectName: 'Ownership Subject',
      subjectCode: `OWN-${Date.now()}`,
      instructorId: instructor._id,
      sections: ['A'],
      department: 'Appeals'
    })

    const startTime = new Date('2024-02-01T10:00:00Z')
    const endTime = new Date('2024-02-01T11:00:00Z')

    const session = await Session.create({
      subjectId: subject._id,
      sessionDate: startTime,
      startTime,
      endTime,
      meetCode: 'appeal-own-1',
      status: 'completed'
    })

    // Attendance belongs to otherStudent, but we will pass student._id
    const attendance = await Attendance.create({
      sessionId: session._id,
      userId: otherStudent._id,
      instructorId: instructor._id,
      studentName: `${otherStudent.firstName} ${otherStudent.lastName}`,
      status: 'absent'
    })

    const promise = createAppeal({
      attendanceId: attendance._id,
      studentId: student._id,
      reason: 'Test mismatched ownership'
    })

    await expect(promise).rejects.toThrow()
  })

  it('createAppeal throws for invalid attendance identifier', async () => {
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'InvalidAtt',
      email: `stu-invalidatt+${Date.now()}@example.com`,
      role: 'student'
    })

    const promise = createAppeal({
      attendanceId: 'not-a-valid-id',
      studentId: student._id,
      reason: 'Invalid attendance id'
    })

    await expect(promise).rejects.toThrow()
  })

  it('createAppeal throws when attendance record does not exist', async () => {
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'MissingAtt',
      email: `stu-missingatt+${Date.now()}@example.com`,
      role: 'student'
    })

    const missingAttendanceId = new mongoose.Types.ObjectId()

    const promise = createAppeal({
      attendanceId: missingAttendanceId,
      studentId: student._id,
      reason: 'Attendance does not exist'
    })

    await expect(promise).rejects.toThrow()
  })

  it('createAppeal throws when attendance has no session reference', async () => {
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'NoSessionRef',
      email: `stu-nosessionref+${Date.now()}@example.com`,
      role: 'student'
    })

    // Insert attendance without sessionId using the raw collection API
    const insertResult = await Attendance.collection.insertOne({
      userId: student._id,
      status: 'absent',
      studentName: `${student.firstName} ${student.lastName}`
    })

    const promise = createAppeal({
      attendanceId: insertResult.insertedId,
      studentId: student._id,
      reason: 'Missing session reference'
    })

    await expect(promise).rejects.toThrow()
  })

  it('createAppeal throws when session has no subject reference', async () => {
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'NoSubjectRef',
      email: `inst-nosubjectref+${Date.now()}@example.com`,
      role: 'instructor'
    })

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'NoSubjectRef',
      email: `stu-nosubjectref+${Date.now()}@example.com`,
      role: 'student'
    })

    const startTime = new Date('2024-03-01T10:00:00Z')
    const endTime = new Date('2024-03-01T11:00:00Z')

    // Session is missing subjectId (allowed by schema)
    const session = await Session.create({
      sessionDate: startTime,
      startTime,
      endTime,
      meetCode: 'appeal-nosubject-1',
      status: 'completed'
    })

    const attendance = await Attendance.create({
      sessionId: session._id,
      userId: student._id,
      instructorId: instructor._id,
      studentName: `${student.firstName} ${student.lastName}`,
      status: 'absent'
    })

    const promise = createAppeal({
      attendanceId: attendance._id,
      studentId: student._id,
      reason: 'Session missing subject reference'
    })

    await expect(promise).rejects.toThrow()
  })

  it('createAppeal throws when subject referenced by session does not exist', async () => {
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const instructor = await User.create({
      firstName: 'Inst',
      lastName: 'MissingSubject',
      email: `inst-missub+${Date.now()}@example.com`,
      role: 'instructor'
    })

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'MissingSubject',
      email: `stu-missub+${Date.now()}@example.com`,
      role: 'student'
    })

    const fakeSubjectId = new mongoose.Types.ObjectId()
    const startTime = new Date('2024-04-01T10:00:00Z')
    const endTime = new Date('2024-04-01T11:00:00Z')

    // Session references a non-existent subject
    const session = await Session.create({
      subjectId: fakeSubjectId,
      sessionDate: startTime,
      startTime,
      endTime,
      meetCode: 'appeal-missub-1',
      status: 'completed'
    })

    const attendance = await Attendance.create({
      sessionId: session._id,
      userId: student._id,
      instructorId: instructor._id,
      studentName: `${student.firstName} ${student.lastName}`,
      status: 'absent'
    })

    const promise = createAppeal({
      attendanceId: attendance._id,
      studentId: student._id,
      reason: 'Subject not found for session'
    })

    await expect(promise).rejects.toThrow()
  })

  it('createAppeal throws when neither attendance nor subject has instructorId', async () => {
    await Promise.all([
      Appeal.deleteMany({}),
      Attendance.deleteMany({}),
      Session.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({})
    ])

    const student = await User.create({
      firstName: 'Stu',
      lastName: 'NoInstructor',
      email: `stu-noinstructor+${Date.now()}@example.com`,
      role: 'student'
    })

    // Insert subject without instructorId using raw collection to bypass schema required
    const subjectInsert = await Subject.collection.insertOne({
      subjectName: 'No Instructor Subject',
      subjectCode: `NOINST-${Date.now()}`,
      sections: ['A'],
      department: 'Appeals'
    })

    const subjectId = subjectInsert.insertedId

    const startTime = new Date('2024-05-01T10:00:00Z')
    const endTime = new Date('2024-05-01T11:00:00Z')

    const session = await Session.create({
      subjectId,
      sessionDate: startTime,
      startTime,
      endTime,
      meetCode: 'appeal-noinst-1',
      status: 'completed'
    })

    // Attendance has no instructorId set
    const attendanceInsert = await Attendance.collection.insertOne({
      sessionId: session._id,
      userId: student._id,
      studentName: `${student.firstName} ${student.lastName}`,
      status: 'absent'
    })

    const promise = createAppeal({
      attendanceId: attendanceInsert.insertedId,
      studentId: student._id,
      reason: 'No instructor determinable'
    })

    await expect(promise).rejects.toThrow()
  })
})
