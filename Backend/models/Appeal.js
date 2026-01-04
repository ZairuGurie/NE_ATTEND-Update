const mongoose = require('mongoose')
const { createModelProxy } = require('../db/modelProxy')

const appealEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['submitted', 'updated', 'comment', 'status-change'],
      default: 'submitted'
    },
    message: {
      type: String,
      trim: true,
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
)

const attachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true
    },
    name: {
      type: String,
      trim: true
    },
    mimeType: {
      type: String,
      trim: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
)

const appealSchema = new mongoose.Schema(
  {
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      required: true
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'denied'],
      default: 'pending'
    },
    reason: {
      type: String,
      trim: true,
      required: true
    },
    studentNotes: {
      type: String,
      trim: true
    },
    instructorNotes: {
      type: String,
      trim: true
    },
    attachments: [attachmentSchema],
    resolution: {
      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      decidedAt: {
        type: Date
      },
      decisionNotes: {
        type: String,
        trim: true
      }
    },
    events: {
      type: [appealEventSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
)

appealSchema.index(
  { attendanceId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { attendanceId: { $exists: true } } }
)
appealSchema.index({ instructorId: 1, status: 1, updatedAt: -1 })
appealSchema.index({ studentId: 1, updatedAt: -1 })

const Appeal = createModelProxy('Appeal', appealSchema)
Appeal.schema = appealSchema

module.exports = Appeal
