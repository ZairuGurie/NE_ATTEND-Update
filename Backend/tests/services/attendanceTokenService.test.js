/**
 * Unit tests for attendanceTokenService
 */

process.env.NODE_ENV = 'test'
process.env.NE_ATTEND_TEST_ALLOW_NO_DB = '1'

describe('attendanceTokenService', () => {
  describe('computeValidityWindow', () => {
    it('computes validFrom and expiresAt based on session start/end and env config', () => {
      const modulePath = require.resolve(
        '../../services/attendanceTokenService'
      )

      const originalLead = process.env.TOKEN_VALID_LEAD_MINUTES
      const originalGrace = process.env.TOKEN_GRACE_MINUTES

      // Ensure we load the module with our desired test configuration
      delete require.cache[modulePath]
      process.env.TOKEN_VALID_LEAD_MINUTES = '10'
      process.env.TOKEN_GRACE_MINUTES = '5'

      const {
        computeValidityWindow
      } = require('../../services/attendanceTokenService')

      const start = new Date('2024-01-01T10:00:00Z')
      const end = new Date('2024-01-01T11:00:00Z')

      const { validFrom, expiresAt } = computeValidityWindow({
        startTime: start,
        endTime: end
      })

      const leadMinutes = (start.getTime() - validFrom.getTime()) / 60000
      const graceMinutes = (expiresAt.getTime() - end.getTime()) / 60000

      expect(leadMinutes).toBe(10)
      expect(graceMinutes).toBe(5)

      // Restore environment and cache for other tests
      process.env.TOKEN_VALID_LEAD_MINUTES = originalLead
      process.env.TOKEN_GRACE_MINUTES = originalGrace
      delete require.cache[modulePath]
    })
  })

  describe('markTokenConsumed', () => {
    it('marks token as consumed, sets consumedAt/consumedBy and calls save()', async () => {
      let saved = false
      const fakeToken = {
        consumed: false,
        consumedAt: null,
        consumedBy: null,
        save: async () => {
          saved = true
        }
      }

      const before = Date.now()

      const {
        markTokenConsumed
      } = require('../../services/attendanceTokenService')

      await markTokenConsumed({
        tokenRecord: fakeToken,
        consumedBy: 'tester-user'
      })

      expect(fakeToken.consumed).toBe(true)
      expect(fakeToken.consumedBy).toBe('tester-user')
      expect(saved).toBe(true)
      expect(fakeToken.consumedAt instanceof Date).toBe(true)
      expect(fakeToken.consumedAt.getTime()).toBeGreaterThanOrEqual(before)
    })
  })
})
