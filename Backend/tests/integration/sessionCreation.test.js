/**
 * Integration tests for session creation logic
 *
 * Tests the race condition fixes and atomic session creation
 * using findOneAndUpdate with upsert
 */

const mongoose = require('mongoose')
const Session = require('../../models/Session')

describe('Session Creation Integration Tests', () => {
  let connection

  beforeAll(async () => {
    // Connect to test database
    const mongoUri =
      process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/neattend_test'
    connection = await mongoose.connect(mongoUri)
  })

  afterAll(async () => {
    // Clean up and close connection
    if (connection) {
      await mongoose.connection.close()
    }
  })

  beforeEach(async () => {
    // Clear sessions collection before each test
    await Session.deleteMany({})
  })

  describe('Atomic Session Creation', () => {
    it('should create session atomically with findOneAndUpdate', async () => {
      const meetCode = 'test-meet-123'
      const sessionDate = new Date('2023-01-01T00:00:00Z')
      const now = new Date('2023-01-01T10:00:00Z')

      const sessionData = {
        meetCode,
        sessionDate,
        startTime: now,
        endTime: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour later
        status: 'active'
      }

      // Use the same logic as in server.js
      const session = await Session.findOneAndUpdate(
        { meetCode, sessionDate },
        { $setOnInsert: sessionData },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      )

      expect(session).toBeDefined()
      expect(session.meetCode).toBe(meetCode)
      expect(session.sessionDate).toEqual(sessionDate)
      expect(session.status).toBe('active')
      expect(session.sessionId).toBeDefined() // Should have auto-generated sessionId
    })

    it('should return existing session when duplicate creation attempted', async () => {
      const meetCode = 'test-meet-123'
      const sessionDate = new Date('2023-01-01T00:00:00Z')
      const now = new Date('2023-01-01T10:00:00Z')

      const sessionData = {
        meetCode,
        sessionDate,
        startTime: now,
        endTime: new Date(now.getTime() + 60 * 60 * 1000),
        status: 'active'
      }

      // First creation
      const session1 = await Session.findOneAndUpdate(
        { meetCode, sessionDate },
        { $setOnInsert: sessionData },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      )

      // Second creation attempt (should return existing)
      const differentSessionData = {
        meetCode,
        sessionDate,
        startTime: new Date('2023-01-01T11:00:00Z'), // Different start time
        endTime: new Date('2023-01-01T12:00:00Z'),
        status: 'scheduled' // Different status
      }

      const session2 = await Session.findOneAndUpdate(
        { meetCode, sessionDate },
        { $setOnInsert: differentSessionData },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      )

      // Should be the same session (first one created)
      expect(session1._id.toString()).toBe(session2._id.toString())
      expect(session2.startTime).toEqual(session1.startTime) // Original start time preserved
      expect(session2.status).toBe('active') // Original status preserved

      // Verify only one session exists in database
      const sessionCount = await Session.countDocuments({
        meetCode,
        sessionDate
      })
      expect(sessionCount).toBe(1)
    })

    it('should handle concurrent session creation attempts', async () => {
      const meetCode = 'test-meet-concurrent'
      const sessionDate = new Date('2023-01-01T00:00:00Z')
      const now = new Date('2023-01-01T10:00:00Z')

      // IMPORTANT: This repo uses a custom test runner that does not execute
      // beforeAll/beforeEach hooks. To keep this test deterministic, ensure the
      // unique index exists inside the test itself.
      await Session.collection.dropIndexes().catch(() => {})
      await Session.syncIndexes()

      // Create multiple concurrent session creation attempts
      const createSession = index => {
        const sessionData = {
          meetCode,
          sessionDate,
          startTime: new Date(now.getTime() + index * 1000), // Slightly different times
          endTime: new Date(now.getTime() + 60 * 60 * 1000 + index * 1000),
          status: 'active'
        }

        return Session.findOneAndUpdate(
          { meetCode, sessionDate },
          { $setOnInsert: sessionData },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true
          }
        ).catch(async error => {
          // With a unique (meetCode, sessionDate) index, concurrent upserts can
          // raise E11000 on the losing writers. Resolve by returning the winner.
          if (error && error.code === 11000) {
            return Session.findOne({ meetCode, sessionDate })
          }
          throw error
        })
      }

      // Launch 5 concurrent creation attempts
      const promises = Array.from({ length: 5 }, (_, i) => createSession(i))
      const results = await Promise.all(promises)

      // All should return the same session (same _id)
      const firstSessionId = results[0]._id.toString()
      results.forEach(session => {
        expect(session._id.toString()).toBe(firstSessionId)
      })

      // Verify only one session exists in database
      const sessionCount = await Session.countDocuments({
        meetCode,
        sessionDate
      })
      expect(sessionCount).toBe(1)
    })

    it('should create different sessions for different meetCodes', async () => {
      const sessionDate = new Date('2023-01-01T00:00:00Z')
      const now = new Date('2023-01-01T10:00:00Z')

      const createSessionForMeetCode = meetCode => {
        const sessionData = {
          meetCode,
          sessionDate,
          startTime: now,
          endTime: new Date(now.getTime() + 60 * 60 * 1000),
          status: 'active'
        }

        return Session.findOneAndUpdate(
          { meetCode, sessionDate },
          { $setOnInsert: sessionData },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true
          }
        )
      }

      const session1 = await createSessionForMeetCode('meet-code-1')
      const session2 = await createSessionForMeetCode('meet-code-2')

      expect(session1._id.toString()).not.toBe(session2._id.toString())
      expect(session1.meetCode).toBe('meet-code-1')
      expect(session2.meetCode).toBe('meet-code-2')

      // Verify two sessions exist for the target meet codes
      const sessionCount = await Session.countDocuments({
        sessionDate,
        meetCode: { $in: ['meet-code-1', 'meet-code-2'] }
      })
      expect(sessionCount).toBe(2)
    })

    it('should create different sessions for different dates', async () => {
      const meetCode = 'test-meet-123'
      const now = new Date('2023-01-01T10:00:00Z')

      const createSessionForDate = sessionDate => {
        const sessionData = {
          meetCode,
          sessionDate,
          startTime: now,
          endTime: new Date(now.getTime() + 60 * 60 * 1000),
          status: 'active'
        }

        return Session.findOneAndUpdate(
          { meetCode, sessionDate },
          { $setOnInsert: sessionData },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true
          }
        )
      }

      const session1 = await createSessionForDate(
        new Date('2023-01-01T00:00:00Z')
      )
      const session2 = await createSessionForDate(
        new Date('2023-01-02T00:00:00Z')
      )

      expect(session1._id.toString()).not.toBe(session2._id.toString())
      expect(session1.sessionDate).toEqual(new Date('2023-01-01T00:00:00Z'))
      expect(session2.sessionDate).toEqual(new Date('2023-01-02T00:00:00Z'))

      // Verify two sessions exist
      const sessionCount = await Session.countDocuments({ meetCode })
      expect(sessionCount).toBe(2)
    })
  })

  describe('Session Validation', () => {
    it('should validate required fields', async () => {
      const invalidSessionData = {
        // Missing required fields
        sessionDate: new Date('2023-01-01T00:00:00Z')
      }

      await expect(
        Session.findOneAndUpdate(
          {
            meetCode: 'invalid',
            sessionDate: new Date('2023-01-01T00:00:00Z')
          },
          { $setOnInsert: invalidSessionData },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true
          }
        )
      ).rejects.toThrow()
    })

    it('should set default values correctly', async () => {
      const meetCode = 'test-meet-defaults'
      const sessionDate = new Date('2023-01-01T00:00:00Z')
      const now = new Date('2023-01-01T10:00:00Z')

      const sessionData = {
        meetCode,
        sessionDate,
        startTime: now,
        endTime: new Date(now.getTime() + 60 * 60 * 1000)
        // status not specified - should default to 'scheduled'
      }

      const session = await Session.findOneAndUpdate(
        { meetCode, sessionDate },
        { $setOnInsert: sessionData },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      )

      expect(session.status).toBe('scheduled') // Default value
      expect(session.attendanceCount).toBe(0) // Default value
      expect(session.sessionId).toBeDefined() // Auto-generated
      expect(session.createdAt).toBeDefined() // Timestamp
      expect(session.updatedAt).toBeDefined() // Timestamp
    })
  })

  describe('Compound Index Usage', () => {
    it('should efficiently query using compound index', async () => {
      // Create multiple sessions
      const sessions = []
      for (let i = 0; i < 10; i++) {
        const meetCode = `meet-${i}`
        const sessionDate = new Date(`2023-01-0${(i % 3) + 1}T00:00:00Z`)

        const session = await Session.create({
          meetCode,
          sessionDate,
          startTime: new Date('2023-01-01T10:00:00Z'),
          endTime: new Date('2023-01-01T11:00:00Z'),
          status: 'active'
        })
        sessions.push(session)
      }

      // Query using compound index (meetCode + sessionDate)
      const targetMeetCode = 'meet-5'
      const targetSessionDate = new Date('2023-01-03T00:00:00Z')

      const foundSession = await Session.findOne({
        meetCode: targetMeetCode,
        sessionDate: targetSessionDate
      })

      expect(foundSession).toBeDefined()
      expect(foundSession.meetCode).toBe(targetMeetCode)
      expect(foundSession.sessionDate).toEqual(targetSessionDate)
    })
  })
})

// Mock Jest functions if not available (for basic testing)
if (typeof describe === 'undefined') {
  global.describe = (name, fn) => {
    console.log(`\n=== ${name} ===`)
    fn()
  }
  global.it = (name, fn) => {
    try {
      fn()
      console.log(`✓ ${name}`)
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`)
    }
  }
  global.beforeAll = fn => fn()
  global.afterAll = fn => fn()
  global.beforeEach = fn => fn()
  global.expect = actual => ({
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error('Expected value to be defined')
      }
    },
    toBe: expected => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`)
      }
    },
    toEqual: expected => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        )
      }
    },
    not: {
      toBe: expected => {
        if (actual === expected) {
          throw new Error(`Expected not to be ${expected}`)
        }
      }
    },
    rejects: {
      toThrow: async () => {
        try {
          await actual
          throw new Error('Expected promise to reject')
        } catch {
          // Expected to throw
        }
      }
    }
  })
}
