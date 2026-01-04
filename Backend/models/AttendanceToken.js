const mongoose = require('mongoose')
const { createModelProxy } = require('../db/modelProxy')
const crypto = require('crypto')

const attendanceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: false,
      index: true
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: false,
      index: true
    },
    meetCode: {
      type: String,
      trim: true,
      lowercase: true
    },
    // Legacy groupId field for backward compatibility (deprecated)
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: false,
      index: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    sessionDate: {
      type: Date,
      required: true,
      index: true
    },
    validFrom: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    consumed: {
      type: Boolean,
      default: false,
      index: true
    },
    consumedAt: {
      type: Date,
      default: null
    },
    consumedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    issuedAutomatically: {
      type: Boolean,
      default: false
    },
    // Makeup / Out-of-schedule token fields
    isOutscheduled: {
      type: Boolean,
      default: false // true if token is for a makeup/outside-schedule session
    },
    originSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      default: null // reference to original scheduled session (if makeup)
    }
  },
  {
    timestamps: true
  }
)

// Compound index for quick lookup
attendanceTokenSchema.index({ userId: 1, subjectId: 1, sessionDate: 1 }) // Primary index
attendanceTokenSchema.index({ userId: 1, groupId: 1, sessionDate: 1 }) // Legacy index for backward compatibility
attendanceTokenSchema.index({ token: 1, consumed: 1 })
attendanceTokenSchema.index({ subjectId: 1, consumed: 1 }) // For finding valid tokens by subject
attendanceTokenSchema.index(
  { sessionId: 1, userId: 1 },
  { unique: true, sparse: true }
)

// Static method to generate secure token
attendanceTokenSchema.statics.generateToken = function () {
  return crypto.randomBytes(32).toString('hex')
}

// Method to check if token is valid
attendanceTokenSchema.methods.isValid = function () {
  return !this.consumed && new Date() < this.expiresAt
}

const AttendanceToken = createModelProxy(
  'AttendanceToken',
  attendanceTokenSchema
)
AttendanceToken.schema = attendanceTokenSchema

module.exports = AttendanceToken
