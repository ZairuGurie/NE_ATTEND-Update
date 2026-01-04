const mongoose = require('mongoose')
const { createModelProxy } = require('../db/modelProxy')

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: () =>
        `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: false
    },
    // Legacy groupId field for backward compatibility (deprecated)
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: false
    },
    // Normalized calendar day of the session (00:00:00 of that day)
    sessionDate: {
      type: Date,
      required: false
    },
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    meetCode: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    attendanceCount: {
      type: Number,
      default: 0
    },
    notes: {
      type: String,
      trim: true
    },
    isDuringAddDrop: {
      type: Boolean,
      default: false // true if session was during adding/dropping period (calculated from Subject/Group dates)
    },
    // Instructor lateness tracking
    instructorJoinTime: {
      type: Date,
      default: null // when instructor joined the session
    },
    instructorLate: {
      type: Boolean,
      default: false // true if instructor arrived after scheduled start time
    },
    firstThirdThreshold: {
      type: Date,
      default: null // calculated: startTime + (endTime - startTime) / 3
    },
    // Instructor leave tracking
    instructorLeaveTime: {
      type: Date,
      default: null // when instructor/host left the session (meeting ended)
    },
    meetingEnded: {
      type: Boolean,
      default: false // true if meeting has ended (instructor left)
    },
    unmatchedParticipants: [
      {
        name: {
          type: String,
          trim: true
        },
        meetParticipantId: {
          type: String,
          trim: true
        },
        joinTime: {
          type: String
        },
        leaveTime: {
          type: String
        },
        durationSeconds: {
          type: Number,
          default: 0
        },
        recordedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    // Makeup / Out-of-schedule session fields
    isOutscheduled: {
      type: Boolean,
      default: false // true if this is a makeup/outside-schedule session
    },
    originSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      default: null // reference to original scheduled session (if makeup)
    },
    makeupReason: {
      type: String,
      trim: true,
      default: null // reason for makeup class (instructor notes)
    }
  },
  {
    timestamps: true
  }
)

// Index for faster queries
sessionSchema.index({ subjectId: 1 }) // Primary index for subject-based queries
sessionSchema.index({ groupId: 1 }) // Legacy index for backward compatibility
sessionSchema.index({ startTime: 1 })
sessionSchema.index({ meetCode: 1 })
sessionSchema.index({ sessionDate: 1 })
// Compound index for common query pattern (meetCode + sessionDate)
sessionSchema.index(
  { meetCode: 1, sessionDate: 1 },
  {
    unique: true,
    partialFilterExpression: {
      // Use $type to exclude null values without relying on $ne (not supported
      // in partial index expressions on older MongoDB versions).
      meetCode: { $type: 'string' },
      sessionDate: { $type: 'date' }
    }
  }
)
// Compound index for subject-based queries
sessionSchema.index({ subjectId: 1, sessionDate: 1 })
// Index for makeup session queries
sessionSchema.index({ originSessionId: 1 })
sessionSchema.index({ isOutscheduled: 1 })

const Session = createModelProxy('Session', sessionSchema)
Session.schema = sessionSchema

module.exports = Session
