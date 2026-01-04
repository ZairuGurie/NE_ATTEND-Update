/**
 * Unit tests for status utility functions
 *
 * Tests the core status determination logic that was refactored from
 * the complex nested conditions in routes/attendance.js
 */

const {
  deriveRawStatus,
  formatStatusLabel,
  parseHms,
  toIsoWithBase,
  formatHmsFromDate,
  determineFinalStatus,
  applyStatusRules
} = require('../../utils/statusUtils')

describe('StatusUtils', () => {
  describe('deriveRawStatus', () => {
    it('should return existing rawStatus if present', () => {
      const participant = { rawStatus: 'present' }
      const result = deriveRawStatus(participant)
      expect(result).toBe('present')
    })

    it('should return status if rawStatus not present', () => {
      const participant = { status: 'late' }
      const result = deriveRawStatus(participant)
      expect(result).toBe('late')
    })

    it('should return pending for explicit pending status', () => {
      const participant = { status: 'pending' }
      const result = deriveRawStatus(participant)
      expect(result).toBe('pending')
    })

    it('should return present for synchronized timeout when meeting ended', () => {
      const participant = { timeoutSynchronized: true }
      const options = {
        meetingEnded: true,
        instructorLeaveTimeIso: '2023-01-01T10:00:00Z'
      }
      const result = deriveRawStatus(participant, options)
      expect(result).toBe('present')
    })

    it('should return left for participant with leave time', () => {
      const participant = { leaveTime: '10:30:00' }
      const result = deriveRawStatus(participant)
      expect(result).toBe('left')
    })

    it('should return joined for short duration', () => {
      const participant = { attendedDuration: 30 }
      const result = deriveRawStatus(participant)
      expect(result).toBe('joined')
    })

    it('should return present as default', () => {
      const participant = {}
      const result = deriveRawStatus(participant)
      expect(result).toBe('present')
    })
  })

  describe('formatStatusLabel', () => {
    it('should format status labels correctly', () => {
      expect(formatStatusLabel('pending')).toBe('Pending')
      expect(formatStatusLabel('left')).toBe('Left Meeting')
      expect(formatStatusLabel('left meeting')).toBe('Left Meeting')
      expect(formatStatusLabel('late')).toBe('Late')
      expect(formatStatusLabel('joined')).toBe('Just Joined')
      expect(formatStatusLabel('absent')).toBe('Absent')
      expect(formatStatusLabel('present')).toBe('Present')
      expect(formatStatusLabel('')).toBe('Unknown')
      expect(formatStatusLabel(null)).toBe('Unknown')
    })
  })

  describe('parseHms', () => {
    it('should parse valid time strings', () => {
      expect(parseHms('10:30:45')).toEqual({ h: 10, m: 30, s: 45 })
      expect(parseHms('9:15:00')).toEqual({ h: 9, m: 15, s: 0 })
      expect(parseHms('23:59:59')).toEqual({ h: 23, m: 59, s: 59 })
    })

    it('should handle partial time strings', () => {
      expect(parseHms('10:30')).toEqual({ h: 10, m: 30, s: 0 })
      expect(parseHms('10')).toEqual({ h: 10, m: 0, s: 0 })
    })

    it('should return null for invalid input', () => {
      expect(parseHms('')).toBeNull()
      expect(parseHms(null)).toBeNull()
      expect(parseHms('invalid')).toBeNull()
      expect(parseHms('25:00:00')).toEqual({ h: 25, m: 0, s: 0 }) // Allows invalid times
    })
  })

  describe('toIsoWithBase', () => {
    const baseDate = new Date('2023-01-01T00:00:00Z')

    it('should parse ISO date strings directly', () => {
      const isoString = '2023-01-01T10:30:00Z'
      const result = toIsoWithBase(isoString, baseDate)
      expect(result).toEqual(new Date(isoString))
    })

    it('should combine time string with base date', () => {
      const result = toIsoWithBase('10:30:45', baseDate)
      expect(result.getHours()).toBe(10)
      expect(result.getMinutes()).toBe(30)
      expect(result.getSeconds()).toBe(45)
      expect(result.getDate()).toBe(baseDate.getDate())
    })

    it('should return null for invalid input', () => {
      expect(toIsoWithBase('', baseDate)).toBeNull()
      expect(toIsoWithBase(null, baseDate)).toBeNull()
      expect(toIsoWithBase('invalid', baseDate)).toBeNull()
    })

    it('should handle missing base date', () => {
      const result = toIsoWithBase('10:30:00')
      expect(result.getHours()).toBe(10)
      expect(result.getMinutes()).toBe(30)
    })
  })

  describe('formatHmsFromDate', () => {
    it('should format Date objects to HH:MM:SS', () => {
      // Use local-time constructor so the expectation is timezone-independent
      const date = new Date(2023, 0, 1, 10, 30, 45)
      const result = formatHmsFromDate(date)
      expect(result).toBe('10:30:45')
    })

    it('should pad single digits with zeros', () => {
      const date = new Date(2023, 0, 1, 9, 5, 3)
      const result = formatHmsFromDate(date)
      expect(result).toBe('09:05:03')
    })

    it('should return null for invalid input', () => {
      expect(formatHmsFromDate(null)).toBeNull()
      expect(formatHmsFromDate('invalid')).toBeNull()
      expect(formatHmsFromDate(new Date('invalid'))).toBeNull()
    })
  })

  describe('determineFinalStatus', () => {
    describe('for instructors', () => {
      it('should return late for late instructor', () => {
        const context = {
          isInstructor: true,
          rawStatus: 'late',
          hasJoinTime: true,
          hasLeaveTime: false
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('late')
        expect(result.pendingSince).toBeNull()
      })

      it('should return absent for instructor who never joined', () => {
        const context = {
          isInstructor: true,
          hasJoinTime: false
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('absent')
      })

      it('should return present for instructor who left (they were host)', () => {
        const context = {
          isInstructor: true,
          hasJoinTime: true,
          hasLeaveTime: true,
          instructorLeaveTimeIso: '2023-01-01T11:00:00Z',
          wasSynchronized: false
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('present')
      })
    })

    describe('for students when meeting ended', () => {
      it('should return present for synchronized student', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: '2023-01-01T11:00:00Z',
          wasSynchronized: true
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('present')
        expect(result.pendingSince).toBeNull()
      })

      it('should return present for student currently in meeting', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: '2023-01-01T11:00:00Z',
          wasSynchronized: false,
          isCurrentlyInMeeting: true
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('present')
      })

      it('should return present for student who returned after leaving', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: '2023-01-01T11:00:00Z',
          wasSynchronized: false,
          isCurrentlyInMeeting: false,
          lastReturnTime: new Date('2023-01-01T10:45:00Z'),
          lastLeaveTime: new Date('2023-01-01T10:30:00Z')
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('present')
      })

      it('should return absent for student who never joined', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: '2023-01-01T11:00:00Z',
          wasSynchronized: false,
          hasJoinTime: false
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('absent')
      })

      it('should return absent for student who left and never returned', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: '2023-01-01T11:00:00Z',
          wasSynchronized: false,
          hasJoinTime: true,
          hasLeaveTime: true,
          lastReturnTime: null,
          isCurrentlyInMeeting: false
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('absent')
      })
    })

    describe('for students during ongoing meeting', () => {
      it('should return absent for student who never joined', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: null,
          hasJoinTime: false
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('absent')
        expect(result.pendingSince).toBeNull()
      })

      it('should return present for student currently in meeting', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: null,
          hasJoinTime: true,
          isCurrentlyInMeeting: true,
          rawStatus: 'present'
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('present')
        expect(result.pendingSince).toBeNull()
      })

      it('should return late for late student currently in meeting', () => {
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: null,
          hasJoinTime: true,
          isCurrentlyInMeeting: true,
          rawStatus: 'late'
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('late')
      })

      it('should return pending for student who left during meeting', () => {
        const leaveDate = new Date('2023-01-01T10:30:00Z')
        const context = {
          isInstructor: false,
          instructorLeaveTimeIso: null,
          hasJoinTime: true,
          hasLeaveTime: true,
          isCurrentlyInMeeting: false,
          wasSynchronized: false,
          leaveDate
        }
        const result = determineFinalStatus(context)
        expect(result.finalStatus).toBe('pending')
        expect(result.pendingSince).toEqual(leaveDate)
      })
    })
  })

  describe('applyStatusRules', () => {
    it('should apply tardiness rule to present students', () => {
      const rules = {
        isTardy: true,
        sessionIsDuringAddDrop: false,
        instructorLate: false
      }
      const result = applyStatusRules('present', rules)
      expect(result).toBe('late')
    })

    it('should not apply tardiness rule during add/drop period', () => {
      const rules = {
        isTardy: true,
        sessionIsDuringAddDrop: true,
        instructorLate: false
      }
      const result = applyStatusRules('present', rules)
      expect(result).toBe('present')
    })

    it('should apply instructor lateness rule', () => {
      const rules = {
        isTardy: false,
        sessionIsDuringAddDrop: false,
        instructorLate: true,
        firstThirdThreshold: new Date('2023-01-01T10:20:00Z'),
        leaveDate: new Date('2023-01-01T10:15:00Z') // Left before first third
      }
      const result = applyStatusRules('absent', rules)
      expect(result).toBe('present')
    })

    it('should not apply instructor lateness rule if student left after first third', () => {
      const rules = {
        isTardy: false,
        sessionIsDuringAddDrop: false,
        instructorLate: true,
        firstThirdThreshold: new Date('2023-01-01T10:20:00Z'),
        leaveDate: new Date('2023-01-01T10:25:00Z') // Left after first third
      }
      const result = applyStatusRules('absent', rules)
      expect(result).toBe('absent')
    })

    it('should apply both tardiness and instructor lateness rules', () => {
      const rules = {
        isTardy: true,
        sessionIsDuringAddDrop: false,
        instructorLate: true,
        firstThirdThreshold: new Date('2023-01-01T10:20:00Z'),
        leaveDate: new Date('2023-01-01T10:25:00Z')
      }
      const result = applyStatusRules('present', rules)
      expect(result).toBe('late') // Tardiness rule applied
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
  global.expect = actual => ({
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
    toBeNull: () => {
      if (actual !== null) {
        throw new Error(`Expected null, got ${actual}`)
      }
    }
  })
}
