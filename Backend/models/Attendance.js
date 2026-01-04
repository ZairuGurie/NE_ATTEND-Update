const mongoose = require('mongoose')
const { createModelProxy } = require('../db/modelProxy')

const attendanceSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true
    },
    // The instructor account that collected/owns this attendance record
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Snapshot of student full name at time of collection
    studentName: {
      type: String,
      trim: true
    },
    joinTime: {
      type: String
    },
    leaveTime: {
      type: String
    },
    duration: {
      type: Number,
      default: 0 // total attendance duration in seconds
    },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'pending'],
      default: 'absent'
    },
    // Leave/return cycle tracking fields
    leaveCount: {
      type: Number,
      default: 0 // number of times student left the meeting
    },
    returnCount: {
      type: Number,
      default: 0 // number of times student returned to the meeting
    },
    lastLeaveTime: {
      type: Date,
      default: null // timestamp of last leave event
    },
    lastReturnTime: {
      type: Date,
      default: null // timestamp of last return event
    },
    isCurrentlyInMeeting: {
      type: Boolean,
      default: false // current presence status in the meeting
    },
    totalDurationSeconds: {
      type: Number,
      default: 0 // accumulated duration across all join/leave cycles (in seconds)
    },
    // Tardiness tracking fields
    isTardy: {
      type: Boolean,
      default: false // true if student arrived past 25% of scheduled class period
    },
    tardinessCount: {
      type: Number,
      default: 0 // individual tardiness instances (3 tardiness = 1 absence)
    },
    isExcused: {
      type: Boolean,
      default: false // true if absence/tardiness is excused
    },
    isDuringAddDrop: {
      type: Boolean,
      default: false // true if session was during adding/dropping period
    },
    // First join tracking (for tardiness calculation)
    firstJoinTime: {
      type: Date,
      default: null // timestamp of first join (separate from return times)
    },
    timeToEnterSeconds: {
      type: Number,
      default: 0 // seconds from scheduled start to first join (arrival offset)
    },
    isVerifiedParticipant: {
      type: Boolean,
      default: false // true when participant matched to roster/user record
    },
    // Timeout synchronization tracking
    timeoutSynchronized: {
      type: Boolean,
      default: false // true if leaveTime was synchronized from instructor's leaveTime
    },
    // Pending status tracking
    pendingSince: {
      type: Date,
      default: null // timestamp when status became pending
    }
  },
  {
    timestamps: true
  }
)

// Ensure uniqueness per session, per student
// Note: instructorId is NOT part of unique index because:
// 1. MongoDB treats each null as unique, allowing duplicate records
// 2. One student should only have ONE attendance record per session regardless of instructor
// 3. instructorId is stored for filtering/reporting but doesn't affect uniqueness
attendanceSchema.index({ sessionId: 1, userId: 1 }, { unique: true })

// Add non-unique index on instructorId for efficient filtering
attendanceSchema.index({ instructorId: 1 })

const Attendance = createModelProxy('Attendance', attendanceSchema)
Attendance.schema = attendanceSchema

module.exports = Attendance
