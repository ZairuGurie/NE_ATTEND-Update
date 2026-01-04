/**
 * Unit tests for appealService helpers that do not require a database
 */

process.env.NODE_ENV = 'test'
process.env.NE_ATTEND_TEST_ALLOW_NO_DB = '1'

const { assertAppealAccess } = require('../../services/appealService')

describe('appealService.assertAppealAccess', () => {
  const baseAppeal = {
    studentId: 'student-1',
    instructorId: 'instructor-1'
  }

  it('allows admin access to any appeal', () => {
    const requester = { role: 'admin', userId: 'admin-user' }
    const result = assertAppealAccess(baseAppeal, requester)
    expect(result).toBe(true)
  })

  it('allows owning student to access their appeal', () => {
    const requester = { role: 'student', userId: 'student-1' }
    const result = assertAppealAccess(baseAppeal, requester)
    expect(result).toBe(true)
  })

  it('allows assigned instructor to access appeal', () => {
    const requester = { role: 'instructor', userId: 'instructor-1' }
    const result = assertAppealAccess(baseAppeal, requester)
    expect(result).toBe(true)
  })

  it('denies other students', () => {
    const requester = { role: 'student', userId: 'student-2' }
    expect(() => assertAppealAccess(baseAppeal, requester)).toThrow('Forbidden')
  })

  it('denies other instructors', () => {
    const requester = { role: 'instructor', userId: 'instructor-2' }
    expect(() => assertAppealAccess(baseAppeal, requester)).toThrow('Forbidden')
  })

  it('denies access when appeal or requester is missing', () => {
    expect(() => assertAppealAccess(null, null)).toThrow('Forbidden')
  })
})
