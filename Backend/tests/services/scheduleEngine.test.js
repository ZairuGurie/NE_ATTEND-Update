/**
 * Unit tests for scheduleEngine helpers that can run without a live database
 */

process.env.NODE_ENV = 'test'
process.env.NE_ATTEND_TEST_ALLOW_NO_DB = '1'

const { ensureSessionsForWindow } = require('../../services/scheduleEngine')

describe('scheduleEngine.ensureSessionsForWindow', () => {
  it('rejects when windowEnd is not after windowStart', async () => {
    const start = new Date('2024-01-01T10:00:00Z')
    const end = new Date('2024-01-01T09:00:00Z')

    const promise = ensureSessionsForWindow({
      windowStart: start,
      windowEnd: end,
      logger: { log: () => {} }
    })

    await expect(promise).rejects.toThrow()
  })
})
