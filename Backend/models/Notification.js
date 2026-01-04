const mongoose = require('mongoose')
const { createModelProxy } = require('../db/modelProxy')

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        'attendance_present',
        'attendance_absent',
        'attendance_late',
        'attendance_status_changed',
        'announcement',
        'system',
        'reminder'
      ],
      required: true
    },
    title: {
      type: String,
      required: true,
      maxlength: 200
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000
    },
    // Reference to related entities
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedModel'
    },
    relatedModel: {
      type: String,
      enum: ['Attendance', 'Session', 'Subject', 'Announcement', null]
    },
    // Additional metadata
    metadata: {
      meetCode: String,
      subjectName: String,
      sessionDate: Date,
      oldStatus: String,
      newStatus: String,
      instructorName: String
    },
    // Read status
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
)

// Compound index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ userId: 1, createdAt: -1 })

// Auto-delete old notifications after 30 days
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
)

const Notification = createModelProxy('Notification', notificationSchema)
Notification.schema = notificationSchema

module.exports = Notification
